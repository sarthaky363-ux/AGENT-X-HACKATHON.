import assert from 'node:assert/strict';
import test from 'node:test';
import { annealDispatch, diversifiedRouteBackupIds, limitResponders, routeCorridorSimilarity } from '../src/quantum/anneal.ts';
import { entangledMonteCarlo } from '../src/quantum/entangledSim.ts';
import {
  SEED_AREAS,
  SEED_INCIDENTS,
  SEED_REPORTS,
  SEED_RESOURCES,
  SEED_VOLUNTEERS,
} from '../src/data/seedScenario.ts';
import type { QWorld } from '../src/quantum/entangledSim.ts';
import type { Report, Resource, Volunteer } from '../src/state/types.ts';

const asRecord = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map(item => [item.id, item]));

function seedWorld(rainfallMmHr = 75): QWorld {
  return {
    incidents: asRecord(SEED_INCIDENTS),
    volunteers: asRecord<Volunteer>(SEED_VOLUNTEERS),
    resources: asRecord<Resource>(SEED_RESOURCES),
    reports: asRecord<Report>(SEED_REPORTS),
    areas: SEED_AREAS,
    context: { rainfallMmHr },
  };
}

test('annealing is reproducible and never violates responder or crew limits', () => {
  const limited = limitResponders(seedWorld(), 12, 41);
  const incidentIds = Object.keys(limited.incidents);
  const first = annealDispatch(limited, incidentIds, { seed: 20261111, steps: 1200 });
  const second = annealDispatch(limited, incidentIds, { seed: 20261111, steps: 1200 });
  assert.deepEqual(first.annealed.assignments, second.annealed.assignments);
  assert.equal(first.trace.length, 120);
  assert.ok(first.steps >= 200);
  assert.ok(first.annealed.energy <= first.greedy.energy);
  assert.ok(first.annealed.energy <= first.oneEach.energy);
  assert.ok(first.annealed.expectedWeighted >= 0.96 * first.greedy.expectedWeighted);

  const usedVolunteers = first.annealed.assignments.map(assignment => assignment.volunteerId);
  assert.equal(new Set(usedVolunteers).size, usedVolunteers.length);
  for (const volunteerId of usedVolunteers) {
    assert.equal(limited.volunteers[volunteerId].available, true);
  }
  for (const incidentId of incidentIds) {
    assert.ok(
      first.annealed.assignments.filter(assignment => assignment.incidentId === incidentId).length <= 3
    );
  }
  for (const assignment of first.annealed.assignments) {
    if (limited.volunteers[assignment.volunteerId].vehicle === 'boat') {
      assert.equal(assignment.resourceId, 'res_kurl_boat');
      assert.equal(assignment.qty, 1);
    }
  }

  const unavailableId = usedVolunteers[0];
  const alreadyAssignedId = usedVolunteers.find(id => id !== unavailableId)!;
  const filteredWorld: QWorld = {
    ...limited,
    volunteers: {
      ...limited.volunteers,
      [unavailableId]: { ...limited.volunteers[unavailableId], available: false },
      [alreadyAssignedId]: {
        ...limited.volunteers[alreadyAssignedId],
        assignedIncidentId: 'incident_elsewhere',
      },
    },
  };
  const filtered = annealDispatch(filteredWorld, incidentIds, { seed: 2, steps: 200 });
  assert.ok(!filtered.annealed.assignments.some(
    assignment => assignment.volunteerId === unavailableId || assignment.volunteerId === alreadyAssignedId
  ));
});

test('limiting responders is seeded, bounded, and does not mutate the source world', () => {
  const world = seedWorld();
  const originalAvailability = Object.fromEntries(
    Object.entries(world.volunteers).map(([id, volunteer]) => [id, volunteer.available])
  );
  const first = limitResponders(world, 12, 7);
  const second = limitResponders(world, 12, 7);
  assert.deepEqual(
    Object.keys(first.volunteers).filter(id => first.volunteers[id].available),
    Object.keys(second.volunteers).filter(id => second.volunteers[id].available)
  );
  assert.equal(Object.values(first.volunteers).filter(volunteer => volunteer.available).length, 12);
  assert.deepEqual(
    Object.fromEntries(Object.entries(world.volunteers).map(([id, volunteer]) => [id, volunteer.available])),
    originalAvailability
  );
});

test('at 75 mm/hr with 12 responders annealed dispatch is no worse than oneEach in the entangled simulator', () => {
  const world = limitResponders(seedWorld(75), 12, 20261111);
  const result = annealDispatch(world, Object.keys(world.incidents), {
    seed: 20261111,
    steps: 6000,
  });
  const riskNeutralReference = annealDispatch(world, Object.keys(world.incidents), {
    seed: 20261111,
    steps: 200,
    riskAversion: 0,
  });
  assert.ok(
    result.annealed.expectedWeighted >= 0.97 * riskNeutralReference.greedy.expectedWeighted,
    `expected weighted reach floor not met: ${result.annealed.expectedWeighted}`
  );
  const annealedSimulation = entangledMonteCarlo(result.annealed.assignments, world, 1200, 20261111);
  const oneEachSimulation = entangledMonteCarlo(result.oneEach.assignments, world, 1200, 20261111);
  assert.ok(
    annealedSimulation.expectedReached >= oneEachSimulation.expectedReached,
    `expected annealed ${annealedSimulation.expectedReached} >= oneEach ${oneEachSimulation.expectedReached}`
  );
});

test('empty optimization inputs return empty assignments without throwing', () => {
  const world = seedWorld();
  const noIncidents = annealDispatch(world, [], { steps: 200 });
  assert.deepEqual(noIncidents.annealed.assignments, []);
  assert.deepEqual(noIncidents.greedy.assignments, []);
  assert.deepEqual(noIncidents.oneEach.assignments, []);

  const noVolunteers: QWorld = { ...world, volunteers: {} };
  const result = annealDispatch(noVolunteers, Object.keys(world.incidents), { steps: 200 });
  assert.deepEqual(result.annealed.assignments, []);
  assert.deepEqual(result.greedy.assignments, []);
  assert.deepEqual(result.oneEach.assignments, []);
});

test('route diversity penalizes a shared corridor and labels a different-route backup', () => {
  const world = seedWorld();
  const incident = world.incidents.inc_001;
  const target = incident.location || world.areas[incident.area].coordinates;
  const lead = { ...world.volunteers.vol_01, vehicle: 'car' as const, location: { x: target.x - 10, y: target.y } };
  const sameRoute = { ...world.volunteers.vol_02, vehicle: 'car' as const, location: { x: target.x - 20, y: target.y } };
  const differentRoute = { ...world.volunteers.vol_03, vehicle: 'boat' as const, location: { x: target.x, y: target.y - 20 } };
  const localWorld: QWorld = {
    ...world,
    volunteers: { ...world.volunteers, [lead.id]: lead, [sameRoute.id]: sameRoute, [differentRoute.id]: differentRoute },
  };
  assert.ok(routeCorridorSimilarity(lead, sameRoute, target) > routeCorridorSimilarity(lead, differentRoute, target));
  assert.deepEqual(diversifiedRouteBackupIds(localWorld, [
    { volunteerId: lead.id, incidentId: incident.id },
    { volunteerId: differentRoute.id, incidentId: incident.id },
  ]), [differentRoute.id]);
});
