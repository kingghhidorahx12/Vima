/* Private operator CLI: run INSIDE the active Gateway container (Railway SSH).
 * Input JSON via stdin; credentials come only from the container environment. */
const { Buffer } = require('node:buffer');
async function main() {
  if (process.argv.length > 3 || process.argv[2] && process.argv[2] !== 'rollback-passenger-auth') throw new Error('Unknown administration command.');
  const secret = process.env.VIMA_DRIVER_ADMIN_SECRET;
  if (!secret || secret.length < 32) throw new Error('Driver administration is not configured in this container.');
  let body = ''; for await (const chunk of process.stdin) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new Error('Input too large.'); }
  JSON.parse(body);
  const port = Number(process.env.VIMA_DRIVER_ADMIN_PORT || 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid administration port.');
  const path = process.argv[2] === 'rollback-passenger-auth' ? 'rollback-passenger-auth' : 'driver-authority';
  const response = await fetch(`http://127.0.0.1:${port}/${path}`, { method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Administration rejected (${response.status}): ${result.error}`);
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
