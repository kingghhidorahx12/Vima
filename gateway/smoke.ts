import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { gatewayConfig } from './config.ts';
import { createGateway } from './server.ts';
import { createTomTomAdapter } from './tomtom.ts';
import { localPlaces } from './places.ts';
import { groundTruth, groundTruthMatch } from './groundTruth.ts';
import { createApiClient } from '../src/services/api/client.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { GeospatialError, type ResolvedPlace } from '../src/services/geospatial/contracts.ts';

async function main() {
  if (!process.env.TOMTOM_API_KEY?.trim()) { console.log('SKIP geo:smoke — falta TOMTOM_API_KEY en el proceso servidor'); return; }
  const config = gatewayConfig();
  const server = createGateway({ ...config, logging: false }, createTomTomAdapter(process.env.TOMTOM_API_KEY, config), { localPlaces });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = createGeospatialClient(createApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async () => null, { development: true }), config.upstreamTimeoutMs + 5000);
  const resolved: ResolvedPlace[] = [];
  let failed = false;
  const check = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); console.log(`PASS ${label}`); }
    catch (error) { failed = true; console.log(`FAIL ${label}: ${error instanceof GeospatialError ? error.code : 'expectation_not_met'}`); }
  };
  try {
    for (const entry of groundTruth) await check(entry.query, async () => {
      const session = await client.startPlacesSession();
      try {
        await session.autocomplete(entry.query, undefined, localPlaces[0]!.coordinate);
        const results = await session.search(entry.query, undefined, localPlaces[0]!.coordinate);
        // A local supplement must never make a provider ground-truth test pass.
        const match = results.find(place => place.provenance === 'provider' && groundTruthMatch(place, entry));
        if (!match) throw new Error('No provider match');
        const place = await session.resolve(match.id);
        if (!groundTruthMatch(place, entry) || !place.address) throw new Error('Resolved place mismatch');
        resolved.push(place);
      } finally { await session.close(); }
    });
    await check('Geocoding dirección Atlacomulco', async () => {
      const place = await client.geocode(groundTruth[0].reference, undefined, localPlaces[0]!.coordinate);
      if (place.regionId !== 'atlacomulco') throw new Error('Locality mismatch');
    });
    await check('Reverse Atlacomulco', async () => {
      const place = await client.reverseGeocode(localPlaces[0]!.coordinate);
      if (!place.address || place.regionId !== 'atlacomulco') throw new Error('Locality mismatch');
    });
    await check('Routing automóvil / tráfico live', async () => {
      if (resolved.length < 2) throw new Error('Missing provider points');
      const route = await client.route({ origin: resolved[0]!.coordinate, destination: resolved[1]!.coordinate, stops: [] });
      if (route.distanceMeters <= 0 || !route.trafficDurationSeconds) throw new Error('Missing live route');
    });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error('FAIL geo:smoke — gateway_unavailable'); process.exitCode = 1; });
