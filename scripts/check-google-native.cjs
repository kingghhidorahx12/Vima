/* global __dirname */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sentinel = 'VIMA_TEST_ONLY_NOT_A_CREDENTIAL';
const manifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
function prebuild(env) {
  const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: root, encoding: 'utf8', env, timeout: 120000,
  });
  if (result.status !== 0) throw new Error('Android prebuild failed; config output withheld to protect credentials');
}
try {
  prebuild({ ...process.env, EXPO_NO_DOTENV: '1', GOOGLE_MAPS_ANDROID_API_KEY: sentinel });
  const xml = readFileSync(manifest, 'utf8');
  assert.match(xml, /android:name="com.google.android.geo.API_KEY"/);
  assert.ok(xml.includes('android:value="' + sentinel + '"'), 'SDK key did not reach AndroidManifest');
  assert.match(xml, /android.permission.ACCESS_FINE_LOCATION/);
  assert.doesNotMatch(xml, /android.permission.ACCESS_BACKGROUND_LOCATION/);
} finally {
  // Restore generated files from actual local configuration; never leave the test marker in a build.
  prebuild(process.env);
  assert.ok(!readFileSync(manifest, 'utf8').includes(sentinel));
}
console.log('Android prebuild OK: env-fed Maps metadata, foreground location preserved, test sentinel removed. No APK built.');
