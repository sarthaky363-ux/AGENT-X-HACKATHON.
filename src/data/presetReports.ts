/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Pre-written citizen and field distress reports for demonstration.
 * Exact specification:
 * - Two true duplicates (same lane in Kurla)
 * - One rumour ("dam has burst in Powai", contradicted by the official feed)
 * - One Hindi message about an elderly person with oxygen needs in Sion
 * - One Marathi message about a family on a roof in Mithi belt
 * - One vague report with no location
 * - One heatwave report about an elderly collapsed worker
 * - One volunteer-sourced report
 */

import { Report } from '../state/types.ts';

export interface PresetReportItem extends Omit<Report, 'id' | 'ts'> {
  id?: string;
  presetKey: string;
  label: string;
  category: 'duplicate' | 'rumour' | 'multilingual_hi' | 'multilingual_mr' | 'vague' | 'heatwave' | 'volunteer';
  expectedAction: string;
}

export const PRESET_CITIZEN_REPORTS: PresetReportItem[] = [
  {
    presetKey: 'kurla_dup_1',
    label: 'Kurla Lane 4 - Primary Alert',
    category: 'duplicate',
    expectedAction: 'Creates initial incident in Kurla with priority ~70+',
    area: 'kurla',
    text: 'Water reached knee level in Kranti Nagar lane 4 near bail bazaar, 6 people stuck on ground floor.',
    language: 'en',
    source: 'citizen',
    reporterId: 'cit_kurla_881',
    location: { x: 440, y: 350 },
    peopleAtRisk: 6,
    flags: ['water_rising', 'ground_floor'],
    credibility: 0.88,
  },
  {
    presetKey: 'kurla_dup_2',
    label: 'Kurla Lane 4 - Duplicate (Redundant)',
    category: 'duplicate',
    expectedAction: 'Triage detects 300m spatial match and auto-merges into Primary',
    area: 'kurla',
    text: 'Kranti Nagar lane 4 bail bazaar inundated, ground floor submerged, 6 family members waiting on second floor.',
    language: 'en',
    source: 'citizen',
    reporterId: 'cit_kurla_994',
    location: { x: 442, y: 352 },
    peopleAtRisk: 6,
    flags: ['water_rising', 'ground_floor'],
    credibility: 0.85,
  },
  {
    presetKey: 'powai_rumor',
    label: 'Powai Dam Burst (Viral Rumour)',
    category: 'rumour',
    expectedAction: 'Contradicted by BMC sensor feed; classified as panic rumour / ignored',
    area: 'andheri_east',
    text: 'URGENT ALERT: Powai dam has burst and entire Saki Naka will be submerged in 10 minutes!! Run immediately!!',
    language: 'en',
    source: 'citizen',
    reporterId: 'cit_viral_anon',
    location: { x: 480, y: 220 },
    peopleAtRisk: 100,
    flags: ['viral_rumour', 'unverified', 'panic'],
    credibility: 0.15,
  },
  {
    presetKey: 'sion_hindi',
    label: 'Sion SOS (Hindi) - Elderly with Oxygen',
    category: 'multilingual_hi',
    expectedAction: 'Extracts 82yo elderly + oxygen, scores priority ~90 (Critical)',
    area: 'sion',
    text: 'सायन कोलीवाडा में हमारे दादाजी (८२ वर्ष) ऑक्सीजन सिलेंडर पर हैं, पानी कमर तक भर चुका है और बिजली चली गई है। तुरंत मदद चाहिए!',
    language: 'hi',
    source: 'citizen',
    reporterId: 'cit_sion_331',
    location: { x: 390, y: 460 },
    peopleAtRisk: 3,
    flags: ['elderly', 'oxygen_support', 'power_cut'],
    credibility: 0.95,
  },
  {
    presetKey: 'mithi_marathi',
    label: 'Mithi River (Marathi) - Family on Rooftop',
    category: 'multilingual_mr',
    expectedAction: 'Extracts roof water-depth + pregnant + children, priority ~95 (Critical), needs: boat',
    area: 'mithi_river_belt',
    text: 'मिठी नदी काठच्या क्रांती नगर झोपडपट्टीत पाणी छतापर्यंत आले आहे. ५ मुले आणि गरोदर महिला छतावर अडकली आहेत, तात्काळ बोट पाठवा!',
    language: 'mr',
    source: 'citizen',
    reporterId: 'cit_mithi_402',
    location: { x: 430, y: 360 },
    peopleAtRisk: 6,
    flags: ['roof_water_level', 'pregnant', 'children', 'boat_needed'],
    credibility: 0.96,
  },
  {
    presetKey: 'vague_sos',
    label: 'Vague SOS - No Precise Coordinates',
    category: 'vague',
    expectedAction: 'Flags missing coordinates; scores base priority and requests clarification',
    area: 'kurla',
    text: 'Help please, water entering house very fast, someone send help immediately!!',
    language: 'en',
    source: 'citizen',
    reporterId: 'cit_anon_panic',
    location: { x: 400, y: 400 },
    peopleAtRisk: 1,
    flags: ['vague_location', 'needs_clarification'],
    credibility: 0.45,
  },
  {
    presetKey: 'dahisar_heatwave',
    label: 'Dahisar Heatwave - Elderly Collapsed Worker',
    category: 'heatwave',
    expectedAction: 'Scores priority for 65yo heatstroke, assigns medical + cool shelter',
    area: 'dahisar',
    text: 'Extreme heat at Dahisar check-naka construction site, 65yo elderly laborer collapsed with suspected heatstroke, unconscious, no shade or drinking water.',
    language: 'en',
    source: 'citizen',
    reporterId: 'cit_dahisar_719',
    location: { x: 260, y: 110 },
    peopleAtRisk: 1,
    flags: ['heatstroke', 'unconscious', 'high_heat_index'],
    credibility: 0.92,
  },
  {
    presetKey: 'volunteer_sion',
    label: 'Volunteer Report - 25 Trapped in Stalled Buses',
    category: 'volunteer',
    expectedAction: 'High trust source (volunteer); 25 people at risk, road blocked, towing + rope needs',
    area: 'sion',
    text: 'Field volunteer Team #4 at Sion Circle: Road underpass completely submerged (waist-deep), 2 BEST buses stalled with ~25 passengers trapped inside, require towing and rope rescue.',
    language: 'en',
    source: 'volunteer',
    reporterId: 'vol_team_4_leader',
    location: { x: 410, y: 480 },
    peopleAtRisk: 25,
    flags: ['volunteer_verified', 'stalled_buses', 'road_blocked'],
    credibility: 0.98,
  },
];
