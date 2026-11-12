import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_AREAS, SEED_INCIDENTS, SEED_REPORTS, SEED_RESOURCES, SEED_VOLUNTEERS } from '../src/data/seedScenario.ts';
import { buildPreAlertsForWorseningIncident } from '../src/state/preAlerts.ts';
import { useWorldStore } from '../src/state/store.ts';
import type { Incident, Report, Resource, Volunteer } from '../src/state/types.ts';

const asRecord = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map(item => [item.id, item]));

test('a priority rise creates a measured conditional neighbour pre-alert', () => {
  const incidents = asRecord(SEED_INCIDENTS.filter(incident => ['inc_001', 'inc_002'].includes(incident.id)));
  const previous = incidents.inc_001;
  const next = { ...previous, priority: previous.priority + 1 };
  const alerts = buildPreAlertsForWorseningIncident(
    previous,
    next,
    'trigger-event',
    {
      incidents: { ...incidents, [next.id]: next },
      volunteers: asRecord<Volunteer>(SEED_VOLUNTEERS),
      resources: asRecord<Resource>(SEED_RESOURCES),
      reports: asRecord<Report>(SEED_REPORTS),
      areas: SEED_AREAS,
      plans: {},
      context: { rainfallMmHr: 75 },
    },
    100
  );
  const neighborAlert = alerts.find(alert => alert.neighborIncidentId === 'inc_002');
  assert.ok(neighborAlert, 'expected a measured Kurla/Sion pre-alert');
  assert.ok(neighborAlert.mutualInformationBits >= 0.005);
  assert.ok(neighborAlert.probabilityAfter < neighborAlert.probabilityBefore);
  assert.equal(neighborAlert.acknowledged, false);
});

test('pre-alert acknowledgement is operator-gated and recorded as an event', () => {
  useWorldStore.getState().resetToInitialDemo();
  const alert = {
    id: 'test-prealert',
    triggerIncidentId: 'inc_001',
    neighborIncidentId: 'inc_002',
    triggerLabel: 'Kurla',
    neighborLabel: 'Sion',
    probabilityBefore: 0.74,
    probabilityAfter: 0.51,
    mutualInformationBits: 0.38,
    phi: 0.52,
    createdAt: Date.now(),
    acknowledged: false,
  };
  useWorldStore.getState().dispatchEvent({
    actor: 'agent:simulation',
    type: 'PRE_ALERT_CREATED',
    payload: alert,
    reason: 'conditional simulation pre-alert',
  });
  const forged = useWorldStore.getState().dispatchEvent({
    actor: 'human',
    type: 'PRE_ALERT_ACKNOWLEDGED',
    payload: { preAlertId: alert.id },
    reason: 'must use the operator action',
  });
  assert.equal(forged, null);

  useWorldStore.getState().acknowledgePreAlert(alert.id);
  assert.equal(useWorldStore.getState().preAlerts[alert.id].acknowledged, true);
  assert.equal(useWorldStore.getState().events.at(-1)?.type, 'PRE_ALERT_ACKNOWLEDGED');
});
