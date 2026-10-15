import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

test('every release export clears Metro transforms while preserving the selected environment', () => {
  const realRequire = createRequire(import.meta.url); let captured: any;
  const fakeRequire = Object.assign((id: string) => id === 'node:child_process' ? { spawnSync: (...args: unknown[]) => { captured = args; return { status: 0 }; } }
    : id === 'node:fs' ? { mkdirSync() {} } : realRequire(id), { resolve: realRequire.resolve });
  const env = { EXPO_PUBLIC_VIMA_VARIANT: 'production', EXPO_PUBLIC_VIMA_API_BASE_URL: 'https://selected.example.com' };
  runInNewContext(readFileSync(new URL('../scripts/export-native.cjs', import.meta.url), 'utf8'), {
    require: fakeRequire, process: { execPath: process.execPath, argv: ['node', 'script', '--output-dir', 'output'], env },
  });
  assert.ok(captured[1].includes('--clear'));
  assert.equal(captured[2].env.EXPO_PUBLIC_VIMA_API_BASE_URL, env.EXPO_PUBLIC_VIMA_API_BASE_URL);
  assert.equal(captured[1].at(-1), 'output');
});

test('release guard rejects mixed-environment bytecode even when the correct URL is also present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vima-release-env-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify({ fileMetadata: { android: { bundle: 'entry.hbc' } } }));
    for (const stale of ['', 'https://product.example.invalid', 'https://map.example.invalid/style.json']) {
      writeFileSync(join(dir, 'entry.hbc'), `https://selected.example.com ${stale}`);
      const result = spawnSync(process.execPath, ['scripts/check-release-isolation.cjs', dir], { encoding: 'utf8' });
      assert.equal(result.status, stale ? 1 : 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
