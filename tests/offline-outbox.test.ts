import assert from 'node:assert/strict';
import test from 'node:test';
import { fitsSingleSms, persistApprovedMockMessages, smsCharacterCount } from '../src/services/mockOutbox.ts';

test('mock SMS length check uses a 160-character single-message limit', () => {
  assert.equal(smsCharacterCount('a'.repeat(160)), 160);
  assert.equal(fitsSingleSms('a'.repeat(160)), true);
  assert.equal(fitsSingleSms('a'.repeat(161)), false);
  assert.equal(fitsSingleSms('नमस्ते'), true);
});

test('approved mock messages fall back to memory when IndexedDB is unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open: () => { throw new Error('storage blocked'); } },
  });
  try {
    assert.equal(await persistApprovedMockMessages([]), 'memory');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
