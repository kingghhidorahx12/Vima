import Storage from 'expo-sqlite/kv-store';
import { sanitizePreferences, sanitizeSnapshot, type LocalPreferences, type TripRecoverySnapshot } from './contracts';

const keys = { preferences: 'vima.preferences.v1', trip: 'vima.trip-recovery.v1' } as const;

async function read<T>(key: string, decode: (value: unknown) => T | null): Promise<T | null> {
  const raw = await Storage.getItem(key);
  if (raw === null) return null;
  try { return decode(JSON.parse(raw)); } catch { return null; }
}

export const localStorage = {
  readPreferences: () => read(keys.preferences, sanitizePreferences),
  async writePreferences(preferences: LocalPreferences) {
    const safe = sanitizePreferences(preferences);
    if (!safe) throw new Error('Invalid local preferences');
    await Storage.setItem(keys.preferences, JSON.stringify(safe));
  },
  readTripSnapshot: () => read(keys.trip, sanitizeSnapshot),
  async writeTripSnapshot(snapshot: TripRecoverySnapshot) {
    const safe = sanitizeSnapshot(snapshot);
    if (!safe) throw new Error('Invalid trip recovery metadata');
    await Storage.setItem(keys.trip, JSON.stringify(safe));
  },
  clearTripSnapshot: () => Storage.removeItem(keys.trip),
};
