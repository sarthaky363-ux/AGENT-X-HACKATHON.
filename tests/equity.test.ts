import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeWardEquity } from '../src/quantum/equity.ts';
import type { EntangledSimResult, QWorld } from '../src/quantum/entangledSim.ts';

test('ward equity vulnerability-weights reach, flags a material gap and suggests one crew move', () => {
  const world: QWorld = {
    incidents: {
      a: { id: 'a', area: 'high', summary: 'A', priority: 1, severity: 'high', needs: [], reportIds: [], status: 'open' },
      b: { id: 'b', area: 'low', summary: 'B', priority: 1, severity: 'high', needs: [], reportIds: [], status: 'open' },
    },
    volunteers: {
      v1: { id: 'v1', name: 'One', skills: [], vehicle: 'car', location: { x: 0, y: 0 }, available: true, trust: 1 },
      v2: { id: 'v2', name: 'Two', skills: [], vehicle: 'car', location: { x: 1, y: 0 }, available: true, trust: 1 },
    },
    resources: {},
    reports: {},
    areas: {
      high: { id: 'high', name: 'High Ward', coordinates: { x: 0, y: 0 }, vulnerability: 0.9 },
      low: { id: 'low', name: 'Low Ward', coordinates: { x: 100, y: 0 }, vulnerability: 0.4 },
    },
  };
  const simulation = {
    trials: 10, seed: 1, incidentIds: ['a', 'b'], reached: [], marginal: { a: 0.9, b: 0.5 },
    edges: [], expectedReached: 0, worstCase5pct: 0, stdReached: 0,
    probabilityAllCriticalReached: 0, outcomes: [],
    heatMetrics: { averagePowerCutProbability: 0, averageHospitalCapacityShortfallProbability: 0, heatIllnessCallPressure: 0 },
  } satisfies EntangledSimResult;
  const result = analyzeWardEquity(world, [
    { volunteerId: 'v1', incidentId: 'a' },
    { volunteerId: 'v2', incidentId: 'a' },
  ], simulation);
  assert.ok(result.gini >= 0);
  assert.ok(result.flaggedWardIds.includes('low'));
  assert.equal(result.smallestReassignment?.toIncidentId, 'b');
  assert.equal(result.smallestReassignment?.volunteerId, 'v1');
});
