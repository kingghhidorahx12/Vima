export interface InstalledUpdate {
  readonly isEnabled?: boolean;
  readonly isEmbeddedLaunch?: boolean;
  readonly updateId?: string | null;
}

/** Read the binary's Expo config, never the potentially newer OTA expoConfig. */
export function installedVersion(embeddedConfig: unknown, updates: InstalledUpdate, development: boolean) {
  let apkVersion = 'No disponible';
  try {
    const config = typeof embeddedConfig === 'string' ? JSON.parse(embeddedConfig) : embeddedConfig;
    if (config && typeof config.version === 'string' && config.version.trim()) apkVersion = config.version.trim();
  } catch { /* Missing/malformed native metadata is not an authentication error. */ }
  const id = typeof updates.updateId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.updateId)
    ? updates.updateId.slice(0, 13).toLowerCase() : undefined;
  const update = development ? 'Desarrollo' : updates.isEmbeddedLaunch
    ? `Incluida en el APK${id ? ` · ${id}` : ''}`
    : updates.isEnabled && id ? `OTA · ${id}` : 'No disponible';
  return { apkVersion, update };
}
