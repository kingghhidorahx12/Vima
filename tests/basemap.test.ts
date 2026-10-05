import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import source from '../src/map/styles/positron.json' with { type: 'json' };
import { passengerBasemap, resolveBasemapStyle } from '../src/map/basemap.ts';
import { resolveMapStyle } from '../src/map/style.ts';

const require = createRequire(import.meta.url);
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
test('Passenger basemap is valid native style with approved colors and unchanged cartographic structure', () => {
  assert.equal(typeof passengerBasemap, 'object');
  if (typeof passengerBasemap === 'string') throw new Error('Expected native style JSON');
  assert.deepEqual(validateStyleMin(passengerBasemap), []);
  assert.deepEqual(passengerBasemap.layers.map(layer => layer.id), source.layers.map(layer => layer.id));
  const color = (id: string, property: string) => {
    const layer = passengerBasemap.layers.find(layer => layer.id === id)!;
    return (layer.paint as Record<string, unknown>)[property];
  };
  assert.equal(color('background', 'background-color'), '#F7F8F7');
  assert.equal(color('highway_minor', 'line-color'), '#F5F6F7');
  assert.equal(color('highway_major_inner', 'line-color'), '#EBEBEB');
  assert.equal(color('landcover_wood', 'fill-color'), '#ECF6EF');
  assert.equal(color('park', 'fill-color'), '#D8EEDB');
  assert.equal(color('water', 'fill-color'), '#BFDDF9');
  for (const [index, layer] of passengerBasemap.layers.entries()) {
    const original = source.layers[index]!;
    const { paint, ...geometryAndLayout } = layer;
    const { paint: originalPaint, ...originalGeometryAndLayout } = original;
    assert.deepEqual(geometryAndLayout, originalGeometryAndLayout);
    const withoutColors = (value: object | undefined) => Object.fromEntries(Object.entries(value ?? {})
      .filter(([key]) => !key.endsWith('color')));
    assert.deepEqual(withoutColors(paint), withoutColors(originalPaint));
    if (layer.type === 'symbol') assert.deepEqual(paint, originalPaint); // Label legibility is retained.
  }
  assert.equal(passengerBasemap.sources.openmaptiles?.type, 'vector');
  assert.match(passengerBasemap.sources.openmaptiles!.attribution ?? '', /OpenStreetMap/);
});

test('the active dev Positron style is polished; explicit other styles and production requirement remain authoritative', () => {
  assert.equal(resolveBasemapStyle(resolveMapStyle(undefined, true)), passengerBasemap);
  assert.equal(resolveBasemapStyle('https://example.test/style.json'), 'https://example.test/style.json');
  assert.throws(() => resolveMapStyle(undefined, false), /required/);
});
