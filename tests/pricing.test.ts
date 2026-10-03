import assert from 'node:assert/strict';
import test from 'node:test';
import { priceTrip } from '../gateway/pricing/engine.ts';
import { loadPricingConfig, validatePricingConfig } from '../gateway/pricing/config.ts';
import { selectPricing } from '../gateway/pricing/selector.ts';
import { createQuoteService } from '../gateway/pricing/service.ts';
import { gatewayConfig } from '../gateway/config.ts';
import type { TomTomAdapter } from '../gateway/tomtom.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import { decodeQuoteResponse } from '../src/services/pricing/normalize.ts';
import { createQuoteStore } from '../gateway/pricing/quoteStore.ts';

test('integer engine applies base, km, traffic minutes, minimum and explicit additions after minimum', () => {
  const config = syntheticPricing();
  const price = (distanceMeters: number, durationSeconds: number, trafficDurationSeconds?: number) => priceTrip({ config, profile: 'URBANO', routeMetrics: { distanceMeters, durationSeconds, trafficDurationSeconds } });
  assert.equal(price(0, 0).price.totalMinor, 509);
  assert.equal(price(0, 0).price.minimumApplied, true);
  const full = price(10000, 600, 900);
  assert.equal(full.price.baseMinor, 101); assert.equal(full.price.distanceChargeMinor, 370);
  assert.equal(full.price.durationChargeMinor, 195); assert.equal(full.price.totalMinor, 666);
  assert.equal(full.price.minimumApplied, false); assert.equal(full.durationSource, 'traffic');
  assert.equal(price(10000, 600).price.totalMinor, 601); assert.equal(price(0, 0).durationSource, 'static');
  const extras = priceTrip({ config, profile: 'URBANO', routeMetrics: { distanceMeters: 0, durationSeconds: 0 },
    adjustments: { additions: [{ code: 'synthetic-toll', kind: 'toll', label: 'Test toll', amountMinor: 7 },
      { code: 'synthetic-extra', kind: 'extra', label: 'Test extra', amountMinor: 3 }] } });
  assert.equal(extras.price.totalMinor, 519); assert.equal(extras.price.extras.length, 2);
});

test('rational sub-cent components are accumulated exactly and rounded only once at the end', () => {
  const config = syntheticPricing(); config.profiles.URBANO = { baseMinor: 0, minimumMinor: 0, distanceMinorPerKm: 1, durationMinorPerMinute: 1 };
  const calculate = (distanceMeters: number, durationSeconds: number) => priceTrip({ config, profile: 'URBANO', routeMetrics: { distanceMeters, durationSeconds } }).price;
  assert.equal(calculate(400, 24).totalMinor, 1); // .4 + .4, not 0 + 0
  assert.equal(calculate(499, 0).totalMinor, 0); assert.equal(calculate(500, 0).totalMinor, 1);
  config.rounding.incrementMinor = 5;
  assert.equal(calculate(2499, 0).totalMinor, 0); assert.equal(calculate(2500, 0).totalMinor, 5);
  assert.equal(calculate(7500, 0).totalMinor, 10);
});

test('overflow, negative metrics, unsafe integers and invalid configuration fail closed', async () => {
  const config = syntheticPricing();
  for (const distanceMeters of [-1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => priceTrip({ config, profile: 'URBANO', routeMetrics: { distanceMeters, durationSeconds: Number.MAX_SAFE_INTEGER } }), /pricing_unavailable/);
  assert.throws(() => priceTrip({ config, profile: 'URBANO', routeMetrics: { distanceMeters: Number.MAX_SAFE_INTEGER, durationSeconds: 0 },
    adjustments: { rateOverride: { distanceMinorPerKm: Number.MAX_SAFE_INTEGER } } }), /pricing_unavailable/);
  for (const mutate of [
    (c: typeof config) => { c.currency = 'USD' as 'MXN'; },
    (c: typeof config) => { c.version = ''; },
    (c: typeof config) => { c.profiles.URBANO.baseMinor = -1; },
    (c: typeof config) => { c.rounding.incrementMinor = 0; },
    (c: typeof config) => { c.regions = [...c.regions, c.regions[0]!]; },
    (c: typeof config) => { c.profiles.URBANO.additions = [{ code: 'x', label: 'X', kind: 'extra', amountMinor: 1 }, { code: 'x', label: 'X', kind: 'extra', amountMinor: 1 }]; },
  ]) { const c = syntheticPricing(); mutate(c); assert.throws(() => validatePricingConfig(c), /pricing_unavailable/); }
  assert.deepEqual(await loadPricingConfig(undefined), { status: 'pricing_not_configured' });
  assert.deepEqual(await loadPricingConfig('nonexistent-pricing-test.json'), { status: 'pricing_unavailable' });
});

test('server regions select urban/regional, directional overrides and exclude a third municipality', () => {
  const c = syntheticPricing(); const a = [0.5, 0.5] as const; const b = [2.5, 0.5] as const; const third = [4.5, 0.5] as const;
  assert.equal(selectPricing(c, [a, a]).profile, 'URBANO'); assert.equal(selectPricing(c, [a, b]).profile, 'REGIONAL');
  c.intermunicipalOverrides = [{ id: 'test', fromRegionId: 'region-0', toRegionId: 'region-1', direction: 'one-way', rateOverride: { baseMinor: 1 } }];
  assert.equal(selectPricing(c, [a, b]).override?.id, 'test'); assert.equal(selectPricing(c, [b, a]).override, undefined);
  c.intermunicipalOverrides[0]!.direction = 'both';
  assert.equal(selectPricing(c, [b, a]).override?.id, 'test'); assert.equal(selectPricing(c, [a, third, b]).override, undefined);
  assert.throws(() => selectPricing(c, [a, [50, 50]]), /pricing_unavailable/);
  c.intermunicipalOverrides = [...c.intermunicipalOverrides, { ...c.intermunicipalOverrides[0]!, id: 'ambiguous' }];
  assert.throws(() => validatePricingConfig(c), /pricing_unavailable/); assert.throws(() => selectPricing(c, [a, b]), /pricing_unavailable/);
});

test('quote store deduplicates concurrent routing, detects conflicts, snapshots immutably and cleans TTL', async () => {
  let now = 1000; let calls = 0;
  const adapter = { route: async () => { calls++; return syntheticRoute; } } as unknown as TomTomAdapter;
  const service = createQuoteService(adapter, gatewayConfig({}), { status: 'ready', config: syntheticPricing() }, () => now);
  const request = { ...syntheticDraft, operationId: 'synthetic-operation-1' }; const context = { signal: new AbortController().signal };
  const [a, b] = await Promise.all([service.quote(request, context), service.quote(request, context)]);
  assert.equal(a, b); assert.equal(calls, 1); assert.equal(a.status, 'priced');
  if (a.status !== 'priced') return;
  assert.equal(a.quote.configVersion, 'SYNTHETIC_PRICING_TEST_ONLY'); assert.equal(a.quote.expiresAt - a.quote.createdAt, 300000);
  assert.equal(a.quote.durationSource, 'traffic'); assert.equal(a.quote.price.totalMinor, 666);
  assert.ok(Object.isFrozen(a.quote.route.geometry.geometry)); assert.throws(() => { a.quote.price.totalMinor = 1; });
  assert.deepEqual(decodeQuoteResponse(a), a);
  await assert.rejects(service.quote({ ...request, destination: { ...syntheticDraft.destination, name: 'different' } }, context), /idempotency_conflict/);
  now += 299999; assert.equal(await service.quote(request, context), a); assert.equal(calls, 1);
  now++; service.store.cleanup(); assert.equal(service.store.lookup(a.quote.id), undefined);
  const renewed = await service.quote(request, context); assert.notEqual(renewed, a); assert.equal(calls, 2);
});

test('route and pricing failures remain distinct, previews survive unavailable config and unknown regions', async () => {
  const ctx = { signal: new AbortController().signal }; const request = { ...syntheticDraft, operationId: 'synthetic-operation-2' };
  const adapter = { route: async () => syntheticRoute } as unknown as TomTomAdapter;
  for (const status of ['pricing_not_configured', 'pricing_unavailable'] as const) {
    const response = await createQuoteService(adapter, gatewayConfig({}), { status }).quote(request, ctx);
    assert.equal(response.status, 'unpriced'); if (response.status !== 'unpriced') continue;
    assert.equal(response.reason, status); assert.equal(response.routePreview.route.distanceMeters, 10000);
    assert.equal('price' in response.routePreview, false); assert.deepEqual(decodeQuoteResponse(response), response);
  }
  const service = createQuoteService(adapter, gatewayConfig({}), { status: 'ready', config: syntheticPricing() });
  const unknown = await service.quote({ ...request, destination: { ...request.destination, coordinate: [80, 80] } }, ctx);
  assert.equal(unknown.status === 'unpriced' && unknown.reason, 'pricing_unavailable');
  const failed = createQuoteService({ route: async () => { throw new Error('upstream'); } } as unknown as TomTomAdapter, gatewayConfig({}), { status: 'pricing_not_configured' });
  await assert.rejects(failed.quote(request, ctx), /route_unavailable/); assert.equal(failed.store.size, 0);
  for (const extra of ['price', 'distance', 'duration', 'profile']) await assert.rejects(service.quote({ ...request, [extra]: 1 }, ctx), /invalid_result/);
});

test('quote store bounds capacity and allows retry after an upstream failure', async () => {
  const store = createQuoteStore(Date.now, 1); let reject!: (reason: Error) => void;
  const pending = store.getOrCreate('one', 'draft', () => new Promise((_, r) => { reject = r; }));
  await Promise.resolve(); await assert.rejects(store.getOrCreate('two', 'draft', async () => { throw new Error(); }), /quote_capacity/);
  reject(new Error('upstream')); await assert.rejects(pending); assert.equal(store.size, 0);
});

test('external versioned config loads without defaults for commercial rates and rejects invalid geometry', async () => {
  const { mkdtemp, writeFile, unlink, rmdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'vima-pricing-test-')); const file = join(dir, 'synthetic.json');
  try {
    const config = syntheticPricing(); await writeFile(file, JSON.stringify(config));
    const result = await loadPricingConfig(file); assert.equal(result.status, 'ready');
    if (result.status === 'ready') assert.ok(Object.isFrozen(result.config.profiles.URBANO));
    const invalid = { ...config, regions: [{ id: 'crossed', polygon: [[0, 0], [3, 3], [0, 2], [2, 0], [0, 0]] }] };
    await writeFile(file, JSON.stringify(invalid)); assert.deepEqual(await loadPricingConfig(file), { status: 'pricing_unavailable' });
    const overlap = { ...config, regions: [...config.regions, { ...config.regions[0]!, id: 'overlap' }] };
    assert.throws(() => selectPricing(overlap, [[0.5, 0.5], [0.6, 0.6]]), /pricing_unavailable/);
  } finally { await unlink(file); await rmdir(dir); }
});

test('regional override changes only explicit rates/additions and static duration is retained when traffic is absent', async () => {
  const config = syntheticPricing(); config.intermunicipalOverrides = [{ id: 'corridor', fromRegionId: 'region-0', toRegionId: 'region-1', direction: 'both',
    rateOverride: { minimumMinor: 0, baseMinor: 1 }, additions: [{ code: 'test', label: 'Test', kind: 'extra', amountMinor: 2 }] }];
  const selection = selectPricing(config, [[0.5, 0.5], [2.5, 0.5]]);
  const result = priceTrip({ config, profile: selection.profile, adjustments: selection.override,
    routeMetrics: { distanceMeters: 1000, durationSeconds: 60 } });
  assert.equal(result.price.totalMinor, 73); assert.equal(result.durationSource, 'static');
  assert.equal(result.price.baseMinor, 1); assert.equal(result.price.distanceChargeMinor, 53); assert.equal(result.price.durationChargeMinor, 17);
});
