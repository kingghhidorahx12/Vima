/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@babel/core');
const React = require('react');
const renderer = require('react-test-renderer');
const query = require('@tanstack/react-query');

// Native boundaries are test doubles. This tests React identity/interaction, not native rendering.
function createHarness(boundaryOverrides = {}, { reduced = false, insets = { top: 24, bottom: 16, left: 0, right: 0 },
  realRideSheet = false, themeName = 'light' } = {}) {
  const animations = [];
  const delays = [];
  const repeats = [];
  const cancellations = [];
  const appStateListeners = new Set();
  const projection = { point: [190, 120], project: undefined };
  const modules = new Map();
  const mounted = { map: 0, unmountedMap: 0, sheet: 0, haptics: [], keyboardDismiss: 0, blur: 0, inputFocused: false };
  const root = path.resolve(__dirname, '../..');
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'TextInput', 'Image', 'ActivityIndicator'].map((name) => [name, name]));
  native.Platform = { OS: 'android' };
  native.StyleSheet = { create: (styles) => styles,
    absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } };
  native.AppState = { currentState: 'active', addEventListener: (_event, listener) => {
    appStateListeners.add(listener); return { remove() { appStateListeners.delete(listener); } };
  } };
  let back;
  native.BackHandler = { addEventListener: (_event, fn) => { back = fn; return { remove() { back = undefined; } }; } };
  native.Keyboard = { dismiss() { mounted.keyboardDismiss++; mounted.inputFocused = false; } };
  const builder = (kind, values = {}) => ({ kind, ...values,
    duration(value) { return builder(kind, { ...values, durationMs: value }); },
    easing(value) { return builder(kind, { ...values, curve: value }); },
    reduceMotion(value) { return builder(kind, { ...values, reduction: value }); },
    withInitialValues(value) { return builder(kind, { ...values, initial: value }); },
    withTargetValues(value) { return builder(kind, { ...values, target: value }); } });
  const animated = { FadeIn: builder('FadeIn'), FadeOut: builder('FadeOut'),
    FadeInDown: builder('FadeInDown'), FadeOutDown: builder('FadeOutDown'), FadeOutUp: builder('FadeOutUp'),
    default: { View: 'AnimatedView' }, cancelAnimation(value) { cancellations.push(value); }, ReduceMotion: { System: 'system', Never: 'never' },
    useSharedValue: (initial) => { const value = React.useRef(initial); return React.useMemo(() => ({ get: () => value.current, set: (next) => { value.current = next; } }), []); },
    useAnimatedReaction() {},
    runOnJS: (fn) => fn,
    useAnimatedStyle: (fn) => fn(), interpolateColor: (value, range, colors) => {
      const fraction = Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
      const channels = [1, 3, 5].map(offset => Math.round(parseInt(colors[0].slice(offset, offset + 2), 16) * (1 - fraction) +
        parseInt(colors[1].slice(offset, offset + 2), 16) * fraction));
      return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    }, withTiming: (value, config, completion) => { animations.push({ value, ...config, completion }); return value; },
    withRepeat: (value, count) => { repeats.push({ value, count }); return value; },
    withSequence: (...values) => values.at(-1), withDelay: (duration, value) => { delays.push(duration); return value; } };
  const kv = new Map();
  const nativeHeights = new Map();
  const overrides = {
    'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => insets, SafeAreaView: 'SafeAreaView' },
    'react-native-reanimated': { __esModule: true, ...animated },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => fn(...args) },
    'react-native-gesture-handler': { Gesture: { Pan: () => {
      const pan = { enabled: () => pan, onStart: () => pan, onUpdate: () => pan, onFinalize: () => pan,
        activeOffsetY: () => pan, failOffsetX: () => pan }; return pan;
    } }, GestureDetector: ({ children }) => React.createElement('GestureDetector', null, children) },
    'expo-image': { Image: 'ExpoImage' },
    'expo-blur': { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-router': { useFocusEffect: React.useEffect, Link: 'Link' },
    'expo-dev-client': { registerDevMenuItems: async () => {} },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async () => null,
      setItemAsync: async () => {}, deleteItemAsync: async () => {} },
    'expo-sqlite/kv-store': { __esModule: true, default: {
      getItem: async key => kv.get(key) ?? null, setItem: async (key, value) => { kv.set(key, value); },
    } },
  };
  function load(filename) {
    const resolved = path.resolve(filename);
    if (modules.has(resolved)) return modules.get(resolved).exports;
    if (resolved.endsWith('VimaMap.tsx')) return { VimaMap: function Map(props) {
      React.useImperativeHandle(props.ref, () => ({ project: (...args) => projection.project ? projection.project(...args) : Promise.resolve(projection.point) }), []);
      React.useEffect(() => { mounted.map++; return () => { mounted.unmountedMap++; }; }, []);
      return React.createElement('NativeMapBoundary', props, props.children);
    } };
    if (resolved.endsWith('PassengerMap.tsx')) return { PassengerMap: 'PassengerMapContent' };
    if (resolved.endsWith('VimaRideSheet.tsx') && !realRideSheet) return {
      createRideSheetInteraction: (height, targetOffset, allowedOffsets) => ({ height, targetOffset, allowedOffsets }),
      VimaRideSheet: function Sheet(props) { React.useEffect(() => { mounted.sheet++; }, []);
        return React.createElement('SheetBoundary', props, props.header, props.children); },
    };
    if (resolved.endsWith('haptics.ts')) return { semanticHaptics: async (event) => { mounted.haptics.push(event); } };
    if (resolved.endsWith('ReducedMotion.tsx')) return { useMotionPolicy: () => ({ reducedMotion: reduced, allowDecorativeLoops: !reduced }) };
    if (resolved.endsWith(path.join('themes', 'index.tsx'))) return { useVimaTheme: () => themeName === 'dark'
      ? load(path.join(root, 'src/design/themes/dark.ts')).darkTheme
      : load(path.join(root, 'src/design/themes/light.ts')).lightTheme };
    if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (resolved.endsWith('.png')) return resolved;
    const module = { exports: {} };
    modules.set(resolved, module);
    const transformed = transformSync(fs.readFileSync(resolved, 'utf8'), {
      filename: resolved, configFile: false, babelrc: false,
      presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: resolved.endsWith('.tsx') }]],
      plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
    }).code;
    const localRequire = (id) => {
      if (overrides[id]) return overrides[id];
      if (!id.startsWith('.')) return require(id);
      const base = path.resolve(path.dirname(resolved), id);
      const target = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
        .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw new Error(`Cannot resolve ${id} from ${resolved}`);
      return load(target);
    };
    new Function('require', 'module', 'exports', transformed)(localRequire, module, module.exports);
    return module.exports;
  }
  const Screen = load(path.join(root, 'src/features/passenger/PassengerScreen.tsx')).PassengerScreen;
  const fakeMapConfig = {};
  const boundaries = { schedule() {}, call() {}, safety() {}, ...boundaryOverrides };
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return { projection, animations, delays, repeats, cancellations, mounted, client, QueryClientProvider: query.QueryClientProvider,
    kv, nativeHeights, load,
    setAppState(state) { native.AppState.currentState = state; for (const listener of appStateListeners) listener(state); },
    back: () => back?.(), async render(gateway) {
    let tree;
    await renderer.act(async () => { tree = renderer.create(React.createElement(query.QueryClientProvider, { client },
      React.createElement(Screen, { gateway, mapConfig: fakeMapConfig, boundaries })), { createNodeMock(element) {
        if (element.type === 'TextInput') { mounted.inputFocused = true; return {
          blur() { mounted.blur++; mounted.inputFocused = false; }, focus() { mounted.inputFocused = true; },
        }; }
        if (element.type === 'ScrollView') return { scrollTo() {} };
        if (['passenger-sheet-header', 'passenger-sheet-content', 'passenger-sheet-viewport'].includes(element.props.testID)) {
          return { measure(callback) {
            const height = nativeHeights.get(element.props.testID);
            if (height !== undefined) callback(0, 0, 390, height, 0, 0);
          } };
        }
        return null;
      } }); });
    return tree;
  }, act: renderer.act };
}
module.exports = { createHarness };
