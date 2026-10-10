import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVehicleBearing, type BearingFix } from '../src/map/vehicleBearing.ts';

test('real displacement covers cardinal/diagonal streets and both directions, without a route-axis guess', () => {
  const previous: BearingFix = { coordinate: [0, 0], receivedAt: 1000 };
  for (const [coordinate, expected] of [ [[0, .0002], 0], [[.0002, 0], 90], [[0, -.0002], 180],
    [[-.0002, 0], 270], [[.0002, .0002], 45], [[-.0002, -.0002], 225] ] as const) {
    assert.ok(Math.abs(resolveVehicleBearing(previous, { coordinate, receivedAt: 6000 })! - expected) < .01);
  }
  assert.ok(Math.abs(resolveVehicleBearing(previous, { coordinate: [.0002, 0], receivedAt: 6000, heading: 270 })! - 90) < .01);
  assert.equal(resolveVehicleBearing(previous, { coordinate: [.0002, 0], receivedAt: 6000, heading: 95 }), 95);
});

test('stationary/noisy fixes retain reliable heading; missing, stale and reacquisition stay honest', () => {
  const previous: BearingFix = { coordinate: [-99, 19], receivedAt: 1000, heading: 359 };
  for (const heading of [0, 90, 180, undefined, NaN]) {
    assert.equal(resolveVehicleBearing(previous, { coordinate: [-99.00001, 19.00001], receivedAt: 2000, heading }), 359);
  }
  assert.equal(resolveVehicleBearing(undefined, { coordinate: [0, 0], receivedAt: 1000 }), undefined);
  assert.equal(resolveVehicleBearing(previous, { coordinate: [0, 0], receivedAt: 500 }), 359);
  assert.equal(resolveVehicleBearing(previous, { coordinate: [0, 0], receivedAt: 62000 }), undefined);
  assert.equal(resolveVehicleBearing(previous, { coordinate: [0, 0], receivedAt: 62000, heading: 45 }), 45);
});
