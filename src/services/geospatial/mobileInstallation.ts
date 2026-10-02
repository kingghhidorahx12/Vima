import Storage from 'expo-sqlite/kv-store';

const key = 'vima.installation.v1';
let cached: Promise<string> | undefined;
export function mobileInstallationId(): Promise<string> {
  cached ??= (async () => {
    const existing = await Storage.getItem(key);
    if (existing && /^[a-z0-9-]{16,128}$/.test(existing)) return existing;
    const value = `vima-${Date.now().toString(36)}-${Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0')).join('')}`;
    await Storage.setItem(key, value); return value;
  })();
  return cached;
}
