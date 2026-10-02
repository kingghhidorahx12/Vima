import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTrafficLayers, displayKeyAvailable, parseTrafficLayers, trafficTileUrls } from '../src/map/traffic.ts';
import { pinEntrance } from '../src/map/pinMotion.ts';
import { motionTimings } from '../src/motion/timing.ts';
import { motionTokens } from '../src/motion/tokens.ts';

test('map layers default off, reject malformed preferences and require a separate display key', () => {
  assert.deepEqual(defaultTrafficLayers, { traffic: false, incidents: false });
  assert.deepEqual(parseTrafficLayers({ traffic: true, incidents: false }), { traffic: true, incidents: false });
  assert.deepEqual(parseTrafficLayers({ traffic: 'yes', incidents: true }), defaultTrafficLayers);
  assert.equal(displayKeyAvailable('  '), false);
  assert.equal(displayKeyAvailable('display-key'), true);
  assert.match(trafficTileUrls.flow, /\/maps\/orbis\/traffic\/flow\/vector\/tile\/\{z\}/);
  assert.match(trafficTileUrls.incidents, /\/maps\/orbis\/traffic\/incidents\/vector\/tile\/\{z\}/);
  assert.ok(!trafficTileUrls.flow.includes('key='));
});

test('pin entrance uses only approved timing and removes translation under Reduced Motion', () => {
  const standard = pinEntrance(false);
  const reduced = pinEntrance(true);
  assert.equal(standard.fromY, motionTokens.interactionRules.pinEnterTranslateYPx);
  assert.equal(standard.enter.duration + standard.settle.duration, 420);
  assert.equal(reduced.fromY, 0);
  assert.equal(reduced.settleY, 0);
  assert.equal(reduced.fade.duration, motionTimings.press.duration);
});
