/**
 * Quantum-annealing-inspired simulated annealing on a CPU; the energy is
 * -expected reach + lambda * cross-correlation standard deviation + a return-floor
 * penalty. Only cross-incident covariance is penalized so uncertainty within one
 * incident cannot make the optimizer abandon that rescue. No quantum speed-up is claimed.
 */
import {
  fieldCorrelationMatrix,
  incidentPoint,
  peopleAtRisk,
  seededRandom,
} from './entangledSim.ts';
import type { QWorld } from './entangledSim.ts';
import type { Incident, PlanAssignment, SeverityLevel, Volunteer } from '../state/types.ts';

export const MAX_PER_INCIDENT = 3;

const VEHICLE_SPEED_KMH: Record<Volunteer['vehicle'], number> = {
  none: 5,
  bike: 18,
  car: 24,
  boat: 14,
};

const MOBILISATION_DELAY_MINUTES: Record<Volunteer['vehicle'], number> = {
  none: 5,
  bike: 3,
  car: 7,
  boat: 8,
};

const HARM_THRESHOLDS: Record<SeverityLevel, number> = {
  critical: 20,
  high: 45,
  medium: 90,
  low: 180,
};

const SEVERITY_WEIGHTS: Record<SeverityLevel, number> = {
  critical: 3,
  high: 2,
  medium: 1.3,
  low: 1,
};

export interface AnnealDispatchOptions {
  seed?: number;
  steps?: number;
  riskAversion?: number;
}

export interface AnnealSolution {
  assignments: PlanAssignment[];
  energy: number;
  expectedWeighted: number;
  riskStd: number;
  coverage: Record<string, number>;
  diversifiedBackupVolunteerIds: string[];
}

export interface AnnealDispatchResult {
  annealed: AnnealSolution;
  greedy: AnnealSolution;
  oneEach: AnnealSolution;
  trace: number[];
  steps: number;
  tunnelMovesTried: number;
  tunnelMovesAccepted: number;
  incidentIds: string[];
  correlation: number[][];
}

interface EnergyMetrics {
  energy: number;
  expectedWeighted: number;
  riskStd: number;
  coverage: Record<string, number>;
}

interface Problem {
  incidents: Incident[];
  incidentIds: string[];
  areas: QWorld['areas'];
  volunteers: Volunteer[];
  weights: number[];
  probabilities: number[][];
  correlation: number[][];
  boatResourceId?: string;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function makeProblem(world: QWorld, requestedIncidentIds: string[]): Problem {
  const seen = new Set<string>();
  const incidents = requestedIncidentIds
    .filter(id => {
      if (seen.has(id) || !world.incidents[id] || world.incidents[id].status === 'resolved') return false;
      seen.add(id);
      return true;
    })
    .map(id => world.incidents[id]);
  const incidentIds = incidents.map(incident => incident.id);
  const volunteers = Object.values(world.volunteers)
    .filter(volunteer => volunteer.available && !volunteer.assignedIncidentId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const points = incidents.map(incident => incidentPoint(incident, world));
  const correlation = fieldCorrelationMatrix(points);
  const stress = clamp((world.context?.rainfallMmHr ?? 50) / 50, 0.25, 3);
  const weights = incidents.map(incident =>
    peopleAtRisk(incident, world.reports) * SEVERITY_WEIGHTS[incident.severity]
  );
  const probabilities = volunteers.map(volunteer => incidents.map((incident, index) => {
    const area = world.areas[incident.area];
    const areaLabel = `${incident.area} ${area?.name || ''}`;
    const closureChance = clamp(
      (/mithi|kurla|kranti|bail bazar/i.test(areaLabel) ? 0.35 : 0.12) * stress,
      0,
      0.85
    );
    const vulnerability = clamp(area?.vulnerability ?? 0.5, 0, 1);
    const target = points[index];
    const distanceKm = Math.hypot(
      volunteer.location.x - target.x,
      volunteer.location.y - target.y
    ) / 100;
    const route = distanceKm / VEHICLE_SPEED_KMH[volunteer.vehicle] * 60;
    const hazard = stress * 10 * vulnerability + 12 * closureChance;
    const threshold = HARM_THRESHOLDS[incident.severity] || HARM_THRESHOLDS.medium;
    const eta = route + MOBILISATION_DELAY_MINUTES[volunteer.vehicle] + hazard;
    const timely = 1 / (1 + Math.exp(-(0.85 * threshold - eta) / (0.15 * threshold + 2)));
    const needsText = incident.needs.join(' ');
    let skillFactor = 0.9;
    if (/boat|rescue|evac/i.test(needsText)) {
      skillFactor = volunteer.vehicle === 'boat' ? 1 : 0.35;
    }
    if (/medic|first-aid|oxygen/i.test(needsText)
      && volunteer.skills.some(skill => /first-aid/i.test(skill))) {
      skillFactor = Math.max(skillFactor, 0.95);
    }
    return timely * skillFactor * (0.7 + 0.3 * volunteer.trust);
  }));
  const boatResource = Object.values(world.resources)
    .filter(resource => /boat/i.test(resource.type))
    .sort((a, b) =>
      (b.quantity - (b.allocatedQty || 0)) - (a.quantity - (a.allocatedQty || 0))
      || a.id.localeCompare(b.id)
    )[0];

  return {
    incidents,
    incidentIds,
    areas: world.areas,
    volunteers,
    weights,
    probabilities,
    correlation,
    boatResourceId: boatResource?.id,
  };
}

function routeSector(volunteer: Volunteer, target: { x: number; y: number }): number {
  const angle = Math.atan2(target.y - volunteer.location.y, target.x - volunteer.location.x);
  return Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
}

export function routeCorridorSimilarity(
  first: Volunteer,
  second: Volunteer,
  target: { x: number; y: number }
): number {
  const sameSector = routeSector(first, target) === routeSector(second, target);
  if (sameSector) return first.vehicle === second.vehicle ? 1 : 0.55;
  return first.vehicle === second.vehicle ? 0.25 : 0;
}

export function diversifiedRouteBackupIds(
  world: QWorld,
  assignments: PlanAssignment[]
): string[] {
  const ids = new Set<string>();
  const grouped = new Map<string, Volunteer[]>();
  for (const assignment of assignments) {
    const volunteer = world.volunteers[assignment.volunteerId];
    if (!volunteer) continue;
    grouped.set(assignment.incidentId, [...(grouped.get(assignment.incidentId) || []), volunteer]);
  }
  for (const [incidentId, assigned] of grouped) {
    if (assigned.length < 2) continue;
    const incident = world.incidents[incidentId];
    if (!incident) continue;
    const location = incidentPoint(incident, world);
    const lead = assigned[0];
    for (const backup of assigned.slice(1)) {
      if (routeCorridorSimilarity(lead, backup, location) < 0.5) ids.add(backup.id);
    }
  }
  return [...ids];
}

function evaluate(
  state: number[],
  problem: Problem,
  lambda: number,
  floor: number
): EnergyMetrics {
  const coverage: Record<string, number> = {};
  const standardDeviations: number[] = [];
  let expectedWeighted = 0;

  problem.incidentIds.forEach((incidentId, incidentIndex) => {
    let missedProbability = 1;
    state.forEach((target, volunteerIndex) => {
      if (target === incidentIndex) {
        missedProbability *= 1 - problem.probabilities[volunteerIndex][incidentIndex];
      }
    });
    const probabilityReached = 1 - missedProbability;
    coverage[incidentId] = probabilityReached;
    expectedWeighted += problem.weights[incidentIndex] * probabilityReached;
    standardDeviations.push(Math.sqrt(probabilityReached * (1 - probabilityReached)));
  });

  let crossVariance = 0;
  for (let i = 0; i < problem.incidentIds.length; i++) {
    for (let k = 0; k < problem.incidentIds.length; k++) {
      if (i === k) continue;
      crossVariance += problem.weights[i] * problem.weights[k]
        * problem.correlation[i][k] * standardDeviations[i] * standardDeviations[k];
    }
  }
  const riskStd = Math.sqrt(Math.max(0, crossVariance));
  let routeSimilarityPenalty = 0;
  for (let incidentIndex = 0; incidentIndex < problem.incidentIds.length; incidentIndex++) {
    const assigned = state
      .map((target, volunteerIndex) => target === incidentIndex ? problem.volunteers[volunteerIndex] : null)
      .filter((volunteer): volunteer is Volunteer => volunteer !== null);
    const incident = problem.incidents[incidentIndex];
    const location = incidentPoint(incident, { areas: problem.areas });
    for (let first = 0; first < assigned.length; first++) {
      for (let second = first + 1; second < assigned.length; second++) {
        const similarity = routeCorridorSimilarity(assigned[first], assigned[second], location);
        routeSimilarityPenalty += similarity;
      }
    }
  }
  const meanWeight = problem.weights.length
    ? problem.weights.reduce((sum, weight) => sum + weight, 0) / problem.weights.length
    : 1;
  const energy = -expectedWeighted + lambda * riskStd
    + 10 * Math.max(0, floor - expectedWeighted)
    + routeSimilarityPenalty * meanWeight * 0.015;
  return { energy, expectedWeighted, riskStd, coverage };
}

function countAssignments(state: number[], incidentIndex: number): number {
  return state.reduce((count, target) => count + Number(target === incidentIndex), 0);
}

function isFeasible(state: number[], incidentCount: number): boolean {
  for (let incidentIndex = 0; incidentIndex < incidentCount; incidentIndex++) {
    if (countAssignments(state, incidentIndex) > MAX_PER_INCIDENT) return false;
  }
  return true;
}

function greedyState(
  problem: Problem,
  lambda: number,
  floor: number
): number[] {
  const state = problem.volunteers.map(() => -1);
  let currentEnergy = evaluate(state, problem, lambda, floor).energy;

  while (true) {
    let bestVolunteer = -1;
    let bestIncident = -1;
    let bestEnergy = currentEnergy;
    for (let volunteerIndex = 0; volunteerIndex < state.length; volunteerIndex++) {
      if (state[volunteerIndex] !== -1) continue;
      for (let incidentIndex = 0; incidentIndex < problem.incidentIds.length; incidentIndex++) {
        if (countAssignments(state, incidentIndex) >= MAX_PER_INCIDENT) continue;
        state[volunteerIndex] = incidentIndex;
        const candidateEnergy = evaluate(state, problem, lambda, floor).energy;
        state[volunteerIndex] = -1;
        if (candidateEnergy < bestEnergy - 1e-12) {
          bestEnergy = candidateEnergy;
          bestVolunteer = volunteerIndex;
          bestIncident = incidentIndex;
        }
      }
    }
    if (bestVolunteer < 0) break;
    state[bestVolunteer] = bestIncident;
    currentEnergy = bestEnergy;
  }
  return state;
}

function oneEachState(problem: Problem): number[] {
  const state = problem.volunteers.map(() => -1);
  const incidentOrder = problem.incidentIds
    .map((id, index) => ({ index, weight: problem.weights[index] }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const usedVolunteers = new Set<number>();

  for (const { index: incidentIndex } of incidentOrder) {
    let bestVolunteer = -1;
    let bestProbability = -1;
    for (let volunteerIndex = 0; volunteerIndex < problem.volunteers.length; volunteerIndex++) {
      if (usedVolunteers.has(volunteerIndex)) continue;
      const probability = problem.probabilities[volunteerIndex][incidentIndex];
      if (probability > bestProbability) {
        bestProbability = probability;
        bestVolunteer = volunteerIndex;
      }
    }
    if (bestVolunteer >= 0) {
      state[bestVolunteer] = incidentIndex;
      usedVolunteers.add(bestVolunteer);
    }
  }
  return state;
}

function assignmentsFor(state: number[], problem: Problem): PlanAssignment[] {
  const assignments: PlanAssignment[] = [];
  state.forEach((incidentIndex, volunteerIndex) => {
    if (incidentIndex < 0) return;
    const volunteer = problem.volunteers[volunteerIndex];
    const assignment: PlanAssignment = {
      volunteerId: volunteer.id,
      incidentId: problem.incidentIds[incidentIndex],
    };
    if (volunteer.vehicle === 'boat' && problem.boatResourceId) {
      assignment.resourceId = problem.boatResourceId;
      assignment.qty = 1;
    }
    assignments.push(assignment);
  });
  return assignments;
}

function solutionFor(
  state: number[],
  problem: Problem,
  lambda: number,
  floor: number
): AnnealSolution {
  const assignments = assignmentsFor(state, problem);
  return {
    assignments,
    diversifiedBackupVolunteerIds: diversifiedRouteBackupIds({
      incidents: Object.fromEntries(problem.incidents.map(incident => [incident.id, incident])),
      volunteers: Object.fromEntries(problem.volunteers.map(volunteer => [volunteer.id, volunteer])),
      resources: {},
      reports: {},
      areas: problem.areas,
    }, assignments),
    ...evaluate(state, problem, lambda, floor),
  };
}

function randomIndex(random: () => number, length: number): number {
  return Math.floor(random() * length);
}

function proposeTunnelMove(
  state: number[],
  incidentCount: number,
  random: () => number
): number[] | null {
  if (state.length < 2 || incidentCount === 0) return null;
  const incidentIndex = randomIndex(random, incidentCount);
  const moveSize = random() < 0.5 ? 2 : 3;
  const crew = state.map((_, index) => index);
  for (let i = crew.length - 1; i > 0; i--) {
    const j = randomIndex(random, i + 1);
    [crew[i], crew[j]] = [crew[j], crew[i]];
  }
  const next = [...state];
  for (const volunteerIndex of crew.slice(0, Math.min(moveSize, crew.length))) {
    next[volunteerIndex] = incidentIndex;
  }
  return isFeasible(next, incidentCount) ? next : null;
}

function proposeSwapMove(
  state: number[],
  incidentCount: number,
  random: () => number
): number[] | null {
  if (state.length < 2) return null;
  const first = randomIndex(random, state.length);
  const second = (first + 1 + randomIndex(random, state.length - 1)) % state.length;
  const next = [...state];
  [next[first], next[second]] = [next[second], next[first]];
  return isFeasible(next, incidentCount) ? next : null;
}

function proposeReassignment(
  state: number[],
  incidentCount: number,
  random: () => number
): number[] | null {
  if (state.length === 0) return null;
  const volunteerIndex = randomIndex(random, state.length);
  const next = [...state];
  next[volunteerIndex] = randomIndex(random, incidentCount + 1) - 1;
  return isFeasible(next, incidentCount) ? next : null;
}

export function annealDispatch(
  world: QWorld,
  incidentIds: string[],
  options: AnnealDispatchOptions = {}
): AnnealDispatchResult {
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed!) >>> 0 : 20261111;
  const steps = Math.max(200, Math.floor(Number.isFinite(options.steps) ? options.steps! : 6000));
  const lambda = Math.max(0, Number.isFinite(options.riskAversion) ? options.riskAversion! : 1);
  const problem = makeProblem(world, incidentIds);
  const riskNeutralReference = greedyState(problem, 0, 0);
  const referenceExpected = evaluate(riskNeutralReference, problem, 0, 0).expectedWeighted;
  const floor = 0.97 * referenceExpected;
  const greedy = greedyState(problem, lambda, floor);
  const oneEach = oneEachState(problem);
  const greedyEnergy = evaluate(greedy, problem, lambda, floor).energy;
  const oneEachEnergy = evaluate(oneEach, problem, lambda, floor).energy;
  let current = greedyEnergy <= oneEachEnergy ? [...greedy] : [...oneEach];
  let currentEnergy = Math.min(greedyEnergy, oneEachEnergy);
  let best = [...current];
  let bestEnergy = currentEnergy;
  const random = seededRandom(seed);
  const meanWeight = problem.weights.length
    ? problem.weights.reduce((sum, weight) => sum + weight, 0) / problem.weights.length
    : 1;
  const initialTemperature = 0.25 * meanWeight;
  const finalTemperature = 0.004 * meanWeight;
  const trace: number[] = [];
  let tunnelMovesTried = 0;
  let tunnelMovesAccepted = 0;
  const traceSamples = Math.min(120, steps);

  for (let step = 0; step < steps; step++) {
    const progress = steps <= 1 ? 1 : step / (steps - 1);
    const temperature = initialTemperature * (finalTemperature / initialTemperature) ** progress;
    const gamma = 0.12 * (1 - progress);
    const roll = random();
    let candidate: number[] | null;
    let isTunnel = false;

    if (roll < gamma) {
      tunnelMovesTried++;
      isTunnel = true;
      candidate = proposeTunnelMove(current, problem.incidentIds.length, random);
    } else if (roll < gamma + 0.25) {
      candidate = proposeSwapMove(current, problem.incidentIds.length, random);
    } else {
      candidate = proposeReassignment(current, problem.incidentIds.length, random);
    }

    if (candidate && candidate.some((target, index) => target !== current[index])) {
      const candidateEnergy = evaluate(candidate, problem, lambda, floor).energy;
      const delta = candidateEnergy - currentEnergy;
      if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
        current = candidate;
        currentEnergy = candidateEnergy;
        if (isTunnel) tunnelMovesAccepted++;
        if (currentEnergy < bestEnergy - 1e-12) {
          best = [...current];
          bestEnergy = currentEnergy;
        }
      }
    }

    if (Math.floor((step + 1) * traceSamples / steps) > Math.floor(step * traceSamples / steps)) {
      trace.push(currentEnergy);
    }
  }

  return {
    annealed: solutionFor(best, problem, lambda, floor),
    greedy: solutionFor(greedy, problem, lambda, floor),
    oneEach: solutionFor(oneEach, problem, lambda, floor),
    trace,
    steps,
    tunnelMovesTried,
    tunnelMovesAccepted,
    incidentIds: problem.incidentIds,
    correlation: problem.correlation,
  };
}

export function limitResponders(world: QWorld, count: number, seed = 1): QWorld {
  const random = seededRandom(Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 1);
  const volunteerIds = Object.keys(world.volunteers).sort((a, b) => a.localeCompare(b));
  for (let i = volunteerIds.length - 1; i > 0; i--) {
    const j = randomIndex(random, i + 1);
    [volunteerIds[i], volunteerIds[j]] = [volunteerIds[j], volunteerIds[i]];
  }
  const keptCount = Number.isFinite(count)
    ? clamp(Math.floor(count), 0, volunteerIds.length)
    : 0;
  const kept = new Set(volunteerIds.slice(0, keptCount));
  const volunteers = Object.fromEntries(
    Object.entries(world.volunteers).map(([id, volunteer]) => [
      id,
      { ...volunteer, available: kept.has(id) },
    ])
  );
  return { ...world, volunteers };
}
