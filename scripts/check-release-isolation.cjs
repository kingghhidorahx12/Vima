const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const directory = path.resolve(process.argv[2] || 'dist');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
for (const [platform, files] of Object.entries(metadata.fileMetadata)) {
  const bundle = fs.readFileSync(path.join(directory, files.bundle));
  for (const marker of ['SYNTHETIC_PRICING_TEST_ONLY', 'VIMA_PRICING_CONFIG_PATH', 'TOMTOM_API_KEY',
    'intermunicipalOverrides', 'distanceMinorPerKm', 'VIMA_PLACE_MEDIA_DIR', 'manifest.v1.json',
    'gateway/placeMedia', 'C:\\Users\\', '/Users/', 'gateway/pricing/engine', 'VIMA_AUTH_CONFIG_PATH',
    'matching-v1.json', 'invalid_auth_config', 'matching_storage_unavailable']) {
    assert.equal(bundle.includes(Buffer.from(marker)), false, `Release contains server/test/path marker: ${platform} ${marker}`);
  }
  console.log(`Release pricing/server/path isolation OK: ${platform}`);
}
