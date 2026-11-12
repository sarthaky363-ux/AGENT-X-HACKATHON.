import { collapse, entangledMonteCarlo, type QWorld } from '../quantum/entangledSim.ts';
import { annealDispatch } from '../quantum/anneal.ts';
import { isIncidentDispatchable } from '../tools/credibility.ts';
import type { Incident, Plan, PreAlert } from './types.ts';

export const PRE_ALERT_MI_THRESHOLD = 0.005;
const MINIMUM_REACH_DROP = 0.02;

interface PreAlertWorld {
  incidents: Record<string, Incident>;
  volunteers: QWorld['volunteers'];
  resources: QWorld['resources'];
  reports: QWorld['reports'];
  areas: QWorld['areas'];
  plans: Record<string, Plan>;
  context: { rainfallMmHr: number };
}

const severityRank = { low: 0, medium: 1, high: 2, critical: 3 } as const;

function incidentLabel(incident: Incident, world: PreAlertWorld): string {
  return world.areas[incident.area]?.name || incident.area || incident.id;
}

function severityOrPriorityRose(previous: Incident, next: Incident): boolean {
  const previousPriority = previous.priority ?? previous.priorityScore ?? 0;
  const nextPriority = next.priority ?? next.priorityScore ?? 0;
  return severityRank[next.severity] > severityRank[previous.severity] || nextPriority > previousPriority;
}

export function buildPreAlertsForWorseningIncident(
  previous: Incident | undefined,
  next: Incident,
  triggerEventId: string,
  world: PreAlertWorld,
  createdAt: number
): PreAlert[] {
  if (!previous || !severityOrPriorityRose(previous, next)) return [];
  const incidents = Object.fromEntries(
    Object.values(world.incidents)
      .filter(incident => incident.status !== 'resolved')
      .map(incident => [incident.id, incident])
  );
  const incidentIds = Object.keys(incidents);
  if (incidentIds.length < 2) return [];

  const simulationWorld: QWorld = {
    incidents,
    volunteers: world.volunteers,
    resources: world.resources,
    reports: world.reports,
    areas: world.areas,
    context: { rainfallMmHr: world.context.rainfallMmHr },
  };
  const dispatchableIncidents = Object.values(incidents)
    .filter(incident => isIncidentDispatchable(incident, world.reports));
  const storedPlan = Object.values(world.plans)
    .filter(plan => plan.assignments.length > 0)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .find(plan => plan.strategy === 'entangled_optimal')
    || Object.values(world.plans)
      .filter(plan => plan.assignments.length > 0)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const assignments = storedPlan?.assignments || annealDispatch(
    {
      ...simulationWorld,
      incidents: Object.fromEntries(dispatchableIncidents.map(incident => [incident.id, incident])),
    },
    dispatchableIncidents.map(incident => incident.id),
    { seed: 7 }
  ).annealed.assignments;
  const result = entangledMonteCarlo(assignments, simulationWorld, 600, 42);
  const conditional = collapse(result, { [next.id]: false });
  if (conditional.matchingTrials === 0) return [];

  const alerts: PreAlert[] = [];
  result.edges.forEach(edge => {
    const neighborId = edge.a === next.id ? edge.b : edge.b === next.id ? edge.a : undefined;
    if (!neighborId || edge.mutualInformationBits < PRE_ALERT_MI_THRESHOLD) return;
    const probabilityBefore = result.marginal[neighborId] || 0;
    const probabilityAfter = conditional.probabilities[neighborId] || 0;
    if (probabilityBefore - probabilityAfter < MINIMUM_REACH_DROP) return;
    const neighbor = incidents[neighborId];
    if (!neighbor) return;
    alerts.push({
      id: `prealert_${triggerEventId}_${neighborId}`,
      triggerIncidentId: next.id,
      neighborIncidentId: neighborId,
      triggerLabel: incidentLabel(next, world),
      neighborLabel: incidentLabel(neighbor, world),
      probabilityBefore,
      probabilityAfter,
      mutualInformationBits: edge.mutualInformationBits,
      phi: edge.phi,
      createdAt,
      acknowledged: false,
    });
  });
  return alerts;
}
