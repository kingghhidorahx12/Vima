export type MatchingTraceEvent =
  | 'location_session_start' | 'permission_check' | 'permission_request' | 'permission_result' | 'location_gate'
  | 'provider_check' | 'provider_result' | 'last_known_result'
  | 'watch_attach' | 'watch_attached' | 'watch_callback' | 'watch_error'
  | 'watchdog' | 'watch_retry' | 'location_post_start'
  | 'location_post_receipt' | 'location_post_error' | 'location_session_stop'
  | 'poll_start' | 'poll_result' | 'poll_error' | 'poll_retry'
  | 'poll_reconnected' | 'poll_invalidation' | 'poll_stop' | 'offer_render';

export type MatchingTraceFields = Readonly<Record<string, string | number | boolean | undefined>>;
export type MatchingTrace = (event: MatchingTraceEvent, fields?: MatchingTraceFields) => void;

const safeCode = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : undefined;

/** Returns only transport metadata that is safe to include in DEV diagnostics. */
export function matchingTraceError(error: unknown): MatchingTraceFields {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return { code: 'aborted' };
  if (!error || typeof error !== 'object') return { code: 'unknown' };
  const candidate = error as { status?: unknown; code?: unknown; name?: unknown };
  return {
    ...(typeof candidate.status === 'number' && Number.isInteger(candidate.status) ? { status: candidate.status } : {}),
    code: safeCode(candidate.code) ?? safeCode(candidate.name) ?? 'unknown',
  };
}

/** Structured diagnostics are intentionally inert outside Metro DEV builds. */
export const matchingDevTrace: MatchingTrace = (event, fields = {}) => {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  globalThis.console.info('[Vima DEV]', JSON.stringify({ event, ...fields }));
};
