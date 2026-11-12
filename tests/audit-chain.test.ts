import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIT_GENESIS_HASH, canonicalJSON, hashEvent, verifyAuditChain } from '../src/state/auditChain.ts';
import { useWorldStore } from '../src/state/store.ts';
import type { Event } from '../src/state/types.ts';

test('canonical JSON is key-order independent and the hash chain detects an edited event', async () => {
  assert.equal(canonicalJSON({ b: 2, a: { y: 1, x: 0 } }), canonicalJSON({ a: { x: 0, y: 1 }, b: 2 }));
  const source: Event[] = [
    { id: 'evt-1', ts: 1, actor: 'system', type: 'A', payload: { z: 2, a: 1 }, reason: 'first', version: 1 },
    { id: 'evt-2', ts: 2, actor: 'human', type: 'B', payload: {}, reason: 'second', version: 2 },
  ];
  let prevHash = AUDIT_GENESIS_HASH;
  const chained: Event[] = [];
  for (const event of source) {
    const unsigned = { ...event, prevHash };
    const hash = await hashEvent(unsigned, prevHash);
    chained.push({ ...unsigned, hash });
    prevHash = hash;
  }

  assert.deepEqual(await verifyAuditChain(chained), {
    valid: true,
    firstBrokenIndex: null,
    verifiedCount: 2,
  });
  const edited = chained.map(event => ({ ...event }));
  edited[1].reason = 'edited after sealing';
  const result = await verifyAuditChain(edited);
  assert.equal(result.valid, false);
  assert.equal(result.firstBrokenIndex, 1);
});

test('store seals events and the tamper demo fails verification at the edited index', async () => {
  useWorldStore.getState().resetToInitialDemo();
  await useWorldStore.getState().ensureAuditChain();
  const before = await useWorldStore.getState().verifyAuditChain();
  assert.equal(before.valid, true);

  const tamperedIndex = useWorldStore.getState().tamperOldEventForDemo();
  assert.notEqual(tamperedIndex, null);
  const after = await useWorldStore.getState().verifyAuditChain();
  assert.equal(after.valid, false);
  assert.equal(after.firstBrokenIndex, tamperedIndex);
});

test('verification reports Web Crypto unavailability without treating it as a valid chain', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    await assert.rejects(verifyAuditChain([]), /Verification unavailable: Web Crypto/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});
