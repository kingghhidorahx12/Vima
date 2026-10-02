import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { resolveMapStyle } from '../src/map/style.ts';
import { mapTilerUserAgentHeader } from '../src/map/requestPolicy.ts';
import { createMotionPolicy } from '../src/motion/policy.ts';
import { canInterpolateVehicle, interpolateCoordinate, validateVehicleSample, type VehicleMotionConfig } from '../src/map/vehicleMotion.ts';
import { sanitizePreferences, sanitizeSnapshot } from '../src/services/storage/contracts.ts';
import { reconcileTrip, type AuthoritativeTrip, type TripGateway } from '../src/features/trip/contracts.ts';
import { executeConfirmedCommand, tripKey, tripQueryOptions } from '../src/features/trip/queries.ts';
import { createApiClient } from '../src/services/api/client.ts';

test('development map defaults to OpenFreeMap Positron; production requires explicit HTTPS style', () => {
  assert.equal(resolveMapStyle(undefined, true), 'https://tiles.openfreemap.org/styles/positron');
  assert.equal(resolveMapStyle(' ', true), 'https://tiles.openfreemap.org/styles/positron');
  assert.equal(resolveMapStyle('https://example.test/dev.json', true), 'https://example.test/dev.json');
  assert.throws(() => resolveMapStyle(undefined, false), /EXPO_PUBLIC_MAP_STYLE_URL is required/);
  assert.throws(() => resolveMapStyle('', false), /EXPO_PUBLIC_MAP_STYLE_URL is required/);
  assert.throws(() => resolveMapStyle('http://example.test/style.json', false));
  assert.throws(() => resolveMapStyle('https://user:secret@example.test/style.json', true));
  assert.equal(resolveMapStyle('https://example.test/style.json', false), 'https://example.test/style.json');
});

test('MapTiler request identity is restricted to its HTTPS hosts', () => {
  assert.equal(mapTilerUserAgentHeader.name, 'User-Agent');
  assert.equal(mapTilerUserAgentHeader.value, 'VimaMobile/com.kingghhidorahx12.vima');
  assert.match('https://api.maptiler.com/maps/style.json', mapTilerUserAgentHeader.match);
  assert.doesNotMatch('https://tiles.openfreemap.org/styles/positron', mapTilerUserAgentHeader.match);
  assert.doesNotMatch('https://maptiler.com.evil.test/style.json', mapTilerUserAgentHeader.match);
});

test('reduced motion disables vehicle interpolation, route reveal and camera animation', () => {
  assert.deepEqual(createMotionPolicy(true), {
    reducedMotion: true, allowVehicleInterpolation: false, allowRouteReveal: false, allowCameraAnimation: false,
    navigation: 'fade', routeReveal: 'fade', allowAmbientGradient: false, allowDecorativeLoops: false,
    searchPulse: 'static', allowScaleTransforms: false,
  });
});

// Numerical motion values below are isolated test inputs, not application defaults.
const motion: VehicleMotionConfig = { durationMs: 100, easing: (value) => value, shouldSnap: () => false };
const sample = { coordinate: [1, 1] as const, heading: 0, sequence: 1 };
test('vehicle snaps when config is missing, reconnected, reduced, or injected jump criterion matches', () => {
  assert.equal(canInterpolateVehicle([0, 0], sample, false), false);
  assert.equal(canInterpolateVehicle(null, sample, false, motion), false);
  assert.equal(canInterpolateVehicle([0, 0], sample, true, motion), false);
  assert.equal(canInterpolateVehicle([0, 0], { ...sample, reconnected: true }, false, motion), false);
  assert.equal(canInterpolateVehicle([0, 0], sample, false, { ...motion, shouldSnap: () => true }), false);
  assert.equal(canInterpolateVehicle([0, 0], sample, false, motion), true);
});

test('vehicle coordinates reject invalid input and cross the dateline by the short path', () => {
  assert.equal(validateVehicleSample({ ...sample, coordinate: [NaN, 1] }), false);
  assert.equal(validateVehicleSample({ ...sample, coordinate: [1, 91] }), false);
  assert.deepEqual(interpolateCoordinate([179, 0], [-179, 2], 0.5), [-180, 1]);
});

test('KV snapshot discards sensitive extra fields and never includes server phase', () => {
  const safe = { version: 1, tripId: 'trip-fixture', revision: 2, savedAt: '2026-09-29T00:00:00Z' };
  assert.deepEqual(sanitizeSnapshot({ ...safe, token: 'test-only', card: 'test-only', phase: 'fixture', coordinate: [1, 1] }), safe);
  assert.equal(sanitizeSnapshot({ ...safe, revision: -1 }), null);
  assert.equal(sanitizeSnapshot({ ...safe, version: 99 }), null);
  assert.equal(sanitizeSnapshot(null), null);
  assert.deepEqual(sanitizePreferences({ version: 1, reducedMotion: 'reduce', secret: 'test-only' }), { version: 1, reducedMotion: 'reduce' });
});

const initial: AuthoritativeTrip = { id: 'trip-fixture', revision: 1, phase: 'server-fixture-a' };
const command = { tripId: initial.id, commandId: 'test-command', name: 'test-only', payload: {} };

test('critical action leaves cache unchanged until server confirmation', async () => {
  const client = new QueryClient();
  client.setQueryData(tripKey(initial.id), initial);
  let resolve!: (trip: AuthoritativeTrip) => void;
  const gateway: TripGateway = { fetch: async () => initial, execute: () => new Promise((done) => { resolve = done; }) };
  const pending = executeConfirmedCommand(client, gateway, command);
  assert.deepEqual(client.getQueryData(tripKey(initial.id)), initial);
  const confirmed = { ...initial, revision: 2, phase: 'server-fixture-b' };
  resolve(confirmed);
  await pending;
  assert.deepEqual(client.getQueryData(tripKey(initial.id)), confirmed);
  client.clear();
});

test('failed action rejects and does not update state', async () => {
  const client = new QueryClient();
  client.setQueryData(tripKey(initial.id), initial);
  const gateway: TripGateway = { fetch: async () => initial, execute: async () => { throw new Error('offline'); } };
  await assert.rejects(executeConfirmedCommand(client, gateway, command), /offline/);
  assert.deepEqual(client.getQueryData(tripKey(initial.id)), initial);
  client.clear();
});

test('stale fetch or command cannot roll back a newer authoritative revision', async () => {
  const current = { ...initial, revision: 4 };
  assert.equal(reconcileTrip(current, initial), current);
  assert.throws(() => reconcileTrip(current, { ...initial, id: 'another-trip' }));
  const client = new QueryClient();
  client.setQueryData(tripKey(initial.id), current);
  const gateway: TripGateway = { fetch: async () => initial, execute: async () => initial };
  await client.fetchQuery(tripQueryOptions(gateway, initial.id));
  await executeConfirmedCommand(client, gateway, command);
  assert.deepEqual(client.getQueryData(tripKey(initial.id)), current);
  client.clear();
});

test('API rejects another origin before reading credentials or sending a request', async () => {
  let credentialRead = false;
  const api = createApiClient('https://api.example.test/', async () => { credentialRead = true; return null; });
  await assert.rejects(api.request({ method: 'GET', path: 'https://other.test/', decode: (value) => value }));
  assert.equal(credentialRead, false);
});
