import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import { matchingHttp } from '../gateway/matching/http.ts';
import { setup, p, driver, flush } from './support/lifecycle-fixture.ts';
import { decodeDriver, decodeMatchingTrip } from '../src/services/matching/decode.ts';

test('authenticated lifecycle HTTP commands/telemetry, allowlists, PIN separation and long-poll revisions', async () => {
  const f = setup(1); try {
    await f.ready(); await f.available(1); const trip = await f.c.create(p, 'quote', 'request'); await flush();
    await f.c.offerAction(driver(1), (await f.c.driver(driver(1))).offer!.id, 'accept', 'accept');
    const a = (await f.c.fetch(p, trip.id)).assignment!;
    const call = async (path: string, body: unknown, token = f.tokens[2]) => {
      let result: unknown;
      await matchingHttp({ method: 'POST', headers: { authorization: `Bearer ${token}` } } as IncomingMessage,
        path, f.auth, f.c, async () => body, new AbortController().signal, (status, value) => { assert.equal(status, 200); result = value; });
      return decodeDriver(result);
    };
    const commands = `/v1/driver/assignments/${trip.id}/commands`;
    await assert.rejects(call(commands, { assignmentId: a.id, commandId: 'arrive', command: { name: 'arrive' } }, f.tokens[0]), /forbidden/);
    await assert.rejects(call(commands, { assignmentId: a.id, commandId: 'arrive', command: { name: 'arrive', bypass: true } }));
    await f.c.location(driver(1), [0.2, 0.2], 0, 'pickup');
    const before = await f.c.driver(driver(1)); const poll = f.c.wait(driver(1), undefined, before.revision);
    const arrived = await call(commands, { assignmentId: a.id, commandId: 'arrive', command: { name: 'arrive' } });
    assert.equal((await poll).revision, arrived.revision);
    assert.equal('pin' in arrived.assignment!.value, false);
    await assert.rejects(call(`/v1/driver/assignments/${trip.id}/cancel`, { actionId: 'cancel-no-assignment-id' }));
    const inProgress = await call(commands, { assignmentId: a.id, commandId: 'pin', command: { name: 'start', pin: a.pin } });
    assert.equal(inProgress.assignment!.state, 'IN_PROGRESS');
    const poison = structuredClone(inProgress); (poison.assignment!.value as Record<string, unknown>).pin = a.pin;
    assert.throws(() => decodeDriver(poison));
    await call(`/v1/driver/assignments/${trip.id}/telemetry`, { assignmentId: a.id, sample: { sequence: 1, capturedAt: f.clock.now(), coordinate: [0.2, 0.2] } });
    await call(commands, { assignmentId: a.id, commandId: 'finish', command: { name: 'finish', kind: 'early', finalTelemetrySequence: 1 } });
    const closed = await call(commands, { assignmentId: a.id, commandId: 'paid', command: { name: 'cash_received' } });
    assert.equal(closed.lastTrip?.state, 'COMPLETED');
    assert.equal(decodeMatchingTrip(await f.c.fetch(p, trip.id)).phase, 'completed');
  } finally { f.close(); }
});
