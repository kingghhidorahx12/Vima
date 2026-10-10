import type { VimaThemeName } from './index';
import { sanitizePreferences, type LocalPreferences } from '../../services/storage/contracts.ts';
import { withDeadline } from '../../services/api/deadline.ts';

interface PreferenceStorage {
  readPreferences(): Promise<LocalPreferences | null>;
  writePreferences(value: LocalPreferences): Promise<void>;
}
/** One preference record and one ordered writer for the lifetime of RootProviders. */
export function createThemeControl(storage: PreferenceStorage, env: string | undefined) {
  const fallback: VimaThemeName = env === 'dark' ? 'dark' : 'light';
  let state = { ready: false, name: fallback, reducedMotion: 'reduce' as LocalPreferences['reducedMotion'] };
  let preferences: LocalPreferences = { version: 1, reducedMotion: 'system' };
  let loading: Promise<void> | undefined; let writing = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  const setTheme = (name: VimaThemeName) => {
    if (!state.ready || (name !== 'light' && name !== 'dark')) return;
    preferences = { ...preferences, themeName: name };
    const next = preferences;
    state = { ...state, name }; publish();
    writing = writing.catch(() => {}).then(() => storage.writePreferences(next));
    void writing.catch(() => {}); // Storage errors never roll back a newer in-memory intention.
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    load: () => loading ??= (async () => {
      try { preferences = sanitizePreferences(await withDeadline(storage.readPreferences(), 8000)) ?? preferences; }
      catch { preferences = { version: 1, reducedMotion: 'reduce' }; }
      state = { ready: true, name: preferences.themeName ?? fallback, reducedMotion: preferences.reducedMotion }; publish();
    })(),
    setTheme,
    toggleTheme: () => setTheme(state.name === 'light' ? 'dark' : 'light'),
    flushed: () => writing,
  };
}
