import type { EntangledSimResult, QWorld } from './entangledSim.ts';
import type { PlanAssignment } from '../state/types.ts';

export interface WardEquityMetric {
  areaId: string;
  name: string;
  vulnerability: number;
  expectedResponseMinutes: number | null;
  reachProbability: number;
  weightedRisk: number;
}

export interface EquityReassignment {
  volunteerId: string;
  fromIncidentId: string;
  toIncidentId: string;
  fromWard: string;
  toWard: string;
}

export interface WardEquityResult {
  wards: WardEquityMetric[];
  gini: number;
  averageReachProbability: number;
  flaggedWardIds: string[];
  smallestReassignment: EquityReassignment | null;
}

export function analyzeWardEquity(
  world: QWorld,
  assignments: PlanAssignment[],
  simulation: EntangledSimResult
): WardEquityResult {
  const grouped = new Map<string, string[]>();
  for (const incident of Object.values(world.incidents)) {
    if (incident.status === 'resolved') continue;
    const areaId = incident.area;
    grouped.set(areaId, [...(grouped.get(areaId) || []), incident.id]);
  }

  const wards = [...grouped.entries()].map(([areaId, ids]) => {
    const area = world.areas[areaId];
    const vulnerability = Math.min(1, Math.max(0, area?.vulnerability ?? 0.5));
    let weightedRisk = 0;
    let reachedWeight = 0;
    let responseWeighted = 0;
    let responseWeight = 0;

    for (const incidentId of ids) {
      const incident = world.incidents[incidentId];
      const reportRisk = incident.reportIds.reduce(
        (sum, reportId) => sum + (world.reports[reportId]?.peopleAtRisk || 0),
        0
      );
      const weight = Math.max(1, reportRisk || 20) * (0.5 + vulnerability);
      const reachProbability = simulation.marginal[incidentId] || 0;
      weightedRisk += weight;
      reachedWeight += weight * reachProbability;
      const location = incident.location || incident.coordinates || area?.coordinates;
      const incidentAssignments = assignments.filter(item => item.incidentId === incidentId);
      const responseMinutes = location
        ? incidentAssignments.reduce((best, item) => {
          const volunteer = world.volunteers[item.volunteerId];
          if (!volunteer) return best;
          const eta = 5 + Math.hypot(
            volunteer.location.x - location.x,
            volunteer.location.y - location.y
          ) / 100 / 12 * 60;
          return Math.min(best, eta);
        }, Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      if (Number.isFinite(responseMinutes)) {
        responseWeighted += weight * responseMinutes;
        responseWeight += weight;
      }
    }

    return {
      areaId,
      name: area?.name || areaId,
      vulnerability,
      expectedResponseMinutes: responseWeight ? responseWeighted / responseWeight : null,
      reachProbability: weightedRisk ? reachedWeight / weightedRisk : 0,
      weightedRisk,
    };
  });

  const totalWeight = wards.reduce((sum, ward) => sum + ward.weightedRisk, 0);
  const averageReachProbability = totalWeight
    ? wards.reduce((sum, ward) => sum + ward.reachProbability * ward.weightedRisk, 0) / totalWeight
    : 0;
  const sortedUnreached = wards.map(ward => (1 - ward.reachProbability) * ward.weightedRisk).sort((a, b) => a - b);
  const unreachedTotal = sortedUnreached.reduce((sum, value) => sum + value, 0);
  const gini = sortedUnreached.length && unreachedTotal
    ? sortedUnreached.reduce((sum, value, index) =>
      sum + (2 * (index + 1) - sortedUnreached.length - 1) * value, 0
    ) / (sortedUnreached.length * unreachedTotal)
    : 0;
  const flaggedWardIds = wards
    .filter(ward => averageReachProbability - ward.reachProbability > 0.2)
    .map(ward => ward.areaId);
  const bestSource = wards
    .filter(ward => ward.reachProbability > averageReachProbability)
    .sort((a, b) => b.reachProbability - a.reachProbability)[0];
  const weakestTarget = wards
    .filter(ward => flaggedWardIds.includes(ward.areaId))
    .sort((a, b) => a.reachProbability - b.reachProbability)[0];
  let smallestReassignment: EquityReassignment | null = null;
  if (bestSource && weakestTarget) {
    const sourceCandidates = assignments
      .filter(item => world.incidents[item.incidentId]?.area === bestSource.areaId)
      .sort((a, b) =>
        Number(assignments.filter(item => item.incidentId === b.incidentId).length > 1)
        - Number(assignments.filter(item => item.incidentId === a.incidentId).length > 1)
      );
    const targetIncident = Object.values(world.incidents)
      .filter(incident => incident.area === weakestTarget.areaId && incident.status !== 'resolved')
      .sort((a, b) => a.priority - b.priority)[0];
    const source = sourceCandidates[0];
    if (source && targetIncident) {
      smallestReassignment = {
        volunteerId: source.volunteerId,
        fromIncidentId: source.incidentId,
        toIncidentId: targetIncident.id,
        fromWard: bestSource.name,
        toWard: weakestTarget.name,
      };
    }
  }

  return { wards, gini, averageReachProbability, flaggedWardIds, smallestReassignment };
}
