import assert from 'node:assert/strict';
import test from 'node:test';
import { useWorldStore } from '../src/state/store.ts';
import { Event } from '../src/state/types.ts';
import { translate_to_english } from '../src/tools/triageTools.ts';

test('citizen report ingestion preserves a voice transcript and its selected language', () => {
  useWorldStore.getState().resetToInitialDemo();
  const transcript = 'मिठी नदीजवळ पाणी वाढत आहे';
  let reportAdded: Event | undefined;
  const unsubscribe = useWorldStore.getState().subscribeToEvents(event => {
    if (event.type === 'REPORT_ADDED') {
      reportAdded = event;
    }
  });

  useWorldStore.getState().addCitizenReport({
    text: transcript,
    language: 'mr',
    source: 'citizen',
  });
  unsubscribe();

  assert.ok(reportAdded);
  assert.equal(reportAdded.actor, 'citizen');
  assert.equal(reportAdded.type, 'REPORT_ADDED');
  assert.equal(reportAdded.payload.text, transcript);
  assert.equal(reportAdded.payload.language, 'mr');
  assert.equal(reportAdded.payload.source, 'citizen');
  assert.equal(useWorldStore.getState().reports[reportAdded.payload.id]?.text, transcript);
});

test('English translation updates keep the original report text through event replay', () => {
  useWorldStore.getState().resetToInitialDemo();
  const transcript = 'सायनमध्ये पाणी कमरेपर्यंत आले आहे';
  useWorldStore.getState().addCitizenReport({
    text: transcript,
    language: 'hi',
    source: 'citizen',
  });
  const report = Object.values(useWorldStore.getState().reports).find(item => item.text === transcript);
  assert.ok(report);
  assert.equal(report.translationStatus, 'pending');

  useWorldStore.getState().dispatchEvent({
    actor: 'triage',
    type: 'REPORT_TRANSLATION_UPDATED',
    payload: { reportId: report.id, englishTranslation: 'Water has reached waist height in Sion.' },
    reason: 'English translation saved for report display',
  });

  const translatedReport = useWorldStore.getState().reports[report.id];
  assert.equal(translatedReport.text, transcript);
  assert.equal(translatedReport.englishTranslation, 'Water has reached waist height in Sion.');
  assert.equal(translatedReport.translationStatus, 'available');

  useWorldStore.getState().replayFromZero();
  const replayedReport = useWorldStore.getState().reports[report.id];
  assert.equal(replayedReport.text, transcript);
  assert.equal(replayedReport.englishTranslation, 'Water has reached waist height in Sion.');
});

test('translation failures are shown as unavailable instead of fabricated English', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    assert.equal(await translate_to_english('अनोखा आपत्कालीन संदेश'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
