import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { productDriverFixture } from './support/product-driver-fixture.ts';
import { createDriverJournal } from '../src/services/matching/driverJournal.ts';
import { driverExit } from '../src/services/auth/productRole.ts';
import { ApiError } from '../src/services/api/client.ts';
import type { MatchingClient } from '../src/services/matching/client.ts';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import type { MatchingPassengerSnapshot } from '../src/services/matching/contracts.ts';

function legacyDecoder() {
  const require = createRequire(import.meta.url);
  const source = execFileSync('git',['show','55e004e:src/services/matching/decode.ts'],{encoding:'utf8'});
  const { code } = require('@babel/core').transformSync(source,{filename:'legacy-decoder.ts',configFile:false,babelrc:false,
    presets:[['@babel/preset-typescript']],plugins:['@babel/plugin-transform-modules-commonjs']});
  const module = {exports:{} as {decodeMatchingTrip: (value:unknown)=>MatchingPassengerSnapshot}};
  new Function('require','module','exports',code)(createRequire(resolve('src/services/matching/decode.ts')),module,module.exports);
  return module.exports.decodeMatchingTrip;
}

for (const suspended of [false, true]) test(`D3 OTP HTTP journey, private CLI, restart, lost receipt and cash; suspended=${suspended}`, async () => {
  const f = await productDriverFixture();
  try {
    await f.cliApprove(); await f.cliApprove(); // Same decision, no duplicate audit.
    const pm = f.passenger.matching('passenger'); let dm = f.driver.matching('driver');
    assert.deepEqual((await f.driver.auth.current(undefined, true))!.capabilities, ['passenger','driver']);
    const trip = await f.request(); const offer = await f.offer();
    const assigned = await dm.offerAction(offer.id, 'accept', 'accept');
    assert.equal(assigned.assignment!.state, 'ASSIGNED');
    const a = (await pm.fetch(trip.id)).assignment!;
    assert.equal(a.driver.rating, null); assert.equal(a.driver.ratingCount, 0);
    const oldDecode = legacyDecoder(); const snapshot = await pm.fetch(trip.id);
    assert.throws(()=>oldDecode(snapshot), /Invalid matching response/);
    assert.equal(oldDecode({...snapshot,assignment:{...a,driver:{name:a.driver.name,rating:4.9}}}).id,trip.id);
    assert.equal('pin' in assigned.assignment!.value, false);
    assert.deepEqual(await dm.offerAction(offer.id, 'accept', 'accept'), assigned);
    if (suspended) {
      await f.admin('suspend'); await assert.rejects(dm.availability('AVAILABLE', 'forbidden-work'), (e: unknown) => e instanceof ApiError && e.status === 403);
      await assert.rejects(dm.cancelAssignment(trip.id, 'forbidden-cancel', a.id), (e: unknown) => e instanceof ApiError && e.status === 403);
    }
    await dm.lifecycleCommand(trip.id, a.id, 'arrive', { name:'arrive' });
    assert.equal((await pm.fetch(trip.id)).requestState, 'ARRIVED_PICKUP');
    await assert.rejects(dm.lifecycleCommand(trip.id, a.id, 'wrong-pin', { name:'start', pin:a.pin === '1111' ? '2222' : '1111' }), (e: unknown) => e instanceof ApiError && e.status === 409);
    await dm.lifecycleCommand(trip.id, a.id, 'start', { name:'start', pin:a.pin });
    f.advance(1000); await dm.telemetry(trip.id, a.id, {sequence:1,capturedAt:f.now,coordinate:[0.2,0.2],heading:90});
    f.advance(10_000); const live = await dm.telemetry(trip.id,a.id,{sequence:2,capturedAt:f.now,coordinate:[0.2001,0.2001],heading:45});
    assert.deepEqual((await pm.fetch(trip.id)).assignment!.sample.coordinate,[0.2001,0.2001]);
    await f.restart(); f.passenger.reopen(); f.driver.reopen(); dm = f.driver.matching('driver');
    assert.equal((await f.passenger.matching('passenger').activeRequest())!.id,trip.id);
    assert.equal((await dm.driver()).assignment!.state,'IN_PROGRESS');
    await assert.rejects(driverExit(dm)(), /trip_active/);
    const data = new Map<string,string>();
    const storage = {getItem:async(k:string)=>data.get(k)??null,setItem:async(k:string,v:string)=>{data.set(k,v);},removeItem:async(k:string)=>{data.delete(k);}};
    const journal = createDriverJournal(storage,f.d.accountId,dm,()=>{},'product');
    await journal.enqueueCommand(live,'finish',{name:'finish',kind:'normal',finalTelemetrySequence:2});
    f.loseReceipt(`/v1/driver/assignments/${trip.id}/commands`);
    await assert.rejects(journal.sync()); assert.equal(await journal.pending(),1);
    const payment = await journal.sync(); assert.equal(payment.assignment!.state,'PAYMENT_PENDING'); assert.equal(await journal.pending(),0);
    const serverTrip = await f.passenger.matching('passenger').fetch(trip.id);
    const pricing = serverTrip.quote.pricing;
    assert.ok(pricing?.status === 'priced');
    assert.deepEqual(serverTrip.lifecycle!.settlement!.price, pricing.quote.price);
    await dm.lifecycleCommand(trip.id,a.id,'cash',{name:'cash_received'});
    assert.equal((await f.passenger.matching('passenger').fetch(trip.id)).requestState,'COMPLETED');
    assert.equal(await f.passenger.matching('passenger').activeRequest(), null);
    const audit = JSON.parse(await readFile(join(f.directory,'auth-v1.json'),'utf8')); assert.equal(audit.admin.filter((r:any)=>r.operationId==='cli-approve').length,1);
    await f.restart(); assert.equal((await f.passenger.matching('passenger').fetch(trip.id)).requestState,'COMPLETED');
    await dm.lifecycleCommand(trip.id,a.id,'cash',{name:'cash_received'}); // Receipt is still replayable after terminal/restart.
    if (suspended) await assert.rejects(dm.driver(), (e: unknown) => e instanceof ApiError && e.status===403);
    else assert.equal((await dm.driver()).lastTrip!.state,'COMPLETED');
  } finally { await f.close(); }
});

test('D3 HTTP suspension withdraws an offered job and survives restart, reapproval and definitive revocation', async () => {
  const f = await productDriverFixture();
  try {
    await f.admin('approve'); const dm=f.driver.matching('driver');
    await f.admin('suspend'); await assert.rejects(dm.driver(),(e:unknown)=>e instanceof ApiError&&e.status===403);
    await f.admin('approve'); const trip=await f.request(); const offer=await f.offer();
    await f.admin('suspend'); await f.restart();
    await assert.rejects(dm.offerAction(offer.id,'accept','late-accept'),(e:unknown)=>e instanceof ApiError&&e.status===403);
    assert.equal((await f.passenger.matching('passenger').fetch(trip.id)).requestState,'SEARCHING');
    const snapshot=JSON.parse(await readFile(join(f.directory,'matching-v1.json'),'utf8'));
    assert.equal(snapshot.offers[offer.id].state,'REVOKED');
    await f.admin('revoke'); await f.restart();
    assert.deepEqual((await f.driver.auth.current(undefined,true))!.capabilities,['passenger']);
    await assert.rejects(dm.availability('AVAILABLE','revoked'),(e:unknown)=>e instanceof ApiError&&e.status===403);
    f.offline(true); await assert.rejects(f.passenger.auth.current(undefined,true)); f.offline(false);
    assert.equal((await f.passenger.matching('passenger').activeRequest())!.id,trip.id);
  } finally { await f.close(); }
});

for (const adminFirst of [false,true]) test(`D3 concurrent HTTP suspension versus accept preserves first-commit authority, admin sent first=${adminFirst}`, async () => {
  const f=await productDriverFixture();
  try {
    await f.admin('approve'); const trip=await f.request(); const offer=await f.offer(); const dm=f.driver.matching('driver');
    const suspend=()=>f.admin('suspend'); const accept=()=>dm.offerAction(offer.id,'accept','race');
    const results=await Promise.allSettled(adminFirst?[suspend(),accept()]:[accept(),suspend()]);
    const accepted=results[adminFirst?1:0]!.status==='fulfilled';
    await f.restart(); const state=await f.passenger.matching('passenger').fetch(trip.id);
    assert.equal(state.requestState,accepted?'ASSIGNED':'SEARCHING');
    await assert.rejects(dm.availability('AVAILABLE','no-new-work'),(e:unknown)=>e instanceof ApiError&&e.status===403);
    if(accepted) assert.equal((await dm.driver()).assignment!.value.id,state.assignment!.id);
    else await assert.rejects(dm.driver(),(e:unknown)=>e instanceof ApiError&&e.status===403);
  } finally { await f.close(); }
});

test('D3 every Driver HTTP operation rejects Passenger-only authority, spoofed context, and a revoked session', async () => {
  const f = await productDriverFixture();
  try {
    const endpoints = [ ['GET','/v1/driver/state'],['GET','/v1/driver/changes?afterRevision=0'],['GET','/v1/matching/session'],
      ['POST','/v1/driver/availability'],['POST','/v1/driver/location'],['POST','/v1/driver/offers/offer/accept'],['POST','/v1/driver/offers/offer/reject'],
      ['POST','/v1/driver/assignments/request/commands'],['POST','/v1/driver/assignments/request/telemetry'],['POST','/v1/driver/assignments/request/cancel'] ];
    for (const [method,path] of endpoints) {
      await assert.rejects(f.passenger.auth.api.request({path:path!,method:method as 'GET'|'POST',operationalContext:'driver',body:method==='POST'?{}:undefined,decode:v=>v}),
        (e:unknown)=>e instanceof ApiError&&e.status===403, path);
    }
    await f.admin('approve'); const stolen = f.driver.reopen(); await stolen.current();
    f.driver.reopen(); await f.driver.auth.current(); // Separate client, same stored session.
    await f.admin('security_block');
    await assert.rejects(stolen.api.request({path:'/v1/driver/state',method:'GET',operationalContext:'driver',decode:v=>v}), (e:unknown)=>e instanceof ApiError&&e.status===403);
    await f.driver.auth.logout();
    await assert.rejects(stolen.api.request({path:'/v1/driver/state',method:'GET',operationalContext:'driver',decode:v=>v}), (e:unknown)=>e instanceof ApiError&&e.status===401);
    assert.equal(stolen.getSnapshot().reason,'expired');
    assert.ok(await f.passenger.auth.current());
  } finally { await f.close(); }
});

test('D3 exit cannot trust an old OFFLINE receipt when a new assignment wins during the retry', async () => {
  let reads=0;
  const leave = driverExit({driver:async()=>++reads===1?{availability:'AVAILABLE'}:{availability:'ASSIGNED',assignment:{}},
    availability:async()=>({availability:'OFFLINE'})} as unknown as MatchingClient);
  await assert.rejects(leave(), /trip_active|offline_unconfirmed/);
});

test('D3 real HTTP exit retry rejects an idempotent OFFLINE receipt older than the accepted assignment', async () => {
  const f = await productDriverFixture();
  try {
    await f.admin('approve'); const dm = f.driver.matching('driver'); let offerId = '';
    await dm.availability('AVAILABLE','initial-locating');
    const leave = driverExit({ driver:()=>dm.driver(), availability: async (availability, id) => {
      if (offerId) await dm.offerAction(offerId,'accept','racing-accept');
      return dm.availability(availability,id);
    } });
    f.loseReceipt('/v1/driver/availability'); await assert.rejects(leave());
    const trip = await f.request(); offerId = (await f.offer()).id;
    await assert.rejects(leave(), /trip_active|offline_unconfirmed/);
    assert.equal((await f.passenger.matching('passenger').fetch(trip.id)).requestState,'ASSIGNED');
  } finally { await f.close(); }
});
