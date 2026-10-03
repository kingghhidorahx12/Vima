import { gatewayConfig } from './config.ts';
import { createTomTomAdapter } from './tomtom.ts';
import { createGateway } from './server.ts';
import { localPlaces } from './places.ts';
import { loadPricingConfig } from './pricing/config.ts';

const config = gatewayConfig();
const key = process.env.TOMTOM_API_KEY;
const server = createGateway(config, createTomTomAdapter(key, config), {
  pricing: await loadPricingConfig(process.env.VIMA_PRICING_CONFIG_PATH),
  configured: Boolean(key?.trim()), localPlaces,
  logger: entry => process.stdout.write(JSON.stringify(entry) + '\n'),
});
server.listen(config.port, config.host, () => process.stdout.write(JSON.stringify({ event: 'gateway-ready',
  host: config.host, port: config.port, configured: Boolean(key?.trim()) }) + '\n'));
server.on('error', () => { process.stderr.write('gateway_start_failed\n'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
