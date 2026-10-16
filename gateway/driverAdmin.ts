import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ProductAuthError } from './productAuth.ts';
import { MatchingError } from './matching/auth.ts';

/** Separate loopback listener. Never mounted on the public Gateway router. */
export function createDriverAdminServer(secret: string, gateway: {
  administerDriver(input: unknown): Promise<unknown>; rollbackPassengerAuth(): Promise<unknown>;
}) {
  if (secret.length < 32 || secret.length > 256 || /\s/.test(secret)) throw new Error('invalid_driver_admin_secret');
  const digest = (s: string) => createHash('sha256').update(s).digest();
  const expected = digest('Bearer ' + secret);
  return createServer({ requestTimeout: 5_000, maxHeaderSize: 4096 }, async (req, res) => {
    const reply = (status: number, value: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    };
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') ||
        !timingSafeEqual(expected, digest(req.headers.authorization ?? ''))) { reply(401, { error: 'admin_unauthorized' }); req.resume(); return; }
      if (req.method !== 'POST' || !['/driver-authority', '/rollback-passenger-auth'].includes(req.url ?? '')) { reply(404, { error: 'not_found' }); req.resume(); return; }
      let body = ''; for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        body += chunk; if (Buffer.byteLength(body) > 8192) { req.resume(); throw new ProductAuthError(413, 'admin_input_too_large'); }
      }
      let input: unknown; try { input = JSON.parse(body); } catch { throw new ProductAuthError(400, 'invalid_admin_json'); }
      if (req.url === '/rollback-passenger-auth' && JSON.stringify(input) !== '{}') throw new ProductAuthError(400, 'invalid_admin_input');
      reply(200, req.url === '/driver-authority' ? await gateway.administerDriver(input) : await gateway.rollbackPassengerAuth());
    } catch (error) {
      reply(error instanceof ProductAuthError || error instanceof MatchingError ? error.status : 503,
        { error: error instanceof ProductAuthError || error instanceof MatchingError ? error.code : 'admin_unavailable' });
    }
  });
}
