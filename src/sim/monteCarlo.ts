/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic, seeded simulation for dispatch plan outcomes.
 */

import { Incident, MonteCarloResult, Plan, Report, Resource, SeverityLevel, Volunteer } from '../state/types.ts';

export interface MonteCarloWorldState {
  incidents: Record<string, Incident>;
  volunteers: Record<string, Volunteer>;
  resources: Record<string, Resource>;
  reports: Record<string, Report>;
  areas: Record<string, { id: string; name: string; coordinates: { x: number; y: number }; vulnerability: number }>;
  context?: {
    rainfallMmHr?: number;
  };
}

const HARM_THRESHOLDS: Record<SeverityLevel, number> = {
  critical: 20,
  high: 45,
  medium: 90,
  low: 180,
};

const SPEED_KMH: Record<Volunteer['vehicle'], number> = {
  none: 5,
  bike: 18,
  car: 24,
  boat: 14,
};

const DELAY_MEAN_MINUTES: Record<Volunteer['vehicle'], number> = {
  none: 5,
  bike: 3,
  car: 7,
  boat: 8,
};

const DEFAULT_SEED = 20261028;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(random: () => number): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function quantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const fraction = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[Math.min(lowerIndex + 1, sorted.length - 1)] - sorted[lowerIndex]) * fraction;
}

function peopleAtRisk(incident: Incident, reports: Record<string, Report>): number {
  const people = incident.reportIds.reduce((sum, id) => sum + Math.max(0, reports[id]?.peopleAtRisk || 0), 0);
  return people > 0 ? people : 1;
}

function incidentLocation(
  incident: Incident,
  areas: MonteCarloWorldState['areas']
): { x: number; y: number } {
  return incident.location || incident.coordinates || areas[incident.area]?.coordinates || { x: 400, y: 350 };
}

function routeMinutes(
  volunteer: Volunteer,
  incident: Incident,
  worldState: MonteCarloWorldState
): number {
  const target = incidentLocation(incident, worldState.areas);
  const distanceKm = Math.hypot(volunteer.location.x - target.x, volunteer.location.y - target.y) / 100;
  return distanceKm / SPEED_KMH[volunteer.vehicle] * 60;
}

function isNearMithi(incident: Incident, worldState: MonteCarloWorldState): boolean {
  const area = worldState.areas[incident.area];
  return /mithi|kurla|kranti|bail bazar/i.test(`${incident.area} ${area?.name || ''}`);
}

function waterRiseRate(
  incident: Incident,
  worldState: MonteCarloWorldState,
  random: () => number
): number {
  const vulnerability = Math.min(1, Math.max(0, worldState.areas[incident.area]?.vulnerability ?? 0.5));
  const rainfall = Math.max(0, worldState.context?.rainfallMmHr ?? 50);
  const mean = Math.max(0.1, rainfall * (0.015 + vulnerability * 0.025));
  const sigma = 0.35;
  return Math.exp(Math.log(mean) - sigma * sigma / 2 + sigma * normalSample(random));
}

function hasResourceShortfall(
  plan: Plan,
  incidentId: string,
  worldState: MonteCarloWorldState,
  random: () => number
): boolean {
  const assignments = plan.assignments.filter(assignment => assignment.incidentId === incidentId);
  const missingResource = assignments.some(assignment => {
    if (!assignment.resourceId) return false;
    const resource = worldState.resources[assignment.resourceId];
    return !resource || resource.quantity - (resource.allocatedQty || 0) < (assignment.qty || 1);
  });
  return random() < (missingResource ? 0.45 : 0.08);
}

/**
 * Runs seeded worlds and returns reached-people counts for every trial.
 * The supplied seed (or the stable default) fully determines the result.
 */
export function monteCarlo(
  plan: Plan,
  worldState: MonteCarloWorldState,
  trials = 300,
  seed = DEFAULT_SEED
): MonteCarloResult {
  const trialCount = Math.max(1, Math.floor(Number.isFinite(trials) ? trials : 300));
  const normalizedSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : DEFAULT_SEED;
  const random = seededRandom(normalizedSeed);
  const incidents = Object.values(worldState.incidents)
    .filter(incident => incident.status !== 'resolved');
  const criticalIncidents = incidents.filter(incident => incident.severity === 'critical');
  const outcomes: number[] = [];
  let allCriticalCount = 0;

  for (let trial = 0; trial < trialCount; trial++) {
    const closures = new Map<string, boolean>();
    const riseByArea = new Map<string, number>();
    let reachedPeople = 0;
    let allCriticalReached = true;

    incidents.forEach(incident => {
      if (!riseByArea.has(incident.area)) {
        riseByArea.set(incident.area, waterRiseRate(incident, worldState, random));
      }

      const assignments = plan.assignments.filter(assignment => assignment.incidentId === incident.id);
      const roadId = incident.area;
      if (!closures.has(roadId)) {
        closures.set(roadId, random() < (isNearMithi(incident, worldState) ? 0.35 : 0.12));
      }

      const threshold = HARM_THRESHOLDS[incident.severity] || HARM_THRESHOLDS.medium;
      const waterDelay = Math.max(0, (riseByArea.get(incident.area) || 0) - 1) * 0.2;
      const shortfall = hasResourceShortfall(plan, incident.id, worldState, random);
      const reached = assignments.some(assignment => {
        const volunteer = worldState.volunteers[assignment.volunteerId];
        if (!volunteer) return false;
        const meanDelay = DELAY_MEAN_MINUTES[volunteer.vehicle];
        const delay = Math.max(0, meanDelay + normalSample(random) * 2.5);
        const closureDelay = closures.get(roadId) ? 12 : 0;
        const arrival = routeMinutes(volunteer, incident, worldState) + delay + closureDelay + waterDelay;
        const resourcePenalty = shortfall ? 15 : 0;
        return arrival + resourcePenalty < threshold;
      });

      if (reached) reachedPeople += peopleAtRisk(incident, worldState.reports);
      if (incident.severity === 'critical' && !reached) {
        allCriticalReached = false;
      }
    });

    outcomes.push(reachedPeople);
    if (allCriticalReached) allCriticalCount++;
  }

  const expectedReached = outcomes.reduce((sum, outcome) => sum + outcome, 0) / trialCount;
  const variance = outcomes.reduce((sum, outcome) => sum + (outcome - expectedReached) ** 2, 0) / trialCount;
  const margin = 1.96 * Math.sqrt(variance / trialCount);

  return {
    trials: trialCount,
    seed: normalizedSeed,
    expectedReached,
    worstCase5pct: quantile(outcomes, 0.05),
    confidenceInterval95: {
      lower: Math.max(0, expectedReached - margin),
      upper: expectedReached + margin,
    },
    probabilityAllCriticalReached: criticalIncidents.length === 0 ? 1 : allCriticalCount / trialCount,
    outcomes,
  };
}
