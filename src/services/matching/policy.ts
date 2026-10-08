export const matchingLocationPolicy = {
  ttlMs: 60_000,
  watcherTimeoutMs: 10_000,
  watcherRetryMs: 3_000,
} as const;

export const isMatchingLocationFresh = (receivedAt: number, now: number) =>
  Number.isSafeInteger(receivedAt) && receivedAt >= 0 && now >= receivedAt && now - receivedAt < matchingLocationPolicy.ttlMs;
