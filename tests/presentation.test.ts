import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import renderer from 'react-test-renderer';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

test('button loading keeps its accessible action, blocks duplicate taps and stays static under Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { VimaButton } = h.load('src/design/components/VimaButton.tsx');
    let calls = 0;
    const scene = (loading: boolean) => React.createElement(VimaButton, { label: 'Llamar', icon: 'phone',
      secondary: true, communication: true, loading, onPress: () => { calls++; } });
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(scene(true)); });
    try {
      const busy = tree.root.findByType('Pressable' as never);
      assert.equal(busy.props.accessibilityLabel, 'Llamar');
      assert.equal(busy.props.accessibilityState.busy, true);
      assert.equal(busy.props.disabled, true);
      assert.equal(tree.root.findAllByType('ActivityIndicator' as never).length, reduced ? 0 : 1);
      const content = tree.root.findAllByType('View' as never)[0]!;
      const style = Object.assign({}, ...content.props.style.filter(Boolean));
      assert.equal(style.opacity === 0, !reduced);
      assert.equal(calls, 0);
      await h.act(async () => tree.update(scene(false)));
      const ready = tree.root.findByType('Pressable' as never);
      assert.equal(ready.props.disabled, false);
      await h.act(async () => ready.props.onPress());
      assert.equal(calls, 1);
      assert.equal(h.mounted.haptics.length, 1);
    } finally { await h.act(async () => tree.unmount()); }
  }
});
