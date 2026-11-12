import assert from 'node:assert/strict';
import test from 'node:test';
import { entangledMonteCarlo, type QWorld } from '../src/quantum/entangledSim.ts';
import type { Incident, PlanAssignment, Report, Volunteer } from '../src/state/types.ts';

function stressWorld(heat: number): QWorld {
  const incidents: Incident[] = ['heat-a', 'heat-b'].map((id, index) => ({
    id,
    area: index === 0 ? 'ward-a' : 'ward-b',
    summary: 'Heat illness calls reported',
    priority: 70,
    severity: 'medium',
    needs: ['medical'],
    reportIds: [`rep-${id}`],
    status: 'open',
    type: heat > 35 ? 'heatwave' : 'flood',
    heatIndexC: heat > 35 ? heat : undefined,
    location: { x: 0, y: index * 5 },
  }));
  const volunteers: Volunteer[] = incidents.map((incident, index) => ({
    id: `crew-${index}`,
    name: `Crew ${index}`,
    skills: ['first-aid'],
    vehicle: 'car',
    location: { x: 2500, y: index * 5 },
    available: true,
    trust: 0.9,
  }));
  const reports: Report[] = incidents.map((incident, index) => ({
    id: incident.reportIds[0],
    ts: 1,
    area: incident.area,
    text: 'Heat illness calls need medical help.',
    language: 'en',
    source: 'citizen',
    reporterId: `source-${index}`,
    location: incident.location!,
    peopleAtRisk: 20,
    flags: [],
    credibility: 0.9,
  }));
  return {
    incidents: Object.fromEntries(incidents.map(incident => [incident.id, incident])),
    volunteers: Object.fromEntries(volunteers.map(volunteer => [volunteer.id, volunteer])),
    resources: {},
    reports: Object.fromEntries(reports.map(report => [report.id, report])),
    areas: {
      'ward-a': { id: 'ward-a', name: 'Ward A', coordinates: { x: 0, y: 0 }, vulnerability: 0.7 },
      'ward-b': { id: 'ward-b', name: 'Ward B', coordinates: { x: 0, y: 5 }, vulnerability: 0.7 },
    },
    context: { rainfallMmHr: 0, ambientTempC: heat },
  };
}

test('heat stress creates a measured correlated risk field and raises pairwise MI', () => {
  const assignments: PlanAssignment[] = [
    { volunteerId: 'crew-0', incidentId: 'heat-a' },
    { volunteerId: 'crew-1', incidentId: 'heat-b' },
  ];
  const cool = entangledMonteCarlo(assignments, stressWorld(30), 3000, 42);
  const hot = entangledMonteCarlo(assignments, stressWorld(44), 3000, 42);
  const coolIndex = cool.edges.reduce((sum, edge) => sum + edge.mutualInformationBits, 0);
  const hotIndex = hot.edges.reduce((sum, edge) => sum + edge.mutualInformationBits, 0);
  assert.ok(hotIndex > coolIndex, `expected hot index ${hotIndex} > cool index ${coolIndex}`);
  assert.ok(hot.heatMetrics.averagePowerCutProbability > cool.heatMetrics.averagePowerCutProbability);
  assert.ok(hot.heatMetrics.averageHospitalCapacityShortfallProbability > cool.heatMetrics.averageHospitalCapacityShortfallProbability);
  assert.ok(hot.heatMetrics.heatIllnessCallPressure > cool.heatMetrics.heatIllnessCallPressure);
});
