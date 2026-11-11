/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic dispatch planning with optional Gemini-written plan explanations.
 */

import { Incident, LocationCoordinates, Plan, PlanAssignment, Resource, RoadClosure as StateRoadClosure, VehicleType, Volunteer } from '../state/types.ts';
import { EventSubscriber, useWorldStore, WorldStoreState } from '../state/store.ts';
import { isIncidentDispatchable } from '../tools/credibility.ts';
import { annealDispatch } from '../quantum/anneal.ts';
import { entangledMonteCarlo, QWorld } from '../quantum/entangledSim.ts';
import { fetchWithTimeout } from '../services/fetchWithTimeout.ts';

export type DispatchStrategy = 'maximise_coverage' | 'protect_critical' | 'minimise_risk' | 'entangled_optimal';
export type RouteMode = VehicleType | 'foot';

export type RoadClosure = StateRoadClosure;

export interface DispatchSnapshot {
  volunteers: Record<string, Volunteer>;
  incidents: Record<string, Incident>;
  resources: Record<string, Resource>;
  reports: WorldStoreState['reports'];
  areas: WorldStoreState['areas'];
  officialAlerts: WorldStoreState['officialAlerts'];
  roadClosures?: WorldStoreState['roadClosures'];
  rejectionConstraints: string[];
  context?: WorldStoreState['context'];
}

export interface PlanAssignmentChange {
  strategy: DispatchStrategy;
  added: PlanAssignment[];
  removed: PlanAssignment[];
}

export interface DispatchPlansUpdatedPayload {
  plans: Plan[];
  changes: PlanAssignmentChange[];
  changeReason: string;
  probabilityChanges: Record<string, number>;
  triggerEventType: string;
}

const STRATEGIES: DispatchStrategy[] = ['maximise_coverage', 'protect_critical', 'minimise_risk', 'entangled_optimal'];

const BUILD_PLAN_DECLARATION = {
  name: 'build_plan',
  description: 'Build one deterministic dispatch candidate for the selected strategy. All numeric metrics are computed by this tool.',
  parameters: {
    type: 'OBJECT',
    properties: {
      strategy: {
        type: 'STRING',
        enum: STRATEGIES,
        description: 'One of maximise_coverage, protect_critical, minimise_risk, or entangled_optimal.',
      },
    },
    required: ['strategy'],
  },
};

const MODE_SPEED_KMH: Record<RouteMode, number> = {
  none: 5,
  foot: 5,
  bike: 18,
  car: 24,
  boat: 14,
};

function snapshotFromState(state: WorldStoreState): DispatchSnapshot {
  return {
    volunteers: state.volunteers,
    incidents: state.incidents,
    resources: state.resources,
    reports: state.reports,
    areas: state.areas,
    officialAlerts: state.officialAlerts,
    roadClosures: state.roadClosures,
    rejectionConstraints: state.rejectionConstraints,
    context: state.context,
  };
}

function schematicDistanceKm(from: LocationCoordinates, to: LocationCoordinates): number {
  return Math.hypot(from.x - to.x, from.y - to.y) / 100;
}

/** Returns available volunteers with the requested skill, closest first. */
export function find_volunteers(
  skill: string,
  near: LocationCoordinates,
  radiusKm: number,
  volunteers: Record<string, Volunteer> = useWorldStore.getState().volunteers
): Volunteer[] {
  return Object.values(volunteers)
    .filter(volunteer => volunteer.available)
    .filter(volunteer => skill === '*' || volunteer.skills.some(item => item.toLowerCase() === skill.toLowerCase()))
    .filter(volunteer => schematicDistanceKm(volunteer.location, near) <= radiusKm)
    .sort((a, b) => schematicDistanceKm(a.location, near) - schematicDistanceKm(b.location, near));
}

/** Sums unallocated stock matching a resource type, optionally at one depot. */
export function check_stock(
  type: string,
  depotArea?: string,
  resources: Record<string, Resource> = useWorldStore.getState().resources
): number {
  const normalizedType = type.toLowerCase();
  const normalizedDepot = depotArea?.toLowerCase();
  return Object.values(resources)
    .filter(resource => resource.type.toLowerCase() === normalizedType)
    .filter(resource => !normalizedDepot || resource.depotArea.toLowerCase() === normalizedDepot)
    .reduce((available, resource) => available + Math.max(0, resource.quantity - (resource.allocatedQty || 0)), 0);
}

/** Estimates travel time from schematic distance, vehicle speed, and matching road closures. */
export function estimate_route_time(
  from: LocationCoordinates,
  to: LocationCoordinates,
  mode: RouteMode,
  roadClosures: RoadClosure[] = []
): number {
  const distanceKm = schematicDistanceKm(from, to);
  const travelMinutes = distanceKm / MODE_SPEED_KMH[mode] * 60;
  const closurePenalty = roadClosures.reduce((sum, closure) => sum + closure.penaltyMinutes, 0);
  return Math.round((travelMinutes + closurePenalty) * 10) / 10;
}

function getIncidentLocation(incident: Incident, snapshot: DispatchSnapshot): LocationCoordinates {
  if (incident.location || incident.coordinates) return incident.location || incident.coordinates!;
  return snapshot.areas[incident.area]?.coordinates || { x: 400, y: 350 };
}

function getIncidentSkill(incident: Incident): string {
  const needs = incident.needs.join(' ').toLowerCase();
  if (needs.includes('boat') || needs.includes('water rescue')) return 'boat';
  if (needs.includes('tow') || needs.includes('drive')) return 'driving';
  if (needs.includes('medical') || needs.includes('first-aid') || needs.includes('oxygen')) return 'first-aid';
  return '*';
}

function getResourceType(incident: Incident): string | undefined {
  const needs = incident.needs.join(' ').toLowerCase();
  if (needs.includes('boat')) return 'inflatable_boat';
  if (needs.includes('medical') || needs.includes('first-aid') || needs.includes('oxygen')) return 'medical_trauma_kit';
  if (needs.includes('food')) return 'food_rations';
  if (needs.includes('water')) return 'potable_water_canisters';
  if (needs.includes('pump')) return 'dewatering_pump';
  if (needs.includes('towing')) return 'heavy_tow_winch';
  if (needs.includes('evac')) return 'evac_stretchers';
  return undefined;
}

function getRoadClosures(snapshot: DispatchSnapshot, area: string): RoadClosure[] {
  const alertClosures = snapshot.officialAlerts
    .filter(alert => !alert.area || alert.area.toLowerCase() === 'all' || alert.area.toLowerCase() === area.toLowerCase())
    .filter(alert => /\b(closed|closure|blocked|submerged|impassable|diverted)\b/i.test(`${alert.headline} ${alert.text}`))
    .map(alert => ({
      area: alert.area,
      description: `${alert.headline}: ${alert.text}`,
      penaltyMinutes: 12,
    }));
  const reportedClosures = (snapshot.roadClosures || [])
    .filter(closure => !closure.area || closure.area.toLowerCase() === 'all' || closure.area.toLowerCase() === area.toLowerCase());
  return [...alertClosures, ...reportedClosures];
}

function incidentSeverityRank(incident: Incident): number {
  return incident.severity === 'critical' ? 4 : incident.severity === 'high' ? 3 : incident.severity === 'medium' ? 2 : 1;
}

function rankIncidents(
  incidents: Incident[],
  strategy: DispatchStrategy,
  snapshot: DispatchSnapshot
): Incident[] {
  const withOptions = incidents.map(incident => ({
    incident,
    candidates: find_volunteers(
      getIncidentSkill(incident),
      getIncidentLocation(incident, snapshot),
      20,
      snapshot.volunteers
    ),
  }));

  if (strategy === 'protect_critical') {
    return withOptions
      .sort((a, b) =>
        incidentSeverityRank(b.incident) - incidentSeverityRank(a.incident) ||
        b.incident.priority - a.incident.priority
      )
      .map(item => item.incident);
  }

  if (strategy === 'maximise_coverage') {
    return withOptions
      .sort((a, b) =>
        a.candidates.length - b.candidates.length ||
        a.incident.priority - b.incident.priority
      )
      .map(item => item.incident);
  }

  return withOptions
    .sort((a, b) => {
      const locationA = getIncidentLocation(a.incident, snapshot);
      const locationB = getIncidentLocation(b.incident, snapshot);
      const riskA = a.candidates.length
        ? Math.min(...a.candidates.map(volunteer =>
          schematicDistanceKm(volunteer.location, locationA) + (1 - volunteer.trust) * 5
        ))
        : Number.POSITIVE_INFINITY;
      const riskB = b.candidates.length
        ? Math.min(...b.candidates.map(volunteer =>
          schematicDistanceKm(volunteer.location, locationB) + (1 - volunteer.trust) * 5
        ))
        : Number.POSITIVE_INFINITY;
      return riskA - riskB || b.incident.priority - a.incident.priority;
    })
    .map(item => item.incident);
}

function selectVolunteer(
  incident: Incident,
  strategy: DispatchStrategy,
  usedVolunteerIds: Set<string>,
  snapshot: DispatchSnapshot,
  closures: RoadClosure[]
): Volunteer | undefined {
  const target = getIncidentLocation(incident, snapshot);
  const candidates = find_volunteers(getIncidentSkill(incident), target, 20, snapshot.volunteers)
    .filter(volunteer => !usedVolunteerIds.has(volunteer.id));

  if (strategy === 'minimise_risk') {
    return candidates.sort((a, b) => {
      const riskScore = (volunteer: Volunteer) =>
        estimate_route_time(volunteer.location, target, volunteer.vehicle, closures) +
        (1 - volunteer.trust) * 20;
      return riskScore(a) - riskScore(b);
    })[0];
  }

  return candidates[0];
}

function resourceIdFor(
  incident: Incident,
  remainingStock: Record<string, number>,
  snapshot: DispatchSnapshot
): string | undefined {
  const resourceType = getResourceType(incident);
  if (!resourceType || check_stock(resourceType, undefined, snapshot.resources) < 1) return undefined;
  const resource = Object.values(snapshot.resources)
    .filter(item => item.type === resourceType && (remainingStock[item.id] || 0) > 0)
    .sort((a, b) => (remainingStock[b.id] || 0) - (remainingStock[a.id] || 0))[0];
  if (!resource) return undefined;
  remainingStock[resource.id] -= 1;
  return resource.id;
}

function buildEntangledOptimalPlan(
  snapshot: DispatchSnapshot,
  planningSnapshot: DispatchSnapshot,
  eligibleIncidents: Incident[]
): Plan {
  const world: QWorld = {
    incidents: Object.fromEntries(eligibleIncidents.map(incident => [incident.id, incident])),
    volunteers: planningSnapshot.volunteers,
    resources: planningSnapshot.resources,
    reports: snapshot.reports,
    areas: snapshot.areas,
    context: { rainfallMmHr: snapshot.context?.rainfallMmHr },
  };
  const incidentIds = eligibleIncidents.map(incident => incident.id);
  const annealed = annealDispatch(world, incidentIds, { seed: 7 });
  const entangled = entangledMonteCarlo(annealed.annealed.assignments, world, 600, 42);
  const assignments = annealed.annealed.assignments;
  const assignedIncidentIds = new Set(assignments.map(assignment => assignment.incidentId));
  const coverage = eligibleIncidents.length === 0
    ? 100
    : Math.round(assignedIncidentIds.size / eligibleIncidents.length * 100);
  const routeTimes: number[] = [];
  const trustScores: number[] = [];

  assignments.forEach(assignment => {
    const incident = planningSnapshot.incidents[assignment.incidentId];
    const volunteer = planningSnapshot.volunteers[assignment.volunteerId];
    if (!incident || !volunteer) return;
    const closures = getRoadClosures(planningSnapshot, incident.area);
    routeTimes.push(estimate_route_time(
      volunteer.location,
      getIncidentLocation(incident, planningSnapshot),
      volunteer.vehicle,
      closures
    ));
    trustScores.push(volunteer.trust);
  });

  const etaMinutes = routeTimes.length
    ? Math.round(routeTimes.reduce((sum, time) => sum + time, 0) / routeTimes.length * 10) / 10
    : 0;
  const meanTrust = trustScores.length
    ? trustScores.reduce((sum, trust) => sum + trust, 0) / trustScores.length
    : 0;
  const unservedRatio = eligibleIncidents.length === 0
    ? 0
    : (eligibleIncidents.length - assignedIncidentIds.size) / eligibleIncidents.length;
  const riskScore = Math.min(100, Math.round(
    unservedRatio * 45 + Math.min(30, etaMinutes * 1.5) + (trustScores.length ? (1 - meanTrust) * 25 : 0)
  ));
  const entanglementMetrics = {
    trials: entangled.trials,
    energy: annealed.annealed.energy,
    expectedWeightedReach: annealed.annealed.expectedWeighted,
    riskStd: annealed.annealed.riskStd,
    expectedReached: entangled.expectedReached,
    worstCase5pct: entangled.worstCase5pct,
    spread: entangled.stdReached,
    probabilityAllCriticalReached: entangled.probabilityAllCriticalReached,
    correlatedPairs: entangled.edges.filter(edge => edge.mutualInformationBits >= 0.005).length,
  };

  return {
    id: 'dispatch_entangled_optimal',
    name: 'Entangled optimal',
    strategy: 'entangled_optimal',
    assignments,
    coverage,
    etaMinutes,
    riskScore,
    probability: 1 / STRATEGIES.length,
    status: 'candidate',
    explanation: `Annealed joint assignments target ${entanglementMetrics.expectedWeightedReach.toFixed(1)} weighted reach at energy ${entanglementMetrics.energy.toFixed(1)}. Across ${entangled.trials} correlated worlds, expected reached is ${entangled.expectedReached.toFixed(1)} with a ${entangled.worstCase5pct.toFixed(1)} worst-5% result.`,
    entanglementMetrics,
    createdAt: Date.now(),
  };
}

/** Builds one deterministic candidate plan; all numeric fields come from these pure tools. */
export function build_plan(
  strategy: DispatchStrategy,
  snapshot: DispatchSnapshot = snapshotFromState(useWorldStore.getState())
): Plan {
  const excludedVolunteerIds = new Set(
    snapshot.rejectionConstraints.flatMap(constraint => {
      const matches = [...constraint.matchAll(/\bavoid\s+(?:volunteer\s+)?([A-Za-z0-9_-]+)\b/gi)];
      return matches
        .map(match => {
          const requested = match[1].toLowerCase();
          return Object.values(snapshot.volunteers).find(volunteer => {
            const id = volunteer.id.toLowerCase();
            const shortId = id.replace(/^vol_?/, 'v');
            return id === requested || shortId === requested;
          })?.id;
        })
        .filter((id): id is string => Boolean(id));
    })
  );
  const planningSnapshot = excludedVolunteerIds.size
    ? {
        ...snapshot,
        volunteers: Object.fromEntries(
          Object.entries(snapshot.volunteers).filter(([id]) => !excludedVolunteerIds.has(id))
        ),
      }
    : snapshot;
  const eligibleIncidents = Object.values(snapshot.incidents)
    .filter(incident => incident.status !== 'resolved')
    .filter(incident => isIncidentDispatchable(incident, snapshot.reports));
  if (strategy === 'entangled_optimal') {
    return buildEntangledOptimalPlan(snapshot, planningSnapshot, eligibleIncidents);
  }
  const orderedIncidents = rankIncidents(eligibleIncidents, strategy, planningSnapshot);
  const usedVolunteerIds = new Set<string>();
  const remainingStock = Object.fromEntries(
    Object.values(planningSnapshot.resources).map(resource => [
      resource.id,
      Math.max(0, resource.quantity - (resource.allocatedQty || 0)),
    ])
  );
  const assignments: PlanAssignment[] = [];
  const routeTimes: number[] = [];
  const trustScores: number[] = [];

  orderedIncidents.forEach(incident => {
    const closures = getRoadClosures(planningSnapshot, incident.area);
    const volunteer = selectVolunteer(incident, strategy, usedVolunteerIds, planningSnapshot, closures);
    if (!volunteer) return;
    usedVolunteerIds.add(volunteer.id);
    const target = getIncidentLocation(incident, snapshot);
    const routeTime = estimate_route_time(volunteer.location, target, volunteer.vehicle, closures);
    routeTimes.push(routeTime);
    trustScores.push(volunteer.trust);
    assignments.push({
      volunteerId: volunteer.id,
      incidentId: incident.id,
      resourceId: resourceIdFor(incident, remainingStock, planningSnapshot),
      qty: 1,
    });
  });

  const totalIncidents = eligibleIncidents.length;
  const coverage = totalIncidents === 0 ? 100 : Math.round(assignments.length / totalIncidents * 100);
  const etaMinutes = routeTimes.length
    ? Math.round(routeTimes.reduce((sum, time) => sum + time, 0) / routeTimes.length * 10) / 10
    : 0;
  const meanTrust = trustScores.length
    ? trustScores.reduce((sum, trust) => sum + trust, 0) / trustScores.length
    : 0;
  const unservedRatio = totalIncidents === 0 ? 0 : (totalIncidents - assignments.length) / totalIncidents;
  const routeRisk = Math.min(30, etaMinutes * 1.5);
  const trustRisk = trustScores.length ? (1 - meanTrust) * 25 : 0;
  const riskScore = Math.min(100, Math.round(unservedRatio * 45 + routeRisk + trustRisk));

  return {
    id: `dispatch_${strategy}`,
    name: strategy.replaceAll('_', ' '),
    strategy,
    assignments,
    coverage,
    etaMinutes,
    riskScore,
    probability: 1 / STRATEGIES.length,
    status: 'candidate',
    explanation: 'Plan rationale is being prepared.',
    createdAt: Date.now(),
  };
}

function calculateProbabilities(plans: Plan[]): Plan[] {
  const utilities = plans.map(plan => plan.coverage - plan.riskScore);
  const maxUtility = Math.max(...utilities);
  const weights = utilities.map(utility => Math.exp(utility - maxUtility));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let assignedProbability = 0;

  return plans.map((plan, index) => {
    const probability = index === plans.length - 1
      ? Math.max(0, 1 - assignedProbability)
      : weights[index] / totalWeight;
    assignedProbability += probability;
    return { ...plan, probability };
  });
}

async function requestPlansFromGemini(
  snapshot: DispatchSnapshot,
  canContinue: () => boolean
): Promise<Plan[] | undefined> {
  const constraints = snapshot.rejectionConstraints.length
    ? `Operator constraints from rejected plans (must be respected): ${snapshot.rejectionConstraints.join('; ')}.`
    : '';
  const prompt = `${constraints} Use build_plan exactly once for each strategy: maximise_coverage, protect_critical, minimise_risk, entangled_optimal. Do not invent plan metrics.`;
  const conversation: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: 'user', parts: [{ text: prompt }] },
  ];
  const results = new Map<DispatchStrategy, Plan>();

  for (let turn = 0; turn < 4 && results.size < STRATEGIES.length; turn++) {
    if (!canContinue()) return undefined;
    const response = await fetchWithTimeout('/api/gemini/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'dispatch',
        contents: conversation,
        systemInstruction: 'You are a dispatch planning agent. Always call build_plan for all four requested strategies before giving any explanation. Never calculate or alter numeric results.',
        tools: [{ functionDeclarations: [BUILD_PLAN_DECLARATION] }],
        temperature: 0.1,
      }),
    });
    if (!canContinue()) return undefined;
    if (!response.ok) {
      console.info('[Dispatch Agent] Gemini plan-tool request HTTP', response.status, 'using local plans');
      return undefined;
    }
    const data = await response.json();
    if (!canContinue()) return undefined;
    if (!data.success && data.isFallback) {
      console.info('[Dispatch Agent] Gemini plan-tool request used fallback:', data.error);
      return undefined;
    }

    const functionCalls = Array.isArray(data.functionCalls) ? data.functionCalls : [];
    if (functionCalls.length === 0) break;

    conversation.push({
      role: 'model',
      parts: functionCalls.map((call: { name: string; args?: { strategy?: DispatchStrategy } }) => ({
        functionCall: call,
      })),
    });
    const functionResponses = [];
    for (const call of functionCalls as Array<{ name: string; args?: { strategy?: DispatchStrategy } }>) {
      if (!canContinue()) return undefined;
      const strategy = call.args?.strategy;
      if (call.name !== 'build_plan' || !strategy || !STRATEGIES.includes(strategy) || results.has(strategy)) continue;
      const plan = build_plan(strategy, snapshot);
      results.set(strategy, plan);
      functionResponses.push({
        functionResponse: {
          name: 'build_plan',
          response: {
            strategy,
            coverage: plan.coverage,
            etaMinutes: plan.etaMinutes,
            riskScore: plan.riskScore,
            assignments: plan.assignments,
          },
        },
      });
    }
    if (functionResponses.length === 0) break;
    conversation.push({ role: 'user', parts: functionResponses });
  }

  return STRATEGIES.every(strategy => results.has(strategy))
    ? STRATEGIES.map(strategy => results.get(strategy)!)
    : undefined;
}

function assignmentKey(assignment: PlanAssignment): string {
  return `${assignment.incidentId}:${assignment.volunteerId}:${assignment.resourceId || ''}:${assignment.qty || 0}`;
}

function createAssignmentDiff(previous: Plan | undefined, next: Plan): PlanAssignmentChange {
  const previousAssignments = previous?.assignments || [];
  const previousKeys = new Set(previousAssignments.map(assignmentKey));
  const nextKeys = new Set(next.assignments.map(assignmentKey));
  return {
    strategy: next.strategy as DispatchStrategy,
    added: next.assignments.filter(assignment => !previousKeys.has(assignmentKey(assignment))),
    removed: previousAssignments.filter(assignment => !nextKeys.has(assignmentKey(assignment))),
  };
}

function createChangeReason(event: Parameters<EventSubscriber>[0], state: WorldStoreState): string {
  if (event.type === 'INCIDENT_CREATED' || event.type === 'INCIDENT_UPDATED') {
    const incident = event.payload as Incident | undefined;
    if (incident?.severity === 'critical') return `new critical report in ${incident.area.replaceAll('_', ' ')}`;
    if (incident) return `incident updated in ${incident.area.replaceAll('_', ' ')}`;
  }
  if (event.type === 'CREDIBILITY_UPDATED') {
    const report = state.reports[event.payload?.reportId];
    if (report) return `credibility changed for ${report.area.replaceAll('_', ' ')} report`;
  }
  if (event.type.startsWith('VOLUNTEER_')) return 'volunteer availability changed';
  if (event.type.startsWith('RESOURCE_')) return 'resource stock changed';
  if (event.type === 'PLAN_APPROVED') return 'volunteer and resource availability changed after approval';
  if (event.type === 'INCIDENT_STATUS_CHANGED') return 'incident status changed';
  if (event.type === 'OFFICIAL_ALERT_RELEASED') return 'official road closure or hazard update';
  return event.reason || 'dispatch inputs changed';
}

function capSentences(text: string): string {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
}

async function writePlanExplanations(plans: Plan[]): Promise<Plan[]> {
  const fallbackPlans = plans.map(plan => ({
    ...plan,
    explanation: plan.strategy === 'maximise_coverage'
      ? `Covers ${plan.coverage}% of eligible incidents by assigning available responders across the widest set. Route ETA averages ${plan.etaMinutes} minutes.`
      : plan.strategy === 'protect_critical'
      ? `Places critical and high-priority incidents first, then uses remaining responders to fill other calls. Coverage is ${plan.coverage}% with risk ${plan.riskScore}/100.`
      : plan.strategy === 'entangled_optimal'
      ? plan.explanation || `Uses seeded joint-crew annealing and ${plan.entanglementMetrics?.trials || 0} correlated worlds to estimate reach.`
      : `Prefers nearby, trusted responders and shorter travel routes to reduce operational exposure. Coverage is ${plan.coverage}% with average ETA ${plan.etaMinutes} minutes.`,
  }));

  try {
    const response = await fetchWithTimeout('/api/gemini/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'dispatch',
        prompt: `Write one plain-language explanation for each dispatch plan. Do not recalculate, alter, or invent any numbers. Return only JSON: {"explanations":{"maximise_coverage":"...","protect_critical":"...","minimise_risk":"...","entangled_optimal":"..."}}. Each explanation must be no more than 2 sentences. Plan data: ${JSON.stringify(plans.map(plan => ({
          strategy: plan.strategy,
          coverage: plan.coverage,
          etaMinutes: plan.etaMinutes,
          riskScore: plan.riskScore,
          assignmentCount: plan.assignments.length,
          entanglementMetrics: plan.entanglementMetrics,
        })))}`,
        systemInstruction: 'You explain dispatch tradeoffs in plain language. The supplied plan metrics are authoritative. Never calculate or introduce numbers.',
      }),
    });
    if (!response.ok) {
      console.info('[Dispatch Agent] Gemini explanation request HTTP', response.status);
      return fallbackPlans;
    }
    const data = await response.json();
    if (!data.success && data.isFallback) return fallbackPlans;
    const text = typeof data.text === 'string'
      ? data.text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim()
      : '';
    const parsed = JSON.parse(text) as { explanations?: Record<string, unknown> };
    if (!parsed.explanations || typeof parsed.explanations !== 'object') return fallbackPlans;

    return fallbackPlans.map(plan => {
      const explanation = parsed.explanations?.[plan.strategy || ''];
      return typeof explanation === 'string' && explanation.trim()
        ? { ...plan, explanation: capSentences(explanation) }
        : plan;
    });
  } catch (error) {
    console.info('[Dispatch Agent] Gemini explanation unavailable; using deterministic explanations.', error);
    return fallbackPlans;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let generationInProgress = false;
let generation = 0;
let pendingTrigger: { event: Parameters<EventSubscriber>[0]; state: WorldStoreState } | undefined;

async function runDispatchAgent(
  triggerEvent: Parameters<EventSubscriber>[0],
  triggerState: WorldStoreState
): Promise<void> {
  if (useWorldStore.getState().isKilled) return;
  if (generationInProgress) {
    pendingTrigger = { event: triggerEvent, state: triggerState };
    return;
  }

  generationInProgress = true;
  const runGeneration = ++generation;
  const canContinue = () =>
    runGeneration === generation && !useWorldStore.getState().isKilled;
  const startedAt = performance.now();
  const store = useWorldStore.getState();

  try {
    if (!canContinue()) return;
    store.setAgentEvaluating('dispatch', true, 'Building four candidate plans');

    const snapshot = snapshotFromState(useWorldStore.getState());
    let deterministicPlans: Plan[];
    try {
      deterministicPlans = await requestPlansFromGemini(snapshot, canContinue) ||
        STRATEGIES.map(strategy => build_plan(strategy, snapshot));
    } catch (error) {
      if (!canContinue()) return;
      console.info('[Dispatch Agent] Gemini tool calling unavailable; building plans locally.', error);
      deterministicPlans = STRATEGIES.map(strategy => build_plan(strategy, snapshot));
    }
    if (!canContinue()) return;
    const plansWithExplanations = await writePlanExplanations(deterministicPlans);
    if (!canContinue()) return;
    const calculatedPlans = calculateProbabilities(plansWithExplanations)
      .map(plan => ({ ...plan, status: 'candidate' as const }));

    const stateNow = useWorldStore.getState();
    if (!canContinue()) return;
    const previousPlans = Object.values(stateNow.plans);
    const previousByStrategy = new Map(
      previousPlans
        .filter(plan => STRATEGIES.includes(plan.strategy as DispatchStrategy))
        .map(plan => [plan.strategy as DispatchStrategy, plan])
    );
    const changes = calculatedPlans.map(plan => createAssignmentDiff(previousByStrategy.get(plan.strategy as DispatchStrategy), plan));
    const probabilityChanges = Object.fromEntries(calculatedPlans.map(plan => {
      const previous = previousByStrategy.get(plan.strategy as DispatchStrategy);
      return [plan.id, previous
        ? Math.round((plan.probability - previous.probability) * 1000) / 10
        : 0];
    }));
    const changeReason = createChangeReason(triggerEvent, stateNow);
    const plans = calculatedPlans.map(plan => ({
      ...plan,
      probabilityDelta: probabilityChanges[plan.id] || 0,
      changeReason,
    }));
    const payload: DispatchPlansUpdatedPayload = {
      plans,
      changes,
      changeReason,
      probabilityChanges,
      triggerEventType: triggerEvent.type,
    };

    plans.forEach((plan, index) => {
      stateNow.logAgentActivity({
        id: `dispatch_${Date.now()}_${index}`,
        timestamp: Date.now(),
        agent: 'dispatch',
        toolName: 'build_plan',
        inputParams: { strategy: plan.strategy },
        outputResult: {
          assignments: plan.assignments.length,
          coverage: plan.coverage,
          etaMinutes: plan.etaMinutes,
          riskScore: plan.riskScore,
          probability: plan.probability,
        },
        executionMs: Math.max(1, Math.round((performance.now() - startedAt) / STRATEGIES.length)),
        status: 'success',
        triggerReason: `Dispatch triggered by ${triggerEvent.type}`,
      });
    });

    useWorldStore.getState().dispatchEvent({
      actor: 'agent:dispatch',
      type: 'DISPATCH_PLANS_UPDATED',
      payload,
      reason: `Dispatch generated four candidate plans; assignments updated because ${changeReason}.`,
    });
  } catch (error) {
    if (!canContinue()) return;
    console.error('[Dispatch Agent] Plan generation failed.', error);
    useWorldStore.getState().dispatchEvent({
      actor: 'agent:dispatch',
      type: 'AGENT_ERROR_LOGGED',
      payload: { agent: 'dispatch', error: error instanceof Error ? error.message : String(error) },
      reason: 'Dispatch could not generate candidate plans.',
    });
  } finally {
    useWorldStore.getState().setAgentEvaluating('dispatch', false);
    generationInProgress = false;
    if (pendingTrigger && !useWorldStore.getState().isKilled) {
      const nextTrigger = pendingTrigger;
      pendingTrigger = undefined;
      void runDispatchAgent(nextTrigger.event, nextTrigger.state);
    }
  }
}

const DISPATCH_TRIGGER_EVENTS = new Set([
  'INCIDENT_CREATED',
  'INCIDENT_UPDATED',
  'INCIDENT_STATUS_CHANGED',
  'VOLUNTEER_REGISTERED',
  'VOLUNTEER_UPDATED',
  'VOLUNTEER_STATUS_CHANGED',
  'RESOURCE_STOCKED',
  'RESOURCE_ALLOCATED',
  'CREDIBILITY_UPDATED',
  'PLAN_REJECTED',
  'OFFICIAL_ALERT_RELEASED',
  'ROAD_CLOSURE_REPORTED',
  'RAINFALL_CONTEXT_UPDATED',
]);

export function initDispatchAgentSubscription(): () => void {
  const store = useWorldStore.getState();
  const queueRun = (event: Parameters<EventSubscriber>[0]) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runDispatchAgent(event, useWorldStore.getState());
    }, 40);
  };

  const unsubscribe = store.subscribeToEvents(event => {
    if (event.type === 'DEMO_SCENARIO_RESET') {
      generation++;
      pendingTrigger = undefined;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = undefined;
      useWorldStore.getState().setAgentEvaluating('dispatch', false);
      return;
    }
    if (event.type === 'SYSTEM_FROZEN') {
      generation++;
      pendingTrigger = undefined;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = undefined;
      useWorldStore.getState().setAgentEvaluating('dispatch', false);
      return;
    }
    if (!DISPATCH_TRIGGER_EVENTS.has(event.type)) return;
    queueRun(event);
  });

  void runDispatchAgent({
    id: 'dispatch_initial',
    ts: Date.now(),
    actor: 'system',
    type: 'DISPATCH_INITIALIZED',
    payload: {},
    reason: 'Initial dispatch plan generation',
    version: store.version,
  }, store);

  return () => {
    unsubscribe();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
    pendingTrigger = undefined;
  };
}
