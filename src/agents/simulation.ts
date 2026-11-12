/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs deterministic Monte Carlo simulations when dispatch plans change.
 */

import { EventSubscriber, useWorldStore, WorldStoreState } from '../state/store.ts';
import { MonteCarloResult, Plan } from '../state/types.ts';
import { MonteCarloWorldState, monteCarlo } from '../sim/monteCarlo.ts';
import { fetchWithTimeout } from '../services/fetchWithTimeout.ts';

const TRIALS = 300;
const PLAN_EVENT_TYPES = new Set([
  'DISPATCH_PLANS_UPDATED',
  'PLAN_CREATED',
  'PLAN_SUPERPOSITION_GENERATED',
  'SUPERPOSITION_PLANS_BATCH_SET',
  'PLANS_SUPERPOSITION_UPDATED',
  'SIMULATION_SEED_UPDATED',
  'RAINFALL_CONTEXT_UPDATED',
]);

function simulationWorldState(state: WorldStoreState): MonteCarloWorldState {
  return {
    incidents: state.incidents,
    volunteers: state.volunteers,
    resources: state.resources,
    reports: state.reports,
    areas: state.areas,
    context: state.context,
  };
}

function capSentences(text: string): string {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
}

function fallbackExplanation(plan: Plan, metrics: MonteCarloResult): string {
  return `Across ${metrics.trials} simulated worlds, this plan reaches about ${Math.round(metrics.expectedReached)} people on average, with a 95% confidence range of ${Math.round(metrics.confidenceInterval95.lower)} to ${Math.round(metrics.confidenceInterval95.upper)}. It reaches all critical incidents in ${Math.round(metrics.probabilityAllCriticalReached * 100)}% of simulated worlds.`;
}

async function writeExplanation(
  plan: Plan,
  metrics: MonteCarloResult,
  canContinue: () => boolean
): Promise<string> {
  try {
    if (!canContinue()) return fallbackExplanation(plan, metrics);
    const response = await fetchWithTimeout('/api/gemini/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'simulation',
        prompt: `Write exactly two concise plain-language sentences explaining these already-computed simulation results. Do not calculate, alter, or invent metrics. Return only the two sentences. Plan: ${plan.name || plan.strategy || plan.id}. Results: ${JSON.stringify({
          trials: metrics.trials,
          expectedReached: metrics.expectedReached,
          worstCase5pct: metrics.worstCase5pct,
          confidenceInterval95: metrics.confidenceInterval95,
          probabilityAllCriticalReached: metrics.probabilityAllCriticalReached,
        })}`,
        systemInstruction: 'You explain authoritative numeric simulation results in plain language. Never calculate, change, round, or introduce metrics.',
        temperature: 0.1,
      }),
    });
    if (!canContinue()) return fallbackExplanation(plan, metrics);
    if (!response.ok) {
      console.warn('[Simulation Agent] Gemini explanation request failed with HTTP', response.status);
      return fallbackExplanation(plan, metrics);
    }
    const data = await response.json();
    if (!canContinue()) return fallbackExplanation(plan, metrics);
    const text = typeof data.text === 'string'
      ? data.text.trim().replace(/^```(?:text)?/i, '').replace(/```$/i, '').trim()
      : '';
    const explanation = capSentences(text);
    return explanation || fallbackExplanation(plan, metrics);
  } catch (error) {
    if (!canContinue()) return fallbackExplanation(plan, metrics);
    console.warn('[Simulation Agent] Gemini explanation unavailable; using deterministic explanation.', error);
    return fallbackExplanation(plan, metrics);
  }
}

function totalPeopleAtRisk(state: WorldStoreState): number {
  return Object.values(state.incidents)
    .filter(incident => incident.status !== 'resolved')
    .reduce((total, incident) => {
      const count = incident.reportIds.reduce(
        (sum, reportId) => sum + Math.max(0, state.reports[reportId]?.peopleAtRisk || 0),
        0
      );
      return total + (count || 1);
    }, 0);
}

function rankPlans(
  plans: Plan[],
  results: Map<string, MonteCarloResult>,
  population: number
): Plan[] {
  const maximum = Math.max(1, population);
  const ranked = plans.map(plan => {
    const metrics = results.get(plan.id)!;
    const score =
      0.6 * Math.min(1, metrics.expectedReached / maximum) +
      0.25 * Math.min(1, metrics.worstCase5pct / maximum) +
      0.15 * (1 - Math.min(100, Math.max(0, plan.riskScore)) / 100);
    return { ...plan, simulationMetrics: { ...metrics, rankScore: score } };
  });
  const totalScore = ranked.reduce((sum, plan) => sum + (plan.simulationMetrics?.rankScore || 0), 0);
  return ranked.map(plan => ({
    ...plan,
    probability: totalScore > 0
      ? (plan.simulationMetrics?.rankScore || 0) / totalScore
      : 1 / Math.max(1, ranked.length),
  }));
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let unsubscribe: (() => void) | undefined;

async function runSimulation(state: WorldStoreState): Promise<void> {
  if (state.isKilled) return;
  const plans = Object.values(state.plans).filter(plan => plan.status === 'candidate');
  if (plans.length === 0) return;
  const runId = ++generation;
  const canContinue = () => runId === generation && !useWorldStore.getState().isKilled;
  const seed = state.simulationSeed;
  const world = simulationWorldState(state);
  const startedAt = performance.now();
  useWorldStore.getState().setAgentEvaluating('simulation', true, `Simulating ${plans.length} plans across ${TRIALS} worlds`);

  try {
    const results = new Map(plans.map(plan => [plan.id, monteCarlo(plan, world, TRIALS, seed)]));
    const rankedPlans = rankPlans(plans, results, totalPeopleAtRisk(state));
    const explainedPlans = await Promise.all(rankedPlans.map(async plan => ({
      id: plan.id,
      simulationMetrics: plan.simulationMetrics,
      simulationExplanation: await writeExplanation(plan, plan.simulationMetrics!, canContinue),
      probability: plan.probability,
    })));

    const current = useWorldStore.getState();
    if (!canContinue() || current.simulationSeed !== seed) return;
    const stillCurrent = plans.every(plan => {
      const currentPlan = current.plans[plan.id];
      return currentPlan &&
        JSON.stringify(currentPlan.assignments) === JSON.stringify(plan.assignments);
    });
    if (!stillCurrent) return;

    useWorldStore.getState().dispatchEvent({
      actor: 'agent:simulation',
      type: 'SIMULATION_RESULTS_UPDATED',
      payload: { plans: explainedPlans, seed, trials: TRIALS },
      reason: `Simulation completed for ${plans.length} dispatch plans using seed ${seed}.`,
    });
    useWorldStore.getState().logAgentActivity({
      id: `simulation_${seed}_${Date.now()}`,
      timestamp: Date.now(),
      agent: 'simulation',
      toolName: 'monteCarlo',
      inputParams: { planCount: plans.length, trials: TRIALS, seed },
      outputResult: {
        planCount: explainedPlans.length,
        expectedReached: Object.fromEntries(explainedPlans.map(plan => [
          plan.id,
          plan.simulationMetrics?.expectedReached,
        ])),
      },
      executionMs: Math.max(1, Math.round(performance.now() - startedAt)),
      status: 'success',
      triggerReason: 'Dispatch plans changed',
    });
  } catch (error) {
    if (!canContinue()) return;
    console.error('[Simulation Agent] Simulation failed.', error);
    useWorldStore.getState().dispatchEvent({
      actor: 'agent:simulation',
      type: 'AGENT_ERROR_LOGGED',
      payload: { agent: 'simulation', error: error instanceof Error ? error.message : String(error) },
      reason: 'Simulation could not evaluate dispatch plans.',
    });
  } finally {
    if (runId === generation) {
      useWorldStore.getState().setAgentEvaluating('simulation', false);
    }
  }
}

export function initSimulationAgentSubscription(): () => void {
  unsubscribe?.();
  const state = useWorldStore.getState();
  const schedule = () => {
    generation++;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runSimulation(useWorldStore.getState());
    }, 30);
  };
  unsubscribe = state.subscribeToEvents((event: Parameters<EventSubscriber>[0]) => {
    if (event.type === 'DEMO_SCENARIO_RESET') {
      generation++;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = undefined;
      useWorldStore.getState().setAgentEvaluating('simulation', false);
      return;
    }
    if (event.type === 'SYSTEM_FROZEN') {
      generation++;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = undefined;
      useWorldStore.getState().setAgentEvaluating('simulation', false);
      return;
    }
    if (PLAN_EVENT_TYPES.has(event.type)) schedule();
  });
  if (Object.values(state.plans).some(plan => plan.status === 'candidate')) schedule();
  return () => {
    unsubscribe?.();
    unsubscribe = undefined;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
    generation++;
  };
}
