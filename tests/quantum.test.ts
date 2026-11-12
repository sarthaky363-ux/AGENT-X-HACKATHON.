import assert from 'node:assert/strict';
import test from 'node:test';
import { annealDispatch, limitResponders } from '../src/quantum/anneal.ts';
import {
  collapse,
  entangledMonteCarlo,
  fieldCorrelationMatrix,
  type QWorld,
} from '../src/quantum/entangledSim.ts';
import { interfere } from '../src/quantum/interference.ts';
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

function seedWorld(): QWorld {
  return limitResponders({
    incidents: asRecord(SEED_INCIDENTS),
    volunteers: asRecord<Volunteer>(SEED_VOLUNTEERS),
    resources: asRecord<Resource>(SEED_RESOURCES),
    reports: asRecord<Report>(SEED_REPORTS),
    areas: SEED_AREAS,
    context: { rainfallMmHr: 75 },
  }, 12, 3);
}

function report(overrides: Partial<Report> & Pick<Report, 'id'>): Report {
  const { id, ...rest } = overrides;
  return {
    id,
    ts: Date.now(),
    area: 'kurla',
    text: 'Water is rising near the bridge.',
    language: 'en',
    source: 'citizen',
    reporterId: overrides.reporterId || id,
    location: { x: 0, y: 0 },
    flags: [],
    ...rest,
  };
}

test('correlation matrix is normalized, symmetric, and decays with distance', () => {
  const matrix = fieldCorrelationMatrix([
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 250, y: 0 },
  ]);
  assert.equal(matrix.length, 3);
  matrix.forEach((row, i) => {
    assert.ok(Math.abs(row[i] - 1) < 1e-12);
    row.forEach((value, j) => assert.ok(Math.abs(value - matrix[j][i]) < 1e-12));
  });
  assert.ok(matrix[0][1] > matrix[0][2]);
});

test('seeded reach is reproducible and Kurla/Sion outcomes are correlated', () => {
  const world = seedWorld();
  const pairWorld: QWorld = {
    ...world,
    incidents: asRecord(SEED_INCIDENTS.filter(incident => ['inc_001', 'inc_002'].includes(incident.id))),
  };
  const assignments: PlanAssignment[] = [
    { volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 1 },
    { volunteerId: 'vol_02', incidentId: 'inc_002', resourceId: 'res_kurl_boat', qty: 1 },
  ];
  const result = entangledMonteCarlo(assignments, pairWorld, 3000, 42);
  const repeated = entangledMonteCarlo(assignments, pairWorld, 3000, 42);
  assert.deepEqual(result.reached, repeated.reached);
  assert.deepEqual(result.outcomes, repeated.outcomes);

  const edge = result.edges.find(({ a, b }) => a === 'inc_001' && b === 'inc_002');
  assert.ok(edge, 'expected a Kurla/Sion entanglement edge');
  assert.ok(edge.phi > 0.1, `expected positive phi, got ${edge.phi}`);
  assert.ok(edge.pBGivenAReached > edge.pBGivenAMissed);
});

test('collapse conditions on misses and empty observations match all trials', () => {
  const world = seedWorld();
  const pairWorld: QWorld = {
    ...world,
    incidents: asRecord(SEED_INCIDENTS.filter(incident => ['inc_001', 'inc_002'].includes(incident.id))),
  };
  const assignments: PlanAssignment[] = [
    { volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 1 },
    { volunteerId: 'vol_02', incidentId: 'inc_002', resourceId: 'res_kurl_boat', qty: 1 },
  ];
  const result = entangledMonteCarlo(assignments, pairWorld, 3000, 42);
  const missedKurla = collapse(result, { inc_001: false });
  assert.equal(missedKurla.probabilities.inc_001, 0);
  assert.ok(missedKurla.matchingTrials > 0 && missedKurla.matchingTrials < result.trials);
  assert.ok(missedKurla.probabilities.inc_002 < result.marginal.inc_002);

  const unconditioned = collapse(result, {});
  assert.equal(unconditioned.matchingTrials, result.trials);
  assert.deepEqual(unconditioned.probabilities, result.marginal);
});

test('interference distinguishes independent support, repeated reports, contradictions, and no evidence', () => {
  const constructive = interfere([
    report({ id: 'rep-a', reporterId: 'source-a', credibility: 0.6 }),
    report({ id: 'rep-b', reporterId: 'source-b', credibility: 0.6 }),
  ]);
  assert.equal(constructive.verdict, 'constructive');

  const repeated = interfere(Array.from({ length: 5 }, (_, index) =>
    report({ id: `repeat-${index}`, reporterId: 'same-source', credibility: 0.6 })
  ));
  assert.ok(repeated.credibility < constructive.credibility);
  assert.equal(repeated.terms.length, 1);

  const contradiction = interfere([
    report({ id: 'support', reporterId: 'supporter', credibility: 0.6 }),
    report({
      id: 'contradicted',
      reporterId: 'contradicted-source',
      credibility: 0.6,
      credibilityReasons: ['Contradicted by official alert'],
    }),
  ]);
  assert.equal(contradiction.verdict, 'destructive');
  assert.ok(contradiction.intensity < 1e-25);

  const empty = interfere([]);
  assert.equal(empty.verdict, 'no-evidence');
  assert.equal(empty.credibility, 0);
  assert.equal(empty.visibility, 1);
});

test('annealing is deterministic, respects the floor and crew constraints, and beats oneEach in simulation', () => {
  const world = seedWorld();
  const incidentIds = Object.values(world.incidents)
    .filter(incident => incident.status !== 'resolved')
    .map(incident => incident.id);
  const result = annealDispatch(world, incidentIds, { seed: 7, steps: 6000 });
  const repeated = annealDispatch(world, incidentIds, { seed: 7, steps: 6000 });
  const riskNeutralReference = annealDispatch(world, incidentIds, {
    seed: 7,
    steps: 200,
    riskAversion: 0,
  });

  assert.deepEqual(result.annealed.assignments, repeated.annealed.assignments);
  assert.ok(result.annealed.energy <= result.greedy.energy);
  assert.ok(result.annealed.energy <= result.oneEach.energy);
  assert.ok(result.annealed.expectedWeighted >= 0.97 * riskNeutralReference.greedy.expectedWeighted);

  const assignedVolunteers = result.annealed.assignments.map(assignment => assignment.volunteerId);
  assert.equal(new Set(assignedVolunteers).size, assignedVolunteers.length);
  assignedVolunteers.forEach(id => assert.equal(world.volunteers[id].available, true));
  incidentIds.forEach(id => assert.ok(
    result.annealed.assignments.filter(assignment => assignment.incidentId === id).length <= 3
  ));
  const unavailableId = assignedVolunteers[0];
  const alreadyAssignedId = assignedVolunteers.find(id => id !== unavailableId);
  if (unavailableId && alreadyAssignedId) {
    const constrainedWorld: QWorld = {
      ...world,
      volunteers: {
        ...world.volunteers,
        [unavailableId]: { ...world.volunteers[unavailableId], available: false },
        [alreadyAssignedId]: {
          ...world.volunteers[alreadyAssignedId],
          assignedIncidentId: 'incident_elsewhere',
        },
      },
    };
    const constrained = annealDispatch(constrainedWorld, incidentIds, { seed: 7, steps: 200 });
    assert.ok(!constrained.annealed.assignments.some(
      assignment => assignment.volunteerId === unavailableId || assignment.volunteerId === alreadyAssignedId
    ));
  }

  const annealedSim = entangledMonteCarlo(result.annealed.assignments, world, 1200, 42);
  const oneEachSim = entangledMonteCarlo(result.oneEach.assignments, world, 1200, 42);
  assert.ok(annealedSim.expectedReached >= oneEachSim.expectedReached);
});

test('empty quantum inputs stay well-defined', () => {
  const world = seedWorld();
  const emptyIncidents = annealDispatch(world, [], { seed: 7, steps: 200 });
  assert.deepEqual(emptyIncidents.annealed.assignments, []);
  assert.deepEqual(emptyIncidents.greedy.assignments, []);
  assert.deepEqual(emptyIncidents.oneEach.assignments, []);

  const noVolunteers: QWorld = { ...world, volunteers: {} };
  const noCrew = annealDispatch(noVolunteers, Object.keys(world.incidents), { seed: 7, steps: 200 });
  assert.deepEqual(noCrew.annealed.assignments, []);

  const emptyWorld: QWorld = { ...noVolunteers, incidents: {} };
  const emptySimulation = entangledMonteCarlo([], emptyWorld, 5, 7);
  assert.equal(emptySimulation.expectedReached, 0);
  assert.deepEqual(emptySimulation.edges, []);
  assert.equal(collapse(emptySimulation, {}).matchingTrials, 5);
  assert.deepEqual(fieldCorrelationMatrix([]), []);
});
