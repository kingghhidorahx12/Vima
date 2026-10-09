import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

test('Windows cloudflared prefers the validated repo-local tool and falls back to validated PATH', () => {
  const cwd = 'C:\\repo'; const local = path.join(cwd, '.runtime', 'tools', 'cloudflared.exe');
  const calls: string[] = [];
  const localResult = qa.resolveCloudflared(cwd, { platform: 'win32', existsSyncImpl: (value: string) => value === local,
    spawnSyncImpl(command: string, args: string[]) { calls.push(`${command} ${args.join(' ')}`); return { status: 0 }; } });
  assert.equal(localResult, local); assert.deepEqual(calls, [`${local} --version`]);

  calls.length = 0;
  const fallback = qa.resolveCloudflared(cwd, { platform: 'win32', existsSyncImpl: () => true,
    spawnSyncImpl(command: string, args: string[]) {
      calls.push(`${command} ${args.join(' ')}`); return command === 'cloudflared' ? { status: 0 } : { status: 1 };
    } });
  assert.equal(fallback, 'cloudflared');
  assert.deepEqual(calls, [`${local} --version`, 'cloudflared --version']);

  assert.throws(() => qa.resolveCloudflared(cwd, { platform: 'win32', existsSyncImpl: () => false,
    spawnSyncImpl() { return { status: 1 }; } }), /\.runtime\/tools\/cloudflared\.exe ni en PATH/);
});

test('ADB absence, empty, multiple, unauthorized, offline and invalid output remain optional', () => {
  const result = (devices: unknown, version = { status: 0 }) => qa.detectAdb({ spawnSyncImpl(_command: string, args: string[]) {
    return args[0] === 'version' ? version : devices;
  } });
  assert.match(result(undefined, { status: 1 }).warning, /ADB no disponible/);
  assert.match(result({ status: 0, stdout: 'List of devices attached\n\n' }).warning, /sin dispositivos/);
  assert.match(result({ status: 0, stdout: 'List of devices attached\nA\tdevice\nB\tdevice\n' }).warning, /múltiples/);
  assert.match(result({ status: 0, stdout: 'List of devices attached\nA\tunauthorized\n' }).warning, /no autorizado/);
  assert.match(result({ status: 0, stdout: 'List of devices attached\nA\toffline\n' }).warning, /offline/);
  assert.match(result({ status: 0, stdout: 'unexpected' }).warning, /no válida/);
  assert.match(result({ status: 1, stdout: '' }).warning, /No se pudo consultar/);
});

test('exactly one authorized ADB device yields an explicit serial-scoped logcat command', () => {
  const detected = qa.detectAdb({ spawnSyncImpl(_command: string, args: string[]) {
    return args[0] === 'version' ? { status: 0 } : { status: 0, stdout: 'List of devices attached\nserial-1\tdevice\n' };
  } });
  assert.deepEqual(detected, { command: 'adb', serial: 'serial-1' });
  const source = readFileSync('scripts/qa-session.cjs', 'utf8');
  assert.match(source, /\['-s', preflight\.adb\.serial, 'logcat'\]/);
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

test('ADB exit is non-critical and a started capture remains registered for cleanup', async () => {
  const child = fakeChild(); const warnings: string[] = [];
  qa.watchOptionalChild(child, 'adb', () => false, (message: string) => warnings.push(message));
  child.emit('exit', 1, null);
  assert.match(warnings[0]!, /sesión continúa/);

  const cleanupChild = fakeChild(); cleanupChild.pid = 77; cleanupChild.exitCode = null; cleanupChild.killed = false;
  const commands: unknown[][] = [];
  const registry = qa.createProcessRegistry({ platform: 'win32', spawnSyncImpl(command: string, args: string[]) {
    commands.push([command, args]); cleanupChild.exitCode = 0; return { status: 0 };
  } });
  registry.register('adb', cleanupChild); await registry.cleanup();
  assert.deepEqual(commands, [['taskkill', ['/pid', '77', '/T', '/F']]]);
});

test('launcher source preserves exact Gateway → health → tunnel → Metro → ADB order without shell or fixed startup sleep', () => {
  const source = readFileSync('scripts/qa-session.cjs', 'utf8');
  const gateway = source.indexOf("start('gateway'");
  const health = source.indexOf('waitForHealth(', gateway);
  const tunnel = source.indexOf("start('tunnel'", health);
  const metro = source.indexOf("start('metro'", tunnel);
  const adb = source.indexOf("start('adb'", metro);
  assert.ok(gateway < health && health < tunnel && tunnel < metro && metro < adb);
  assert.match(source, /start\('tunnel', preflight\.cloudflaredCommand/);
  assert.doesNotMatch(source, /shell:\s*true|sleep\s+/);
  assert.match(source, /taskkill.*\/T.*\/F/s);
});
