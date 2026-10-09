'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');

const REQUIRED_ENV = ['TOMTOM_API_KEY', 'VIMA_PRICING_CONFIG_PATH', 'VIMA_AUTH_CONFIG_PATH'];
const QUICK_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/gi;

function validateRequiredEnvironment(env) {
  const missing = REQUIRED_ENV.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Falta configuración QA requerida: ${missing.join(', ')}`);
  return true;
}

function gatewayTarget(env) {
  const host = env.VIMA_GEO_HOST?.trim() || '127.0.0.1';
  const port = env.VIMA_GEO_PORT === undefined ? 8787 : Number(env.VIMA_GEO_PORT);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error('VIMA_GEO_PORT no es válido');
  const localHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return { host, port, localUrl: `http://${localHost}:${port}` };
}

function extractQuickTunnelUrls(value) {
  return [...new Set(String(value).match(QUICK_TUNNEL) ?? [])];
}

function buildChildEnvironments(baseEnv, theme, publicGatewayUrl) {
  if (!['light', 'dark'].includes(theme)) throw new Error('Tema QA inválido');
  const gateway = { ...baseEnv };
  const tunnel = { ...baseEnv };
  const metro = { ...baseEnv, EXPO_PUBLIC_VIMA_API_BASE_URL: publicGatewayUrl, EXPO_PUBLIC_VIMA_FIXTURES: '' };
  if (theme === 'dark') metro.EXPO_PUBLIC_VIMA_THEME = 'dark';
  else delete metro.EXPO_PUBLIC_VIMA_THEME;
  const adb = { ...baseEnv };
  return { gateway, tunnel, metro, adb };
}

function redactForLog(value, env) {
  let safe = String(value);
  for (const name of REQUIRED_ENV) {
    const secret = env[name];
    if (secret) safe = safe.split(secret).join(`[${name}]`);
  }
  return safe;
}

function waitForQuickTunnel(child, timeoutMs = 30_000, timers = { setTimeout, clearTimeout }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error, url) => {
      if (settled) return;
      settled = true; timers.clearTimeout(timer);
      child.stdout?.off('data', onData); child.stderr?.off('data', onData); child.off('exit', onExit);
      if (error) reject(error); else resolve(url);
    };
    const onData = chunk => {
      const urls = extractQuickTunnelUrls(chunk);
      if (urls.length > 1) finish(new Error('cloudflared anunció más de un Quick Tunnel'));
      else if (urls.length === 1) finish(undefined, urls[0]);
    };
    const onExit = (code) => finish(new Error(`cloudflared terminó antes de publicar URL (${code ?? 'signal'})`));
    child.stdout?.on('data', onData); child.stderr?.on('data', onData); child.once('exit', onExit);
    timer = timers.setTimeout(() => finish(new Error('cloudflared no publicó una URL Quick Tunnel a tiempo')), timeoutMs);
  });
}

async function waitForHealth(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const deadline = now() + timeoutMs;
  let lastError;
  while (now() < deadline) {
    try {
      const response = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = new Error(`health respondió ${response.status}`);
    } catch (error) { lastError = error; }
    await delay(250);
  }
  throw new Error(`Gateway no alcanzó health: ${lastError instanceof Error ? lastError.message : 'timeout'}`);
}

function commandAvailable(command, args, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl(command, args, { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
}

function assertPreflight(env, options = {}) {
  validateRequiredEnvironment(env);
  const run = options.spawnSyncImpl ?? spawnSync;
  if (!commandAvailable('cloudflared', ['--version'], run)) throw new Error('Falta cloudflared en PATH. Instálalo antes de iniciar QA.');
  if (!commandAvailable('adb', ['version'], run)) throw new Error('Falta adb en PATH. Instala Android platform-tools antes de iniciar QA.');
  const devices = run('adb', ['devices'], { encoding: 'utf8', windowsHide: true });
  if (devices.error || devices.status !== 0 || !/^\S+\s+device$/m.test(devices.stdout ?? ''))
    throw new Error('No hay un dispositivo Android autorizado en adb.');
  const expoCli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
  if (!fs.existsSync(expoCli)) throw new Error('No se encontró Expo CLI local. Ejecuta npm install.');
  return { expoCli };
}

function createProcessRegistry(options = {}) {
  const platform = options.platform ?? process.platform;
  const run = options.spawnSyncImpl ?? spawnSync;
  const kill = options.killImpl ?? process.kill.bind(process);
  const children = [];
  let cleaning;
  return {
    register(name, child) { children.push({ name, child }); return child; },
    get stopping() { return !!cleaning; },
    cleanup() {
      if (cleaning) return cleaning;
      cleaning = Promise.allSettled([...children].reverse().map(async ({ child }) => {
        if (!child.pid || child.exitCode !== null || child.killed) return;
        if (platform === 'win32') run('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else {
          try { kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* already stopped */ } }
        }
        if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2_000))]);
        if (platform !== 'win32' && child.exitCode === null) {
          try { kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already stopped */ } }
        }
      })).then(() => undefined);
      return cleaning;
    },
  };
}

function watchCriticalChild(child, name, isStopping, onFatal) {
  child.once('error', error => { if (!isStopping()) onFatal(new Error(`${name} no pudo iniciar: ${error.message}`)); });
  child.once('exit', (code, signal) => { if (!isStopping()) onFatal(new Error(`${name} terminó inesperadamente (${code ?? signal})`)); });
}

function attachLoggedOutput(child, name, logPath, env, onText) {
  const output = fs.createWriteStream(logPath, { flags: 'a' });
  const buffers = new Map();
  const connect = stream => {
    if (!stream) return;
    buffers.set(stream, '');
    stream.on('data', chunk => {
      const raw = chunk.toString(); output.write(redactForLog(raw, env)); onText?.(raw);
      const combined = buffers.get(stream) + raw;
      const lines = combined.split(/\r?\n/); buffers.set(stream, lines.pop());
      for (const line of lines) if (line) console.log(`[${name}] ${redactForLog(line, env)}`);
    });
  };
  connect(child.stdout); connect(child.stderr);
  child.once('close', () => {
    for (const value of buffers.values()) if (value) console.log(`[${name}] ${redactForLog(value, env)}`);
    output.end();
  });
  return output;
}

function timestamp(now = new Date()) { return now.toISOString().replace(/[:.]/g, '-'); }

async function runQaSession(theme, options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const spawnImpl = options.spawnImpl ?? spawn;
  const preflight = (options.assertPreflight ?? assertPreflight)(env, options);
  const target = gatewayTarget(env);
  const runDir = path.join(cwd, '.runtime', 'qa', `${timestamp(options.nowDate?.())}-${theme}`);
  fs.mkdirSync(runDir, { recursive: true });
  const registry = createProcessRegistry(options);
  let fatalReject;
  const fatal = new Promise((_resolve, reject) => { fatalReject = reject; });
  const start = (name, command, args, childEnv, onText) => {
    if (registry.stopping) throw new Error('La sesión QA ya se está cerrando');
    const child = registry.register(name, spawnImpl(command, args, {
      cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
    }));
    attachLoggedOutput(child, name, path.join(runDir, `${name}.log`), env, onText);
    watchCriticalChild(child, name, () => registry.stopping, fatalReject);
    return child;
  };
  const stopSignal = new Promise(resolve => {
    const stop = signal => resolve(signal);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  });
  try {
    const provisional = buildChildEnvironments(env, theme, 'https://pending.trycloudflare.com');
    start('gateway', process.execPath, ['--experimental-strip-types', path.join(cwd, 'gateway', 'main.ts')], provisional.gateway);
    await Promise.race([waitForHealth(target.localUrl, options.healthOptions), fatal]);
    let tunnelText = '';
    const tunnel = start('tunnel', 'cloudflared', ['tunnel', '--url', target.localUrl, '--no-autoupdate'], provisional.tunnel,
      value => { tunnelText += value; });
    const publicUrl = await Promise.race([waitForQuickTunnel(tunnel, options.tunnelTimeoutMs), fatal]);
    const urls = extractQuickTunnelUrls(tunnelText);
    if (urls.length !== 1 || urls[0] !== publicUrl) throw new Error('No se obtuvo exactamente una URL Quick Tunnel válida');
    console.log(`[qa] Gateway público: ${publicUrl}`);
    const childEnvs = buildChildEnvironments(env, theme, publicUrl);
    start('metro', process.execPath, [preflight.expoCli, 'start', '--dev-client', '--tunnel'], childEnvs.metro);
    start('adb', 'adb', ['logcat'], childEnvs.adb);
    const result = await Promise.race([stopSignal, fatal]);
    if (result instanceof Error) throw result;
  } finally {
    await registry.cleanup();
  }
}

async function main() {
  const theme = process.argv[2];
  if (!['light', 'dark'].includes(theme)) throw new Error('Uso: node scripts/qa-session.cjs light|dark');
  await runQaSession(theme);
}

module.exports = {
  REQUIRED_ENV, validateRequiredEnvironment, gatewayTarget, extractQuickTunnelUrls, buildChildEnvironments,
  redactForLog, waitForQuickTunnel, waitForHealth, commandAvailable, assertPreflight, createProcessRegistry,
  watchCriticalChild, runQaSession,
};

if (require.main === module) main().catch(error => { console.error(`[qa] ${redactForLog(error.message, process.env)}`); process.exitCode = 1; });
