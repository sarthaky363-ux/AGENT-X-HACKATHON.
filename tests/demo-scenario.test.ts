import assert from 'node:assert/strict';
import test from 'node:test';
import { build_plan, DispatchSnapshot } from '../src/agents/dispatch.ts';
import { buildGenesisEvents } from '../src/data/seedScenario.ts';
import { createDemoScenarioSchedule, DEMO_SCENARIO_DURATION_MS, DEMO_SCENARIO_SEED } from '../src/scenario/demoScenario.ts';
import { monteCarlo } from '../src/sim/monteCarlo.ts';
import { INITIAL_DERIVED_STATE, reduceAllEvents } from '../src/state/reducer.ts';
import { Event } from '../src/state/types.ts';

function replayScenario(startTs: number) {
  const genesis = buildGenesisEvents();
  const inputs = createDemoScenarioSchedule(startTs);
  const events: Event[] = inputs.map((input, index) => ({
    id: input.id,
    ts: input.ts,
    actor: input.actor,
    type: input.type,
    payload: input.payload,
    reason: input.reason,
    version: genesis.length + index + 1,
  }));
  return {
    events,
    state: reduceAllEvents([...genesis, ...events], INITIAL_DERIVED_STATE),
  };
}

test('demo schedule is a reproducible 14-event, 90-second sequence', () => {
  const startTs = 1_798_000_000_000;
  const first = createDemoScenarioSchedule(startTs);
  const second = createDemoScenarioSchedule(startTs);
  assert.equal(first.length, 14);
  assert.deepEqual(first, second);
  assert.equal(first[0].type, 'SIMULATION_SEED_UPDATED');
  assert.equal(first[0].payload.seed, DEMO_SCENARIO_SEED);
  assert.equal(first[13].atMs, DEMO_SCENARIO_DURATION_MS);
  assert.deepEqual(first.map(input => input.ts), first.map(input => startTs + input.atMs));
  assert.equal(first.filter(input => input.type === 'OFFICIAL_ALERT_RELEASED').length, 2);
  assert.equal(first.filter(input => input.type === 'ROAD_CLOSURE_REPORTED').length, 1);
  assert.equal(first.find(input => input.type === 'ROAD_CLOSURE_REPORTED')?.payload.to, 'Sion');
  assert.equal(first.find(input => input.type === 'RESOURCE_STOCKED')?.payload.quantity, 0);

  const rumourIndex = first.findIndex(input => input.id.endsWith('powai_rumour'));
  const corroborationIndex = first.findIndex(input => input.id.endsWith('powai_field_report'));
  assert.ok(rumourIndex >= 0 && corroborationIndex > rumourIndex);
});

test('scenario event replay and seeded plan simulation produce identical results', () => {
  const { events, state } = replayScenario(1_798_000_000_000);
  const replayed = replayScenario(1_798_000_000_000);
  assert.deepEqual(events, replayed.events);
  assert.deepEqual(state, replayed.state);
  assert.equal(state.simulationSeed, DEMO_SCENARIO_SEED);
  assert.equal(state.resources.res_kurl_boat.quantity, 0);
  assert.deepEqual(state.roadClosures, [{
    area: 'kurla',
    from: 'Kurla',
    to: 'Sion',
    description: 'Kurla-Sion link closed due to floodwater.',
    penaltyMinutes: 18,
  }]);

  const snapshot: DispatchSnapshot = {
    volunteers: state.volunteers,
    incidents: state.incidents,
    resources: state.resources,
    reports: state.reports,
    areas: state.areas,
    officialAlerts: state.officialAlerts,
    roadClosures: state.roadClosures,
    rejectionConstraints: state.rejectionConstraints,
  };
  const firstPlan = build_plan('minimise_risk', snapshot);
  const secondPlan = build_plan('minimise_risk', snapshot);
  assert.deepEqual(firstPlan.assignments, secondPlan.assignments);
  assert.equal(firstPlan.coverage, secondPlan.coverage);
  assert.equal(firstPlan.etaMinutes, secondPlan.etaMinutes);
  assert.deepEqual(
    monteCarlo(firstPlan, state, 50, DEMO_SCENARIO_SEED),
    monteCarlo(secondPlan, state, 50, DEMO_SCENARIO_SEED),
  );
});
