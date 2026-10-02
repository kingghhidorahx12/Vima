const assert = require('node:assert/strict');
const fs = require('node:fs');
const Jimp = require('jimp-compact');

// Read-only measurement: artwork bytes never change. Include pixel corners + 1dp resampling margin.
async function main() {
  const source = fs.readFileSync('app.config.ts', 'utf8');
  const width = Number(/android: \{ imageWidth: (\d+) \}/.exec(source)?.[1]);
  const image = await Jimp.read('assets/brand/vima_splash_lockup_final.png');
  let radius = 0;
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, offset) => {
    if (image.bitmap.data[offset + 3] > 0) radius = Math.max(radius,
      Math.hypot(x + 0.5 - image.bitmap.width / 2, y + 0.5 - image.bitmap.height / 2) + Math.SQRT1_2);
  });
  const maximum = Math.floor(95 * image.bitmap.width / radius);
  assert.equal(width, maximum, 'Use the largest measured whole-dp width with the 1dp safety margin');
  assert.ok(radius * width / image.bitmap.width + 1 <= 96);
  console.log(`Splash safe: imageWidth=${width}dp; alpha radius=${(radius * width / image.bitmap.width).toFixed(3)}dp + 1dp <= 96dp`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
