const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const directory = path.resolve(process.argv[2] || 'dist');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
for (const [platform, files] of Object.entries(metadata.fileMetadata)) {
  const bundle = fs.readFileSync(path.join(directory, files.bundle));
  for (const marker of ['TOMTOM_API_KEY', 'TomTom-Api-Key', 'api.tomtom.com', 'gateway-ready']) {
    assert.equal(bundle.includes(Buffer.from(marker)), false, `Server boundary leaked into ${platform}: ${marker}`);
  }
  console.log(`Server credential/provider boundary OK: ${platform}`);
}
