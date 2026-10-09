import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const qa = require('../scripts/qa-session.cjs');

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; pid?: number;
    exitCode?: number | null; killed?: boolean; kill?: (signal?: string) => void };
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  return child;
}

test('Quick Tunnel parser accepts only HTTPS trycloudflare URLs from stdout or stderr', async () => {
  assert.deepEqual(qa.extractQuickTunnelUrls('http://bad.trycloudflare.com https://example.com'), []);
  assert.deepEqual(qa.extractQuickTunnelUrls('ready https://valid-name.trycloudflare.com/path'), ['https://valid-name.trycloudflare.com']);
  for (const stream of ['stdout', 'stderr'] as const) {
    const child = fakeChild(); const url = qa.waitForQuickTunnel(child, 1000);
    child[stream].write('https://qa-vima.trycloudflare.com\n');
    assert.equal(await url, 'https://qa-vima.trycloudflare.com');
  }
});

test('Quick Tunnel wait rejects timeout/no URL and multiple URLs', async () => {
  const child = fakeChild(); let expire!: () => void;
  const pending = qa.waitForQuickTunnel(child, 1000, { setTimeout(fn: () => void) { expire = fn; return 1; }, clearTimeout() {} });
  child.stdout.write('https://example.com\n'); expire();
  await assert.rejects(pending, /no publicó una URL/);
  const duplicate = fakeChild(); const rejected = qa.waitForQuickTunnel(duplicate, 1000);
  duplicate.stderr.write('https://one.trycloudflare.com https://two.trycloudflare.com');
  await assert.rejects(rejected, /más de un Quick Tunnel/);
});

test('light/dark child envs inject the public gateway without mutating or leaking parent theme', () => {
  const base = { TOMTOM_API_KEY: 'secret', VIMA_PRICING_CONFIG_PATH: 'pricing.json', VIMA_AUTH_CONFIG_PATH: 'auth.json',
    EXPO_PUBLIC_VIMA_THEME: 'stale' };
  const light = qa.buildChildEnvironments(base, 'light', 'https://vima.trycloudflare.com');
  const dark = qa.buildChildEnvironments(base, 'dark', 'https://vima.trycloudflare.com');
  assert.equal(light.metro.EXPO_PUBLIC_VIMA_API_BASE_URL, 'https://vima.trycloudflare.com');
  assert.equal(light.metro.EXPO_PUBLIC_VIMA_THEME, undefined);
  assert.equal(dark.metro.EXPO_PUBLIC_VIMA_THEME, 'dark');
  assert.equal(base.EXPO_PUBLIC_VIMA_THEME, 'stale');
  assert.equal(qa.validateRequiredEnvironment(base), true);
  assert.throws(() => qa.validateRequiredEnvironment({}), /TOMTOM_API_KEY.*VIMA_PRICING_CONFIG_PATH.*VIMA_AUTH_CONFIG_PATH/);
});

test('QA logging redacts required secret/config values and never serializes the environment', () => {
  const env = { TOMTOM_API_KEY: 'tom-secret', VIMA_PRICING_CONFIG_PATH: 'private-pricing', VIMA_AUTH_CONFIG_PATH: 'private-auth' };
  const result = qa.redactForLog('tom-secret private-pricing private-auth', env);
  assert.equal(result, '[TOMTOM_API_KEY] [VIMA_PRICING_CONFIG_PATH] [VIMA_AUTH_CONFIG_PATH]');
  assert.doesNotMatch(result, /tom-secret|private-pricing|private-auth/);
  const source = readFileSync('scripts/qa-session.cjs', 'utf8');
  assert.match(source, /output\.write\(redactForLog\(raw, env\)\)/);
});

test('cleanup is idempotent and closes the Windows process tree', async () => {
  const child = fakeChild(); child.pid = 42; child.exitCode = null; child.killed = false;
  const commands: unknown[][] = [];
  const registry = qa.createProcessRegistry({ platform: 'win32', spawnSyncImpl(command: string, args: string[]) {
    commands.push([command, args]); child.exitCode = 0; return { status: 0 };
  } });
  registry.register('gateway', child);
  const first = registry.cleanup(); const second = registry.cleanup();
  assert.equal(first, second); await first;
  assert.deepEqual(commands, [['taskkill', ['/pid', '42', '/T', '/F']]]);
});

test('a critical child exit reports the child and cleanup state suppresses false fatal errors', () => {
  const first = fakeChild(); const errors: Error[] = [];
  qa.watchCriticalChild(first, 'metro', () => false, (error: Error) => errors.push(error));
  first.emit('exit', 7, null); assert.match(errors[0]!.message, /metro.*7/);
  const stopping = fakeChild();
  qa.watchCriticalChild(stopping, 'adb', () => true, (error: Error) => errors.push(error));
  stopping.emit('exit', 0, null); assert.equal(errors.length, 1);
});

test('launcher source preserves exact Gateway → health → tunnel → Metro → ADB order without shell or fixed startup sleep', () => {
  const source = readFileSync('scripts/qa-session.cjs', 'utf8');
  const gateway = source.indexOf("start('gateway'");
  const health = source.indexOf('waitForHealth(', gateway);
  const tunnel = source.indexOf("start('tunnel'", health);
  const metro = source.indexOf("start('metro'", tunnel);
  const adb = source.indexOf("start('adb'", metro);
  assert.ok(gateway < health && health < tunnel && tunnel < metro && metro < adb);
  assert.doesNotMatch(source, /shell:\s*true|sleep\s+/);
  assert.match(source, /taskkill.*\/T.*\/F/s);
});
