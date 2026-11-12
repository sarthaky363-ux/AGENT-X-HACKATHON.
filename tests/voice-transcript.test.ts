import assert from 'node:assert/strict';
import test from 'node:test';
import { detectTranscriptLanguage, fallbackTranscriptConfidence } from '../src/services/voiceTranscript.ts';

test('voice transcript language detection handles Hindi, Marathi and English scripts', () => {
  assert.equal(detectTranscriptLanguage('मदद चाहिए'), 'hi');
  assert.equal(detectTranscriptLanguage('मला मदत हवी आहे'), 'mr');
  assert.equal(detectTranscriptLanguage('Need help near the bridge'), 'en');
});

test('fallback transcription confidence stays bounded and low-confidence text requires review', () => {
  assert.ok(fallbackTranscriptConfidence('help') < 0.65);
  assert.ok(fallbackTranscriptConfidence('many words '.repeat(30)) < 0.65);
});
