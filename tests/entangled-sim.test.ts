import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collapse,
  entangledMonteCarlo,
  fieldCorrelationMatrix,
  probit,
  type EntangledSimResult,
} from '../src/quantum/entangledSim.ts';
import {
  SEED_AREAS,
  SEED_INCIDENTS,
  SEED_REPORTS,
  SEED_RESOURCES,
  SEED_VOLUNTEERS,
} from '../src/data/seedScenario.ts';
import type { PlanAssignment, Report, Resource, Volunteer } from '../src/state/types.ts';

const asRecord = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map(item => [item.id, item]));

test('probit is symmetric and field correlations are normalized, symmetric, and spatially decaying', () => {
  assert.ok(Math.abs(probit(0.9) + probit(0.1)) < 1e-12);
  const matrix = fieldCorrelationMatrix([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 250, y: 0 }]);
  assert.equal(matrix.length, 3);
  matrix.forEach((row, i) => assert.ok(Math.abs(row[i] - 1) < 1e-12));
  matrix.forEach((row, i) => row.forEach((value, j) => {
    assert.ok(Math.abs(value - matrix[j][i]) < 1e-12);
  }));
  assert.ok(matrix[0][1] > matrix[0][2]);
});

test('same seed reproduces outcomes, and empty collapse retains every trial and marginal', () => {
  const world = makeSeedWorld();
  const assignments = seedAssignments();
  const first = entangledMonteCarlo(assignments, world, 300, 20261111);
  const second = entangledMonteCarlo(assignments, world, 300, 20261111);
  assert.deepEqual(first.outcomes, second.outcomes);
  assert.deepEqual(first.reached, second.reached);

  const collapsed = collapse(first, {});
  assert.equal(collapsed.matchingTrials, first.trials);
  assert.deepEqual(collapsed.probabilities, first.marginal);
});

test('seeded Kurla and Sion incidents share measured reach dependence', () => {
  const result = entangledMonteCarlo(seedAssignments(), makeSeedWorld(), 3000, 20261111);
  const edge = result.edges.find(({ a, b }) => a === 'inc_001' && b === 'inc_002');
  assert.ok(edge, 'expected a Kurla/Sion entanglement edge');
  assert.ok(edge.phi > 0.1, `expected positive phi, got ${edge.phi}`);
  assert.ok(
    edge.pBGivenAReached > edge.pBGivenAMissed,
    `expected P(Sion reached | Kurla reached) > P(Sion reached | Kurla missed), got ${edge.pBGivenAReached} <= ${edge.pBGivenAMissed}`
  );
});

test('collapse conditions only on the observed incident values', () => {
  const result = entangledMonteCarlo(seedAssignments(), makeSeedWorld(), 300, 7);
  const collapseOnKurlaReached = collapse(result, { inc_001: true });
  const matchedIndices = result.reached
    .map((trial, index) => trial[0] ? index : -1)
    .filter(index => index >= 0);
  assert.equal(collapseOnKurlaReached.matchingTrials, matchedIndices.length);
  if (matchedIndices.length > 0) {
    const expectedSionProbability = matchedIndices
      .reduce((sum, index) => sum + Number(result.reached[index][1]), 0) / matchedIndices.length;
    assert.equal(collapseOnKurlaReached.probabilities.inc_002, expectedSionProbability);
  }
});

test('collapse falls back to marginals when no stored trial matches', () => {
  const result: EntangledSimResult = {
    trials: 2,
    seed: 1,
    incidentIds: ['inc_001'],
    reached: [[false], [false]],
    marginal: { inc_001: 0.6 },
    edges: [],
    expectedReached: 0,
    worstCase5pct: 0,
    stdReached: 0,
    probabilityAllCriticalReached: 0,
    outcomes: [0, 0],
    heatMetrics: {
      averagePowerCutProbability: 0,
      averageHospitalCapacityShortfallProbability: 0,
      heatIllnessCallPressure: 0,
    },
  };
  assert.deepEqual(collapse(result, { inc_001: true }), {
    matchingTrials: 0,
    probabilities: { inc_001: 0.6 },
  });
});

function makeSeedWorld() {
  const reports = asRecord<Report>(SEED_REPORTS);
  const volunteers = asRecord<Volunteer>(SEED_VOLUNTEERS.slice(0, 12));
  const resources = asRecord<Resource>(SEED_RESOURCES);
  return {
    incidents: asRecord(SEED_INCIDENTS.filter(incident => incident.id === 'inc_001' || incident.id === 'inc_002')),
    volunteers,
    resources,
    reports,
    areas: SEED_AREAS,
    context: { rainfallMmHr: 75 },
  };
}

function seedAssignments(): PlanAssignment[] {
  return [
    { volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 1 },
    { volunteerId: 'vol_02', incidentId: 'inc_002', resourceId: 'res_kurl_boat', qty: 1 },
  ];
}
