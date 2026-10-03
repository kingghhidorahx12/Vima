import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { primaryGradient, resolveColor, semanticColors, visualTokens } from '../src/design/tokens/index.ts';
import { textStyle } from '../src/design/typography.ts';
import { elevationStyle, lightTheme } from '../src/design/themes/light.ts';
import { allowedSheetGeometry, nearestSheetSnap, rideSheetGeometry } from '../src/design/components/rideSheetGeometry.ts';
import { motionTokens } from '../src/motion/tokens.ts';
import { evaluateBezier, motionTimings, parseBezier } from '../src/motion/timing.ts';
import { hapticForEvent } from '../src/motion/hapticEvents.ts';
import { createMotionPolicy } from '../src/motion/policy.ts';
import { createVehicleMotion, interpolateHeading, validateVehicleSample } from '../src/map/vehicleMotion.ts';
import { mapColors, routeColor } from '../src/map/semantics.ts';
import { revealRoute, routeFrame, type RouteFeature } from '../src/map/routeGeometry.ts';

test('runtime tokens preserve both approved JSON documents, including unresolved ranges', () => {
  assert.deepEqual(visualTokens, JSON.parse(readFileSync(new URL('../docs/design/vima.visual.final.json', import.meta.url), 'utf8')));
  assert.deepEqual(motionTokens, JSON.parse(readFileSync(new URL('../docs/design/vima.motion.final.json', import.meta.url), 'utf8')));
  assert.equal(semanticColors.destinationAndCriticalMapPin, visualTokens.colors.red);
  assert.equal(semanticColors.spatialAndSecondaryAction, '#2F80FF');
  assert.equal(semanticColors.primaryActionAndSuccess, '#00D68F');
  assert.equal(routeColor('active', 'accentBlue'), '#2F80FF');
  assert.deepEqual(primaryGradient.stops.map((stop) => stop.position), [0, 0.58, 1]);
  assert.throws(() => resolveColor('unapproved'));
});

test('typography preserves contextual ranges and selects real Inter weights without synthetic bold', () => {
  assert.equal(textStyle({ variant: 'body', weight: 500 }).fontFamily, 'Inter_500Medium');
  assert.equal(textStyle({ variant: 'display', sizePx: 34 }).fontSize, 34);
  assert.throws(() => textStyle({ variant: 'display', sizePx: 37 }));
  assert.throws(() => textStyle({ variant: 'display', sizePx: NaN }));
  assert.equal(lightTheme.surfaces.buttonPrimary.height, visualTokens.components.buttonPrimary.heightPx);
  assert.equal(lightTheme.surfaces.sheet.borderTopLeftRadius, visualTokens.radii.sheetPx);
  const shadow = elevationStyle('level1', visualTokens.colors.carbon).boxShadow;
  assert.deepEqual(shadow, [{ offsetX: 0, offsetY: 2, blurRadius: 8, spreadDistance: 0, color: 'rgba(11, 15, 14, 0.06)' }]);
});

test('sheet derives visible percentages from measured height and settles without overshoot or velocity physics', () => {
  const geometry = rideSheetGeometry(1000, 1);
  assert.deepEqual(geometry.offsets, [760, 480, 120]);
  assert.equal(geometry.targetOffset, 480);
  assert.equal(nearestSheetSnap(500, geometry.offsets), 480);
  assert.equal(nearestSheetSnap(-100, geometry.offsets), 120);
  assert.equal(nearestSheetSnap(2000, geometry.offsets), 760);
  assert.throws(() => rideSheetGeometry(0, 0));
  assert.throws(() => rideSheetGeometry(NaN, 0));
});

test('single sheet snap always returns to its state target, including from intermediate drag positions', () => {
  const geometry = allowedSheetGeometry(1000, 430, [430]);
  assert.deepEqual(geometry.allowedOffsets, [430]);
  assert.equal(geometry.minOffset, 120);
  assert.equal(geometry.maxOffset, 760);
  for (const offset of [120, 300, 480, 640, 760]) {
    assert.equal(nearestSheetSnap(offset, geometry.allowedOffsets), geometry.targetOffset);
  }
  assert.throws(() => allowedSheetGeometry(1000, 430, [480]));
});

test('multi-snap sheets settle only at explicitly allowed offsets', () => {
  const geometry = allowedSheetGeometry(1000, 480, [480, 120]);
  assert.equal(nearestSheetSnap(700, geometry.allowedOffsets), 480);
  assert.equal(nearestSheetSnap(210, geometry.allowedOffsets), 120);
  assert.notEqual(nearestSheetSnap(300, geometry.allowedOffsets), 300);
  assert.throws(() => allowedSheetGeometry(1000, 480, [480, 800]));
});

test('Reduced Motion moves a settled sheet immediately; normal motion uses the approved snap timing', () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require('@babel/core') as {
    transformSync: (code: string, options: Record<string, unknown>) => { code?: string } | null;
  };
  const source = readFileSync(new URL('../src/motion/helpers.ts', import.meta.url), 'utf8');
  const transformed = transformSync(source, { filename: 'helpers.ts', configFile: false, babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true }]], plugins: ['@babel/plugin-transform-modules-commonjs'] })?.code;
  assert.ok(transformed);
  const calls: { value: number; duration: number }[] = [];
  const module = { exports: {} as { moveTo: (value: number, reduced: boolean, timing: typeof motionTimings.sheetSnap) => number } };
  new Function('require', 'module', 'exports', transformed)((id: string) => id === 'react-native-reanimated'
    ? { ReduceMotion: { System: 'system', Never: 'never' }, withTiming: (value: number, config: { duration: number }) => {
      calls.push({ value, duration: config.duration }); return value;
    } } : { motionSystemStatus: 'approved' }, module, module.exports);
  assert.equal(module.exports.moveTo(430, true, motionTimings.sheetSnap), 430);
  assert.deepEqual(calls, []);
  assert.equal(module.exports.moveTo(430, false, motionTimings.sheetSnap), 430);
  assert.deepEqual(calls, [{ value: 430, duration: motionTimings.sheetSnap.duration }]);
});

test('CSS cubic-bezier uses x inversion and exact approved duration/easing pairs', () => {
  const linear = parseBezier('cubic-bezier(0, 0, 1, 1)');
  for (const progress of [0, 0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(evaluateBezier(progress, linear) - progress) < 1e-8);
  const state = parseBezier(motionTokens.easings.state);
  assert.ok(Math.abs(evaluateBezier(0.5, state) - 0.775561311) < 1e-7);
  assert.equal(motionTimings.sheetEnter.duration, 300);
  assert.equal(motionTimings.sheetClose.duration, 240);
  assert.equal(motionTimings.map.duration, 420);
  assert.throws(() => parseBezier('spring'));
});

test('semantic haptics distinguish actions, success, failure and safety', () => {
  assert.equal(hapticForEvent('buttonChip'), 'light');
  assert.equal(hapticForEvent('requestRide'), 'medium');
  assert.equal(hapticForEvent('driverFound'), 'success');
  assert.equal(hapticForEvent('pinIncorrect'), 'error');
  assert.equal(hapticForEvent('routeChangeRejected'), 'medium');
  assert.equal(hapticForEvent('paymentFailure'), 'error');
  assert.equal(hapticForEvent('securityAlert'), 'warning');
});

test('vehicle interpolates heading through north using the short arc and requires valid telemetry', () => {
  assert.equal(interpolateHeading(350, 10, 0.5), 0);
  assert.equal(interpolateHeading(10, 350, 0.5), 0);
  assert.equal(interpolateHeading(90, 180, 1), 180);
  assert.equal(validateVehicleSample({ coordinate: [0, 0], sequence: 1, heading: NaN }), false);
  assert.equal(validateVehicleSample({ coordinate: [0, 0], sequence: 1, heading: 360 }), false);
  const shouldSnap = () => true;
  assert.equal(createVehicleMotion(shouldSnap).durationMs, motionTokens.durationsMs.map);
  assert.equal(createVehicleMotion(shouldSnap).shouldSnap, shouldSnap);
});

// Coordinates and dimensions in these tests are synthetic numerical fixtures only.
const route: RouteFeature = { type: 'Feature', properties: { id: 'test-route' },
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] } };
test('route reveal follows geometry while Reduced Motion preserves the complete route and fades', () => {
  assert.deepEqual(revealRoute(route, 0.5).geometry, { type: 'LineString', coordinates: [[0, 0], [1, 0], [1, 0]] });
  assert.equal(revealRoute(route, 1), route);
  const reduced = routeFrame(route, 0.5, true);
  assert.equal(reduced.geometry, route.geometry);
  assert.equal(reduced.properties?.vimaRevealOpacity, 0.5);
  assert.equal(routeFrame(route, 0.5, false).properties?.vimaRevealOpacity, 1);
  assert.deepEqual(route.properties, { id: 'test-route' });
  assert.equal(createMotionPolicy(true).routeReveal, 'fade');
  assert.equal(createMotionPolicy(false).routeReveal, 'draw');
});

test('multiline reveal never fabricates a segment between disconnected lines', () => {
  const multiline: RouteFeature = { ...route, geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 0]], [[10, 0], [11, 0]]] } };
  assert.deepEqual(revealRoute(multiline, 0.75).geometry, { type: 'MultiLineString', coordinates: [[[0, 0], [1, 0]], [[10, 0], [10.5, 0]]] });
  assert.equal(mapColors.destination, visualTokens.colors.red);
  assert.equal(routeColor('active', 'carbon'), visualTokens.colors.carbon);
  assert.equal(routeColor('completed', 'greenDark'), visualTokens.colors.gray);
});
