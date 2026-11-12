import { Event, Report } from '../state/types.ts';

export const DEMO_SCENARIO_DURATION_MS = 90_000;
export const DEMO_SCENARIO_SEED = 20261028;

export interface DemoScenarioInput {
  atMs: number;
  ts: number;
  id: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  reason: string;
  report?: Omit<Report, 'id' | 'ts'>;
}

type DemoScenarioDraft = Omit<DemoScenarioInput, 'ts'>;

function report(
  area: string,
  text: string,
  location: { x: number; y: number },
  peopleAtRisk: number,
  flags: string[],
  reporterId: string,
  credibility: number,
): Omit<Report, 'id' | 'ts'> {
  return {
    area,
    text,
    language: 'en',
    source: 'citizen',
    reporterId,
    location,
    peopleAtRisk,
    flags,
    credibility,
  };
}

export function createDemoScenarioSchedule(startTs: number): DemoScenarioInput[] {
  const inputs: DemoScenarioDraft[] = [
    {
      atMs: 0,
      id: 'demo_20261028_01_seed',
      type: 'SIMULATION_SEED_UPDATED',
      actor: 'human',
      payload: { seed: DEMO_SCENARIO_SEED },
      reason: `Demo scenario fixed the Monte Carlo seed at ${DEMO_SCENARIO_SEED}.`,
    },
    {
      atMs: 5_000,
      id: 'demo_20261028_02_kurla_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: water rising around Kranti Nagar in Kurla.',
      report: report(
        'kurla',
        'Water is rising around Kranti Nagar; two families need help moving to higher ground.',
        { x: 480, y: 380 },
        12,
        ['water_rising', 'evac_needed'],
        'demo_citizen_kurla_01',
        0.86,
      ),
    },
    {
      atMs: 10_000,
      id: 'demo_20261028_03_sion_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: residents need first aid near Sion Station.',
      report: report(
        'sion',
        'Water is crossing the footpath near Sion Station; residents need first aid.',
        { x: 420, y: 440 },
        8,
        ['waterlogging', 'medical'],
        'demo_citizen_sion_01',
        0.83,
      ),
    },
    {
      atMs: 15_000,
      id: 'demo_20261028_04_imd_alert',
      type: 'OFFICIAL_ALERT_RELEASED',
      actor: 'official:imd',
      payload: {
        id: 'demo_alert_imd_01',
        ts: startTs + 15_000,
        source: 'IMD Mumbai Radar',
        agency: 'IMD',
        headline: 'Severe rainfall cell over Kurla and Sion',
        text: 'Radar confirms intense rainfall over the Kurla-Sion corridor for the next 45 minutes.',
        urgency: 'critical',
        area: 'kurla',
        claimType: 'weather',
        isExtremeConfirmed: true,
      },
      reason: 'IMD official alert confirms severe rainfall over Kurla and Sion.',
    },
    {
      atMs: 20_000,
      id: 'demo_20261028_05_andheri_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: water is collecting near the Andheri East subway.',
      report: report(
        'andheri_east',
        'Water is collecting near the Andheri East subway; traffic is slowing.',
        { x: 340, y: 260 },
        5,
        ['waterlogging', 'traffic'],
        'demo_citizen_andheri_01',
        0.79,
      ),
    },
    {
      atMs: 27_000,
      id: 'demo_20261028_06_bmc_alert',
      type: 'OFFICIAL_ALERT_RELEASED',
      actor: 'official:bmc',
      payload: {
        id: 'demo_alert_bmc_powai_01',
        ts: startTs + 27_000,
        source: 'BMC Hydraulic Engineer & Dam Safety Cell',
        agency: 'BMC',
        headline: 'Powai Lake inspection: dam intact',
        text: 'Inspection confirms the Powai Lake weir and spillway are operating normally; no dam breach is reported.',
        urgency: 'high',
        area: 'andheri_east',
        claimType: 'dam breach',
        contradictsClaims: ['dam burst', 'dam has burst', 'dam breach', 'powai dam'],
        isExtremeConfirmed: false,
      },
      reason: 'BMC official alert confirms the Powai Lake dam is intact.',
    },
    {
      atMs: 34_000,
      id: 'demo_20261028_07_kurla_corroboration',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report corroborates rising water in the Kurla incident area.',
      report: report(
        'kurla',
        'Water has reached the lane entrance near Kranti Nagar; the reported location is correct.',
        { x: 482, y: 382 },
        6,
        ['water_rising', 'location_confirmed'],
        'demo_citizen_kurla_02',
        0.88,
      ),
    },
    {
      atMs: 42_000,
      id: 'demo_20261028_08_road_closure',
      type: 'ROAD_CLOSURE_REPORTED',
      actor: 'official:traffic',
      payload: {
        area: 'kurla',
        from: 'Kurla',
        to: 'Sion',
        description: 'Kurla-Sion link closed due to floodwater.',
        penaltyMinutes: 18,
      },
      reason: 'Traffic control reports the Kurla-Sion link closed due to floodwater.',
    },
    {
      atMs: 48_000,
      id: 'demo_20261028_09_boat_stockout',
      type: 'RESOURCE_STOCKED',
      actor: 'agent:logistics',
      payload: {
        id: 'res_kurl_boat',
        type: 'inflatable_boat',
        quantity: 0,
        depotArea: 'Kurla Emergency Staging Depot',
        allocatedQty: 0,
      },
      reason: 'Logistics reports a stock-out of inflatable boats at the Kurla depot.',
    },
    {
      atMs: 55_000,
      id: 'demo_20261028_10_chembur_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: families need drinking water near Chembur.',
      report: report(
        'chembur',
        'Several families near Govandi need drinking water after the supply interruption.',
        { x: 520, y: 470 },
        15,
        ['water_supply', 'families'],
        'demo_citizen_chembur_01',
        0.82,
      ),
    },
    {
      atMs: 62_000,
      id: 'demo_20261028_11_powai_rumour',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: an unverified viral claim says the Powai dam has burst.',
      report: report(
        'andheri_east',
        'Viral message claims the Powai dam has burst and Saki Naka will be submerged.',
        { x: 480, y: 220 },
        100,
        ['viral_rumour', 'unverified', 'panic'],
        'demo_powai_rumour',
        0.12,
      ),
    },
    {
      atMs: 68_000,
      id: 'demo_20261028_12_powai_field_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario field report corroborates the BMC finding: Powai dam intact; local street flooding only.',
      report: report(
        'andheri_east',
        'Field check near Powai Lake confirms the dam is intact; water is pooling on one local street.',
        { x: 482, y: 224 },
        3,
        ['field_checked', 'localized_flooding', 'powai'],
        'demo_powai_field_reporter',
        0.91,
      ),
    },
    {
      atMs: 80_000,
      id: 'demo_20261028_13_kurla_boat_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: residents near the Mithi need boat evacuation.',
      report: report(
        'kurla',
        'Residents are waiting on a rooftop near the Mithi; a rescue boat is needed.',
        { x: 486, y: 386 },
        9,
        ['roof_water_level', 'boat_needed'],
        'demo_citizen_kurla_03',
        0.89,
      ),
    },
    {
      atMs: DEMO_SCENARIO_DURATION_MS,
      id: 'demo_20261028_14_dadar_report',
      type: 'REPORT_ADDED',
      actor: 'citizen',
      payload: {},
      reason: 'Scenario report: waterlogging is worsening near Dadar TT.',
      report: report(
        'dadar',
        'Water is rising near Dadar TT; commuters are asking for a safe route.',
        { x: 390, y: 550 },
        10,
        ['water_rising', 'commuters'],
        'demo_citizen_dadar_01',
        0.84,
      ),
    },
  ];

  return inputs.map(input => ({
    ...input,
    ts: startTs + input.atMs,
    payload: input.report
      ? {
          ...input.report,
          id: input.id.replace('demo_20261028_', 'demo_report_'),
          ts: startTs + input.atMs,
        }
      : input.payload,
  }));
}

export function dispatchDemoScenarioInput(
  input: DemoScenarioInput,
  dispatchEvent: (event: { id: string; ts: number; actor: string; type: string; payload: Record<string, unknown>; reason: string }) => Event | null,
  addScenarioReport: (report: Omit<Report, 'id' | 'ts'>, id: string, ts: number, eventId: string) => Event | null,
): Event | null {
  if (input.report) {
    const reportId = input.id.replace('demo_20261028_', 'demo_report_');
    return addScenarioReport(input.report, reportId, input.ts, input.id);
  }
  return dispatchEvent({
    id: input.id,
    ts: input.ts,
    actor: input.actor,
    type: input.type,
    payload: input.payload,
    reason: input.reason,
  });
}
