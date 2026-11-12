/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ENTANGLE Pure Event-Sourced Reducer
 * All WorldState is 100% derived from the append-only events[] log.
 */

import { CommsDraft, DerivedWorldState, Event, Plan, RoadClosure } from './types.ts';
import { isValidCommsText } from '../tools/commsValidation.ts';

const LANGUAGES: CommsDraft['language'][] = ['en', 'hi', 'mr'];

export const INITIAL_DERIVED_STATE: DerivedWorldState = {
  reports: {},
  incidents: {},
  preAlerts: {},
  volunteers: {},
  resources: {},
  plans: {},
  areas: {},
  officialAlerts: [],
  pendingAlertsQueue: [],
  roadClosures: [],
  commsDrafts: {},
  commsOutbox: [],
  rejectionConstraints: [],
  simulationSeed: 20261028,
  isKilled: false,
  killReason: undefined,
  killedAt: undefined,
  rainfallMmHr: 72,
  rainfallSource: 'seeded',
};

export function reduceEvent(state: DerivedWorldState, event: Event): DerivedWorldState {
  if (state.isKilled && event.type !== 'UNFREEZE') return state;

  switch (event.type) {
    case 'AREAS_INITIALIZED': {
      const areas = event.payload?.areas || {};
      return {
        ...state,
        areas: { ...state.areas, ...areas },
      };
    }

    case 'VOLUNTEER_REGISTERED':
    case 'VOLUNTEER_UPDATED': {
      const volunteer = event.payload;
      if (!volunteer?.id) return state;
      return {
        ...state,
        volunteers: {
          ...state.volunteers,
          [volunteer.id]: {
            ...state.volunteers[volunteer.id],
            ...volunteer,
          },
        },
      };
    }

    case 'VOLUNTEER_STATUS_CHANGED': {
      const { volunteerId, available, assignedIncidentId } = event.payload || {};
      if (!volunteerId || !state.volunteers[volunteerId]) return state;
      return {
        ...state,
        volunteers: {
          ...state.volunteers,
          [volunteerId]: {
            ...state.volunteers[volunteerId],
            available: available !== undefined ? available : state.volunteers[volunteerId].available,
            assignedIncidentId: assignedIncidentId !== undefined ? assignedIncidentId : state.volunteers[volunteerId].assignedIncidentId,
          },
        },
      };
    }

    case 'RESOURCE_STOCKED': {
      const resource = event.payload;
      if (!resource?.id) return state;
      return {
        ...state,
        resources: {
          ...state.resources,
          [resource.id]: {
            ...state.resources[resource.id],
            ...resource,
          },
        },
      };
    }

    case 'RESOURCE_ALLOCATED': {
      const { resourceId, quantity } = event.payload || {};
      const res = state.resources[resourceId];
      if (!res) return state;
      return {
        ...state,
        resources: {
          ...state.resources,
          [resourceId]: {
            ...res,
            allocatedQty: (res.allocatedQty || 0) + (quantity || 0),
          },
        },
      };
    }

    case 'REPORT_ADDED':
    case 'REPORT_INGESTED': {
      const report = event.payload;
      if (!report?.id) return state;
      return {
        ...state,
        reports: {
          ...state.reports,
          [report.id]: report,
        },
      };
    }

    case 'REPORT_TRANSLATION_UPDATED': {
      const { reportId, englishTranslation } = event.payload || {};
      if (!reportId || !state.reports[reportId]) return state;
      const hasTranslation = typeof englishTranslation === 'string' && englishTranslation.trim().length > 0;
      return {
        ...state,
        reports: {
          ...state.reports,
          [reportId]: {
            ...state.reports[reportId],
            englishTranslation: hasTranslation ? englishTranslation.trim() : undefined,
            translationStatus: hasTranslation ? 'available' : 'unavailable',
          },
        },
      };
    }

    case 'OFFICIAL_ALERTS_INITIALIZED': {
      const alerts = event.payload?.alerts || [];
      const pendingQueue = event.payload?.pendingQueue || [];
      return {
        ...state,
        officialAlerts: alerts,
        pendingAlertsQueue: pendingQueue,
      };
    }

    case 'OFFICIAL_ALERT_RELEASED': {
      const alert = event.payload;
      if (!alert?.id) return state;
      const filteredPending = (state.pendingAlertsQueue || []).filter(a => a.id !== alert.id);
      return {
        ...state,
        officialAlerts: [alert, ...(state.officialAlerts || [])],
        pendingAlertsQueue: filteredPending,
      };
    }

    case 'ROAD_CLOSURE_REPORTED': {
      const closure = event.payload as RoadClosure | undefined;
      if (!closure?.description || !Number.isFinite(closure.penaltyMinutes)) return state;
      return {
        ...state,
        roadClosures: [
          ...state.roadClosures.filter(item => item.description !== closure.description),
          closure,
        ],
      };
    }

    case 'CREDIBILITY_UPDATED': {
      const { reportId, credibility, credibilityScore, explanation, reasons, isUnverified } = event.payload || {};
      if (!reportId || !state.reports[reportId]) return state;
      const score = credibility !== undefined ? credibility : credibilityScore;
      const reasonsList = Array.isArray(reasons) ? reasons : (state.reports[reportId].credibilityReasons || []);
      const unverified = isUnverified !== undefined ? isUnverified : (score < 0.35);
      return {
        ...state,
        reports: {
          ...state.reports,
          [reportId]: {
            ...state.reports[reportId],
            credibility: score,
            credibilityScore: score,
            credibilityExplanation: explanation || reasonsList.join('; ') || state.reports[reportId].credibilityExplanation,
            credibilityReasons: reasonsList,
            isUnverified: unverified,
          },
        },
      };
    }

    case 'REPORT_MERGED': {
      const { reportId, incidentId, primaryId } = event.payload || {};
      const targetId = incidentId || primaryId;
      if (!reportId || !state.reports[reportId]) return state;
      const updatedReport = {
        ...state.reports[reportId],
        mergedInto: targetId,
      };

      let updatedIncidents = state.incidents;
      if (incidentId && state.incidents[incidentId]) {
        updatedIncidents = {
          ...state.incidents,
          [incidentId]: {
            ...state.incidents[incidentId],
            reportIds: Array.from(new Set([...state.incidents[incidentId].reportIds, reportId])),
          },
        };
      }

      return {
        ...state,
        reports: {
          ...state.reports,
          [reportId]: updatedReport,
        },
        incidents: updatedIncidents,
      };
    }

    case 'REPORTS_MERGED': {
      const { primaryId, duplicateIds = [], reason, incidentId } = event.payload || {};
      if (!primaryId || !Array.isArray(duplicateIds)) return state;

      const updatedReports = { ...state.reports };
      duplicateIds.forEach((dupId: string) => {
        if (updatedReports[dupId]) {
          updatedReports[dupId] = {
            ...updatedReports[dupId],
            mergedInto: primaryId,
          };
        }
      });

      let updatedIncidents = state.incidents;
      const targetIncId = incidentId || Object.values(state.incidents).find(inc => inc.reportIds.includes(primaryId))?.id;
      if (targetIncId && updatedIncidents[targetIncId]) {
        updatedIncidents = {
          ...updatedIncidents,
          [targetIncId]: {
            ...updatedIncidents[targetIncId],
            reportIds: Array.from(new Set([...updatedIncidents[targetIncId].reportIds, ...duplicateIds])),
          },
        };
      }

      return {
        ...state,
        reports: updatedReports,
        incidents: updatedIncidents,
      };
    }

    case 'INCIDENT_CREATED':
    case 'INCIDENT_UPDATED': {
      const incident = event.payload;
      if (!incident?.id) return state;
      return {
        ...state,
        incidents: {
          ...state.incidents,
          [incident.id]: {
            ...state.incidents[incident.id],
            ...incident,
          },
        },
      };
    }

    case 'PRE_ALERT_CREATED': {
      const preAlert = event.payload;
      if (!preAlert?.id || state.preAlerts[preAlert.id]) return state;
      return {
        ...state,
        preAlerts: { ...state.preAlerts, [preAlert.id]: preAlert },
      };
    }

    case 'PRE_ALERT_ACKNOWLEDGED': {
      const { preAlertId, acknowledgedAt } = event.payload || {};
      if (!preAlertId || !state.preAlerts[preAlertId] || state.preAlerts[preAlertId].acknowledged) return state;
      return {
        ...state,
        preAlerts: {
          ...state.preAlerts,
          [preAlertId]: {
            ...state.preAlerts[preAlertId],
            acknowledged: true,
            acknowledgedAt: acknowledgedAt || event.ts,
          },
        },
      };
    }

    case 'INCIDENT_STATUS_CHANGED': {
      const { incidentId, status } = event.payload || {};
      if (!incidentId || !state.incidents[incidentId]) return state;
      return {
        ...state,
        incidents: {
          ...state.incidents,
          [incidentId]: {
            ...state.incidents[incidentId],
            status,
          },
        },
      };
    }

    case 'PLAN_CREATED':
    case 'PLAN_SUPERPOSITION_GENERATED': {
      const plan = event.payload;
      if (!plan?.id) return state;
      return {
        ...state,
        plans: {
          ...state.plans,
          [plan.id]: plan,
        },
      };
    }

    case 'SUPERPOSITION_PLANS_BATCH_SET': {
      const plansList = event.payload?.plans || [];
      const newPlans: Record<string, any> = { ...state.plans };
      plansList.forEach((p: any) => {
        if (p?.id) newPlans[p.id] = p;
      });
      return {
        ...state,
        plans: newPlans,
      };
    }

    case 'DISPATCH_PLANS_UPDATED': {
      const { plans: plansList = [] } = event.payload || {};
      if (!Array.isArray(plansList)) return state;
      const updatedPlans = { ...state.plans };
      Object.values(updatedPlans).forEach(plan => {
        if (plan.id.startsWith('dispatch_') && plan.status === 'candidate') {
          updatedPlans[plan.id] = { ...plan, status: 'discarded' };
        }
      });
      plansList.forEach((plan: Plan) => {
        if (plan?.id) updatedPlans[plan.id] = plan;
      });
      return { ...state, plans: updatedPlans };
    }

    case 'SIMULATION_SEED_UPDATED': {
      const seed = event.payload?.seed;
      if (!Number.isInteger(seed)) return state;
      return { ...state, simulationSeed: seed >>> 0 };
    }

    case 'RAINFALL_CONTEXT_UPDATED': {
      const rainfallMmHr = event.payload?.rainfallMmHr;
      const source = event.payload?.source;
      if (!Number.isFinite(rainfallMmHr) || rainfallMmHr < 0 ||
          !['live', 'cached', 'seeded'].includes(source)) return state;
      return {
        ...state,
        rainfallMmHr,
        rainfallSource: source,
      };
    }

    case 'SIMULATION_RESULTS_UPDATED': {
      const updates = event.payload?.plans;
      if (!Array.isArray(updates)) return state;
      const plans = { ...state.plans };
      updates.forEach((update: Partial<Plan> & { id?: string }) => {
        if (!update.id || !plans[update.id]) return;
        plans[update.id] = {
          ...plans[update.id],
          ...(update.simulationMetrics ? { simulationMetrics: update.simulationMetrics } : {}),
          ...(update.simulationExplanation ? { simulationExplanation: update.simulationExplanation } : {}),
          ...(typeof update.probability === 'number' ? { probability: update.probability } : {}),
        };
      });
      return { ...state, plans };
    }

    case 'PLAN_REJECTED': {
      if (event.actor !== 'human') return state;
      const { planId, reason } = event.payload || {};
      if (!planId || state.plans[planId]?.status !== 'candidate' || typeof reason !== 'string') return state;
      const safeReason = reason.trim().slice(0, 240);
      if (!safeReason) return state;
      return {
        ...state,
        plans: { ...state.plans, [planId]: { ...state.plans[planId], status: 'rejected' } },
        rejectionConstraints: [...state.rejectionConstraints, safeReason],
      };
    }

    case 'PLAN_APPROVED': {
      if (event.actor !== 'human') return state;
      const { planId } = event.payload || {};
      const chosenPlan = state.plans[planId];
      if (!chosenPlan || chosenPlan.status !== 'candidate') return state;

      // Collapse the candidate lattice into the explicitly selected plan.
      const updatedPlans: Record<string, any> = {};
      Object.values(state.plans).forEach(p => {
        if (p.id === planId) {
          updatedPlans[p.id] = { ...p, status: 'approved' };
        } else if (p.status === 'candidate') {
          updatedPlans[p.id] = { ...p, status: 'discarded' };
        } else {
          updatedPlans[p.id] = p;
        }
      });

      // Update volunteer availability & assigned incident
      const updatedVolunteers = { ...state.volunteers };
      const updatedIncidents = { ...state.incidents };
      const updatedResources = { ...state.resources };

      chosenPlan.assignments.forEach(assign => {
        if (assign.volunteerId && updatedVolunteers[assign.volunteerId]?.available) {
          updatedVolunteers[assign.volunteerId] = {
            ...updatedVolunteers[assign.volunteerId],
            available: false,
            assignedIncidentId: assign.incidentId,
          };
        }
        if (assign.incidentId && updatedIncidents[assign.incidentId]?.status !== 'resolved') {
          updatedIncidents[assign.incidentId] = {
            ...updatedIncidents[assign.incidentId],
            status: 'assigned',
          };
        }
        if (assign.resourceId && assign.qty && updatedResources[assign.resourceId]) {
          const res = updatedResources[assign.resourceId];
          updatedResources[assign.resourceId] = {
            ...res,
            allocatedQty: Math.min(res.quantity, (res.allocatedQty || 0) + assign.qty),
          };
        }
      });

      return {
        ...state,
        plans: updatedPlans,
        volunteers: updatedVolunteers,
        incidents: updatedIncidents,
        resources: updatedResources,
      };
    }

    case 'PLAN_EXECUTED': {
      if (event.actor !== 'human') return state;
      const { planId } = event.payload || {};
      if (!planId || state.plans[planId]?.status !== 'approved') return state;
      return {
        ...state,
        plans: {
          ...state.plans,
          [planId]: {
            ...state.plans[planId],
            status: 'executed',
          },
        },
      };
    }

    case 'COMMS_DRAFTS_CREATED': {
      const approvedPlan = state.plans[event.payload?.planId];
      if (
        event.actor !== 'agent:comms' ||
        approvedPlan?.status !== 'approved' ||
        !Array.isArray(event.payload?.drafts)
      ) return state;
      const drafts = event.payload.drafts as CommsDraft[];
      if (drafts.length === 0 || !drafts.every(draft =>
        Boolean(draft?.id && draft.wardId && draft.incidentId) &&
        LANGUAGES.includes(draft.language) &&
        draft.approvedByHuman === false &&
        Array.isArray(draft.broadcastChannels) &&
        draft.broadcastChannels.length === 2 &&
        draft.broadcastChannels.includes('sms') &&
        draft.broadcastChannels.includes('whatsapp') &&
        isValidCommsText(draft.language, draft.text)
      )) return state;
      const commsDrafts = { ...state.commsDrafts };
      drafts.forEach(draft => {
        if (!commsDrafts[draft.id]) commsDrafts[draft.id] = draft;
      });
      return { ...state, commsDrafts };
    }

    case 'COMMS_MESSAGE_APPROVED': {
      if (event.actor !== 'human') return state;
      const draftId = event.payload?.draftId;
      const draft = state.commsDrafts[draftId];
      if (!draft || draft.approvedByHuman) return state;
      const approved = { ...draft, approvedByHuman: true, publishedAt: event.ts };
      return {
        ...state,
        commsDrafts: { ...state.commsDrafts, [draftId]: approved },
        commsOutbox: [...state.commsOutbox, approved],
      };
    }

    case 'SYSTEM_FROZEN': {
      if (event.actor !== 'human') return state;
      return {
        ...state,
        isKilled: true,
        killReason: event.payload?.reason || 'Operator Manual Freeze',
        killedAt: event.ts,
      };
    }

    case 'UNFREEZE': {
      if (event.actor !== 'human') return state;
      return {
        ...state,
        isKilled: false,
        killReason: undefined,
        killedAt: undefined,
      };
    }

    default:
      return state;
  }
}

/**
 * Replays all events from zero to produce the canonical DerivedWorldState.
 */
export function reduceAllEvents(events: Event[], baseState: DerivedWorldState = INITIAL_DERIVED_STATE): DerivedWorldState {
  return events.reduce((accState, event) => reduceEvent(accState, event), baseState);
}
