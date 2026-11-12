import type { CommsDraft } from '../state/types.ts';

const DATABASE_NAME = 'entangle-demo-outbox';
const STORE_NAME = 'approved-messages';
const memoryOutbox = new Map<string, CommsDraft>();

export function smsCharacterCount(text: string): number {
  return text.length;
}

export function fitsSingleSms(text: string): boolean {
  return smsCharacterCount(text) <= 160;
}

export async function persistApprovedMockMessages(messages: CommsDraft[]): Promise<'indexeddb' | 'memory'> {
  const approved = messages.filter(message => message.approvedByHuman);
  let database: IDBDatabase | undefined;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.');
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the local mock outbox.'));
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      approved.forEach(message => store.put(message));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not persist approved mock messages.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local mock outbox transaction was aborted.'));
    });
    return 'indexeddb';
  } catch {
    approved.forEach(message => memoryOutbox.set(message.id, message));
    return 'memory';
  } finally {
    database?.close();
  }
}
