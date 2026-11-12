import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithTimeout } from '../src/services/fetchWithTimeout.ts';

test('network requests use AbortController and reject with a clear timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  try {
    await assert.rejects(fetchWithTimeout('https://example.invalid/', {}, 10), /timed out after 10 ms/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
