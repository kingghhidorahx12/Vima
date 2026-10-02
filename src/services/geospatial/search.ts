import type { Coordinate } from '../../map/models.ts';
import { GeospatialError, type PlacesSession } from './contracts.ts';
import type { GeospatialClient } from './client.ts';

export function createPlaceSearch(client: GeospatialClient, debounceMs: number) {
  if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new Error('Invalid search debounce');
  let sequence = 0; let active: AbortController | undefined; let session: Promise<PlacesSession> | undefined;
  const close = () => {
    sequence++; active?.abort(); active = undefined;
    const previous = session; session = undefined;
    void previous?.then(value => value.close()).catch(() => {});
  };
  const delay = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new GeospatialError('cancelled')); return; }
    const abort = () => { clearTimeout(timer); reject(new GeospatialError('cancelled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, debounceMs);
    signal.addEventListener('abort', abort, { once: true });
  });
  return {
    close,
    async suggest(input: string, signal?: AbortSignal, bias?: Coordinate) {
      active?.abort(); const controller = new AbortController(); active = controller;
      const current = ++sequence;
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) controller.abort();
      try {
        if (!input.trim()) return [];
        await delay(controller.signal);
        if (!session) {
          const created = client.startPlacesSession();
          session = created;
          void created.catch(() => { if (session === created) session = undefined; });
        }
        const handle = await session;
        controller.signal.throwIfAborted();
        const results = await handle.autocomplete(input, controller.signal, bias);
        if (sequence !== current || controller.signal.aborted) throw new GeospatialError('cancelled');
        return results;
      } catch (error) {
        // An expired gateway session must not poison every subsequent query/retry.
        if (sequence === current && error instanceof GeospatialError && error.code === 'no_result') close();
        throw error;
      } finally { signal?.removeEventListener('abort', abort); }
    },
    async resolve(id: string, signal?: AbortSignal) {
      active?.abort(); sequence++;
      const current = session; session = undefined;
      if (!current) throw new GeospatialError('no_result');
      return (await current).resolve(id, signal);
    },
    async search(input: string, signal?: AbortSignal, bias?: Coordinate) {
      if (!input.trim()) return [];
      active?.abort(); sequence++;
      if (!session) session = client.startPlacesSession();
      return (await session).search(input, signal, bias);
    },
    async followUp(id: string, signal?: AbortSignal, bias?: Coordinate) {
      active?.abort(); sequence++;
      if (!session) throw new GeospatialError('no_result');
      return (await session).followUp(id, signal, bias);
    },
  };
}
