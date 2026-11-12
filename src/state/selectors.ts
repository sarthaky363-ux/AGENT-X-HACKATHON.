/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ENTANGLE Selectors
 * Pure, memoized state projection selectors for the shared WorldState.
 */

import { Incident, Plan, Resource, Volunteer, WorldStoreState } from './store.ts';

/**
 * 1. openIncidentsByPriority:
 * Returns all unresolved incidents (status !== 'resolved') ordered by priority descending.
 */
export const selectOpenIncidentsByPriority = (state: WorldStoreState): Incident[] => {
  return Object.values(state.incidents)
    .filter(inc => inc.status !== 'resolved')
    .sort((a, b) => b.priority - a.priority);
};

/**
 * 2. freeVolunteers:
 * Returns all volunteers currently available for deployment (available === true).
 */
export const selectFreeVolunteers = (state: WorldStoreState): Volunteer[] => {
  return Object.values(state.volunteers).filter(vol => vol.available);
};

/**
 * 3. stockByType:
 * Aggregates resource stocks across all depots grouped by resource type.
 */
export interface AggregatedStock {
  type: string;
  totalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  depots: string[];
}

export const selectStockByType = (state: WorldStoreState): Record<string, AggregatedStock> => {
  const stockMap: Record<string, AggregatedStock> = {};

  Object.values(state.resources).forEach(res => {
    if (!stockMap[res.type]) {
      stockMap[res.type] = {
        type: res.type,
        totalQuantity: 0,
        allocatedQuantity: 0,
        availableQuantity: 0,
        depots: [],
      };
    }

    const current = stockMap[res.type];
    current.totalQuantity += res.quantity;
    current.allocatedQuantity += res.allocatedQty || 0;
    current.availableQuantity = Math.max(0, current.totalQuantity - current.allocatedQuantity);
    if (!current.depots.includes(res.depotArea)) {
      current.depots.push(res.depotArea);
    }
  });

  return stockMap;
};

/**
 * 4. latestPlans:
 * Returns candidate plans in superposition sorted by probability descending.
 */
export const selectLatestPlans = (state: WorldStoreState): Plan[] => {
  return Object.values(state.plans).sort((a, b) => b.probability - a.probability);
};

/**
 * Additional domain selectors
 */
export const selectApprovedPlan = (state: WorldStoreState): Plan | undefined => {
  return Object.values(state.plans).find(p => p.status === 'approved' || p.status === 'executed');
};

export const selectIncidentsByArea = (state: WorldStoreState, areaId: string): Incident[] => {
  return Object.values(state.incidents).filter(inc => inc.area === areaId);
};

export const selectVolunteersBySkill = (state: WorldStoreState, skill: string): Volunteer[] => {
  return Object.values(state.volunteers).filter(vol =>
    vol.skills.some(s => s.toLowerCase() === skill.toLowerCase())
  );
};
