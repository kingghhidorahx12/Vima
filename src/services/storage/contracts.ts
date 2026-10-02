/** Only recovery metadata. No coordinates, identity, phase, secrets or payment data. */
export interface TripRecoverySnapshot {
  readonly version: 1;
  readonly tripId: string;
  readonly revision: number;
  readonly savedAt: string;
}

export interface LocalPreferences {
  readonly version: 1;
  readonly reducedMotion: 'system' | 'reduce';
  readonly themeName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reconstruct an allowlist even if the caller passes extra fields at runtime. */
export function sanitizeSnapshot(value: unknown): TripRecoverySnapshot | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.tripId !== 'string' ||
      !value.tripId || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) return null;
  return { version: 1, tripId: value.tripId, revision: value.revision as number, savedAt: value.savedAt };
}

export function sanitizePreferences(value: unknown): LocalPreferences | null {
  if (!isRecord(value) || value.version !== 1 ||
      (value.reducedMotion !== 'system' && value.reducedMotion !== 'reduce') ||
      (value.themeName !== undefined && typeof value.themeName !== 'string')) return null;
  return {
    version: 1,
    reducedMotion: value.reducedMotion,
    ...(value.themeName === undefined ? {} : { themeName: value.themeName as string }),
  };
}
