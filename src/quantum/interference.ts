/**
 * This is a transparent ranking heuristic in ordinary arithmetic, not a
 * calibrated probability, and it must not replace the deterministic credibility score.
 */
import type { Report } from '../state/types.ts';

export type InterferenceVerdict = 'constructive' | 'destructive' | 'neutral' | 'no-evidence';

export interface InterferenceTerm {
  groupId: string;
  reportIds: string[];
  amplitude: number;
  phase: number;
  re: number;
  im: number;
  supporting: boolean;
  freshness: number;
}

export interface InterferencePathPoint {
  x: number;
  y: number;
  groupId?: string;
}

export interface InterferenceResult {
  terms: InterferenceTerm[];
  re: number;
  im: number;
  resultant: { re: number; im: number };
  intensity: number;
  incoherentSum: number;
  visibility: number;
  credibility: number;
  verdict: InterferenceVerdict;
  path: InterferencePathPoint[];
}

interface ReportAmplitude {
  report: Report;
  amplitude: number;
  freshness: number;
}

export function reportHalfLifeMinutes(report: Report): number {
  const text = `${report.text} ${report.flags?.join(' ') || ''}`;
  return /collapse|building|structure/i.test(text) ? 90 : 30;
}

export function reportFreshness(report: Report, now = Date.now()): number {
  const ageMinutes = Math.max(0, (now - report.ts) / 60000);
  return Math.exp(-ageMinutes / reportHalfLifeMinutes(report));
}

export function interfere(reports: Report[]): InterferenceResult {
  const grouped = new Map<string, ReportAmplitude[]>();
  for (const report of reports) {
    const groupId = report.reporterId || report.id;
    const baseCredibility = Math.min(
      1,
      Math.max(0.01, report.credibility ?? report.credibilityScore ?? 0.5)
    );
    const freshness = reportFreshness(report);
    const amplitude = Math.sqrt(baseCredibility) * freshness * (report.source === 'official' ? 1.4 : 1);
    const group = grouped.get(groupId) || [];
    group.push({ report, amplitude, freshness });
    grouped.set(groupId, group);
  }

  const terms: InterferenceTerm[] = [];
  for (const [groupId, group] of grouped) {
    const strongest = Math.max(...group.map(item => item.amplitude));
    const otherAmplitude = group.reduce((sum, item) => sum + item.amplitude, 0) - strongest;
    const amplitude = strongest + 0.15 * otherAmplitude;
    const freshness = group.reduce((sum, item) => sum + item.freshness, 0) / group.length;
    const contradicted = group.some(({ report }) =>
      report.credibilityReasons?.some(reason => /contradicted by/i.test(reason))
    );
    const phase = contradicted ? Math.PI : 0;
    terms.push({
      groupId,
      reportIds: group.map(({ report }) => report.id),
      amplitude,
      phase,
      re: amplitude * Math.cos(phase),
      im: amplitude * Math.sin(phase),
      supporting: !contradicted,
      freshness,
    });
  }

  terms.sort((a, b) => Number(b.supporting) - Number(a.supporting) || b.amplitude - a.amplitude);
  const re = terms.reduce((sum, term) => sum + term.re, 0);
  const im = terms.reduce((sum, term) => sum + term.im, 0);
  const intensity = re * re + im * im;
  const incoherentSum = terms.reduce((sum, term) => sum + term.amplitude * term.amplitude, 0);
  const visibility = incoherentSum === 0 ? 1 : intensity / incoherentSum;
  const credibility = 1 - Math.exp(-1.2 * intensity);
  const verdict: InterferenceVerdict = terms.length === 0
    ? 'no-evidence'
    : visibility > 1.15
    ? 'constructive'
    : visibility < 0.85
    ? 'destructive'
    : 'neutral';

  const path: InterferencePathPoint[] = [{ x: 0, y: 0 }];
  let pathRe = 0;
  let pathIm = 0;
  for (const term of terms) {
    pathRe += term.re;
    pathIm += term.im;
    path.push({ x: pathRe, y: pathIm, groupId: term.groupId });
  }

  return {
    terms,
    re,
    im,
    resultant: { re, im },
    intensity,
    incoherentSum,
    visibility,
    credibility,
    verdict,
    path,
  };
}
