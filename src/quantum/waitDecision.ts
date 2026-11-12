import { collapse, entangledMonteCarlo, peopleAtRisk, type QWorld } from './entangledSim.ts';
import { interfere } from './interference.ts';
import type { Incident, PlanAssignment, Report, Resource, Volunteer } from '../state/types.ts';

const SIMULATION_TRIALS = 600;
const CONFIRMATION_CREDIBILITY = 0.75;
const SECOND_SOURCE_RATE_PER_MINUTE = 1 / 30;
const SERVICE_HOLD_MINUTES = 30;

export interface WaitDecisionEstimate {
  reportCredibility: number;
  confirmationCredibility: number;
  secondSourceChance: number;
  immediateReachProbability: number;
  delayedReachProbability: number;
  expectedPeopleIfActNow: number;
  expectedPeopleIfWaiting: number;
  expectedOpportunityLoss: number;
  expectedWastedDispatchCost: number;
  crewTimeHeldMinutes: number;
  boatHeld: boolean;
  breakEvenCredibility: number | null;
  waitMinutes: number;
  recommendation: 'act-now' | 'wait' | 'no-responder';
  hasAvailableResponder: boolean;
  simulatedTrials: number;
}

function isWaterRescueReport(report: Report): boolean {
  return /flood|water|boat|trapped|rescue/i.test(`${report.text} ${report.flags.join(' ')}`);
}

function makeProbeIncident(report: Report): Incident {
  const text = `${report.text} ${report.flags.join(' ')}`.toLowerCase();
  const severity: Incident['severity'] = /life[- ]threat|trapped|collapse|unconscious/.test(text)
    ? 'critical'
    : isWaterRescueReport(report)
    ? 'high'
    : 'medium';
  return {
    id: `wait_probe_${report.id}`,
    area: report.area,
    summary: `Hypothetical unverified report: ${report.text.slice(0, 100)}`,
    priority: severity === 'critical' ? 95 : severity === 'high' ? 75 : 50,
    severity,
    needs: isWaterRescueReport(report) ? ['water rescue'] : [],
    reportIds: [report.id],
    status: 'open',
    location: report.location,
  };
}

function nearestAvailableVolunteer(report: Report, volunteers: Record<string, Volunteer>): Volunteer | undefined {
  return Object.values(volunteers)
    .filter(volunteer => volunteer.available)
    .sort((a, b) => {
      const distance = (volunteer: Volunteer) => Math.hypot(
        volunteer.location.x - report.location.x,
        volunteer.location.y - report.location.y
      );
      return distance(a) - distance(b);
    })[0];
}

function availableBoat(resources: Record<string, Resource>): Resource | undefined {
  return Object.values(resources).find(resource =>
    /boat/i.test(resource.type) && resource.quantity - (resource.allocatedQty || 0) > 0
  );
}

function expectedPeopleForIncidents(
  result: ReturnType<typeof entangledMonteCarlo>,
  world: QWorld,
  excludedIncidentId: string
): number {
  if (result.reached.length === 0) return 0;
  const incidentIds = result.incidentIds.filter(id => id !== excludedIncidentId);
  return result.reached.reduce((sum, trial) => sum + incidentIds.reduce((people, id) => {
    const index = result.incidentIds.indexOf(id);
    return people + (trial[index] ? peopleAtRisk(world.incidents[id], world.reports) : 0);
  }, 0), 0) / result.reached.length;
}

function credibilityAfterIndependentConfirmation(report: Report, credibility: number): number {
  const first = { ...report, credibility };
  const confirmation: Report = {
    ...report,
    id: `simulated_confirmation_${report.id}`,
    ts: report.ts + 30 * 60_000,
    source: 'volunteer',
    reporterId: `independent_source_${report.id}`,
    credibility: CONFIRMATION_CREDIBILITY,
    credibilityScore: CONFIRMATION_CREDIBILITY,
    credibilityReasons: [],
  };
  return interfere([first, confirmation]).credibility;
}

function findBreakEvenCredibility(
  report: Report,
  secondSourceChance: number,
  immediatePeoplePerCredibility: number,
  delayedPeoplePerConfirmedCredibility: number,
  opportunityLoss: number
): number | null {
  for (let step = 0; step <= 1000; step++) {
    const credibility = step / 1000;
    const actNow = credibility * immediatePeoplePerCredibility - opportunityLoss;
    const wait = secondSourceChance * (
      credibilityAfterIndependentConfirmation(report, credibility) * delayedPeoplePerConfirmedCredibility -
      opportunityLoss
    );
    if (actNow >= wait) return credibility;
  }
  return null;
}

export function estimateWaitDecision(
  report: Report,
  world: QWorld,
  existingAssignments: PlanAssignment[],
  waitMinutes: number
): WaitDecisionEstimate {
  const boundedWait = Math.max(5, Math.min(60, Math.round(waitMinutes / 5) * 5));
  const probe = makeProbeIncident(report);
  const waterRescue = isWaterRescueReport(report);
  const volunteer = nearestAvailableVolunteer(report, world.volunteers);
  const boat = waterRescue ? availableBoat(world.resources) : undefined;
  const probeAssignment = volunteer
    ? {
        volunteerId: volunteer.id,
        incidentId: probe.id,
        ...(boat ? { resourceId: boat.id, qty: 1 } : {}),
      }
    : undefined;
  const incidents = { ...world.incidents, [probe.id]: probe };
  const scenarioWorld: QWorld = { ...world, incidents };
  const baselineAssignments = existingAssignments.filter(assignment => assignment.incidentId !== probe.id);
  const immediateAssignments = probeAssignment
    ? [
        ...baselineAssignments.filter(assignment => assignment.volunteerId !== probeAssignment.volunteerId),
        probeAssignment,
      ]
    : baselineAssignments;
  const immediateSimulation = entangledMonteCarlo(immediateAssignments, scenarioWorld, SIMULATION_TRIALS, 42);
  const delayedWorld: QWorld = {
    ...scenarioWorld,
    context: {
      ...scenarioWorld.context,
      dispatchDelayByIncident: {
        ...scenarioWorld.context?.dispatchDelayByIncident,
        [probe.id]: boundedWait,
      },
    },
  };
  const delayedSimulation = entangledMonteCarlo(immediateAssignments, delayedWorld, SIMULATION_TRIALS, 42);
  const existingBaseline = entangledMonteCarlo(baselineAssignments, scenarioWorld, SIMULATION_TRIALS, 42);
  const opportunityLoss = Math.max(
    0,
    expectedPeopleForIncidents(existingBaseline, scenarioWorld, probe.id) -
      expectedPeopleForIncidents(immediateSimulation, scenarioWorld, probe.id)
  );
  const reportCredibility = interfere([report]).credibility;
  const secondSourceChance = 1 - Math.exp(-SECOND_SOURCE_RATE_PER_MINUTE * boundedWait);
  const confirmationCredibility = credibilityAfterIndependentConfirmation(report, reportCredibility);
  const immediateReachProbability = volunteer ? immediateSimulation.marginal[probe.id] || 0 : 0;
  const delayedReachProbability = volunteer ? delayedSimulation.marginal[probe.id] || 0 : 0;
  const people = peopleAtRisk(probe, scenarioWorld.reports);
  const immediatePeople = people * immediateReachProbability;
  const delayedPeople = people * delayedReachProbability;
  const expectedPeopleIfActNow = reportCredibility * immediatePeople - opportunityLoss;
  const expectedPeopleIfWaiting = secondSourceChance * (
    confirmationCredibility * delayedPeople - opportunityLoss
  );
  const breakEvenCredibility = volunteer
    ? findBreakEvenCredibility(report, secondSourceChance, immediatePeople, delayedPeople, opportunityLoss)
    : null;
  const routeMinutes = volunteer
    ? Math.hypot(
        volunteer.location.x - report.location.x,
        volunteer.location.y - report.location.y
      ) / 100 / ({ none: 5, bike: 18, car: 24, boat: 14 }[volunteer.vehicle]) * 60
    : 0;

  return {
    reportCredibility,
    confirmationCredibility,
    secondSourceChance,
    immediateReachProbability,
    delayedReachProbability,
    expectedPeopleIfActNow,
    expectedPeopleIfWaiting,
    expectedOpportunityLoss: opportunityLoss,
    expectedWastedDispatchCost: (1 - reportCredibility) * opportunityLoss,
    crewTimeHeldMinutes: volunteer ? Math.round(routeMinutes + SERVICE_HOLD_MINUTES) : 0,
    boatHeld: Boolean(boat),
    breakEvenCredibility,
    waitMinutes: boundedWait,
    recommendation: volunteer
      ? expectedPeopleIfActNow >= expectedPeopleIfWaiting ? 'act-now' : 'wait'
      : 'no-responder',
    hasAvailableResponder: Boolean(volunteer),
    simulatedTrials: SIMULATION_TRIALS,
  };
}
