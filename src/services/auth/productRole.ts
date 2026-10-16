import { ApiError, type ApiClient, type ApiRequest } from '../api/client.ts';
import type { MatchingClient } from '../matching/client.ts';
import { driverOperationId } from '../matching/operationId.ts';

/** A context owns all its requests, including commands/outbox calls without a signal. */
export function productRoleApi(api: ApiClient, valid: () => boolean, context: 'passenger' | 'driver', denied: () => void = () => {}) {
  let closed = false; const controllers = new Set<AbortController>();
  const check = () => { if (closed || !valid()) throw new Error('product_context_cancelled'); };
  return {
    close() { closed = true; controllers.forEach(c => c.abort()); controllers.clear(); },
    api: { async request<T>(input: ApiRequest<T>): Promise<T> {
      check(); const controller = new AbortController(); controllers.add(controller);
      const abort = () => controller.abort(); input.signal?.addEventListener('abort', abort, { once: true });
      try {
        if (input.signal?.aborted) controller.abort();
        const value = await api.request({ ...input, operationalContext: context, signal: controller.signal });
        check(); if (controller.signal.aborted) throw new Error('product_context_cancelled'); return value;
      } catch (error) { if (!closed && valid() && error instanceof ApiError && error.status === 403) denied(); throw error; }
      finally { controllers.delete(controller); input.signal?.removeEventListener('abort', abort); }
    } } satisfies ApiClient,
  };
}

/** A failed/ambiguous OFFLINE never authorizes leaving. Stable operation ID is reused. */
export function driverExit(client: Pick<MatchingClient, 'driver' | 'availability'>) {
  let id: string | undefined; let pending = false;
  return async () => {
    if (pending) throw new Error('driver_exit_pending'); pending = true;
    try {
      const state = await client.driver();
      if (state.assignment) throw new Error('driver_trip_active');
      if (state.availability === 'OFFLINE') return;
      id ??= driverOperationId('availability_offline');
      const confirmed = await client.availability('OFFLINE', id);
      if (confirmed.assignment || confirmed.availability !== 'OFFLINE') throw new Error('driver_offline_unconfirmed');
      // Idempotent receipts describe their original commit, not necessarily now.
      const current = await client.driver();
      if (current.assignment) throw new Error('driver_trip_active');
      if (current.availability !== 'OFFLINE') throw new Error('driver_offline_unconfirmed');
    } finally { pending = false; }
  };
}
