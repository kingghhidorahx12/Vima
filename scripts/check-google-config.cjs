/* global __dirname */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cli = require.resolve('expo/bin/cli');
const sentinel = 'VIMA_TEST_ONLY_NOT_A_CREDENTIAL';
function resolved(type, key) {
  const result = spawnSync(process.execPath, [cli, 'config', '--type', type, '--json'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, EXPO_NO_DOTENV: '1', GOOGLE_MAPS_ANDROID_API_KEY: key },
  });
  if (result.status !== 0) throw new Error('Expo config validation failed; output withheld to avoid credential disclosure');
  return JSON.parse(result.stdout);
}
const full = resolved('prebuild', sentinel);
assert.equal(full.android.config.googleMaps.apiKey, sentinel);
assert.equal(full.extra.googleMapsAndroidConfigured, true);
assert.equal(full.android.package, 'com.kingghhidorahx12.vima');
assert.equal(full.owner, 'kingghidorahx12');
assert.equal(full.extra.eas.projectId, '30422aec-d22b-40f0-8008-c6a316633fd8');
const publicConfig = resolved('public', sentinel);
assert.ok(!JSON.stringify(publicConfig).includes(sentinel), 'Maps SDK key leaked into public config');
assert.equal(publicConfig.extra.googleMapsAndroidConfigured, true);
const missing = resolved('public', '');
assert.equal(missing.extra.googleMapsAndroidConfigured, false);
console.log('Expo Google config OK: env injection, optional key, identity preserved, public config excludes SDK key.');
