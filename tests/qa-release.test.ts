import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { appVariant } from '../config/appVariant.cjs';
import { gatewayConfig } from '../gateway/config.ts';
import { createGateway } from '../gateway/server.ts';
import { createTomTomAdapter } from '../gateway/tomtom.ts';
import { createAuthConfig } from '../gateway/matching/auth.ts';
import { syntheticPricing } from './support/pricing-fixture.ts';

test('variants preserve base ID and require explicit congruent QA HTTPS config', () => {
 const qa = { EXPO_PUBLIC_VIMA_VARIANT: 'qa', EXPO_PUBLIC_VIMA_API_BASE_URL: 'https://qa.example.test', EXPO_PUBLIC_MAP_STYLE_URL: 'https://map.example.test/style' };
 assert.equal(appVariant(qa).suffix, '.qa');
 assert.equal(appVariant({ EXPO_PUBLIC_VIMA_VARIANT: 'development' }).suffix, '.dev');
 assert.equal(appVariant({ EXPO_PUBLIC_VIMA_VARIANT: 'production' }).suffix, '');
 for (const extra of [{EXPO_PUBLIC_VIMA_VARIANT:'bad'}, {EAS_BUILD_PROFILE:'production'}, {EXPO_PUBLIC_VIMA_FIXTURES:'1'}, {EXPO_PUBLIC_VIMA_API_BASE_URL:'http://qa.example.test'}]) assert.throws(() => appVariant({...qa,...extra}));
 const eas = JSON.parse(readFileSync('eas.json','utf8'));
 assert.equal(eas.build.qa.environment, 'preview'); assert.equal(eas.build.qa.channel,'qa'); assert.equal(eas.build.qa.developmentClient,undefined);
 assert.equal(eas.build.development.developmentClient,true); assert.equal(eas.build.production.channel,'production');
 assert.match(readFileSync('app.config.ts','utf8'), /policy: 'appVersion'/);
 for(const role of ['passenger','driver']) assert.match(readFileSync('app/qa/'+role+'.tsx','utf8'), /EXPO_PUBLIC_VIMA_VARIANT === 'qa'/);
});
test('Railway PORT wins; local defaults survive and QA requires an explicit durable directory', () => {
 assert.equal(gatewayConfig({}).host,'127.0.0.1');
 assert.equal(gatewayConfig({PORT:'4567',VIMA_GEO_PORT:'8787'}).port,4567);
 assert.equal(gatewayConfig({PORT:'4567'}).host,'0.0.0.0');
 assert.equal(gatewayConfig({VIMA_BACKEND_MODE:'qa',VIMA_GEO_RUNTIME_DIR:'/data'}).runtimeDir,'/data');
 assert.throws(()=>gatewayConfig({VIMA_BACKEND_MODE:'qa'})); assert.throws(()=>gatewayConfig({PORT:'bad'}));
});
test('QA authenticates every v1 boundary; readiness is durable and public, restart retains v4', async () => {
 const directory=mkdtempSync(join(tmpdir(),'vima-qa-')); const token='q'.repeat(40);
 const auth=createAuthConfig({accounts:[{accountId:'p',role:'passenger',token},{accountId:'d',role:'driver',token:'d'.repeat(40),driver:{name:'Test',rating:5},vehicle:{name:'Test',plate:'TEST',color:'Test'}}]});
 const config={...gatewayConfig({}),qa:true,runtimeDir:directory,rateLimit:1000};
 const adapter=createTomTomAdapter(undefined,config);
 const start=async (configured:boolean) => { const server=createGateway(config,adapter,{configured,auth,pricing:{status:'ready',config:syntheticPricing()}});server.listen(0,'127.0.0.1');await once(server,'listening');return {server,url:'http://127.0.0.1:'+(server.address() as AddressInfo).port}; };
 const stop=async (server:ReturnType<typeof createGateway>)=>{server.close();await once(server,'close');};
 try {
  let run=await start(false); assert.equal((await fetch(run.url+'/ready')).status,503); assert.equal((await fetch(run.url+'/health')).status,200); await stop(run.server);
  run=await start(true);
  try {
   assert.equal((await fetch(run.url+'/ready')).status,200);
   for(const path of ['/v1/geospatial/places/sessions','/v1/passenger/quotes','/v1/media/place-images/test/thumbnail','/v1/matching/identity','/v1/unknown']) {
    for(const authorization of ['', 'Bearer invalid']) assert.equal((await fetch(run.url+path,{headers:{authorization,'x-forwarded-proto':'https'}})).status,401);
   }
   assert.equal((await fetch(run.url+'/v1/geospatial/places/sessions',{method:'POST',headers:{authorization:'Bearer '+token,'x-forwarded-proto':'https','content-type':'application/json'},body:'{}'})).status,201);
   assert.equal((await fetch(run.url+'/v1/geospatial/places/sessions',{method:'POST',headers:{authorization:'Bearer '+token}})).status,403);
   assert.equal((await fetch(run.url+'/v1/passenger/quotes',{method:'POST',headers:{authorization:'Bearer '+'d'.repeat(40),'x-forwarded-proto':'https'}})).status,403);
  } finally {await stop(run.server);}
  const before=readFileSync(join(directory,'matching-v1.json'),'utf8');run=await start(true);await stop(run.server);
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'matching-v1.json'),'utf8')),JSON.parse(before));
  writeFileSync(join(directory,'matching-v1.json'),'corrupt evidence');
  assert.throws(()=>createGateway(config,adapter,{configured:true,auth,pricing:{status:'ready',config:syntheticPricing()}}),/invalid_matching_snapshot/);
  assert.equal(readFileSync(join(directory,'matching-v1.json'),'utf8'),'corrupt evidence');
 } finally {rmSync(directory,{recursive:true,force:true});}
});
