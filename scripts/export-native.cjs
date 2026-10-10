const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Hermes embeds its input filename. A process-local relative temp path avoids embedding
// the developer's OS home directory in exported bytecode. No global environment changes.
const temporary = '.validation/hermes-temp';
fs.mkdirSync(temporary, { recursive: true });
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli');
const result = spawnSync(process.execPath, [cli, 'export', '--platform', 'android', '--platform', 'ios', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_VIMA_VARIANT: process.env.EXPO_PUBLIC_VIMA_VARIANT || 'production', TEMP: temporary, TMP: temporary, TMPDIR: temporary },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
