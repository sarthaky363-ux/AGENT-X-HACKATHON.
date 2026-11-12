/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Mumbai Ward Topologies & Schematic Geo-Grid
 * Provides offline-reliable SVG paths, geographic coordinates, and vulnerability baselines.
 */

export interface MumbaiWard {
  id: string;
  code: string;
  name: string;
  region: 'Island City' | 'Western Suburbs' | 'Eastern Suburbs';
  vulnerabilityIndex: number; // 0.0 - 1.0 based on density, elevation, slum ratio
  elevationMeters: number;
  populationDensityPerSqKm: number;
  waterloggingHotspots: string[];
  heatIslandSeverity: 'extreme' | 'high' | 'moderate';
  svgCenter: { x: number; y: number }; // Schematic coordinates (0 - 800)
  svgPolygon: string; // SVG polygon points
}

export const MUMBAI_WARDS: Record<string, MumbaiWard> = {
  colaba: {
    id: 'colaba',
    code: 'A',
    name: 'Colaba & Fort',
    region: 'Island City',
    vulnerabilityIndex: 0.52,
    elevationMeters: 4.2,
    populationDensityPerSqKm: 28000,
    waterloggingHotspots: ['Cuffe Parade Coastal Road', 'GPO Fort Underpass'],
    heatIslandSeverity: 'moderate',
    svgCenter: { x: 380, y: 720 },
    svgPolygon: '340,660 410,660 430,760 360,780 330,720',
  },
  dadar: {
    id: 'dadar',
    code: 'G/North',
    name: 'Dadar & Hindmata',
    region: 'Island City',
    vulnerabilityIndex: 0.78,
    elevationMeters: 2.1,
    populationDensityPerSqKm: 54000,
    waterloggingHotspots: ['Hindmata Flyover Underbelly', 'Dadar TT Junction'],
    heatIslandSeverity: 'high',
    svgCenter: { x: 390, y: 550 },
    svgPolygon: '330,500 440,500 450,600 340,600',
  },
  dharavi: {
    id: 'dharavi',
    code: 'G/N-Ext',
    name: 'Dharavi & Sion',
    region: 'Island City',
    vulnerabilityIndex: 0.94,
    elevationMeters: 1.8,
    populationDensityPerSqKm: 82000,
    waterloggingHotspots: ['Kumbharwada Lowlands', 'Sion Station Nullah', '90-Feet Road'],
    heatIslandSeverity: 'extreme',
    svgCenter: { x: 420, y: 440 },
    svgPolygon: '360,400 470,400 480,480 370,480',
  },
  kurla: {
    id: 'kurla',
    code: 'L',
    name: 'Kurla & Mithi Basin',
    region: 'Eastern Suburbs',
    vulnerabilityIndex: 0.91,
    elevationMeters: 2.4,
    populationDensityPerSqKm: 68000,
    waterloggingHotspots: ['Kranti Nagar Mithi River Bank', 'Bail Bazar', 'LBS Road Bridge'],
    heatIslandSeverity: 'high',
    svgCenter: { x: 480, y: 380 },
    svgPolygon: '440,330 550,330 540,430 430,430',
  },
  bkc: {
    id: 'bkc',
    code: 'H/East',
    name: 'Bandra-Kurla Complex (BKC)',
    region: 'Western Suburbs',
    vulnerabilityIndex: 0.45,
    elevationMeters: 3.8,
    populationDensityPerSqKm: 19000,
    waterloggingHotspots: ['Kalanagar Junction', 'BKC Connector Ramps'],
    heatIslandSeverity: 'moderate',
    svgCenter: { x: 380, y: 370 },
    svgPolygon: '330,330 430,330 420,410 320,400',
  },
  andheri: {
    id: 'andheri',
    code: 'K/West & East',
    name: 'Andheri & Subways',
    region: 'Western Suburbs',
    vulnerabilityIndex: 0.82,
    elevationMeters: 3.1,
    populationDensityPerSqKm: 49000,
    waterloggingHotspots: ['Milan Subway Underpass', 'Andheri Subway', 'SV Road Junction'],
    heatIslandSeverity: 'high',
    svgCenter: { x: 340, y: 260 },
    svgPolygon: '280,210 400,210 390,310 270,300',
  },
  chembur: {
    id: 'chembur',
    code: 'M/West',
    name: 'Chembur & Govandi',
    region: 'Eastern Suburbs',
    vulnerabilityIndex: 0.74,
    elevationMeters: 3.5,
    populationDensityPerSqKm: 46000,
    waterloggingHotspots: ['Postal Colony', 'Shell Colony Lowline', 'Govandi Shivaji Nagar'],
    heatIslandSeverity: 'extreme',
    svgCenter: { x: 520, y: 470 },
    svgPolygon: '480,430 580,430 570,530 470,520',
  },
  borivali: {
    id: 'borivali',
    code: 'R/Central',
    name: 'Borivali & Dahisar',
    region: 'Western Suburbs',
    vulnerabilityIndex: 0.48,
    elevationMeters: 6.2,
    populationDensityPerSqKm: 32000,
    waterloggingHotspots: ['Dahisar River Spillway', 'SV Road Borivali Station'],
    heatIslandSeverity: 'moderate',
    svgCenter: { x: 320, y: 130 },
    svgPolygon: '260,80 380,80 370,180 250,170',
  },
};
