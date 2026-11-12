import assert from 'node:assert/strict';
import test from 'node:test';
import { useWorldStore } from '../src/state/store.ts';
import { build_plan, DispatchSnapshot } from '../src/agents/dispatch.ts';
import { isValidCommsText } from '../src/agents/comms.ts';

test('frozen event dispatch accepts only the operator UNFREEZE action', () => {
  const store = useWorldStore.getState();
  store.resetToInitialDemo();
  useWorldStore.getState().toggleKillSwitch('test freeze');
  const frozen = useWorldStore.getState();
  assert.equal(frozen.isKilled, true);
  assert.equal(frozen.lastEvent?.type, 'SYSTEM_FROZEN');
  const eventCount = frozen.events.length;

  for (const type of ['REPORT_ADDED', 'PLAN_APPROVED', 'PLAN_REJECTED', 'SYSTEM_FROZEN', 'SCENARIO_SWITCHED', 'UNFREEZE']) {
    assert.equal(useWorldStore.getState().dispatchEvent({
      actor: 'human',
      type,
      payload: {},
      reason: 'must be blocked while frozen',
    }), null);
  }
  useWorldStore.getState().resetToInitialDemo();
  useWorldStore.getState().approvePlan('plan_alpha');
  useWorldStore.getState().approveCommsDraft('missing-draft');
  assert.equal(useWorldStore.getState().events.length, eventCount);
  assert.equal(useWorldStore.getState().plans.plan_alpha.status, 'candidate');
  assert.equal(useWorldStore.getState().volunteers.vol_01.available, true);
  useWorldStore.getState().addCitizenReport({ text: 'blocked during freeze' });
  assert.equal(useWorldStore.getState().events.length, eventCount);

  useWorldStore.getState().toggleKillSwitch();
  const resumed = useWorldStore.getState();
  assert.equal(resumed.isKilled, false);
  assert.equal(resumed.events.length, eventCount + 1);
  assert.equal(resumed.lastEvent?.type, 'UNFREEZE');
});

test('drafts stay out of the mock outbox until each message is approved', () => {
  useWorldStore.getState().resetToInitialDemo();
  const plan = {
    id: 'test_approval_plan',
    assignments: [{ volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 1 }],
    coverage: 100,
    etaMinutes: 1,
    riskScore: 0,
    probability: 1,
    status: 'candidate' as const,
  };
  useWorldStore.getState().dispatchEvent({
    actor: 'agent:dispatch',
    type: 'PLAN_CREATED',
    payload: plan,
    reason: 'test candidate plan',
  });
  const beforeApproval = useWorldStore.getState();
  assert.equal(beforeApproval.dispatchEvent({
    actor: 'human',
    type: 'PLAN_APPROVED',
    payload: { planId: plan.id },
    reason: 'a caller cannot forge a human approval event',
  }), null);
  const stockBeforeApproval = beforeApproval.resources.res_kurl_boat.allocatedQty || 0;
  useWorldStore.getState().approvePlan(plan.id);
  const approvedState = useWorldStore.getState();
  assert.equal(approvedState.plans[plan.id]?.status, 'approved');
  assert.equal(approvedState.volunteers.vol_01.available, false);
  assert.equal(approvedState.incidents.inc_001.status, 'assigned');
  assert.equal(approvedState.resources.res_kurl_boat.allocatedQty, stockBeforeApproval + 1);
  const beforeInvalidDraft = approvedState.events.length;
  assert.equal(approvedState.dispatchEvent({
    actor: 'agent:comms',
    type: 'COMMS_DRAFTS_CREATED',
    payload: {
      planId: plan.id,
      drafts: [{
        id: 'invalid-draft',
        incidentId: 'inc_001',
        wardId: 'kurla',
        areaName: 'Kurla',
        disasterType: 'flood',
        language: 'en',
        text: 'Support teams are coordinating local assistance.',
        approvedByHuman: false,
        broadcastChannels: ['sms', 'whatsapp'],
      }],
    },
    reason: 'invalid Gemini content must be rejected',
  }), null);
  assert.equal(useWorldStore.getState().events.length, beforeInvalidDraft);

  const drafts = ['draft-en', 'draft-hi'].map((id, index) => ({
    id,
    incidentId: 'inc_001',
    wardId: 'kurla',
    areaName: 'Kurla',
    disasterType: 'flood' as const,
    language: index === 0 ? 'en' as const : 'hi' as const,
    text: index === 0
      ? 'Update: support teams are coordinating local assistance. Use [SAFE ROUTE] or [SHELTER]. Call 1916.'
      : 'इस क्षेत्र के लिए सूचना: सहायता दल स्थानीय मदद का समन्वय कर रहे हैं। [सुरक्षित मार्ग] या [आश्रय] जाएँ। 1916 पर कॉल करें।',
    approvedByHuman: false,
    broadcastChannels: ['sms', 'whatsapp'] as ('sms' | 'whatsapp')[],
  }));
  useWorldStore.getState().dispatchEvent({
    actor: 'agent:comms',
    type: 'COMMS_DRAFTS_CREATED',
    payload: { planId: plan.id, drafts },
    reason: 'test validated drafts',
  });
  assert.equal(useWorldStore.getState().commsOutbox.length, 0);

  useWorldStore.getState().approveCommsDraft('draft-en');
  assert.equal(useWorldStore.getState().commsOutbox.length, 1);
  assert.equal(useWorldStore.getState().commsOutbox[0].id, 'draft-en');
  assert.equal(useWorldStore.getState().commsDrafts['draft-hi'].approvedByHuman, false);
});

test('multilingual validation enforces length and the requested writing system', () => {
  assert.equal(isValidCommsText('en', 'Update: support is being coordinated. Use [SAFE ROUTE]. Call 1916.'), true);
  assert.equal(isValidCommsText('hi', 'सहायता दल स्थानीय मदद का समन्वय कर रहे हैं। [सुरक्षित मार्ग] का उपयोग करें। 1916 पर कॉल करें।'), true);
  assert.equal(isValidCommsText('mr', 'मदत पथके स्थानिक सहाय्याचे समन्वय करत आहेत. [निवारा] येथे जा. 1916 वर कॉल करा.'), true);
  assert.equal(isValidCommsText('hi', 'Support teams are coordinating. Call 1916.'), false);
  assert.equal(isValidCommsText('en', 'Please stay calm. कृपया सुरक्षित रहें।'), false);
  assert.equal(isValidCommsText('en', 'Emergency support is available.'), false);
  assert.equal(isValidCommsText('en', 'Update: support is coordinated. Use [SAFE ROUTE].'), false);
  assert.equal(isValidCommsText('en', 'Update: support is coordinated. Call 1916.'), false);
  assert.equal(isValidCommsText('en', 'a'.repeat(280)), false);
});

test('recognized rejection constraints exclude only the named volunteer', () => {
  const store = useWorldStore.getState();
  const incident = Object.values(store.incidents)[0];
  const volunteer = store.volunteers.vol_12;
  const snapshot: DispatchSnapshot = {
    incidents: { [incident.id]: { ...incident, reportIds: [], needs: ['rescue'] } },
    volunteers: { [volunteer.id]: volunteer },
    resources: {},
    reports: {},
    areas: store.areas,
    officialAlerts: [],
    rejectionConstraints: ['avoid volunteer V12'],
  };
  const excluded = build_plan('maximise_coverage', snapshot);
  assert.equal(excluded.assignments.length, 0);

  const recoverable = build_plan('maximise_coverage', {
    ...snapshot,
    rejectionConstraints: ['avoid volunteer unknown-responder'],
  });
  assert.equal(recoverable.assignments.length, 1);
});

test('entangled dispatch is deterministic and still requires the operator approval gate', () => {
  const reset = useWorldStore.getState();
  reset.resetToInitialDemo();
  const first = build_plan('entangled_optimal');
  const second = build_plan('entangled_optimal');
  assert.deepEqual(first.assignments, second.assignments);
  assert.deepEqual(first.entanglementMetrics, second.entanglementMetrics);
  assert.equal(first.strategy, 'entangled_optimal');
  assert.ok(first.entanglementMetrics);

  useWorldStore.getState().dispatchEvent({
    actor: 'agent:dispatch',
    type: 'PLAN_CREATED',
    payload: first,
    reason: 'entangled candidate',
  });
  const candidateState = useWorldStore.getState();
  assert.equal(candidateState.dispatchEvent({
    actor: 'agent:dispatch',
    type: 'PLAN_APPROVED',
    payload: { planId: first.id },
    reason: 'an agent cannot approve a candidate',
  }), null);
  assert.equal(candidateState.dispatchEvent({
    actor: 'human',
    type: 'PLAN_APPROVED',
    payload: { planId: first.id },
    reason: 'a caller cannot forge the operator action',
  }), null);
  assert.equal(useWorldStore.getState().plans[first.id]?.status, 'candidate');

  useWorldStore.getState().approvePlan(first.id);
  assert.equal(useWorldStore.getState().plans[first.id]?.status, 'approved');
});

test('rejecting the entangled candidate stores the operator constraint', () => {
  useWorldStore.getState().resetToInitialDemo();
  const plan = build_plan('entangled_optimal');
  useWorldStore.getState().dispatchEvent({
    actor: 'agent:dispatch',
    type: 'PLAN_CREATED',
    payload: plan,
    reason: 'entangled candidate',
  });

  useWorldStore.getState().rejectPlan(plan.id, 'avoid volunteer V12');
  const state = useWorldStore.getState();
  assert.equal(state.plans[plan.id]?.status, 'rejected');
  assert.ok(state.rejectionConstraints.includes('avoid volunteer V12'));
});

test('entangled dispatch excludes incidents with only unverified reports', () => {
  useWorldStore.getState().resetToInitialDemo();
  const state = useWorldStore.getState();
  const blockedReport = {
    ...state.reports.rep_001,
    id: 'rep_unverified',
    credibility: 0.1,
    isUnverified: true,
  };
  const snapshot: DispatchSnapshot = {
    incidents: {
      ...state.incidents,
      inc_001: { ...state.incidents.inc_001, reportIds: [blockedReport.id] },
    },
    volunteers: state.volunteers,
    resources: state.resources,
    reports: { ...state.reports, [blockedReport.id]: blockedReport },
    areas: state.areas,
    officialAlerts: state.officialAlerts,
    rejectionConstraints: [],
    context: state.context,
  };

  const plan = build_plan('entangled_optimal', snapshot);
  assert.ok(!plan.assignments.some(assignment => assignment.incidentId === 'inc_001'));
});
