const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const directory = path.resolve(process.argv[2] || 'dist');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
for (const [platform, files] of Object.entries(metadata.fileMetadata)) {
  const bundle = fs.readFileSync(path.join(directory, files.bundle));
  // Display tiles are public mobile configuration. Remove only the two exact approved URLs
  // before checking that no other provider host (Search/Routing) reaches the bundle.
  const providerScan = bundle.toString('latin1')
    .replaceAll('https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/{z}/{x}/{y}?apiVersion=2', '')
    .replaceAll('https://api.tomtom.com/maps/orbis/traffic/incidents/vector/tile/{z}/{x}/{y}?apiVersion=2', '');
  assert.equal(providerScan.includes('api.tomtom.com'), false, 'Non-Display TomTom endpoint leaked');
  for (const marker of ['TOMTOM_API_KEY', 'TomTom-Api-Key', 'gateway-ready']) {
    assert.equal(bundle.includes(Buffer.from(marker)), false, `Server boundary leaked into ${platform}: ${marker}`);
  }
  console.log(`Server credential/provider boundary OK: ${platform}`);
}
