import { PricingError, type QuoteResponse } from './contracts.ts';

export function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeSnapshot); Object.freeze(value); }
  return value;
}
const snapshot = (value: QuoteResponse) => value.status === 'priced' ? value.quote : value.routePreview;
export function createQuoteStore(now = Date.now, maximum = 500) {
  const operations = new Map<string, { fingerprint: string; promise: Promise<QuoteResponse>; value?: QuoteResponse }>();
  const quotes = new Map<string, QuoteResponse>();
  const owners = new Map<string, string>();
  const cleanup = () => {
    for (const [id, entry] of operations) if (entry.value && snapshot(entry.value).expiresAt <= now()) {
      operations.delete(id); quotes.delete(snapshot(entry.value).id); owners.delete(snapshot(entry.value).id);
    }
  };
  return {
    cleanup,
    lookup(id: string) { cleanup(); return quotes.get(id); },
    lookupOwned(id: string, owner: string) { cleanup(); return owners.get(id) === owner ? quotes.get(id) : undefined; },
    async getOrCreate(operationId: string, fingerprint: string, create: () => Promise<QuoteResponse>, owner?: string) {
      cleanup();
      const key = JSON.stringify([owner ?? null, operationId]);
      const existing = operations.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new PricingError('idempotency_conflict');
        return existing.promise;
      }
      if (operations.size >= maximum) throw new PricingError('quote_capacity');
      const entry: { fingerprint: string; promise: Promise<QuoteResponse>; value?: QuoteResponse } = {
        fingerprint, promise: Promise.resolve().then(create).then(result => {
          const value = freezeSnapshot(structuredClone(result)); entry.value = value;
          quotes.set(snapshot(value).id, value); if (owner) owners.set(snapshot(value).id, owner); return value;
        }).catch(error => { operations.delete(key); throw error; }),
      };
      operations.set(key, entry); return entry.promise;
    },
    get size() { cleanup(); return operations.size; },
  };
}
