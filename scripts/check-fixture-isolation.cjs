const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.resolve(process.argv[2] || 'dist');
const development = process.argv.includes('--development');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
for (const [platform, files] of Object.entries(metadata.fileMetadata)) {
  const bundle = fs.readFileSync(path.join(directory, files.bundle));
  for (const marker of ['VIMA_PASSENGER_DEV_FIXTURES_ONLY', 'fixture-trip-', 'fixture-assignment-', 'fixture-origin', 'fixture-office']) {
    assert.equal(bundle.includes(Buffer.from(marker)), development,
      `Unexpected fixture presence in ${platform} (development=${development}): ${marker}`);
  }
  console.log(`Fixture isolation OK: ${platform} (${development ? 'included in development' : 'excluded from release'})`);
}
