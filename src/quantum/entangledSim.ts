/**
 * "Entanglement" is a quantum-inspired name for measured correlation; nothing
 * runs on quantum hardware. Shared causes are spatially correlated surge and
 * road-closure fields, plus resource-shortfall draws shared by competing incidents.
 */
import type {
  Incident,
  PlanAssignment,
  Report,
  Resource,
  SeverityLevel,
  Volunteer,
} from '../state/types.ts';

export interface QWorld {
  incidents: Record<string, Incident>;
  volunteers: Record<string, Volunteer>;
  resources: Record<string, Resource>;
  reports: Record<string, Report>;
  areas: Record<string, {
    id: string;
    name: string;
    coordinates: { x: number; y: number };
    vulnerability: number;
  }>;
  context?: {
    rainfallMmHr?: number;
    ambientTempC?: number;
    dispatchDelayMinutes?: number;
    dispatchDelayByIncident?: Record<string, number>;
  };
}

export interface EntangledEdge {
  a: string;
  b: string;
  phi: number;
  mutualInformationBits: number;
  pBGivenAReached: number;
  pBGivenAMissed: number;
}

export interface EntangledSimResult {
  trials: number;
  seed: number;
  incidentIds: string[];
  reached: boolean[][];
  marginal: Record<string, number>;
  edges: EntangledEdge[];
  expectedReached: number;
  worstCase5pct: number;
  stdReached: number;
  probabilityAllCriticalReached: number;
  outcomes: number[];
  heatMetrics: {
    averagePowerCutProbability: number;
    averageHospitalCapacityShortfallProbability: number;
    heatIllnessCallPressure: number;
  };
}

export interface CollapseResult {
  matchingTrials: number;
  probabilities: Record<string, number>;
}

export const FIELD_LENGTH = 90;

const HARM_THRESHOLDS: Record<SeverityLevel, number> = {
  critical: 20,
  high: 45,
  medium: 90,
  low: 180,
};

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

const DEFAULT_SEED = 20261111;

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalSample(random: () => number): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

/** Abramowitz and Stegun 26.2.23 approximation to the inverse normal CDF. */
export function probit(probability: number): number {
  const p = Math.min(1 - 1e-6, Math.max(1e-6, probability));
  const tail = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(tail));
  const numerator = 2.515517 + 0.802853 * t + 0.010328 * t * t;
  const denominator = 1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t;
  const magnitude = t - numerator / denominator;
  return p < 0.5 ? -magnitude : magnitude;
}

export function incidentPoint(
  incident: Incident,
  world: Pick<QWorld, 'areas'>
): { x: number; y: number } {
  return incident.location
    || incident.coordinates
    || world.areas[incident.area]?.coordinates
    || { x: 400, y: 350 };
}

export function peopleAtRisk(incident: Incident, reports: Record<string, Report>): number {
  const total = incident.reportIds.reduce(
    (sum, reportId) => sum + Math.max(0, reports[reportId]?.peopleAtRisk ?? 0),
    0
  );
  return Math.max(1, total);
}

function gaussianKernelMatrix(
  points: Array<{ x: number; y: number }>,
  length: number
): number[][] {
  return points.map(point => points.map(other => {
    const distanceSquared = (point.x - other.x) ** 2 + (point.y - other.y) ** 2;
    return Math.exp(-distanceSquared / (2 * length * length));
  }));
}

export function fieldCorrelationMatrix(
  points: Array<{ x: number; y: number }>,
  length = FIELD_LENGTH
): number[][] {
  if (!Number.isFinite(length) || length <= 0) {
    throw new RangeError('Field correlation length must be a positive finite number.');
  }
  const kernels = gaussianKernelMatrix(points, length);
  const norms = kernels.map(row => Math.sqrt(row.reduce((sum, value) => sum + value * value, 0)));

  return points.map((_, i) => points.map((__, k) => {
    const dot = kernels[i].reduce((sum, value, j) => sum + value * kernels[k][j], 0);
    return dot / (norms[i] * norms[k]);
  }));
}

function linearQuantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

function measureEdge(a: string, b: string, reached: boolean[][], aIndex: number, bIndex: number): EntangledEdge {
  let n11 = 0;
  let n10 = 0;
  let n01 = 0;
  let n00 = 0;

  for (const trial of reached) {
    if (trial[aIndex] && trial[bIndex]) n11++;
    else if (trial[aIndex]) n10++;
    else if (trial[bIndex]) n01++;
    else n00++;
  }

  const count = reached.length;
  const denominator = Math.sqrt(
    (n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00)
  );
  const phi = denominator === 0 ? 0 : (n11 * n00 - n10 * n01) / denominator;
  const pAReached = (n11 + n10) / count;
  const pAMissed = (n01 + n00) / count;
  const pBReached = (n11 + n01) / count;
  const pBMissed = (n10 + n00) / count;
  const cells: Array<[number, number, number]> = [
    [n11, pAReached, pBReached],
    [n10, pAReached, pBMissed],
    [n01, pAMissed, pBReached],
    [n00, pAMissed, pBMissed],
  ];
  let mutualInformationBits = 0;
  for (const [cellCount, pA, pB] of cells) {
    if (cellCount === 0) continue;
    const jointProbability = cellCount / count;
    mutualInformationBits += jointProbability * Math.log2(jointProbability / (pA * pB));
  }

  return {
    a,
    b,
    phi,
    mutualInformationBits: Math.max(0, mutualInformationBits),
    pBGivenAReached: n11 + n10 === 0 ? 0 : n11 / (n11 + n10),
    pBGivenAMissed: n01 + n00 === 0 ? 0 : n01 / (n01 + n00),
  };
}

export function entangledMonteCarlo(
  assignments: PlanAssignment[],
  world: QWorld,
  trials = 300,
  seed = DEFAULT_SEED
): EntangledSimResult {
  const trialCount = Math.max(1, Math.floor(Number.isFinite(trials) ? trials : 300));
  const normalizedSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : DEFAULT_SEED;
  const random = seededRandom(normalizedSeed);
  const incidents = Object.values(world.incidents).filter(incident => incident.status !== 'resolved');
  const incidentIds = incidents.map(incident => incident.id);
  const points = incidents.map(incident => incidentPoint(incident, world));
  const kernels = gaussianKernelMatrix(points, FIELD_LENGTH);
  const rowNorms = kernels.map(row => Math.sqrt(row.reduce((sum, value) => sum + value * value, 0)));
  const resourceDemand = new Map<string, number>();
  for (const assignment of assignments) {
    if (!assignment.resourceId) continue;
    resourceDemand.set(
      assignment.resourceId,
      (resourceDemand.get(assignment.resourceId) || 0) + (assignment.qty || 1)
    );
  }
  const assignmentsByIncident = new Map<string, PlanAssignment[]>();
  for (const assignment of assignments) {
    const list = assignmentsByIncident.get(assignment.incidentId) || [];
    list.push(assignment);
    assignmentsByIncident.set(assignment.incidentId, list);
  }
  const criticalIndices = incidents
    .map((incident, index) => incident.severity === 'critical' ? index : -1)
    .filter(index => index >= 0);
  const rainfall = world.context?.rainfallMmHr ?? 50;
  const stress = Math.min(3, Math.max(0.25, rainfall / 50));
  const ambientTempC = world.context?.ambientTempC ?? 33;
  const reached: boolean[][] = [];
  const outcomes: number[] = [];
  let allCriticalCount = 0;
  let powerCutCount = 0;
  let hospitalCapacityShortfallCount = 0;
  let heatIllnessCallPressure = 0;

  for (let trialIndex = 0; trialIndex < trialCount; trialIndex++) {
    const z1 = incidents.map(() => normalSample(random));
    const z2 = incidents.map(() => normalSample(random));
    const zHeat = incidents.map(() => normalSample(random));
    const surge = incidents.map((_, i) => {
      const weighted = kernels[i].reduce((sum, kernel, j) => sum + kernel * z1[j], 0);
      return weighted / rowNorms[i];
    });
    const closure = incidents.map((_, i) => {
      const weighted = kernels[i].reduce((sum, kernel, j) => sum + kernel * z2[j], 0);
      return weighted / rowNorms[i];
    });
    const heatField = incidents.map((_, i) => {
      const weighted = kernels[i].reduce((sum, kernel, j) => sum + kernel * zHeat[j], 0);
      return weighted / rowNorms[i];
    });
    const resourceShortfall = new Map<string, boolean>();
    for (const resourceId of resourceDemand.keys()) {
      const resource = world.resources[resourceId];
      const short = !resource
        || resource.quantity - (resource.allocatedQty || 0) < resourceDemand.get(resourceId)!;
      resourceShortfall.set(resourceId, random() < (short ? 0.45 : 0.08));
    }
    const noResourceShortfall = new Map<string, boolean>();
    const trialReached: boolean[] = [];
    let reachedPeople = 0;
    let allCriticalReached = true;

    incidents.forEach((incident, index) => {
      const area = world.areas[incident.area];
      const areaLabel = `${incident.area} ${area?.name || ''}`;
      const closureProbability = Math.min(
        0.85,
        (/mithi|kurla|kranti|bail bazar/i.test(areaLabel) ? 0.35 : 0.12) * stress
      );
      const closureDelay = closure[index] > probit(1 - closureProbability) ? 12 : 0;
      const vulnerability = Math.min(1, Math.max(0, area?.vulnerability ?? 0.5));
      const waterDelay = stress * 10 * vulnerability * Math.exp(0.5 * surge[index] - 0.125);
      const heatIndexC = incident.heatIndexC ?? ambientTempC;
      const heatStress = Math.min(1, Math.max(0, (heatIndexC - 28) / 20));
      const heatIncident = incident.type === 'heatwave' || incident.heatIndexC !== undefined;
      const powerCutProbability = Math.min(0.65, Math.max(0, (ambientTempC - 32) / 18 + heatStress * 0.15));
      const hospitalCapacityProbability = Math.min(
        0.65,
        Math.max(0, (ambientTempC - 34) / 24 + (heatIncident ? heatStress * 0.2 : 0))
      );
      const powerCut = powerCutProbability > 0 && heatField[index] > probit(1 - powerCutProbability);
      const hospitalCapacityShortfall = heatIncident && hospitalCapacityProbability > 0 &&
        heatField[index] > probit(1 - hospitalCapacityProbability);
      if (powerCut) powerCutCount++;
      if (hospitalCapacityShortfall) hospitalCapacityShortfallCount++;
      if (heatIncident) heatIllnessCallPressure += heatStress * (1 + vulnerability);
      const heatPowerDelay = powerCut ? 9 : 0;
      const hospitalDelay = hospitalCapacityShortfall ? 11 : 0;
      const heatCallDelay = heatIncident ? heatStress * 5 : 0;
      const incidentAssignments = assignmentsByIncident.get(incident.id) || [];
      const withoutResource = incidentAssignments.some(assignment => !assignment.resourceId);
      if (withoutResource && !noResourceShortfall.has(incident.id)) {
        noResourceShortfall.set(incident.id, random() < 0.08);
      }
      const threshold = HARM_THRESHOLDS[incident.severity] || HARM_THRESHOLDS.medium;
      const dispatchDelay = Math.max(
        0,
        world.context?.dispatchDelayByIncident?.[incident.id] ?? world.context?.dispatchDelayMinutes ?? 0
      );
      const isReached = incidentAssignments.some(assignment => {
        const volunteer = world.volunteers[assignment.volunteerId];
        if (!volunteer) return false;
        const target = points[index];
        const distanceKm = Math.hypot(
          volunteer.location.x - target.x,
          volunteer.location.y - target.y
        ) / 100;
        const routeMinutes = distanceKm / VEHICLE_SPEED_KMH[volunteer.vehicle] * 60;
        const mobilisation = Math.max(
          0,
          MOBILISATION_DELAY_MINUTES[volunteer.vehicle] + 2.5 * normalSample(random)
        );
        const shortfall = assignment.resourceId
          ? resourceShortfall.get(assignment.resourceId) || false
          : noResourceShortfall.get(incident.id) || false;
        const shortfallDelay = shortfall ? 15 : 0;
        return routeMinutes + mobilisation + dispatchDelay + closureDelay + waterDelay +
          heatPowerDelay + hospitalDelay + heatCallDelay + shortfallDelay < threshold;
      });

      trialReached.push(isReached);
      if (isReached) reachedPeople += peopleAtRisk(incident, world.reports);
      if (incident.severity === 'critical' && !isReached) allCriticalReached = false;
    });

    reached.push(trialReached);
    outcomes.push(reachedPeople);
    if (allCriticalReached) allCriticalCount++;
  }

  const marginal: Record<string, number> = {};
  incidentIds.forEach((id, index) => {
    marginal[id] = reached.reduce((sum, trial) => sum + Number(trial[index]), 0) / trialCount;
  });
  const edges: EntangledEdge[] = [];
  for (let a = 0; a < incidentIds.length; a++) {
    for (let b = a + 1; b < incidentIds.length; b++) {
      edges.push(measureEdge(incidentIds[a], incidentIds[b], reached, a, b));
    }
  }
  edges.sort((a, b) => b.mutualInformationBits - a.mutualInformationBits);
  const expectedReached = outcomes.reduce((sum, value) => sum + value, 0) / trialCount;
  const variance = outcomes.reduce((sum, value) => sum + (value - expectedReached) ** 2, 0) / trialCount;

  return {
    trials: trialCount,
    seed: normalizedSeed,
    incidentIds,
    reached,
    marginal,
    edges,
    expectedReached,
    worstCase5pct: linearQuantile(outcomes, 0.05),
    stdReached: Math.sqrt(variance),
    probabilityAllCriticalReached: criticalIndices.length === 0
      ? 1
      : allCriticalCount / trialCount,
    outcomes,
    heatMetrics: {
      averagePowerCutProbability: powerCutCount / (trialCount * Math.max(1, incidents.length)),
      averageHospitalCapacityShortfallProbability: hospitalCapacityShortfallCount /
        (trialCount * Math.max(1, incidents.length)),
      heatIllnessCallPressure: heatIllnessCallPressure / trialCount,
    },
  };
}

export function collapse(
  result: EntangledSimResult,
  observed: Record<string, boolean>
): CollapseResult {
  const observations = Object.entries(observed).filter(([id]) => result.incidentIds.includes(id));
  const matchingTrials = result.reached.filter(trial =>
    observations.every(([id, value]) => trial[result.incidentIds.indexOf(id)] === value)
  );
  const probabilities: Record<string, number> = {};

  result.incidentIds.forEach((id, index) => {
    probabilities[id] = matchingTrials.length === 0
      ? result.marginal[id] || 0
      : matchingTrials.reduce((sum, trial) => sum + Number(trial[index]), 0) / matchingTrials.length;
  });

  return {
    matchingTrials: matchingTrials.length,
    probabilities,
  };
}
