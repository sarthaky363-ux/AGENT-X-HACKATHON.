/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Mumbai Monsoon Flood Scenario Seed Data
 * Exact specification:
 * - 6 areas with schematic x,y positions
 * - 40 volunteers with realistic skills (swimming, first-aid, driving, boat, Marathi/Hindi)
 * - 12 resource stocks across 3 depots
 * - 1 mock official alert feed with 5 timed alerts
 */

import { Area, Event, Incident, OfficialAlert, Report, Resource, Volunteer } from '../state/types.ts';
import { computeCredibility } from '../tools/credibility.ts';

export const SEED_AREAS: Record<string, Area> = {
  kurla: {
    id: 'kurla',
    name: 'Kurla & LBS Corridor',
    region: 'Eastern Suburbs',
    coordinates: { x: 480, y: 380 },
    vulnerability: 0.91,
    hotspots: ['Kranti Nagar', 'Bail Bazar', 'LBS Marg Junction'],
  },
  sion: {
    id: 'sion',
    name: 'Sion & Dharavi North',
    region: 'Island City',
    coordinates: { x: 420, y: 440 },
    vulnerability: 0.94,
    hotspots: ['Sion Station Nullah', 'Kumbharwada Lowlands', '90-Feet Road'],
  },
  andheri_east: {
    id: 'andheri_east',
    name: 'Andheri East & Subways',
    region: 'Western Suburbs',
    coordinates: { x: 340, y: 260 },
    vulnerability: 0.82,
    hotspots: ['Milan Subway Underpass', 'Andheri Subway', 'WEH Junction'],
  },
  dahisar: {
    id: 'dahisar',
    name: 'Dahisar River Spillway',
    region: 'Western Suburbs',
    coordinates: { x: 320, y: 130 },
    vulnerability: 0.48,
    hotspots: ['Dahisar River Bank', 'SV Road Borivali Periphery'],
  },
  chembur: {
    id: 'chembur',
    name: 'Chembur & Govandi Lowline',
    region: 'Eastern Suburbs',
    coordinates: { x: 520, y: 470 },
    vulnerability: 0.74,
    hotspots: ['Postal Colony', 'Shell Colony', 'Govandi Shivaji Nagar'],
  },
  mithi_river_belt: {
    id: 'mithi_river_belt',
    name: 'Mithi River Basin Corridor',
    region: 'Central Hydraulic Artery',
    coordinates: { x: 450, y: 340 },
    vulnerability: 0.96,
    hotspots: ['Mahim Causeway Sluice', 'Kalina Culvert', 'Bandra Staging Gate'],
  },
};

// 40 Volunteers with realistic Indian names and skills
export const SEED_VOLUNTEERS: Volunteer[] = [
  { id: 'vol_01', name: 'Tanmay Deshmukh', skills: ['swimming', 'boat', 'Marathi', 'Hindi'], vehicle: 'boat', location: { x: 485, y: 382 }, available: true, trust: 0.98, phoneMasked: '+91 98201*****' },
  { id: 'vol_02', name: 'Sneha Shinde', skills: ['first-aid', 'Marathi', 'Hindi'], vehicle: 'bike', location: { x: 422, y: 438 }, available: true, trust: 0.95, phoneMasked: '+91 98190*****' },
  { id: 'vol_03', name: 'Rahul Kamble', skills: ['swimming', 'driving', 'Marathi'], vehicle: 'car', location: { x: 342, y: 262 }, available: true, trust: 0.92, phoneMasked: '+91 97690*****' },
  { id: 'vol_04', name: 'Priya Kadam', skills: ['first-aid', 'swimming', 'Hindi', 'Marathi'], vehicle: 'none', location: { x: 478, y: 385 }, available: true, trust: 0.97, phoneMasked: '+91 99302*****' },
  { id: 'vol_05', name: 'Vikrant More', skills: ['boat', 'driving', 'Marathi'], vehicle: 'boat', location: { x: 452, y: 342 }, available: true, trust: 0.94, phoneMasked: '+91 98210*****' },
  { id: 'vol_06', name: 'Aarav Patil', skills: ['driving', 'swimming', 'Hindi'], vehicle: 'car', location: { x: 522, y: 468 }, available: true, trust: 0.89, phoneMasked: '+91 91672*****' },
  { id: 'vol_07', name: 'Pooja Jadhav', skills: ['first-aid', 'Marathi', 'Hindi'], vehicle: 'none', location: { x: 322, y: 132 }, available: true, trust: 0.93, phoneMasked: '+91 98921*****' },
  { id: 'vol_08', name: 'Amit Gokhale', skills: ['swimming', 'first-aid', 'Marathi'], vehicle: 'bike', location: { x: 425, y: 445 }, available: true, trust: 0.96, phoneMasked: '+91 98205*****' },
  { id: 'vol_09', name: 'Zoya Khan', skills: ['first-aid', 'Hindi', 'Marathi'], vehicle: 'bike', location: { x: 482, y: 378 }, available: true, trust: 0.91, phoneMasked: '+91 98194*****' },
  { id: 'vol_10', name: 'Ganesh Sawant', skills: ['boat', 'swimming', 'Marathi'], vehicle: 'boat', location: { x: 448, y: 338 }, available: true, trust: 0.99, phoneMasked: '+91 97022*****' },
  { id: 'vol_11', name: 'Kavita Nair', skills: ['first-aid', 'driving', 'Hindi'], vehicle: 'car', location: { x: 338, y: 258 }, available: true, trust: 0.88, phoneMasked: '+91 98330*****' },
  { id: 'vol_12', name: 'Sachin Tendulkar-Patil', skills: ['driving', 'swimming', 'Marathi'], vehicle: 'car', location: { x: 518, y: 472 }, available: true, trust: 0.94, phoneMasked: '+91 98691*****' },
  { id: 'vol_13', name: 'Farhan Shaikh', skills: ['swimming', 'bike', 'Hindi'], vehicle: 'bike', location: { x: 486, y: 384 }, available: true, trust: 0.87, phoneMasked: '+91 99201*****' },
  { id: 'vol_14', name: 'Ananya Joshi', skills: ['first-aid', 'swimming', 'Marathi', 'Hindi'], vehicle: 'none', location: { x: 424, y: 442 }, available: true, trust: 0.95, phoneMasked: '+91 98204*****' },
  { id: 'vol_15', name: 'Deepak Salvi', skills: ['boat', 'driving', 'Marathi'], vehicle: 'boat', location: { x: 454, y: 344 }, available: true, trust: 0.96, phoneMasked: '+91 97692*****' },
  { id: 'vol_16', name: 'Manish Chaugule', skills: ['swimming', 'driving', 'Hindi', 'Marathi'], vehicle: 'car', location: { x: 344, y: 264 }, available: true, trust: 0.90, phoneMasked: '+91 98925*****' },
  { id: 'vol_17', name: 'Ritu Verma', skills: ['first-aid', 'Hindi'], vehicle: 'bike', location: { x: 324, y: 134 }, available: true, trust: 0.92, phoneMasked: '+91 98214*****' },
  { id: 'vol_18', name: 'Prashant Gaikwad', skills: ['boat', 'swimming', 'Marathi'], vehicle: 'boat', location: { x: 484, y: 380 }, available: true, trust: 0.97, phoneMasked: '+91 98197*****' },
  { id: 'vol_19', name: 'Shabana Bano', skills: ['first-aid', 'Hindi', 'Marathi'], vehicle: 'none', location: { x: 524, y: 474 }, available: true, trust: 0.89, phoneMasked: '+91 99670*****' },
  { id: 'vol_20', name: 'Rohan Tambe', skills: ['driving', 'swimming', 'Marathi'], vehicle: 'bike', location: { x: 420, y: 436 }, available: true, trust: 0.93, phoneMasked: '+91 98208*****' },
  { id: 'vol_21', name: 'Bhavna Rathod', skills: ['first-aid', 'Hindi', 'swimming'], vehicle: 'none', location: { x: 340, y: 256 }, available: true, trust: 0.91, phoneMasked: '+91 98335*****' },
  { id: 'vol_22', name: 'Nikhil Rane', skills: ['swimming', 'boat', 'Marathi'], vehicle: 'boat', location: { x: 446, y: 336 }, available: true, trust: 0.98, phoneMasked: '+91 98694*****' },
  { id: 'vol_23', name: 'Sunita Wagh', skills: ['first-aid', 'Marathi', 'Hindi'], vehicle: 'bike', location: { x: 488, y: 386 }, available: true, trust: 0.94, phoneMasked: '+91 98199*****' },
  { id: 'vol_24', name: 'Aditya Mehta', skills: ['driving', 'Hindi'], vehicle: 'car', location: { x: 326, y: 136 }, available: true, trust: 0.86, phoneMasked: '+91 99205*****' },
  { id: 'vol_25', name: 'Kiran Gurav', skills: ['swimming', 'first-aid', 'Marathi'], vehicle: 'none', location: { x: 516, y: 466 }, available: true, trust: 0.95, phoneMasked: '+91 97025*****' },
  { id: 'vol_26', name: 'Harshada Tawde', skills: ['first-aid', 'Marathi', 'Hindi'], vehicle: 'bike', location: { x: 418, y: 434 }, available: true, trust: 0.93, phoneMasked: '+91 98212*****' },
  { id: 'vol_27', name: 'Imran Qureshi', skills: ['driving', 'swimming', 'Hindi'], vehicle: 'car', location: { x: 480, y: 376 }, available: true, trust: 0.88, phoneMasked: '+91 98928*****' },
  { id: 'vol_28', name: 'Trupti Mahajan', skills: ['boat', 'swimming', 'Marathi'], vehicle: 'boat', location: { x: 456, y: 346 }, available: true, trust: 0.97, phoneMasked: '+91 98338*****' },
  { id: 'vol_29', name: 'Siddharth Mhatre', skills: ['swimming', 'driving', 'Marathi', 'Hindi'], vehicle: 'bike', location: { x: 346, y: 266 }, available: true, trust: 0.92, phoneMasked: '+91 98209*****' },
  { id: 'vol_30', name: 'Pankaj Vartak', skills: ['first-aid', 'driving', 'Marathi'], vehicle: 'car', location: { x: 320, y: 128 }, available: true, trust: 0.90, phoneMasked: '+91 98192*****' },
  { id: 'vol_31', name: 'Neelam Solanki', skills: ['first-aid', 'Hindi'], vehicle: 'none', location: { x: 526, y: 476 }, available: true, trust: 0.87, phoneMasked: '+91 99674*****' },
  { id: 'vol_32', name: 'Dattatray Parab', skills: ['boat', 'swimming', 'Marathi'], vehicle: 'boat', location: { x: 444, y: 334 }, available: true, trust: 0.99, phoneMasked: '+91 98698*****' },
  { id: 'vol_33', name: 'Ankita Pednekar', skills: ['swimming', 'first-aid', 'Marathi', 'Hindi'], vehicle: 'bike', location: { x: 426, y: 446 }, available: true, trust: 0.96, phoneMasked: '+91 97028*****' },
  { id: 'vol_34', name: 'Mahesh Bhoir', skills: ['driving', 'Marathi'], vehicle: 'car', location: { x: 490, y: 388 }, available: true, trust: 0.91, phoneMasked: '+91 98218*****' },
  { id: 'vol_35', name: 'Geeta Chavan', skills: ['first-aid', 'Marathi', 'Hindi'], vehicle: 'none', location: { x: 336, y: 254 }, available: true, trust: 0.94, phoneMasked: '+91 98929*****' },
  { id: 'vol_36', name: 'Sameer Dalvi', skills: ['swimming', 'bike', 'Marathi'], vehicle: 'bike', location: { x: 514, y: 464 }, available: true, trust: 0.93, phoneMasked: '+91 98339*****' },
  { id: 'vol_37', name: 'Lata Kulkarni', skills: ['first-aid', 'Hindi', 'Marathi'], vehicle: 'none', location: { x: 416, y: 432 }, available: true, trust: 0.95, phoneMasked: '+91 98200*****' },
  { id: 'vol_38', name: 'Chetan Bhagat-Gharat', skills: ['driving', 'swimming', 'Marathi'], vehicle: 'car', location: { x: 328, y: 138 }, available: true, trust: 0.89, phoneMasked: '+91 98195*****' },
  { id: 'vol_39', name: 'Yogesh Ghag', skills: ['boat', 'swimming', 'Marathi'], vehicle: 'boat', location: { x: 458, y: 348 }, available: true, trust: 0.98, phoneMasked: '+91 97699*****' },
  { id: 'vol_40', name: 'Rupali Sutar', skills: ['first-aid', 'swimming', 'Marathi', 'Hindi'], vehicle: 'bike', location: { x: 476, y: 374 }, available: true, trust: 0.94, phoneMasked: '+91 99309*****' },
];

// 12 Resource Stocks Across 3 Depots
export const SEED_RESOURCES: Resource[] = [
  // Depot 1: Kurla Emergency Staging Depot
  { id: 'res_kurl_boat', type: 'inflatable_boat', quantity: 8, depotArea: 'Kurla Emergency Staging Depot', allocatedQty: 2 },
  { id: 'res_kurl_vest', type: 'life_vests', quantity: 120, depotArea: 'Kurla Emergency Staging Depot', allocatedQty: 25 },
  { id: 'res_kurl_food', type: 'food_rations', quantity: 850, depotArea: 'Kurla Emergency Staging Depot', allocatedQty: 100 },
  { id: 'res_kurl_siren', type: 'megaphones_sirens', quantity: 18, depotArea: 'Kurla Emergency Staging Depot', allocatedQty: 4 },

  // Depot 2: Bandra Central Depot
  { id: 'res_band_water', type: 'potable_water_canisters', quantity: 500, depotArea: 'Bandra Central Depot', allocatedQty: 60 },
  { id: 'res_band_med', type: 'medical_trauma_kit', quantity: 45, depotArea: 'Bandra Central Depot', allocatedQty: 8 },
  { id: 'res_band_cool', type: 'cooling_misting_fan', quantity: 15, depotArea: 'Bandra Central Depot', allocatedQty: 2 },
  { id: 'res_band_stret', type: 'evac_stretchers', quantity: 30, depotArea: 'Bandra Central Depot', allocatedQty: 6 },

  // Depot 3: Andheri Municipal Yard
  { id: 'res_andh_pump', type: 'dewatering_pump', quantity: 6, depotArea: 'Andheri Municipal Yard', allocatedQty: 1 },
  { id: 'res_andh_winch', type: 'heavy_tow_winch', quantity: 24, depotArea: 'Andheri Municipal Yard', allocatedQty: 3 },
  { id: 'res_andh_purif', type: 'water_purification_tabs', quantity: 300, depotArea: 'Andheri Municipal Yard', allocatedQty: 40 },
  { id: 'res_andh_tarp', type: 'tarpaulins_blankets', quantity: 400, depotArea: 'Andheri Municipal Yard', allocatedQty: 50 },
];

// 1 Mock Official Alert Feed with 5 Timed Alerts
export const SEED_OFFICIAL_ALERTS: OfficialAlert[] = [
  {
    id: 'alert_imd_01',
    ts: Date.now() - 1000 * 60 * 45,
    source: 'IMD Mumbai Radar Weather Bureau',
    agency: 'IMD',
    headline: 'RED ALERT: Extreme Precipitation Warning',
    text: 'Cloudburst band stationary over central Mumbai. Rainfall exceeding 72mm/hr recorded at Santacruz and Kurla radar stations.',
    urgency: 'critical',
    area: 'kurla',
    claimType: 'flood',
    isExtremeConfirmed: true,
  },
  {
    id: 'alert_bmc_02',
    ts: Date.now() - 1000 * 60 * 35,
    source: 'MCGM Stormwater Management Cell',
    agency: 'BMC',
    headline: 'Coastal High Tide Warning (+4.68m at 15:42 IST)',
    text: 'Tidal surge will coincide with heavy catchment runoff. Sluice gates along Mahim Creek and Love Grove to be shut to prevent backflow.',
    urgency: 'critical',
    area: 'mithi_river_belt',
    claimType: 'flood',
    isExtremeConfirmed: true,
  },
  {
    id: 'alert_sensor_03',
    ts: Date.now() - 1000 * 60 * 25,
    source: 'IoT Telemetry: Mithi River Stage Station #4',
    agency: 'IOT',
    headline: 'River Danger Level Exceeded: Stage 3.82m',
    text: 'Ultrasonic gauge confirms water stage 62cm above 3.2m danger mark at Kranti Nagar railway bridge culvert.',
    urgency: 'critical',
    area: 'kurla',
    claimType: 'flood',
    isExtremeConfirmed: true,
  },
  {
    id: 'alert_traffic_04',
    ts: Date.now() - 1000 * 60 * 15,
    source: 'Mumbai Joint Traffic Police Control Room',
    agency: 'TRAFFIC',
    headline: 'Subway Closures & Arterial Diversions',
    text: 'Milan Subway and Andheri Subway submerged up to 80cm. Traffic diverted to Western Express Flyover.',
    urgency: 'high',
    area: 'andheri_east',
    claimType: 'flood',
  },
  {
    id: 'alert_ndrf_05',
    ts: Date.now() - 1000 * 60 * 5,
    source: 'NDRF 5th Battalion Liaison Desk',
    agency: 'NDRF',
    headline: 'Rescue Boats Positioned at Staging Bases',
    text: '4 motorized flood rescue inflatable boats stationed at Kurla and Sion civic depots with emergency medical corps.',
    urgency: 'high',
    area: 'sion',
  },
];

// Queue of realistic official alerts released on demand by operator
export const UPCOMING_OFFICIAL_ALERTS: OfficialAlert[] = [
  {
    id: 'alert_bmc_dam_06',
    ts: Date.now(),
    source: 'BMC Hydraulic Engineer & Dam Safety Cell',
    agency: 'BMC',
    headline: 'FACT CHECK: Powai Lake Dam Intact & Operating Normally',
    text: 'Hydrological inspection confirms Powai lake masonry weir and spillway gates operating normally. Water depth is 2.1m below crest. NO structural breach or dam burst has occurred. Disregard viral panic messages.',
    urgency: 'high',
    area: 'andheri_east',
    claimType: 'dam breach',
    contradictsClaims: ['dam burst', 'dam has burst', 'dam breach', 'powai dam', 'saki naka submerged'],
    isExtremeConfirmed: false,
  },
  {
    id: 'alert_imd_nowcast_07',
    ts: Date.now(),
    source: 'IMD Colaba Doppler Radar Directorate',
    agency: 'IMD',
    headline: 'FLASH NOWCAST: Severe Convective Cell over Kurla-Sion',
    text: 'Doppler radar indicates intense convective cloud top exceeding 14km. Torrential rain rate exceeding 95mm/hr projected over Sion, Kurla, and Chembur for the next 45 minutes.',
    urgency: 'critical',
    area: 'sion',
    claimType: 'flood',
    isExtremeConfirmed: true,
  },
  {
    id: 'alert_ndrf_boats_08',
    ts: Date.now(),
    source: 'NDRF Quick Response Team Delta',
    agency: 'NDRF',
    headline: '3 Inflatable Zodiac Rescue Boats Dispatched to Kranti Nagar',
    text: 'Tactical inflatable boats equipped with 40HP outboards en route to Kranti Nagar and Bail Bazaar corridors with emergency trauma medics.',
    urgency: 'high',
    area: 'kurla',
  },
  {
    id: 'alert_bmc_health_09',
    ts: Date.now(),
    source: 'MCGM Public Health & Epidemic Cell',
    agency: 'BMC',
    headline: 'Potable Water Advisory: Chembur-Govandi Transit Camps',
    text: 'Chlorination distribution active at ward health posts. Citizens advised to boil tap water and utilize municipal water tankers stationed at Shivaji Nagar.',
    urgency: 'medium',
    area: 'chembur',
  },
  {
    id: 'alert_traffic_we_10',
    ts: Date.now(),
    source: 'Mumbai Joint Traffic Police Control Room',
    agency: 'TRAFFIC',
    headline: 'Western Express Highway Clear; Subways Closed',
    text: 'Vehicular traffic restored on elevated Western Express Highway flyovers. Milan Subway and Andheri Subway remain closed under 80cm floodwater.',
    urgency: 'info',
    area: 'andheri_east',
  },
];

// Initial Reports
export const SEED_REPORTS: Report[] = [
  {
    id: 'rep_001',
    ts: Date.now() - 1000 * 60 * 28,
    area: 'kurla',
    text: 'Water entered 1st floor chawls near Kranti Nagar nullah. 45 elders and infants stranded on asbestos roof, water rising rapidly!',
    language: 'en',
    source: 'citizen',
    reporterId: 'citizen_98201',
    location: { x: 480, y: 380 },
    peopleAtRisk: 45,
    flags: ['waterlogging', 'evac_needed', 'vulnerable_elders'],
    credibility: 0.94,
    mergedInto: 'inc_001',
  },
  {
    id: 'rep_002',
    ts: Date.now() - 1000 * 60 * 22,
    area: 'kurla',
    text: 'क्रांती नगरमध्ये पाणी वेगाने वाढत आहे, घरांच्या छतावर नागरिक अडकले आहेत. तातडीने बोटींची गरज आहे.',
    language: 'mr',
    source: 'citizen',
    reporterId: 'citizen_97690',
    location: { x: 482, y: 382 },
    peopleAtRisk: 20,
    flags: ['waterlogging', 'boat_needed'],
    credibility: 0.91,
    mergedInto: 'inc_001',
  },
  {
    id: 'rep_003',
    ts: Date.now() - 1000 * 60 * 18,
    area: 'sion',
    text: 'Dharavi Kumbharwada pottery kiln lanes completely flooded under 60cm dirty water, high humidity causing heat exhaustion.',
    language: 'en',
    source: 'volunteer',
    reporterId: 'vol_02',
    location: { x: 420, y: 440 },
    peopleAtRisk: 65,
    flags: ['compound_heat_flood', 'potable_water_needed'],
    credibility: 0.96,
    mergedInto: 'inc_002',
  },
  {
    id: 'rep_004',
    ts: Date.now() - 1000 * 60 * 14,
    area: 'andheri_east',
    text: 'Milan subway submerged over 80cm. 2 cars trapped inside underpass, police barricades in place.',
    language: 'en',
    source: 'official',
    reporterId: 'traffic_warden_14',
    location: { x: 340, y: 260 },
    peopleAtRisk: 4,
    flags: ['subway_submerged', 'pump_needed'],
    credibility: 0.98,
    mergedInto: 'inc_003',
  },
  {
    id: 'rep_005',
    ts: Date.now() - 1000 * 60 * 9,
    area: 'chembur',
    text: 'गोवंडी शिवाजी नगर ट्रान्झिट कॅम्पमध्ये पिण्याच्या पाण्याची तीव्र टंचाई आणि जलजन्य आजारांचा धोका.',
    language: 'mr',
    source: 'volunteer',
    reporterId: 'vol_06',
    location: { x: 520, y: 470 },
    peopleAtRisk: 80,
    flags: ['water_tanker_needed', 'medical_aid'],
    credibility: 0.93,
    mergedInto: 'inc_004',
  },
  {
    id: 'rep_006',
    ts: Date.now() - 1000 * 60 * 5,
    area: 'dahisar',
    text: 'Dahisar river spillway overflowing onto lowline pedestrian footbridges near station.',
    language: 'en',
    source: 'citizen',
    reporterId: 'citizen_99201',
    location: { x: 320, y: 130 },
    peopleAtRisk: 12,
    flags: ['spillway_surge'],
    credibility: 0.82,
    mergedInto: 'inc_005',
  },
];

// Initial Incidents
export const SEED_INCIDENTS: Incident[] = [
  {
    id: 'inc_001',
    area: 'kurla',
    summary: 'Mithi River Overtopping & Kranti Nagar Rooftop Evacuation',
    priority: 92,
    severity: 'critical',
    needs: ['boat', 'medical', 'food'],
    reportIds: ['rep_001', 'rep_002'],
    status: 'open',
    location: { x: 480, y: 380 },
    createdAt: Date.now() - 1000 * 60 * 30,
    updatedAt: Date.now() - 1000 * 60 * 10,
  },
  {
    id: 'inc_002',
    area: 'sion',
    summary: 'Dharavi Kumbharwada Waterlogging & Dangerous Wet-Bulb Surge',
    priority: 95,
    severity: 'critical',
    needs: ['medical', 'water', 'boat'],
    reportIds: ['rep_003'],
    status: 'open',
    location: { x: 420, y: 440 },
    createdAt: Date.now() - 1000 * 60 * 25,
    updatedAt: Date.now() - 1000 * 60 * 8,
  },
  {
    id: 'inc_003',
    area: 'andheri_east',
    summary: 'Milan Subway Submersion & Vehicular Entrapment',
    priority: 64,
    severity: 'medium',
    needs: ['pump', 'medical'],
    reportIds: ['rep_004'],
    status: 'open',
    location: { x: 340, y: 260 },
    createdAt: Date.now() - 1000 * 60 * 20,
    updatedAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: 'inc_004',
    area: 'chembur',
    summary: 'Govandi Shivaji Nagar Potable Water Depletion & Dehydration',
    priority: 74,
    severity: 'high',
    needs: ['water', 'medical', 'food'],
    reportIds: ['rep_005'],
    status: 'open',
    location: { x: 520, y: 470 },
    createdAt: Date.now() - 1000 * 60 * 15,
    updatedAt: Date.now() - 1000 * 60 * 4,
  },
  {
    id: 'inc_005',
    area: 'dahisar',
    summary: 'Dahisar River Spillway Footbridge Overflow',
    priority: 48,
    severity: 'low',
    needs: ['food', 'water'],
    reportIds: ['rep_006'],
    status: 'open',
    location: { x: 320, y: 130 },
    createdAt: Date.now() - 1000 * 60 * 10,
    updatedAt: Date.now() - 1000 * 60 * 2,
  },
];

// Initial Candidate Plans in Superposition
export const SEED_PLANS = [
  {
    id: 'plan_alpha',
    name: 'Plan Alpha: Rapid Life-Safety Sweep',
    strategy: 'Rapid Life-Safety Sweep',
    assignments: [
      { volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 1 },
      { volunteerId: 'vol_05', incidentId: 'inc_001', resourceId: 'res_kurl_vest', qty: 15 },
      { volunteerId: 'vol_02', incidentId: 'inc_002', resourceId: 'res_band_med', qty: 2 },
      { volunteerId: 'vol_10', incidentId: 'inc_002', resourceId: 'res_band_water', qty: 30 },
      { volunteerId: 'vol_03', incidentId: 'inc_003', resourceId: 'res_andh_pump', qty: 1 },
    ],
    coverage: 92,
    etaMinutes: 18.5,
    riskScore: 24,
    probability: 0.45,
    simResult: {
      trials: 500,
      successRate: 94.2,
      p10ETA: 12.0,
      p50ETA: 18.5,
      p90ETA: 28.0,
      livesSafeguarded: 340,
    },
    status: 'candidate' as const,
    explanation: 'Deploys nearest motorized boats and medical first-responders to Kranti Nagar and Kumbharwada before high-tide road severance.',
    createdAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: 'plan_beta',
    name: 'Plan Beta: Balanced Resilience Reserve',
    strategy: 'Balanced Resilience Reserve',
    assignments: [
      { volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 1 },
      { volunteerId: 'vol_02', incidentId: 'inc_002', resourceId: 'res_band_med', qty: 1 },
      { volunteerId: 'vol_03', incidentId: 'inc_003', resourceId: 'res_andh_pump', qty: 1 },
    ],
    coverage: 76,
    etaMinutes: 22.0,
    riskScore: 35,
    probability: 0.35,
    simResult: {
      trials: 500,
      successRate: 88.5,
      p10ETA: 14.0,
      p50ETA: 22.0,
      p90ETA: 34.0,
      livesSafeguarded: 280,
    },
    status: 'candidate' as const,
    explanation: 'Holds 30% of volunteer fleet in reserve at Bandra Depot to absorb high-tide surge at 15:42 IST while clearing subways.',
    createdAt: Date.now() - 1000 * 60 * 11,
  },
  {
    id: 'plan_gamma',
    name: 'Plan Gamma: High-Density Vulnerability Priority',
    strategy: 'High-Density Vulnerability Priority',
    assignments: [
      { volunteerId: 'vol_02', incidentId: 'inc_002', resourceId: 'res_band_med', qty: 3 },
      { volunteerId: 'vol_08', incidentId: 'inc_002', resourceId: 'res_band_water', qty: 50 },
      { volunteerId: 'vol_01', incidentId: 'inc_001', resourceId: 'res_kurl_boat', qty: 2 },
      { volunteerId: 'vol_06', incidentId: 'inc_004', resourceId: 'res_kurl_food', qty: 100 },
    ],
    coverage: 84,
    etaMinutes: 26.5,
    riskScore: 42,
    probability: 0.20,
    simResult: {
      trials: 500,
      successRate: 82.0,
      p10ETA: 18.0,
      p50ETA: 26.5,
      p90ETA: 39.0,
      livesSafeguarded: 390,
    },
    status: 'candidate' as const,
    explanation: 'Concentrates maximum volunteer mass into Asia’s densest informal settlements (Dharavi and Govandi) to mitigate compound wet-bulb shock.',
    createdAt: Date.now() - 1000 * 60 * 10,
  },
];

/**
 * Builds the canonical sequence of genesis events that initialize the WorldState.
 * Every piece of data in the system originates as an Event.
 */
export function buildGenesisEvents(): Event[] {
  let v = 1;
  const events: Event[] = [];

  // 1. Initialize Areas
  events.push({
    id: `evt_genesis_areas_${v}`,
    ts: Date.now() - 1000 * 60 * 60,
    actor: 'system',
    type: 'AREAS_INITIALIZED',
    payload: { areas: SEED_AREAS },
    reason: 'Schematic geographic grid and hazard vulnerability baseline loaded for Mumbai',
    version: v++,
  });

  // 2. Register Resources
  SEED_RESOURCES.forEach(res => {
    events.push({
      id: `evt_genesis_res_${res.id}_${v}`,
      ts: Date.now() - 1000 * 60 * 55,
      actor: 'system',
      type: 'RESOURCE_STOCKED',
      payload: res,
      reason: `Stocked ${res.quantity}x ${res.type} at ${res.depotArea}`,
      version: v++,
    });
  });

  // 3. Register Volunteers
  SEED_VOLUNTEERS.forEach(vol => {
    events.push({
      id: `evt_genesis_vol_${vol.id}_${v}`,
      ts: Date.now() - 1000 * 60 * 50,
      actor: 'system',
      type: 'VOLUNTEER_REGISTERED',
      payload: vol,
      reason: `Registered civil defence responder ${vol.name} with ${vol.skills.join(', ')}`,
      version: v++,
    });
  });

  // 4. Ingest reports with the same deterministic scoring used for live reports
  const volunteerTrustMap = Object.fromEntries(SEED_VOLUNTEERS.map(volunteer => [volunteer.id, volunteer.trust]));
  const scoredSeedReports = SEED_REPORTS.map(report => {
    const result = computeCredibility(report, SEED_REPORTS, SEED_OFFICIAL_ALERTS, volunteerTrustMap);
    return {
      ...report,
      credibility: result.score,
      credibilityScore: result.score,
      credibilityReasons: result.reasons,
      isUnverified: result.isUnverified,
    };
  });

  scoredSeedReports.forEach(rep => {
    events.push({
      id: `evt_genesis_rep_${rep.id}_${v}`,
      ts: rep.ts,
      actor: rep.source === 'citizen' ? 'citizen' : `agent:${rep.source}`,
      type: 'REPORT_INGESTED',
      payload: rep,
      reason: `Ingested distress alert from ${rep.area.toUpperCase()} (${rep.language})`,
      version: v++,
    });
  });

  // 5. Create Incidents
  SEED_INCIDENTS.forEach(inc => {
    events.push({
      id: `evt_genesis_inc_${inc.id}_${v}`,
      ts: inc.createdAt || Date.now(),
      actor: 'agent:triage',
      type: 'INCIDENT_CREATED',
      payload: inc,
      reason: `Triaged and created operational incident #${inc.id} (Priority: ${inc.priority}/100)`,
      version: v++,
    });
  });

  // 6. Generate Candidate Plans in Superposition
  SEED_PLANS.forEach(plan => {
    events.push({
      id: `evt_genesis_plan_${plan.id}_${v}`,
      ts: plan.createdAt || Date.now(),
      actor: 'agent:dispatch',
      type: 'PLAN_SUPERPOSITION_GENERATED',
      payload: plan,
      reason: `Formulated superposition candidate ${plan.name} with ${(plan.probability * 100).toFixed(0)}% weight`,
      version: v++,
    });
  });

  // 7. Initialize Official Alert Feed & Telemetry
  events.push({
    id: `evt_genesis_alerts_${v}`,
    ts: Date.now() - 1000 * 60 * 5,
    actor: 'official',
    type: 'OFFICIAL_ALERTS_INITIALIZED',
    payload: {
      alerts: SEED_OFFICIAL_ALERTS,
      pendingQueue: UPCOMING_OFFICIAL_ALERTS,
    },
    reason: 'Initialized official IMD/BMC telemetry and radar warning stream (5 live advisories)',
    version: v++,
  });

  return events;
}
