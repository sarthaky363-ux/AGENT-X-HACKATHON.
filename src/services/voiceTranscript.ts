import type { LanguageCode } from '../state/types.ts';

export function detectTranscriptLanguage(text: string): LanguageCode {
  const normalized = text.toLowerCase();
  if (!/[ऀ-ॿ]/u.test(normalized)) return 'en';
  return /आहे|नाही|मला|आम्ही|कृपया|पाणी/u.test(normalized) ? 'mr' : 'hi';
}

export function fallbackTranscriptConfidence(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(0.58, 0.25 + words * 0.035);
}
