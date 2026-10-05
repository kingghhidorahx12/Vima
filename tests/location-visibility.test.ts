import assert from 'node:assert/strict';
import test from 'node:test';
import { indexRoute, routeWindow, type RouteFeature } from '../src/map/routeGeometry.ts';
import { locationOutsideViewport } from '../src/map/locationVisibility.ts';

test('route sheen is one joined stroke through many vertices without changing the base route', () => {
  const route: RouteFeature = { type: 'Feature', properties: {}, geometry: { type: 'LineString',
    coordinates: Array.from({ length: 101 }, (_, i) => [i / 100, 0]) } };
  const before = JSON.stringify(route);
  const index = indexRoute(route);
  const sheen = routeWindow(index, 0.55, 0.12);
  assert.equal(sheen.geometry.type, 'LineString');
  assert.ok(sheen.geometry.coordinates.length > 10);
  assert.equal(sheen.properties?.vimaSheenOpacity, 1);
  assert.ok(routeWindow(index, 0.02, 0.12).properties!.vimaSheenOpacity < 1);
  assert.ok(routeWindow(index, 0.98, 0.12).properties!.vimaSheenOpacity < 1);
  assert.deepEqual(routeWindow(index, 0, 0.12).geometry.coordinates, []);
  assert.deepEqual(routeWindow(index, 1, 0.12).geometry.coordinates, []);
  assert.equal(JSON.stringify(route), before);
});

test('route sheen does not join disconnected route parts or draw multiple moving strokes', () => {
  const index = indexRoute({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString',
    coordinates: [[[0, 0], [1, 0]], [[10, 0], [11, 0]]] } });
  const sheen = routeWindow(index, 0.55, 0.2);
  assert.equal(sheen.geometry.type, 'LineString');
  if (sheen.geometry.type === 'LineString') assert.ok(sheen.geometry.coordinates.every(point => point[0]! >= 10));
});

test('location visibility excludes covered sheet, uses local dp and tolerates edge jitter', () => {
  const viewport = { width: 390, height: 280 };
  assert.equal(locationOutsideViewport([195, 140], viewport, false), false);
  assert.equal(locationOutsideViewport([195, 400], viewport, false), true);
  assert.equal(locationOutsideViewport([195, 273], viewport, false), true);
  assert.equal(locationOutsideViewport([195, 268], viewport, true), true);
  assert.equal(locationOutsideViewport([195, 250], viewport, true), false);
  assert.equal(locationOutsideViewport([195, 268], viewport, false), false);
  assert.equal(locationOutsideViewport([-1, 100], viewport, false), true);
  assert.equal(locationOutsideViewport([NaN, 100], viewport, true), true);
  assert.equal(locationOutsideViewport([195, 100], { width: NaN, height: 280 }, false), false);
});

test('current location hidden behind floating chrome is outside the usable viewport', () => {
  const viewport = { width: 358, height: 300, top: 80 };
  assert.equal(locationOutsideViewport([179, 60], viewport, false), true);
  assert.equal(locationOutsideViewport([179, 120], viewport, true), false);
  assert.equal(locationOutsideViewport([179, 95], viewport, true), true);
});
