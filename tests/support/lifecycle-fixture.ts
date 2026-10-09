import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MatchingCoordinator, type MatchingClock, type MatchingOptions } from '../../gateway/matching/coordinator.ts';
import { createAuthConfig, type Principal } from '../../gateway/matching/auth.ts';
import { priceTrip } from '../../gateway/pricing/engine.ts';
import type { AuthoritativeRideQuote } from '../../src/services/pricing/contracts.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './pricing-fixture.ts';
import type { MatchingServerEvent } from '../../gateway/matching/trace.ts';
export class Clock implements MatchingClock {
  time = 1000; jobs = new Map<symbol, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (delay: number, callback: () => void) => { const id = Symbol(); this.jobs.set(id, { at: this.time + delay, callback }); return () => { this.jobs.delete(id); }; };
  advance(ms: number) { this.time += ms; const jobs = [...this.jobs]; for (const [id, job] of jobs) if (job.at <= this.time) { this.jobs.delete(id); job.callback(); } }
}
export const flush = async () => { for (let i = 0; i < 15; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
export const p: Principal = { accountId: 'p', role: 'passenger' };
export const other: Principal = { accountId: 'other', role: 'passenger' };
export const driver = (n: number): Principal => ({ accountId: `d${n}`, role: 'driver' });
export function setup(count = 4, customEta?: MatchingOptions['eta'], config = syntheticPricing()) {
  const directory = mkdtempSync(join(tmpdir(), 'vima-matching-test-')); const clock = new Clock();
  const tokens = Array.from({ length: count + 2 }, () => randomBytes(32).toString('hex'));
  const auth = createAuthConfig({ accounts: [p, other, ...Array.from({ length: count }, (_, i) => ({ ...driver(i + 1),
    driver: { name: `Synthetic Driver ${i + 1}`, rating: 4.5 }, vehicle: { name: 'Synthetic', plate: 'TEST', color: 'Test' } }))]
    .map((account, i) => ({ ...account, token: tokens[i] })) });
  const quotes = new Map<string, { owner: string; quote: AuthoritativeRideQuote }>();
  const addQuote = (id: string, owner = 'p') => {
    const quote: AuthoritativeRideQuote = { ...syntheticDraft, id, route: syntheticRoute, createdAt: clock.now(), expiresAt: clock.now() + 300_000,
      ...priceTrip({ config: structuredClone(config), profile: 'URBANO', routeMetrics: syntheticRoute }), configVersion: structuredClone(config).version, profile: 'URBANO', distanceMeters: syntheticRoute.distanceMeters };
    quotes.set(id, { owner, quote }); return quote;
  };
  addQuote('quote');
  const eta: MatchingOptions['eta'] = customEta ?? (async (origin, pickup) => ({ geometry: { type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: [[...origin], [...pickup]] } },
    bounds: { southwest: [Math.min(origin[0], pickup[0]), Math.min(origin[1], pickup[1])], northeast: [Math.max(origin[0], pickup[0]), Math.max(origin[1], pickup[1])] },
    distanceMeters: 1000, durationSeconds: Math.abs(origin[0]) * 1000, trafficDurationSeconds: Math.abs(origin[0]) * 1000 }));
  const traces: MatchingServerEvent[] = [];
  const options = { auth, directory, clock, eta, pricingConfig: structuredClone(config), trace: (event: MatchingServerEvent) => traces.push(event), quote: (id: string, owner: string) => {
    const entry = quotes.get(id); return entry?.owner === owner ? entry.quote : undefined;
  } };
  let coordinator = new MatchingCoordinator(options);
  return { clock, auth, tokens, directory, quotes, addQuote, traces, options, get c() { return coordinator; },
    ready: () => coordinator.start(),
    async available(n: number) { await coordinator.availability(driver(n), 'AVAILABLE', `available-${n}`);
      await coordinator.location(driver(n), [-n / 10, 0.1], undefined, `location-${n}`); },
    async restart() { coordinator.close(); coordinator = new MatchingCoordinator(options); await coordinator.start(); },
    close() { coordinator.close(); rmSync(directory, { recursive: true, force: true });
      for (const event of traces) if (event.event === 'availability_transition' && event.to === 'OFFLINE') assert.equal(event.reason, 'explicit_offline'); } };
}
