import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createPopularityRepository, validatePlaceSignal } from '../gateway/popularity.ts';
import { localPlaces } from '../gateway/places.ts';
import { createGateway } from '../gateway/server.ts';
import { gatewayConfig } from '../gateway/config.ts';
import { createTomTomAdapter } from '../gateway/tomtom.ts';

test('only allowed place actions count; event replay and same-installation repeats cannot inflate a day', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-popularity-test-'));
  const now = Date.UTC(2026, 9, 2, 12);
  const repository = createPopularityRepository(directory, localPlaces, () => now);
  const base = { eventId: 'signal-test-event-0001', type: 'place_selected' as const,
    canonicalPlaceId: localPlaces[0]!.id, regionId: 'atlacomulco', occurredAt: now,
    installationId: 'installation-test-0001' };
  try {
    assert.deepEqual((await repository.discovery('atlacomulco')).popular, []);
    assert.equal((await repository.discovery('atlacomulco')).featured.length, 2);
    assert.deepEqual(await repository.signal(base), { accepted: true });
    assert.deepEqual(await repository.signal(base), { accepted: false });
    assert.deepEqual(await repository.signal({ ...base, eventId: 'signal-test-event-0002' }), { accepted: false });
    assert.deepEqual(await repository.signal({ ...base, eventId: 'signal-test-event-0003', type: 'destination_confirmed' }),
      { accepted: true });
    assert.deepEqual(await repository.signal({ ...base, eventId: 'signal-test-event-0004', installationId: 'installation-test-0002' }),
      { accepted: true });
    assert.equal((await repository.discovery('atlacomulco')).popular[0]?.id, localPlaces[0]!.id);
    const data = await readFile(join(directory, 'place-popularity.v1.json'), 'utf8');
    const daily = JSON.parse(data).daily[0];
    assert.equal(daily.uniqueSelected, 2); assert.equal(daily.uniqueConfirmed, 1);
    assert.doesNotMatch(data, /installation-test|search_performed|query/);
    const restarted = createPopularityRepository(directory, localPlaces, () => now);
    assert.deepEqual(await restarted.signal(base), { accepted: false });
    for (const invalid of [{ ...base, type: 'search_performed' }, { ...base, canonicalPlaceId: 'contribution:pending' },
      { ...base, query: 'private text' }, { ...base, regionId: 'unknown' }])
      assert.throws(() => validatePlaceSignal(invalid, now), /invalid_result/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('discovery and signal endpoints expose bounded verified places without manufacturing popularity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-discovery-test-'));
  const config = { ...gatewayConfig({}), runtimeDir: directory };
  const server = createGateway(config, createTomTomAdapter(undefined, config), { localPlaces });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const empty = await (await fetch(`${base}/v1/geospatial/discovery?regionId=atlacomulco`)).json();
    assert.deepEqual(empty.popular, []); assert.equal(empty.featured.length, 2);
    const response = await fetch(`${base}/v1/geospatial/place-signals`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        eventId: 'signal-http-event-0001', type: 'destination_confirmed', canonicalPlaceId: localPlaces[0]!.id,
        regionId: 'atlacomulco', occurredAt: Date.now(), installationId: 'installation-http-0001',
      }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).accepted, true);
    const live = await (await fetch(`${base}/v1/geospatial/discovery?regionId=atlacomulco`)).json();
    assert.equal(live.popular[0]?.id, localPlaces[0]!.id);
    assert.equal((await fetch(`${base}/v1/geospatial/discovery?regionId=invalid`)).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
