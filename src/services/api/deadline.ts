export class RequestTimeoutError extends Error {
  constructor() { super('request_timeout'); this.name = 'RequestTimeoutError'; }
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
