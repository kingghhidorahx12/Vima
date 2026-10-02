// Urban basemap for development only; production must provide its own URL.
const developmentDemoStyle = 'https://tiles.openfreemap.org/styles/positron';

export function resolveMapStyle(value: string | undefined, development: boolean): string {
  const configured = value?.trim();
  if (!configured) {
    if (development) return developmentDemoStyle;
    throw new Error('EXPO_PUBLIC_MAP_STYLE_URL is required outside development.');
  }
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error('EXPO_PUBLIC_MAP_STYLE_URL must be an absolute HTTP(S) URL.'); }
  if (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) {
    throw new Error('EXPO_PUBLIC_MAP_STYLE_URL must use HTTPS outside development.');
  }
  if (url.username || url.password) throw new Error('Public map style URLs cannot contain credentials.');
  return configured;
}
