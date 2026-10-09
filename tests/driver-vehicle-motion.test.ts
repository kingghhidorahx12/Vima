import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { glyphCodepoints } from '../src/design/glyphs.ts';
import { validateVehicleSample, type DriverVehiclePose, type DriverVehicleSample } from '../src/map/vehicleMotion.ts';

const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

test('real motion hook preserves Driver unknown/last heading, shortest arc, ordering and reconnect fences', async () => {
  const h = createMapHarness({ realMotion: true, reduced: true });
  const { useVehicleMotion } = h.load('src/map/useVehicleMotion.ts');
  let pose!: SharedValue<DriverVehiclePose | null>;
  const config = { durationMs: 1000, easing: (p: number) => p, shouldSnap: () => false };
  function Probe() { pose = useVehicleMotion(h.sample, config, { driver: true, essential: true }); return null; }
  const tree = await h.render(React.createElement(Probe));
  const sample = async (v: DriverVehicleSample) => { h.sample.set(v); await h.flush(); };
  const complete = (start: number) => { h.frame(start); h.frame(start + 1000); };
  try {
    await sample({ coordinate: [0, 0], heading: null, sequence: 1 });
    assert.equal(pose.get()!.heading, null);
    await sample({ coordinate: [1, 0], heading: null, sequence: 2 });
    h.frame(0); h.frame(500); assert.equal(pose.get()!.coordinate[0], 0.5); assert.equal(pose.get()!.heading, null);
    h.frame(1000);
    await sample({ coordinate: [2, 0], heading: 359, sequence: 3 }); complete(2000);
    for (const heading of [null, NaN, -1, 360, Infinity]) {
      await sample({ coordinate: [3, 0], heading, sequence: 4 + [null, NaN, -1, 360, Infinity].findIndex(h => Object.is(h, heading)) });
      complete(4000); assert.equal(pose.get()!.heading, 359);
    }
    await sample({ coordinate: [4, 0], heading: 0, sequence: 10 }); h.frame(6000); h.frame(6500);
    assert.equal(pose.get()!.heading, 359.5); h.frame(7000); assert.equal(pose.get()!.heading, 0);
    await sample({ coordinate: [8, 0], heading: 90, sequence: 9 }); assert.equal(pose.get()!.coordinate[0], 4);
    await sample({ coordinate: [Infinity, 0], heading: 90, sequence: 11 }); assert.equal(pose.get()!.coordinate[0], 4);
    await sample({ coordinate: [8, 0], heading: 90, sequence: 1, reconnected: true }); assert.equal(pose.get()!.coordinate[0], 8);
  } finally { await h.act(async () => tree.unmount()); }
  assert.equal(validateVehicleSample({ coordinate: [0, 0], heading: NaN, sequence: 1 }), false);
});

test('default Passenger Reduced Motion still snaps; Driver essential keeps smoothing and shouldSnap', async () => {
  for (const driver of [false, true]) {
    const h = createMapHarness({ realMotion: true, reduced: true }); const { useVehicleMotion } = h.load('src/map/useVehicleMotion.ts');
    let pose!: SharedValue<DriverVehiclePose | null>;
    const config = { durationMs: 1000, easing: (p: number) => p, shouldSnap: (_a: unknown, b: number[]) => b[0] === 50 };
    function Probe() { pose = useVehicleMotion(h.sample, config, driver ? { driver: true, essential: true } : undefined); return null; }
    const tree = await h.render(React.createElement(Probe));
    try {
      h.sample.set({ coordinate: [0, 0], heading: 0, sequence: 1 }); await h.flush();
      h.sample.set({ coordinate: [10, 0], heading: 10, sequence: 2 }); await h.flush(); h.frame(0); h.frame(500);
      assert.equal(pose.get()!.coordinate[0], driver ? 5 : 10);
      h.sample.set({ coordinate: [50, 0], heading: 20, sequence: 3 }); await h.flush(); assert.equal(pose.get()!.coordinate[0], 50);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('local car artwork has identical geometry and PNG dimensions in both palettes', () => {
  const variants = ['light', 'dark'].map(name => {
    const svg = readFileSync(`assets/driver/vehicle-${name}.svg`, 'utf8');
    assert.doesNotMatch(svg, /(?:href|src)=|<image/); assert.match(svg, /width="38" height="50"/);
    for (const [suffix, scale] of [['', 1], ['@3x', 3]] as const) {
      const png = readFileSync(`assets/driver/vehicle-${name}${suffix}.png`);
      assert.equal(png.readUInt32BE(16), 52 * scale); assert.equal(png.readUInt32BE(20), 64 * scale);
    }
    return svg.replace(/#[0-9a-f]{3,8}/gi, '#palette');
  });
  assert.equal(variants[0], variants[1]);
});

test('sun/light_mode and moon/dark_mode map to actual non-missing bundled Material Symbols glyphs', () => {
  const font = readFileSync('node_modules/@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf');
  let cmap = 0;
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const table = 12 + i * 16;
    if (font.toString('ascii', table, table + 4) === 'cmap') cmap = font.readUInt32BE(table + 8);
  }
  assert.ok(cmap);
  function glyph(code: number) {
    for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
      const start = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4);
      if (font.readUInt16BE(start) !== 4) continue;
      const count = font.readUInt16BE(start + 6) / 2;
      const ends = start + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, offsets = deltas + count * 2;
      for (let j = 0; j < count; j++) {
        const first = font.readUInt16BE(starts + j * 2), last = font.readUInt16BE(ends + j * 2);
        if (code < first || code > last) continue;
        const delta = font.readInt16BE(deltas + j * 2), offset = font.readUInt16BE(offsets + j * 2);
        const index = offset ? font.readUInt16BE(offsets + j * 2 + offset + (code - first) * 2) : code;
        return index ? (index + delta) & 0xffff : 0;
      }
    }
    return 0;
  }
  assert.equal(glyphCodepoints.sun, 0xe518); assert.equal(glyphCodepoints.moon, 0xe51c);
  assert.ok(glyph(glyphCodepoints.sun) > 0); assert.ok(glyph(glyphCodepoints.moon) > 0);
  assert.notEqual(glyph(glyphCodepoints.sun), glyph(glyphCodepoints.moon));
});
