import assert from 'node:assert/strict';
import test from 'node:test';
import { productRoleApi, driverExit } from '../src/services/auth/productRole.ts';
import { ApiError, type ApiClient } from '../src/services/api/client.ts';
import type { MatchingClient } from '../src/services/matching/client.ts';
import { createProductAuthClient } from '../src/services/auth/productSession.ts';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRequire } from 'node:module';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createDriverJournal } from '../src/services/matching/driverJournal.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';

const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

test('D2 reopened product journal waits for a previous native write and cannot overwrite its commands or sequences', async () => {
  let value: string | null = null; let reads = 0; let release!: () => void; let writing!: () => void;
  const started = new Promise<void>(r => { writing = r; }); const barrier = new Promise<void>(r => { release = r; });
  let first = true;
  const storage = { getItem:async()=>{ reads++; return value; },setItem:async(_k:string,v:string)=>{ if(first){first=false;writing();await barrier;} value=v; },removeItem:async()=>{value=null;} };
  const snapshot = { accountId:'test',revision:1,assignment:{requestId:'request',value:{id:'assignment'},state:'IN_PROGRESS',lifecycle:{meter:{lastSequence:0}}} } as unknown as DriverState;
  const a=createDriverJournal(storage,'test',{} as MatchingClient,()=>{},'product');
  const b=createDriverJournal(storage,'test',{} as MatchingClient,()=>{},'product');
  const pending=a.enqueueTelemetry(snapshot,[0,0],100); await started;
  const next=b.enqueueTelemetry(snapshot,[0,0],101); await Promise.resolve(); await Promise.resolve(); assert.equal(reads,1);
  release(); await Promise.all([pending,next]);
  assert.deepEqual(JSON.parse(value!).entries.map((e:any)=>e.sample.sequence),[1,2]);
});

test('D2 real product gate restores approved/active Driver, denies Passenger, confirms exit and unmounts on logout', async () => {
  for (const mode of ['approved', 'passenger', 'restricted-trip']) {
    const session = { accountId: '00000000-0000-4000-8000-000000000001', displayName: 'Test', capabilities: mode === 'approved' ? ['passenger','driver'] : ['passenger'],
      accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresAt: Date.now() + 900000 };
    let saved: string | null = JSON.stringify(session); let offline = 0; const routes: string[] = []; const hints = new Map();
    const auth = createProductAuthClient('https://gateway.example', { read: async () => saved, write: async v => { saved = v; }, clear: async () => { saved = null; } },
      async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === '/v1/auth/me') return Response.json(session);
        if (path === '/v1/auth/logout') return Response.json({ status:'logged_out' });
        if (mode === 'passenger') return Response.json({ error:{ code:'driver_not_authorized' } },{ status:403 });
        assert.equal(new Headers(init?.headers).get('X-Vima-Operational-Context'), 'driver');
        if (path.endsWith('/availability')) offline++;
        return Response.json({ accountId: session.accountId, revision: 1, availability: offline ? 'OFFLINE' : 'AVAILABLE', expiryCount:0,
          location:{ coordinate:[0,0],receivedAt:Date.now() }, profile:{ driver:{name:'Test',rating:null,ratingCount:0},vehicle:{name:'Sedan',plate:'TEST',color:'White'} } });
      });
    // Active-trip exception is tested against the real server in driver-authority;
    // here provide a decoded matching snapshot to exercise the gate exception.
    const matching = mode === 'restricted-trip' ? { createMatchingClient: () => ({ driver: async () => ({ accountId:session.accountId,
      profile:{vehicle:{name:'Sedan',plate:'TEST',color:'White'}},assignment:{state:'IN_PROGRESS'} }) }) } : undefined;
    const h = createMapHarness({ fileOverrides:{
      'src/services/auth/productSession.ts':{ productAuthClient:()=>auth },
      'src/services/api/client.ts':{ ApiError },
      ...(matching ? { 'src/services/matching/client.ts':matching } : {}),
      'src/features/driver/DriverOperationalSurface.tsx':{ DriverSurface:(props: Record<string, unknown>)=>React.createElement('DriverSurface',props) },
      'src/features/auth/AccessSurface.tsx':{ AccessFrame:({children}:any)=>React.createElement('Frame',null,children), AccessNotice:({children}:any)=>React.createElement('Notice',null,children), RestorationSurface:()=>React.createElement('Restoring') },
      'src/design/components/VimaButton.tsx':{ VimaButton:(props:Record<string,unknown>)=>React.createElement('Button',props) },
    },externalOverrides:{
      'expo-router':{ useRouter:()=>router },
      '@tanstack/react-query':{ QueryClient,QueryClientProvider },
      'expo-sqlite/kv-store':{ getItem:async(k:string)=>hints.get(k)??null,setItem:async(k:string,v:string)=>{hints.set(k,v);},removeItem:async(k:string)=>{hints.delete(k);} },
      'react-native':{ View:'View',StyleSheet:{create:(v:unknown)=>v},BackHandler:{addEventListener:()=>({remove(){}})}, AppState:{currentState:'active',addEventListener:()=>({remove(){}})} },
    }});
    const router = { replace:(p:string)=>routes.push(p),dismissAll(){} };
    const tree = await h.render(React.createElement(h.load('src/features/driver/ProductDriverScreen.tsx').ProductDriverScreen));
    try {
      const surfaces = tree.root.findAllByType('DriverSurface');
      if(mode==='passenger') { assert.equal(surfaces.length,0); continue; }
      assert.equal(surfaces.length,1);
      if(mode==='restricted-trip') { assert.equal(surfaces[0].props.restricted,true); continue; }
      await h.act(async()=>{ surfaces[0].props.onLeave(); await new Promise(r=>setTimeout(r,10)); });
      assert.equal(offline,1); assert.equal(routes.at(-1),'/passenger');
      await h.act(async()=>{ await auth.logout(); });
      assert.equal(tree.root.findAllByType('DriverSurface').length,0); assert.equal(routes.at(-1),'/auth');
    } finally { await h.act(async()=>tree.unmount()); }
  }
});

test('D2 contexts fence late results and abort commands on role, account or session disposal', async () => {
  for (const reason of ['role', 'account', 'expired']) {
    let valid = true; let release!: (v: unknown) => void; let signal: AbortSignal | undefined;
    const api: ApiClient = { async request(input) { signal = input.signal;
      assert.equal(input.operationalContext, 'driver'); return input.decode(await new Promise(r => { release = r; })); } };
    const scope = productRoleApi(api, () => valid, 'driver');
    const pending = scope.api.request({ path: '/command', method: 'POST', decode: v => v });
    const rejected = assert.rejects(pending, /context_cancelled/);
    if (reason === 'role') scope.close(); else valid = false;
    release({ revision: 999 }); await rejected;
    if (reason === 'role') assert.equal(signal?.aborted, true);
    await assert.rejects(scope.api.request({ path: '/next', method: 'GET', decode: v => v }), /context_cancelled/);
  }
});

test('D2 network failures preserve context; current 403 closes operations, stale 403 cannot affect a replacement', async () => {
  let allowed = true; let denied = 0;
  const api: ApiClient = { async request() { throw new ApiError(403); } };
  const scope = productRoleApi(api, () => allowed, 'driver', () => denied++);
  await assert.rejects(scope.api.request({ path: '/state', method: 'GET', decode: v => v })); assert.equal(denied, 1);
  allowed = false;
  await assert.rejects(scope.api.request({ path: '/state', method: 'GET', decode: v => v })); assert.equal(denied, 1);
  const offline = productRoleApi({ async request() { throw new TypeError('offline'); } }, () => true, 'driver', () => denied++);
  await assert.rejects(offline.api.request({ path: '/state', method: 'GET', decode: v => v }), /offline/); assert.equal(denied, 1);
});

test('D2 exit keeps an ambiguous OFFLINE idempotent, checks assignment and never claims success on failure', async () => {
  let active = false; let fail = true; let availability = 'AVAILABLE'; const ids: string[] = [];
  const leave = driverExit({ driver: async () => ({ availability, ...(active ? { assignment: {} } : {}) }),
    availability: async (_availability: string, id: string) => { ids.push(id); if (fail) throw Error('offline'); availability = 'OFFLINE'; return { availability }; },
  } as unknown as MatchingClient);
  await assert.rejects(leave(), /offline/);
  fail = false; await leave(); assert.equal(ids[0], ids[1]);
  active = true; await assert.rejects(leave(), /trip_active/); assert.equal(ids.length, 2);
});

test('D2 explicit me revalidation observes suspension without rotating identity or using QA credentials', async () => {
  const session = { accountId: '00000000-0000-4000-8000-000000000001', displayName: 'Test', capabilities: ['passenger','driver'],
    accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresAt: Date.now() + 900000 };
  let caps = session.capabilities; let calls = 0;
  const auth = createProductAuthClient('https://gateway.example', { read: async () => JSON.stringify(session), write: async () => {}, clear: async () => {} },
    async () => { calls++; return Response.json({ ...session, capabilities: caps }); });
  assert.deepEqual((await auth.current())?.capabilities, ['passenger','driver']); const generation = auth.getSnapshot().generation;
  caps = ['passenger']; assert.deepEqual((await auth.current(undefined,true))?.capabilities, ['passenger']);
  assert.equal(calls, 2); assert.equal(auth.getSnapshot().generation, generation);
});

test('D2 reuses one operational surface, isolates journal namespace and leaves the QA gate exclusive to QA', () => {
  const qa = readFileSync('src/dev/driver/DriverLiveScreen.tsx','utf8');
  const product = readFileSync('src/features/driver/ProductDriverScreen.tsx','utf8');
  const shared = readFileSync('src/features/driver/DriverOperationalSurface.tsx','utf8');
  assert.match(qa, /LiveAccountGate role="driver"/); assert.match(qa, /DriverOperationalSurface/);
  assert.doesNotMatch(product + shared, /LiveAccountGate|readCredential|createApiClient/);
  assert.match(shared, /useDriverLifecycle/); assert.match(shared, /createDriverLocationSession/);
  assert.match(product, /driverExit\(matching\)/); assert.match(product, /QueryClientProvider/);
  assert.match(readFileSync('src/services/matching/driverJournal.ts','utf8'), /namespace \? 'product\.'/);
});
