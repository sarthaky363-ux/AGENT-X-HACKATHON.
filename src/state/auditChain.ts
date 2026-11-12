import type { Event } from './types.ts';

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

export interface AuditVerification {
  valid: boolean;
  firstBrokenIndex: number | null;
  verifiedCount: number;
}

function normalizeForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => [key, normalizeForJson(record[key])])
    );
  }
  return value;
}

export function canonicalJSON(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export async function hashEvent(event: Event, prevHash: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable; the audit event could not be sealed.');
  }
  const eventWithoutHash = Object.fromEntries(
    Object.entries(event).filter(([key]) => key !== 'hash')
  );
  const hashInput = {
    ...eventWithoutHash,
    prevHash,
  };
  const bytes = new TextEncoder().encode(`${prevHash}${canonicalJSON(hashInput)}`);
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAuditChain(events: Event[]): Promise<AuditVerification> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Verification unavailable: Web Crypto SHA-256 is not supported in this context.');
  }
  let expectedPrevHash = AUDIT_GENESIS_HASH;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.prevHash !== expectedPrevHash || !event.hash) {
      return { valid: false, firstBrokenIndex: index, verifiedCount: index };
    }
    const expectedHash = await hashEvent(event, expectedPrevHash);
    if (event.hash !== expectedHash) {
      return { valid: false, firstBrokenIndex: index, verifiedCount: index };
    }
    expectedPrevHash = event.hash;
  }
  return { valid: true, firstBrokenIndex: null, verifiedCount: events.length };
}
