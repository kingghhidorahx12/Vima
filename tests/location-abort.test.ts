import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GeospatialError } from '../src/services/geospatial/contracts.ts';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core') as {
  transformSync: (source: string, options: Record<string, unknown>) => { code?: string } | null;
};
const filename = fileURLToPath(new URL('../src/services/location/currentPlace.ts', import.meta.url));

function loadLocation(location: Record<string, unknown>) {
  const transformed = transformSync(readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true }]], plugins: ['@babel/plugin-transform-modules-commonjs'] })?.code;
  assert.ok(transformed);
  const module = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', transformed)((id: string) => id === 'expo-location' ? location :
    id === '../geospatial/contracts' ? { GeospatialError } : assert.fail(`Unexpected import: ${id}`), module, module.exports);
  return module.exports.locateCurrentPlace as (signal?: AbortSignal) => Promise<unknown>;
}

test('location reaches permissions and coordinates with a Hermes-style signal lacking throwIfAborted', async () => {
  const calls: string[] = [];
  const locate = loadLocation({ Accuracy: { Balanced: 1 },
    async requestForegroundPermissionsAsync() { calls.push('permission'); return { granted: true }; },
    async getCurrentPositionAsync() { calls.push('position'); return { coords: { longitude: -99.88, latitude: 19.79 } }; },
    async reverseGeocodeAsync() { calls.push('reverse'); return [{ street: 'Centro', city: 'Atlacomulco' }]; } });
  const signal = { aborted: false } as AbortSignal;
  assert.equal('throwIfAborted' in signal, false);
  const place = await locate(signal) as { coordinate: readonly number[]; address: string };
  assert.deepEqual(calls, ['permission', 'position', 'reverse']);
  assert.deepEqual(place.coordinate, [-99.88, 19.79]);
  assert.ok(place.address.includes('Atlacomulco'));
});

test('location cancellation checks aborted before permissions and after an asynchronous permission response', async () => {
  let permissionCalls = 0; let positionCalls = 0;
  const signal = { aborted: true } as AbortSignal;
  const locate = loadLocation({ Accuracy: { Balanced: 1 },
    async requestForegroundPermissionsAsync() { permissionCalls++; (signal as { aborted: boolean }).aborted = true; return { granted: true }; },
    async getCurrentPositionAsync() { positionCalls++; return { coords: { longitude: -99.88, latitude: 19.79 } }; } });
  await assert.rejects(locate(signal), { code: 'cancelled' });
  assert.equal(permissionCalls, 0);
  (signal as { aborted: boolean }).aborted = false;
  await assert.rejects(locate(signal), { code: 'cancelled' });
  assert.equal(permissionCalls, 1); assert.equal(positionCalls, 0);
});
