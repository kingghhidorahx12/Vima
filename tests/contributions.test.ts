import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gatewayConfig } from '../gateway/config.ts';
import { createGateway } from '../gateway/server.ts';
import { createTomTomAdapter } from '../gateway/tomtom.ts';

test('contribution is pending, idempotent across restart, bounded to configured area and absent from public catalog', async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), 'vima-contribution-test-'));
  const config = { ...gatewayConfig({}), runtimeDir, serviceAreaBounds: [-100, 19, -99, 20] as const };
  const body = { name: 'Lugar aportado', coordinate: [-99.8, 19.8], reference: 'Entrada' };
  const post = async (base: string, key: string, input: unknown) => fetch(base + '/v1/geospatial/place-contributions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(input),
  });
  const serve = async () => {
    const server = createGateway(config, createTomTomAdapter(undefined, config), { localPlaces: [] });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  };
  let active = await serve();
  try {
    const first = await post(active.base, 'contribution-test-0001', body);
    assert.equal(first.status, 201);
    const created = await first.json() as { contributionId: string; status: string; place: { id: string; coordinate: number[] } };
    assert.equal(created.status, 'pending'); assert.deepEqual(created.place.coordinate, body.coordinate);
    assert.equal((await post(active.base, 'contribution-test-0001', body)).status, 201);
    assert.equal((await post(active.base, 'contribution-test-0002', body)).status, 400);
    assert.equal((await post(active.base, 'contribution-test-0003', { ...body, coordinate: [-101, 19.8] })).status, 400);
    assert.equal((await post(active.base, 'short', body)).status, 400);
    const raw = await readFile(join(runtimeDir, 'place-contributions.v1.json'), 'utf8');
    assert.equal(JSON.parse(raw).contributions.length, 1);
    active.server.closeAllConnections(); await new Promise<void>(resolve => active.server.close(() => resolve()));
    active = await serve();
    const replay = await (await post(active.base, 'contribution-test-0001', body)).json() as { contributionId: string };
    assert.equal(replay.contributionId, created.contributionId);
  } finally {
    active.server.closeAllConnections(); await new Promise<void>(resolve => active.server.close(() => resolve()));
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
