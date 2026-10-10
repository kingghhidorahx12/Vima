const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.argv[2]; const qa = process.argv[3] === 'qa';
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
for (const [platform, files] of Object.entries(metadata.fileMetadata)) {
 const bundle = fs.readFileSync(path.join(directory, files.bundle));
 assert.equal(bundle.includes(Buffer.from('Cuenta QA / cambiar modo')), qa, platform + ' live boundary');
 for (const marker of ['Cuenta de prueba Vima', 'VIMA_PASSENGER_DEV_FIXTURES_ONLY', 'VimaGlassSurface']) assert.equal(bundle.includes(Buffer.from(marker)), false, marker);
 console.log(platform + ' QA/production entry isolation OK');
}
