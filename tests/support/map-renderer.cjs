/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const renderer = require('react-test-renderer');
const { transformSync } = require('@babel/core');

function createMapHarness({ reduced = false } = {}) {
  const root = path.resolve(__dirname, '../..');
  const modules = new Map(); const calls = []; const reactions = []; const frames = [];
  const policy = { reducedMotion: reduced, allowCameraAnimation: !reduced };
  const sample = { current: null, get() { return this.current; }, set(v) { this.current = v; } };
  const poses = { current: null, get() { return this.current; }, set(v) { this.current = v; } };
  function component(name) {
    return class NativeBoundary extends React.Component {
      componentDidMount() { calls.push(['mount', name]); }
      componentWillUnmount() { calls.push(['unmount', name]); }
      setCamera(...args) { calls.push(['setCamera', ...args]); }
      animateCamera(...args) { calls.push(['animateCamera', ...args]); }
      fitToCoordinates(...args) { calls.push(['fitToCoordinates', ...args]); }
      setCoordinates(...args) { calls.push(['setCoordinates', ...args]); }
      setNativeProps(...args) { calls.push(['setNativeProps', ...args]); }
      redraw() { calls.push(['redraw']); }
      setStop(...args) { calls.push(['setStop', ...args]); return Promise.resolve(); }
      render() { return React.createElement(name, this.props, this.props.children); }
    };
  }
  const native = { View: 'View', Platform: { OS: 'android' }, StyleSheet: { create: s => s } };
  const animated = {
    __esModule: true, default: { createAnimatedComponent: Component => function Animated(props) {
      return React.createElement(Component, { ...props, ...props.animatedProps });
    } },
    useSharedValue: initial => { const value = React.useRef(initial); return React.useMemo(() =>
      ({ get: () => value.current, set: v => { value.current = v; } }), []); },
    useAnimatedProps: fn => fn(),
    useAnimatedReaction: (prepare, react) => {
      const latest = React.useRef({ prepare, react }); latest.current = { prepare, react };
      React.useEffect(() => { const entry = { latest, previous: undefined }; reactions.push(entry);
        return () => { reactions.splice(reactions.indexOf(entry), 1); }; }, []);
    },
    cancelAnimation() {}, withTiming: v => v, ReduceMotion: { Never: 0, System: 1 },
  };
  const overrides = {
    react: React, 'react-native': native,
    'react-native-reanimated': animated, 'react-native-worklets': { scheduleOnRN: (fn, ...args) => fn(...args) },
    '@maplibre/maplibre-react-native': { Map: component('MapLibreMap'), Marker: component('MapLibreMarker'),
      Camera: component('MapLibreCamera'), GeoJSONSource: component('MapLibreSource'), Layer: component('MapLibreLayer') },
  };
  function load(file) {
    const absolute = path.resolve(root, file);
    if (absolute.endsWith('ReducedMotion.tsx')) return { useMotionPolicy: () => policy };
    // Existing vehicle interpolation is tested separately; this boundary checks native pose dispatch.
    if (absolute.endsWith('useVehicleMotion.ts')) return { useVehicleMotion: () => poses };
    if (modules.has(absolute)) return modules.get(absolute).exports;
    if (absolute.endsWith('.json')) return JSON.parse(fs.readFileSync(absolute, 'utf8'));
    const module = { exports: {} }; modules.set(absolute, module);
    const code = transformSync(fs.readFileSync(absolute, 'utf8'), { filename: absolute, configFile: false, babelrc: false,
      presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: absolute.endsWith('.tsx') }]],
      plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
    }).code;
    const localRequire = id => {
      if (overrides[id]) return overrides[id];
      if (!id.startsWith('.')) return require(id);
      const base = path.resolve(path.dirname(absolute), id);
      const target = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]
        .find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!target) throw new Error('Missing test import ' + id);
      return load(target);
    };
    new Function('require', 'module', 'exports', '__DEV__', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
      localRequire, module, module.exports, true, fn => { frames.push(fn); return frames.length; },
      id => { frames[id - 1] = null; });
    return module.exports;
  }
  return { load, calls, sample, poses, policy, act: renderer.act,
    async render(element) { let tree; await renderer.act(async () => { tree = renderer.create(element); }); return tree; },
    async flush() { await renderer.act(async () => {
      for (const entry of [...reactions]) {
        const value = entry.latest.current.prepare();
        if (value !== entry.previous) { entry.latest.current.react(value, entry.previous); entry.previous = value; }
      }
      const pending = frames.splice(0); pending.forEach(fn => fn?.());
    }); },
  };
}
module.exports = { createMapHarness };
