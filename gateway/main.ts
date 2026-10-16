import { gatewayConfig } from './config.ts';
import { createTomTomAdapter } from './tomtom.ts';
import { createGateway } from './server.ts';
import { localPlaces } from './places.ts';
import { loadPricingConfig } from './pricing/config.ts';
import { loadPlaceMediaCatalog } from './placeMedia.ts';
import { loadAuthConfig } from './matching/auth.ts';
import { createProductAuth, createTwilioVerifyProvider } from './productAuth.ts';
import { createDriverAdminServer } from './driverAdmin.ts';

const config = gatewayConfig();
const key = process.env.TOMTOM_API_KEY;
const pricing = await loadPricingConfig(process.env.VIMA_PRICING_CONFIG_PATH);
if (process.env.VIMA_PRODUCT_AUTH_PROVIDER && process.env.VIMA_PRODUCT_AUTH_PROVIDER !== 'twilio') throw new Error('invalid_product_auth_provider');
const productAuthEnabled = !config.qa && process.env.VIMA_PRODUCT_AUTH_PROVIDER === 'twilio';
const productAuth = productAuthEnabled
  ? createProductAuth({ runtimeDir: config.runtimeDir ?? '.runtime', secret: process.env.VIMA_PRODUCT_AUTH_SECRET ?? '',
    provider: createTwilioVerifyProvider({ accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? '', authToken: process.env.TWILIO_AUTH_TOKEN ?? '' }) })
  : undefined;
const server = createGateway(config, createTomTomAdapter(key, config), {
  pricing,
  // Enabling product auth removes the QA-token authority from production.
  auth: productAuthEnabled ? undefined : loadAuthConfig(process.env.VIMA_AUTH_CONFIG_PATH),
  productAuth,
  media: await loadPlaceMediaCatalog(process.env.VIMA_PLACE_MEDIA_DIR, localPlaces),
  configured: Boolean(key?.trim()), localPlaces,
  logger: entry => process.stdout.write(JSON.stringify(entry) + '\n'),
});
server.listen(config.port, config.host, () => process.stdout.write(JSON.stringify({ event: 'gateway-ready',
  host: config.host, port: config.port, configured: Boolean(key?.trim()), pricingStatus: pricing.status,
  ...(pricing.status === 'ready' ? { pricingVersion: pricing.config.version } : {}) }) + '\n'));
server.on('error', () => { process.stderr.write('gateway_start_failed\n'); process.exitCode = 1; });
if (productAuthEnabled && process.env.VIMA_DRIVER_ADMIN_SECRET) {
  const port = Number(process.env.VIMA_DRIVER_ADMIN_PORT ?? 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === config.port) throw new Error('invalid_driver_admin_port');
  const admin = createDriverAdminServer(process.env.VIMA_DRIVER_ADMIN_SECRET, server);
  admin.listen(port, '127.0.0.1');
  admin.on('error', () => { server.close(); process.exitCode = 1; });
  server.on('close', () => admin.close());
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
