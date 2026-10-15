export class RequestTimeoutError extends Error {
  constructor() { super('request_timeout'); this.name = 'RequestTimeoutError'; }
}

/** Cancel the caller's wait without cancelling a shared refresh/native operation. */
export function withCancellation<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('request_cancelled')); };
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

/** Bounds native/storage promises too; late settlements cannot replace a newer attempt. */
export function withDeadline<T>(work: Promise<T>, milliseconds: number, signal?: AbortSignal,
  onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Error('request_cancelled')); };
    const timer = setTimeout(() => { cleanup(); reject(new RequestTimeoutError()); onTimeout?.(); }, milliseconds);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
