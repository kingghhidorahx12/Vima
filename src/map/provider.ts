/** Transitional selection only; remove rollback after physical Android parity. */
export function resolveMapProvider(platform: string, configured: boolean, development: boolean) {
  if (platform !== 'android') return 'maplibre' as const;
  if (configured) return 'google' as const;
  if (development) return 'maplibre' as const;
  throw new Error('GOOGLE_MAPS_ANDROID_API_KEY is required for Android release');
}
export function optionalGoogleMapId(value: string | undefined) { return value?.trim() || undefined; }
