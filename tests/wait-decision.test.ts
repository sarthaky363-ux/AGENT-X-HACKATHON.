import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_AREAS, SEED_INCIDENTS, SEED_REPORTS, SEED_RESOURCES, SEED_VOLUNTEERS } from '../src/data/seedScenario.ts';
import { estimateWaitDecision } from '../src/quantum/waitDecision.ts';
import type { QWorld } from '../src/quantum/entangledSim.ts';
import type { Report, Resource, Volunteer } from '../src/state/types.ts';

const asRecord = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map(item => [item.id, item]));

function buildWorld(): QWorld {
  return {
    incidents: asRecord(SEED_INCIDENTS),
    volunteers: asRecord<Volunteer>(SEED_VOLUNTEERS),
    resources: asRecord<Resource>(SEED_RESOURCES),
    reports: asRecord<Report>(SEED_REPORTS),
    areas: SEED_AREAS,
    context: { rainfallMmHr: 75 },
  };
}

test('wait advisor estimates delay, second-source chance, costs, and break-even credibility', () => {
  const report: Report = {
    id: 'rep_wait_probe',
    ts: Date.now(),
    area: 'kurla',
    text: 'Flood water is rising and a resident is trapped.',
    language: 'en',
    source: 'citizen',
    reporterId: 'source_wait_probe',
    location: { x: 450, y: 350 },
    peopleAtRisk: 20,
    flags: ['flood', 'water_rescue'],
    credibility: 0.2,
  };
  const estimate = estimateWaitDecision(report, buildWorld(), [], 15);
  assert.equal(estimate.waitMinutes, 15);
  assert.ok(estimate.reportCredibility >= 0 && estimate.reportCredibility <= 1);
  assert.ok(estimate.confirmationCredibility >= estimate.reportCredibility);
  assert.ok(estimate.secondSourceChance > 0 && estimate.secondSourceChance < 1);
  assert.ok(estimate.immediateReachProbability >= estimate.delayedReachProbability);
  assert.ok(Number.isFinite(estimate.expectedPeopleIfActNow));
  assert.ok(Number.isFinite(estimate.expectedPeopleIfWaiting));
  assert.ok(estimate.breakEvenCredibility === null ||
    (estimate.breakEvenCredibility >= 0 && estimate.breakEvenCredibility <= 1));
  assert.equal(estimate.simulatedTrials, 600);
});
