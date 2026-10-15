import assert from 'node:assert/strict';
import test from 'node:test';
import { installedVersion } from '../src/features/auth/appVersion.ts';

test('version identifies the running OTA and binary separately, including embedded/development/unavailable launches', () => {
  const running = { isEnabled: true, isEmbeddedLaunch: false, updateId: '01a140b9-9aca-783d-90ef-6e927f761971' };
  assert.deepEqual(installedVersion('{"version":"1.2.3"}', running, false),
    { apkVersion: '1.2.3', update: 'OTA · 01a140b9-9aca' });
  assert.equal(installedVersion({ version: '1.2.3' }, { ...running, isEmbeddedLaunch: true }, false).update,
    'Incluida en el APK · 01a140b9-9aca');
  assert.equal(installedVersion(null, { isEmbeddedLaunch: true }, false).update, 'Incluida en el APK');
  assert.equal(installedVersion(undefined, running, true).update, 'Desarrollo');
  for (const config of [null, undefined, '{broken', { version: 23 }, { version: '' }]) {
    assert.equal(installedVersion(config, {}, false).apkVersion, 'No disponible');
  }
  for (const updates of [{}, { ...running, isEnabled: false }, { ...running, updateId: null }, { ...running, updateId: 'unknown' }]) {
    assert.equal(installedVersion({}, updates, false).update, 'No disponible');
  }
  // No latest/pending update, app-config OTA version or server guess is an input.
  assert.equal(installedVersion({ version: '1.2.3' }, running, false).apkVersion, '1.2.3');
});
