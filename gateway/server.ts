import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { GeospatialError, type GeospatialErrorCode } from '../src/services/geospatial/contracts.ts';
import { decodeSuggestion, decodePlace } from '../src/services/geospatial/normalize.ts';
import { rankRegionalPlaces } from '../src/services/geospatial/regionalRanking.ts';
import type { VimaLocalPlace } from '../src/services/geospatial/localPlaces.ts';
import type { GatewayConfig } from './config.ts';
import { createGatewayState } from './state.ts';
import { allowFields, coordinate, optionalBias, query, routeRequest } from './validation.ts';
import { providerCanonicalId, type TomTomAdapter, type UpstreamContext } from './tomtom.ts';
import { createContributionRepository } from './contributions.ts';
import { createPopularityRepository } from './popularity.ts';
import { createQuoteService } from './pricing/service.ts';
import { PricingError } from './pricing/contracts.ts';
import type { PricingConfiguration } from './pricing/config.ts';
import { emptyPlaceMediaCatalog, type PlaceMediaCatalog } from './placeMedia.ts';
import { MatchingCoordinator, type MatchingClock } from './matching/coordinator.ts';
import { MatchingError, type AuthConfig } from './matching/auth.ts';
import { matchingHttp } from './matching/http.ts';

export interface GatewayLog { requestId: string; endpoint: string; durationMs: number; upstreamStatus?: number; count: number; error?: GeospatialErrorCode }
async function readBody(request: IncomingMessage, maximum: number): Promise<unknown> {
  if (request.headers['content-type'] && !request.headers['content-type'].startsWith('application/json')) throw new GeospatialError('invalid_result');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += Buffer.byteLength(chunk);
    if (size > maximum) { request.resume(); throw new GeospatialError('invalid_result'); }
    chunks.push(Buffer.from(chunk));
  }
  try { return size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown : {}; }
  catch { throw new GeospatialError('invalid_result'); }
}
export function createGateway(config: GatewayConfig, adapter: TomTomAdapter, options: {
  now?: () => number; logger?: (entry: GatewayLog) => void; localPlaces?: readonly VimaLocalPlace[]; configured?: boolean;
  pricing?: PricingConfiguration; media?: PlaceMediaCatalog; auth?: AuthConfig; matchingClock?: MatchingClock;
} = {}) {
  const now = options.now ?? Date.now;
  const state = createGatewayState(config, now);
  const contributions = createContributionRepository(config.runtimeDir ?? '.runtime', options.localPlaces ?? [], now);
  const popularity = createPopularityRepository(config.runtimeDir ?? '.runtime', options.localPlaces ?? [], now);
  const quotes = createQuoteService(adapter, config, options.pricing ?? { status: 'pricing_not_configured' }, now);
  const matching = options.auth && options.configured && options.pricing?.status === 'ready' ? new MatchingCoordinator({
    auth: options.auth, directory: config.runtimeDir ?? '.runtime', clock: options.matchingClock,
    quote: (id, owner) => { const value = quotes.store.lookupOwned(id, owner); return value?.status === 'priced' ? value.quote : undefined; },
    eta: (origin, destination) => adapter.route({ origin, destination, stops: [] }, { signal: AbortSignal.timeout(config.upstreamTimeoutMs) }),
  }) : undefined;
  const matchingReady = matching?.start();
  const media = options.media ?? emptyPlaceMediaCatalog();
  const attachImage = <T extends { id: string; canonicalId?: string; provenance?: string }>(place: T): T => {
    const image = place.provenance === 'vima-local' ? media.imageFor(place.canonicalId ?? place.id) : undefined;
    return image ? { ...place, image } : place;
  };
  const cleanup = setInterval(() => { state.cleanup(); quotes.store.cleanup(); }, config.cleanupMs); cleanup.unref();
  const server = createServer({ maxHeaderSize: config.maxBodyBytes, requestTimeout: config.upstreamTimeoutMs * 2 }, async (request, response) => {
    const requestId = randomUUID(); const started = now(); const controller = new AbortController();
    const context: UpstreamContext = { signal: controller.signal };
    let endpoint = 'unknown'; let count = 0; let category: GeospatialErrorCode | undefined;
    request.on('aborted', () => controller.abort());
    response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    const reply = (status: number, value: unknown, cache = false) => {
      if (response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache ? 'private, max-age=60' : 'no-store',
        'X-Request-Id': requestId, 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(value));
    };
    try {
      const path = request.url ?? '';
      if (path.length > 512 || path.includes('#')) throw new GeospatialError('invalid_result');
      if (!state.allow(request.socket.remoteAddress ?? 'unknown')) {
        category = 'network_recoverable'; reply(429, { error: { code: category } }); return;
      }
      if (request.method === 'GET' && path === '/health') {
        endpoint = 'health'; reply(200, { status: 'ok', configured: options.configured === true }); return;
      }
      await matchingReady;
      if (await matchingHttp(request, path, options.auth, matching, () => readBody(request, config.maxBodyBytes), controller.signal, reply)) {
        endpoint = 'matching'; count = 1; return;
      }
      if (request.method === 'GET' && path.startsWith('/v1/geospatial/discovery?')) {
        endpoint = 'discovery'; const url = new URL(path, 'http://localhost');
        if (url.pathname !== '/v1/geospatial/discovery' || [...url.searchParams.keys()].length !== 1 ||
          !url.searchParams.has('regionId')) throw new GeospatialError('invalid_result');
        const result = await popularity.discovery(url.searchParams.get('regionId')!);
        count = result.popular.length + result.featured.length;
        reply(200, { popular: result.popular.map(attachImage), featured: result.featured.map(attachImage) }, true); return;
      }
      const mediaMatch = /^\/v1\/media\/place-images\/([a-z0-9][a-z0-9-]{0,79})\/thumbnail(?:\?v=([1-9]\d{0,15}))?$/.exec(path);
      if (request.method === 'GET' && mediaMatch) {
        endpoint = 'place-media.thumbnail';
        const version = mediaMatch[2] ? Number(mediaMatch[2]) : undefined;
        if (version !== undefined && !Number.isSafeInteger(version)) throw new GeospatialError('invalid_result');
        const bytes = await media.thumbnail(mediaMatch[1]!, version);
        if (!bytes) { category = 'no_result'; reply(404, { error: { code: category } }); return; }
        count = 1;
        response.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': bytes.length,
          'Cache-Control': mediaMatch[2] ? 'public, max-age=86400, immutable' : 'public, max-age=60',
          'X-Request-Id': requestId, 'X-Content-Type-Options': 'nosniff' });
        response.end(bytes); return;
      }
      if (path.includes('?')) throw new GeospatialError('invalid_result');
      if (request.method === 'POST' && path === '/v1/passenger/quotes') {
        endpoint = 'passenger.quotes';
        const principal = request.headers.authorization ? options.auth?.authenticate(request.headers.authorization) : undefined;
        if (request.headers.authorization && !principal) throw new MatchingError(401, 'unauthorized');
        if (principal && principal.role !== 'passenger') throw new MatchingError(403, 'forbidden');
        const result = await quotes.quote(await readBody(request, config.maxBodyBytes), context, principal?.accountId);
        count = 1; reply(200, result); return;
      }
      if (request.method === 'POST' && path === '/v1/geospatial/place-signals') {
        endpoint = 'place-signals';
        if (!state.allowSignal(request.socket.remoteAddress ?? 'unknown')) throw new GeospatialError('network_recoverable');
        const result = await popularity.signal(await readBody(request, config.maxBodyBytes) as Parameters<typeof popularity.signal>[0]);
        count = result.accepted ? 1 : 0; reply(200, result); return;
      }
      if (request.method === 'POST' && path === '/v1/geospatial/place-contributions') {
        endpoint = 'place-contributions';
        if (!config.serviceAreaBounds) throw new GeospatialError('map_unavailable');
        if (!state.allowContribution(request.socket.remoteAddress ?? 'unknown')) throw new GeospatialError('network_recoverable');
        const body = allowFields(await readBody(request, config.maxBodyBytes), ['name', 'coordinate', 'reference']);
        const point = coordinate(body.coordinate); const [west, south, east, north] = config.serviceAreaBounds;
        if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) throw new GeospatialError('invalid_result');
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string') throw new GeospatialError('invalid_result');
        const result = await contributions.add({ name: body.name, coordinate: point, reference: body.reference }, key);
        count = 1; reply(201, result); return;
      }
      const sessionMatch = /^\/v1\/geospatial\/places\/sessions\/([a-f0-9-]{36})(?:\/(autocomplete|search|resolve|follow-up))?$/.exec(path);
      if (request.method === 'POST' && path === '/v1/geospatial/places/sessions') {
        endpoint = 'places.session.create'; allowFields(await readBody(request, config.maxBodyBytes), []);
        const session = state.create(); reply(201, { sessionId: session.id }); return;
      }
      if (sessionMatch) {
        const id = sessionMatch[1]!; const action = sessionMatch[2];
        endpoint = `places.session.${action ?? 'close'}`;
        if (request.method === 'DELETE' && !action) {
          allowFields(await readBody(request, config.maxBodyBytes), []); state.close(id); reply(200, {}); return;
        }
        if (request.method !== 'POST' || !action) { reply(405, { error: { code: 'invalid_result' } }); return; }
        const session = state.get(id); context.sessionId = session.id;
        const input = await readBody(request, config.maxBodyBytes);
        const sendSuggestions = (provider: Awaited<ReturnType<TomTomAdapter['search']>>, inputText: string, includeLocal: boolean) => {
          const ranked = rankRegionalPlaces(provider.map(value => value.suggestion), includeLocal ? options.localPlaces ?? [] : [], inputText)
            .slice(0, config.maxResults);
          for (const result of ranked) {
            const ref = provider.find(value => value.suggestion.id === result.id)?.reference;
            if (ref) session.choices.set(result.id, ref);
            else if ('status' in result && result.coordinate) session.choices.set(result.id, result);
          }
          while (session.choices.size > config.maxResults * 3) session.choices.delete(session.choices.keys().next().value!);
          count = ranked.length; reply(200, { suggestions: ranked.map(place => decodeSuggestion(attachImage(place))) });
        };
        if (action === 'resolve') {
          const body = allowFields(input, ['id']); const selection = query(body.id, config);
          const choice = session.choices.get(selection);
          if (!choice) throw new GeospatialError('no_result');
          if (!('coordinate' in choice) && choice.kind !== 'details') throw new GeospatialError('invalid_result');
          let place;
          try { place = 'coordinate' in choice ? decodePlace(choice) :
            { ...await adapter.resolve(choice, context), canonicalId: providerCanonicalId(choice.type, choice.id) }; }
          finally { state.close(id); }
          count = 1; reply(200, attachImage(place)); return;
        }
        if (action === 'follow-up') {
          const body = allowFields(input, ['id', 'bias']); const selection = query(body.id, config);
          const choice = session.choices.get(selection);
          if (!choice || 'coordinate' in choice || choice.kind !== 'discover') throw new GeospatialError('no_result');
          const provider = await adapter.followDiscover(choice, optionalBias(body.bias), context);
          sendSuggestions(provider, choice.query ?? '', false); return;
        }
        const body = allowFields(input, ['input', 'bias']); const inputText = query(body.input, config);
        const provider = await adapter.search(inputText, optionalBias(body.bias), action === 'autocomplete', context);
        const actionable = action === 'autocomplete' && !provider.some(value => value.reference.kind === 'details') &&
          rankRegionalPlaces([], options.localPlaces ?? [], inputText).length === 0
          ? provider.find(value => value.reference.kind === 'discover') : undefined;
        if (actionable?.reference.kind === 'discover') {
          // At most one documented Suggest action is followed automatically per cycle.
          try { sendSuggestions(await adapter.followDiscover(actionable.reference, optionalBias(body.bias), context), inputText, true); return; }
          catch { /* Keep the explicit action selectable when Discover is unavailable. */ }
        }
        sendSuggestions(provider, inputText, true); return;
      }
      if (request.method !== 'POST') { reply(404, { error: { code: 'no_result' } }); return; }
      const input = await readBody(request, config.maxBodyBytes);
      if (path === '/v1/geospatial/geocode') {
        endpoint = 'geocode'; const body = allowFields(input, ['input', 'bias']);
        const result = await adapter.geocode(query(body.input, config), optionalBias(body.bias), context);
        count = result ? 1 : 0; reply(200, { result }); return;
      }
      if (path === '/v1/geospatial/reverse-geocode') {
        endpoint = 'reverse-geocode'; const body = allowFields(input, ['coordinate']);
        const result = await adapter.reverse(coordinate(body.coordinate), context);
        count = result ? 1 : 0; reply(200, { result }); return;
      }
      if (path === '/v1/geospatial/routes') {
        endpoint = 'routes'; const result = await adapter.route(routeRequest(input, config), context);
        count = 1; reply(200, result); return;
      }
      category = 'no_result'; reply(404, { error: { code: category } });
    } catch (error) {
      if (error instanceof MatchingError) { reply(error.status, { error: { code: error.code } }); return; }
      if (error instanceof PricingError) {
        reply(error.code === 'idempotency_conflict' ? 409 : 503, { error: { code: error.code } }); return;
      }
      category = error instanceof GeospatialError ? error.code : 'network_recoverable';
      const status = category === 'invalid_result' ? 400 : category === 'no_result' ? 404 : category === 'timeout' ? 504 :
        category === 'cancelled' ? 499 : 503;
      reply(status, { error: { code: category } });
    } finally {
      if (config.logging) options.logger?.({ requestId, endpoint, durationMs: now() - started, upstreamStatus: context.status, count, error: category });
    }
  });
  server.on('close', () => { clearInterval(cleanup); matching?.close(); });
  return server;
}
