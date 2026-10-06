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
  const originalIds = new Set(source.layers.map(layer => layer.id));
  const originalLayers = passengerBasemap.layers.filter(layer => originalIds.has(layer.id));
  assert.deepEqual(originalLayers.map(layer => layer.id), source.layers.map(layer => layer.id));
  const color = (id: string, property: string) => {
    const layer = passengerBasemap.layers.find(layer => layer.id === id)!;
    return (layer.paint as Record<string, unknown>)[property];
  };
  assert.equal(color('background', 'background-color'), '#F7F8F7');
  assert.equal(color('highway_minor', 'line-color'), '#F5F6F7');
  assert.equal(color('highway_major_inner', 'line-color'), '#EBEBEB');
  assert.deepEqual(color('landcover_wood', 'fill-color'), [
    'interpolate', ['linear'], ['zoom'], 12, '#ECF6EF', 13, '#E3F2E6',
    14, '#DBEFE0', 15, '#D8EEDB', 16, '#D8EEDB',
  ]);
  assert.equal(color('park', 'fill-color'), '#D8EEDB');
  assert.equal(color('water', 'fill-color'), '#BFDDF9');
  for (const [index, layer] of originalLayers.entries()) {
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

test('close landcover and landuse use supported OpenMapTiles fields, approved progression and subordinate order', () => {
  if (typeof passengerBasemap === 'string') throw new Error('Expected native style JSON');
  const layers = passengerBasemap.layers;
  const byId = (id: string) => layers.find(layer => layer.id === id)! as {
    id: string; source: string; 'source-layer': string; minzoom: number;
    filter: unknown; paint: Record<string, unknown>;
  };
  const added = ['landcover_grass', 'landcover_farmland', 'landcover_wetland', 'landuse_recreation'];
  assert.deepEqual(layers.filter(layer => added.includes(layer.id)).map(layer => layer.id), added);
  const polygon = ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false];
  const classes = ['grass', 'farmland', 'wetland'];
  const factors = [1, 0.45, 0.6];
  for (const [index, id] of added.slice(0, 3).entries()) {
    const layer = byId(id);
    assert.equal(layer.source, 'openmaptiles');
    assert.equal(layer['source-layer'], 'landcover');
    assert.equal(layer.minzoom, 12);
    assert.deepEqual(layer.filter, ['all', polygon, ['==', ['get', 'class'], classes[index]]]);
    assert.deepEqual((layer.paint as Record<string, unknown>)['fill-opacity'], [
      'interpolate', ['linear'], ['zoom'], 12, 0,
      13, 0.35 * factors[index]!, 14, 0.75 * factors[index]!,
      15, 0.9 * factors[index]!, 16, factors[index],
    ]);
  }
  assert.deepEqual((byId('landcover_grass').paint as Record<string, unknown>)['fill-color'], [
    'step', ['zoom'], '#ECF6EF', 14,
    ['match', ['get', 'subclass'],
      ['garden', 'park', 'recreation_ground', 'golf_course'], '#D8EEDB', '#ECF6EF'],
  ]);
  assert.equal((byId('landcover_farmland').paint as Record<string, unknown>)['fill-color'], '#ECF6EF');
  assert.equal((byId('landcover_wetland').paint as Record<string, unknown>)['fill-color'], '#D8EEDB');
  const recreation = byId('landuse_recreation');
  assert.equal(recreation['source-layer'], 'landuse');
  assert.equal(recreation.minzoom, 15);
  assert.deepEqual(recreation.filter, ['all', polygon,
    ['match', ['get', 'class'],
      ['pitch', 'playground', 'stadium', 'theme_park', 'zoo', 'cemetery'], true, false]]);
  assert.deepEqual(recreation.paint, {
    'fill-color': '#D8EEDB',
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.35, 16, 0.55],
  });
  const waterIndex = layers.findIndex(layer => layer.id === 'water');
  const firstRoad = layers.findIndex(layer => layer.id === 'highway_path');
  const firstLabel = layers.findIndex(layer => layer.id === 'waterway_line_label');
  for (const id of added) {
    const index = layers.findIndex(layer => layer.id === id);
    assert.ok(index < waterIndex && index < firstRoad && index < firstLabel);
  }
  assert.ok(layers.findIndex(layer => layer.id === 'landcover_wood') < firstRoad);
});

test('the active dev Positron style is polished; explicit other styles and production requirement remain authoritative', () => {
  assert.equal(resolveBasemapStyle(resolveMapStyle(undefined, true)), passengerBasemap);
  assert.equal(resolveBasemapStyle('https://example.test/style.json'), 'https://example.test/style.json');
  assert.throws(() => resolveMapStyle(undefined, false), /required/);
});
