import { randomUUID } from 'node:crypto';
import { allowFields, coordinate, query } from '../validation.ts';
import { GeospatialError, type ResolvedPlace } from '../../src/services/geospatial/contracts.ts';
import type { TomTomAdapter, UpstreamContext } from '../tomtom.ts';
import type { GatewayConfig } from '../config.ts';
import type { PricingConfiguration } from './config.ts';
import { selectPricing } from './selector.ts';
import { priceTrip } from './engine.ts';
import { createQuoteStore } from './quoteStore.ts';
import type { QuoteResponse, QuoteDraft } from './contracts.ts';

export function createQuoteService(adapter: TomTomAdapter, gateway: GatewayConfig, pricing: PricingConfiguration, now = Date.now) {
  const store = createQuoteStore(now);
  function place(raw: unknown): ResolvedPlace {
    const p = allowFields(raw, ['id', 'name', 'address', 'coordinate']);
    return { id: query(p.id, gateway), name: query(p.name, gateway),
      address: p.address === '' ? '' : query(p.address, gateway), coordinate: coordinate(p.coordinate) };
  }
  return { store, async quote(input: unknown, context: UpstreamContext, owner?: string): Promise<QuoteResponse> {
    const b = allowFields(input, ['operationId', 'origin', 'destination', 'stops']);
    if (typeof b.operationId !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(b.operationId) ||
      !Array.isArray(b.stops) || b.stops.length > gateway.maxStops) throw new GeospatialError('invalid_result');
    const draft: QuoteDraft = { origin: place(b.origin), destination: place(b.destination), stops: b.stops.map(place) };
    const points = [draft.origin.coordinate, ...draft.stops.map(p => p.coordinate), draft.destination.coordinate];
    let selection: ReturnType<typeof selectPricing> | undefined;
    if (pricing.status === 'ready') { try { selection = selectPricing(pricing.config, points); } catch { /* Route preview still available. */ } }
    return store.getOrCreate(b.operationId, JSON.stringify(draft), async () => {
      let route;
      try { route = await adapter.route({ origin: draft.origin.coordinate, destination: draft.destination.coordinate,
        stops: draft.stops.map(p => p.coordinate) }, context); }
      catch { throw new GeospatialError('route_unavailable'); }
      const createdAt = now(); const expiresAt = createdAt + (pricing.status === 'ready' ? pricing.config.quoteTtlSeconds : 300) * 1000;
      if (!Number.isSafeInteger(expiresAt)) throw new GeospatialError('invalid_result');
      const routePreview = { ...draft, id: randomUUID(), createdAt, expiresAt, route };
      if (pricing.status !== 'ready') return { status: 'unpriced', reason: pricing.status, routePreview };
      if (!selection) return { status: 'unpriced', reason: 'pricing_unavailable', routePreview };
      try {
        const priced = priceTrip({ config: pricing.config, profile: selection.profile, routeMetrics: route, adjustments: selection.override });
        return { status: 'priced', quote: { ...routePreview, ...priced, configVersion: pricing.config.version,
          profile: selection.profile, ...(selection.override ? { overrideId: selection.override.id } : {}), distanceMeters: route.distanceMeters } };
      } catch { return { status: 'unpriced', reason: 'pricing_unavailable', routePreview }; }
    }, owner);
  } };
}
