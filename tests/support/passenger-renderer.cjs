/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('@babel/core');
const React = require('react');
const renderer = require('react-test-renderer');
const query = require('@tanstack/react-query');

// Native boundaries are test doubles. This tests React identity/interaction, not native rendering.
function createHarness(boundaryOverrides = {}) {
  const modules = new Map();
  const mounted = { map: 0, unmountedMap: 0, sheet: 0, haptics: [], keyboardDismiss: 0, blur: 0, inputFocused: false };
  const root = path.resolve(__dirname, '../..');
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'TextInput', 'Image', 'ActivityIndicator'].map((name) => [name, name]));
  native.StyleSheet = { create: (styles) => styles, absoluteFill: { position: 'absolute' } };
  native.AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  native.Keyboard = { dismiss() { mounted.keyboardDismiss++; mounted.inputFocused = false; } };
  const animated = { default: { View: 'AnimatedView' }, cancelAnimation() {}, ReduceMotion: { System: 'system', Never: 'never' },
    useSharedValue: (initial) => { const value = React.useRef(initial); return React.useMemo(() => ({ get: () => value.current, set: (next) => { value.current = next; } }), []); },
    useAnimatedStyle: (fn) => fn(), withTiming: (value) => value, withRepeat: (value) => value };
  const overrides = {
    'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-reanimated': { __esModule: true, ...animated },
    'expo-router': { useFocusEffect: React.useEffect },
  };
  function load(filename) {
    const resolved = path.resolve(filename);
    if (modules.has(resolved)) return modules.get(resolved).exports;
    if (resolved.endsWith('VimaMap.tsx')) return { VimaMap: function Map(props) {
      React.useEffect(() => { mounted.map++; return () => { mounted.unmountedMap++; }; }, []);
      return React.createElement('NativeMapBoundary', props, props.children);
    } };
    if (resolved.endsWith('PassengerMap.tsx')) return { PassengerMap: 'PassengerMapContent' };
    if (resolved.endsWith('VimaRideSheet.tsx')) return {
      createRideSheetInteraction: (height, targetOffset, allowedOffsets) => ({ height, targetOffset, allowedOffsets }),
      VimaRideSheet: function Sheet(props) { React.useEffect(() => { mounted.sheet++; }, []);
        return React.createElement('SheetBoundary', props, props.header, props.children); },
    };
    if (resolved.endsWith('haptics.ts')) return { semanticHaptics: async (event) => { mounted.haptics.push(event); } };
    if (resolved.endsWith('ReducedMotion.tsx')) return { useMotionPolicy: () => ({ reducedMotion: false, allowDecorativeLoops: true }) };
    if (resolved.endsWith(path.join('themes', 'index.tsx'))) return { useVimaTheme: () => load(path.join(root, 'src/design/themes/light.ts')).lightTheme };
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
  return { mounted, client, async render(gateway) {
    let tree;
    await renderer.act(async () => { tree = renderer.create(React.createElement(query.QueryClientProvider, { client },
      React.createElement(Screen, { gateway, mapConfig: fakeMapConfig, boundaries })), { createNodeMock(element) {
        if (element.type === 'TextInput') { mounted.inputFocused = true; return {
          blur() { mounted.blur++; mounted.inputFocused = false; }, focus() { mounted.inputFocused = true; },
        }; }
        if (element.type === 'ScrollView') return { scrollTo() {} };
        return null;
      } }); });
    return tree;
  }, act: renderer.act };
}
module.exports = { createHarness };
