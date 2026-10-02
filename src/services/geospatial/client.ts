import { ApiError, type ApiClient, type ApiRequest } from '../api/client.ts';
import { normalizeCoordinate } from '../../map/models.ts';
import { GeospatialError, type GeospatialErrorCode, type PlacesSession, type RouteRequest } from './contracts.ts';
import { decodePlace, decodeRoute, decodeSession, decodeSuggestions } from './normalize.ts';

/** Dormant until a Vima HTTPS backend is supplied. No Google URL or key belongs here. */
export function createGeospatialClient(api: ApiClient, timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A positive backend timeout is required');
  async function request<T>(input: ApiRequest<T>, unavailable: GeospatialErrorCode): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: (error: GeospatialError) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const abort = () => { controller.abort(); rejectAbort(new GeospatialError('cancelled')); };
    const timer = setTimeout(() => {
      timedOut = true; controller.abort(); rejectAbort(new GeospatialError('timeout'));
    }, timeoutMs);
    input.signal?.addEventListener('abort', abort, { once: true });
    try {
      if (input.signal?.aborted) throw new GeospatialError('cancelled');
      return await Promise.race([api.request({ ...input, signal: controller.signal }), interrupted]);
    } catch (error) {
      if (timedOut) throw new GeospatialError('timeout');
      if (input.signal?.aborted) throw new GeospatialError('cancelled');
      if (error instanceof GeospatialError) throw error;
      if (error instanceof ApiError) {
        if (error.status === 408 || error.status === 504) throw new GeospatialError('timeout');
        throw new GeospatialError(unavailable);
      }
      if (error instanceof TypeError) throw new GeospatialError('network_recoverable');
      throw new GeospatialError(unavailable);
    } finally { clearTimeout(timer); input.signal?.removeEventListener('abort', abort); }
  }
  return {
    async startPlacesSession(signal?: AbortSignal): Promise<PlacesSession> {
      const sessionId = await request({ path: '/v1/geospatial/places/sessions', method: 'POST',
        decode: decodeSession, signal }, 'search_unavailable');
      let closed = false;
      const path = '/v1/geospatial/places/sessions/' + encodeURIComponent(sessionId);
      const requireOpen = () => { if (closed) throw new GeospatialError('search_unavailable'); };
      return {
        autocomplete(input, signal) {
          requireOpen();
          return request({ path: path + '/autocomplete', method: 'POST', body: { input },
            decode: decodeSuggestions, signal }, 'search_unavailable');
        },
        async resolve(id, signal) {
          requireOpen();
          // Details consumes a session even after an ambiguous network response. Never reuse it.
          closed = true;
          return request({ path: path + '/resolve', method: 'POST', body: { id },
            decode: decodePlace, signal }, 'search_unavailable');
        },
        async close(signal) {
          if (closed) return;
          closed = true;
          await request({ path, method: 'DELETE', decode: () => undefined, signal }, 'search_unavailable');
        },
      };
    },
    route(input: RouteRequest, signal?: AbortSignal) {
      let body: RouteRequest;
      try { body = { origin: normalizeCoordinate(input.origin), destination: normalizeCoordinate(input.destination),
        stops: input.stops.map(normalizeCoordinate) }; }
      catch { throw new GeospatialError('invalid_result'); }
      return request({ path: '/v1/geospatial/routes', method: 'POST', body, decode: decodeRoute, signal }, 'route_unavailable');
    },
  };
}
