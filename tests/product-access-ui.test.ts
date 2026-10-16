import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { ProductAuthClientError } from '../src/services/auth/productSession.ts';
import { validMexicanPhone, mexicanPhoneDigits, otpDigits, countdown } from '../src/features/auth/accessModel.ts';
const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const account = { accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', displayName: 'María López', capabilities: ['passenger'] };
function harness(auth: Record<string, unknown>, dark = false) {
  const calls: unknown[][] = []; let back: (() => boolean) | undefined;
  const router = { replace: (route: unknown) => calls.push(['replace', route]), back: () => calls.push(['back']),
    canGoBack: () => true, dismissAll: () => calls.push(['dismiss']) };
  let theme!: unknown;
  const native = { ...Object.fromEntries(['View', 'Text', 'TextInput', 'Image', 'Pressable', 'ScrollView', 'KeyboardAvoidingView', 'ActivityIndicator'].map(n => [n, n])),
    StyleSheet: { create: (s: unknown) => s, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } },
    Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    BackHandler: { addEventListener: (_event: string, callback: () => boolean) => { back = callback; return { remove() {} }; } } };
  const h = createMapHarness({ reduced: true, fileOverrides: {
    'src/services/auth/productSession.ts': { productAuthClient: () => auth, ProductAuthClientError },
    'src/design/themes/index.tsx': { useVimaTheme: () => theme,
      useVimaThemeControl: () => ({ name: dark ? 'dark' : 'light', toggleTheme: () => calls.push(['theme']) }) },
  }, externalOverrides: { 'react-native': native,
    'expo-sqlite/kv-store': { getItem: async () => null },
    'expo-modules-core': { requireOptionalNativeModule: () => ({ manifest: '{"version":"2.3.4"}' }) },
    'expo-updates': { isEnabled: true, isEmbeddedLaunch: false, updateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({}),
      useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]) },
    '@tanstack/react-query': { useQueryClient: () => ({ clear: () => calls.push(['clear']) }) },
  } });
  theme = h.load(dark ? 'src/design/themes/dark.ts' : 'src/design/themes/light.ts')[dark ? 'darkTheme' : 'lightTheme'];
  return { ...h, calls, back: () => back?.(), renderAuth: () => h.render(React.createElement(h.load('src/features/auth/ProductAuthScreen.tsx').ProductAuthScreen)),
    renderAccount: () => h.render(React.createElement(h.load('src/features/auth/ProductAccountScreen.tsx').ProductAccountScreen)) };
}
const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;
const input = (tree: ReactTestRenderer, label: string) => tree.root.findByProps({ accessibilityLabel: label });

test('access logo uses transparent master and an undecorated frame in both themes without resizing', async () => {
  const surface = readFileSync(new URL('../src/features/auth/AccessSurface.tsx', import.meta.url), 'utf8');
  assert.match(surface, /require\('\.\.\/\.\.\/\.\.\/assets\/brand\/vima_header_lockup_final\.png'\)/);
  for (const dark of [false, true]) {
    const h = harness({ current: async () => null }, dark);
    const tree = await h.renderAuth();
    try {
      const logo = tree.root.findByProps({ accessibilityLabel: 'Vima' });
      assert.ok(logo.props.source);
      assert.deepEqual(logo.props.style, { width: 140, height: 44 });
      assert.equal(logo.props.resizeMode, 'contain');
      assert.equal(logo.parent!.props.style.alignSelf, 'center');
      assert.equal(logo.parent!.props.style.padding, 8);
      assert.equal(logo.parent!.props.style.backgroundColor, undefined);
      assert.equal(logo.props.style.backgroundColor, undefined);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('Mexican phone, six-digit OTP and deadline countdown are bounded and do not modify layout', () => {
  assert.equal(validMexicanPhone('5512345678'), true); assert.equal(validMexicanPhone('0551234567'), false);
  assert.equal(validMexicanPhone('+525512345678'), false);
  assert.equal(mexicanPhoneDigits('+52 55 1234 5678'), '5512345678');
  assert.equal(validMexicanPhone(mexicanPhoneDigits('+1 555 123 4567')), false);
  assert.equal(otpDigits('12 34-56xx7'), '123456');
  assert.equal(countdown(60000, 1000), 59); assert.equal(countdown(60000, 70000), 0);
});

test('OTP has one native input hidden as a whole, preserves paste, autofill and deletion in both themes', async () => {
  for (const dark of [false, true]) {
    const h = harness({ current: async () => null, startOtp: async () => ({ challengeId: 'otp', expiresIn: 600 }) }, dark);
    const tree = await h.renderAuth();
    try {
      await h.act(async () => input(tree, 'Teléfono mexicano').props.onChangeText('5512345678'));
      assert.equal(tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Restaurar sesión existente').length, 0);
      await h.act(async () => button(tree, 'Continuar').props.onPress());
      const field = () => input(tree, 'Código de verificación de seis dígitos');
      assert.equal(tree.root.findAllByType('TextInput' as never).length, 1);
      assert.equal(field().props.style.opacity, 0);
      assert.equal(field().props.autoComplete, 'one-time-code');
      assert.equal(field().props.textContentType, 'oneTimeCode');
      assert.equal(field().props.importantForAutofill, 'yes');
      assert.equal(field().props.autoFocus, true);
      for (const [nativeValue, expected] of [['1', '1'], ['12', '12'], ['123', '123'], ['12', '12'], ['', ''], ['123 456', '123456'], ['654321', '654321']]) {
        await h.act(async () => field().props.onChangeText(nativeValue));
        assert.equal(field().props.value, expected);
        const cells = tree.root.findByProps({ testID: 'product-otp-field' }).findAllByType('Text' as never);
        assert.equal(cells.map((cell: ReactTestInstance) => cell.props.children).join(''), expected);
      }
      assert.equal(button(tree, 'Verificar código').props.disabled, false);
      assert.equal(field().props.editable, true);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('new phone uses existing endpoints, six cells, guarded resend and mandatory name in both themes', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_800_000_000_000 });
  for (const dark of [false, true]) {
    const events: unknown[][] = [];
    const h = harness({ current: async () => null,
      startOtp: async (phone: string) => { events.push(['start', phone]); return { challengeId: 'challenge', expiresIn: 600 }; },
      verifyOtp: async (_challenge: string, code: string) => { events.push(['verify', code]); return { status: 'registration_required', registrationToken: 'grant' }; },
      register: async (_grant: string, name: string) => { events.push(['register', name]); return account; },
    }, dark);
    const tree: ReactTestRenderer = await h.renderAuth();
    try {
      await h.act(async () => input(tree, 'Teléfono mexicano').props.onChangeText('5512345678'));
      await h.act(async () => button(tree, 'Continuar').props.onPress());
      assert.deepEqual(events[0], ['start', '+525512345678']);
      assert.equal(input(tree, 'Código de verificación de seis dígitos').props.maxLength, 32);
      assert.equal(tree.root.findByProps({ testID: 'product-otp-field' }).findAllByType('Text' as never).length, 6);
      assert.equal(button(tree, 'Reenviar código').props.disabled, true);
      await h.act(async () => t.mock.timers.tick(60000));
      assert.equal(button(tree, 'Reenviar código').props.disabled, false);
      await h.act(async () => button(tree, 'Reenviar código').props.onPress());
      assert.equal(events.filter(e => e[0] === 'start').length, 2);
      await h.act(async () => input(tree, 'Código de verificación de seis dígitos').props.onChangeText('123456'));
      await h.act(async () => button(tree, 'Verificar código').props.onPress());
      assert.equal(button(tree, 'Continuar').props.disabled, true);
      await h.act(async () => input(tree, 'Nombre completo').props.onChangeText('María López'));
      await h.act(async () => button(tree, 'Continuar').props.onPress());
      assert.deepEqual(h.calls.at(-1), ['replace', '/passenger']);
      assert.deepEqual(events.at(-1), ['register', 'María López']);
      assert.equal(tree.root.findAllByType('ScrollView' as never).length, 1);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('wrong code stays editable; local expiration disables verify and back changes phone without clearing a session', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_800_000_000_000 });
  const h = harness({ current: async () => null, startOtp: async () => ({ challengeId: 'c', expiresIn: 600 }),
    verifyOtp: async () => { throw new ProductAuthClientError(400, 'invalid_or_expired_code'); } });
  const tree: ReactTestRenderer = await h.renderAuth();
  try {
    await h.act(async () => input(tree, 'Teléfono mexicano').props.onChangeText('5512345678'));
    await h.act(async () => button(tree, 'Continuar').props.onPress());
    await h.act(async () => input(tree, 'Código de verificación de seis dígitos').props.onChangeText('123456'));
    await h.act(async () => button(tree, 'Verificar código').props.onPress());
    assert.ok(tree.root.findAll(n => n.props.accessibilityRole === 'alert').length);
    assert.equal(input(tree, 'Código de verificación de seis dígitos').props.editable, true);
    await h.act(async () => t.mock.timers.tick(600000));
    assert.equal(button(tree, 'Verificar código').props.disabled, true);
    await h.act(async () => h.back());
    assert.equal(input(tree, 'Teléfono mexicano').props.value, '5512345678');
    assert.equal(h.calls.some((c: unknown[]) => c[0] === 'clear'), false);
  } finally { await h.act(async () => tree.unmount()); }
});

test('stored session routes to existing Passenger restoration; offline restoration has recovery and retains credentials', async () => {
  for (const restored of [true, false]) {
    const h = harness({ current: async () => { if (restored) return account; throw new ProductAuthClientError(0, 'network_recoverable'); } });
    const tree: ReactTestRenderer = await h.renderAuth();
    try {
      if (restored) assert.deepEqual(h.calls.at(-1), ['replace', '/passenger']);
      else { assert.ok(button(tree, 'Reintentar')); assert.equal(h.calls.some((c: unknown[]) => c[0] === 'clear'), false); }
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('restoration UI does not abort a still-valid sequence at twelve seconds and back ignores its late account', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let complete!: (value: typeof account) => void; let signal!: AbortSignal;
  const h = harness({ current: (value: AbortSignal) => { signal = value; return new Promise(resolve => { complete = resolve; }); } });
  const tree = await h.renderAuth();
  try {
    await h.act(async () => t.mock.timers.tick(12001));
    assert.equal(signal.aborted, false); assert.equal(button(tree, 'Reintentar'), undefined);
    await h.act(async () => h.back()); assert.equal(signal.aborted, true);
    await h.act(async () => complete(account));
    assert.equal(h.calls.some((call: unknown[]) => call[0] === 'replace'), false);
  } finally { await h.act(async () => tree.unmount()); }
});

test('account shows real name, theme setting and confirmed product logout; unsupported actions are absent', async () => {
  let loggedOut = 0;
  const h = harness({ current: async () => account, logout: async () => { loggedOut++; } });
  const tree: ReactTestRenderer = await h.renderAccount();
  try {
    assert.ok(tree.root.findAllByType('Text' as never).some(n => n.props.children === account.displayName));
    const about = tree.root.findByProps({ testID: 'vima-about' });
    const info = about.findAllByType('Text' as never).map(n => React.Children.toArray(n.props.children).join('')).join('\n');
    assert.match(info, /Acerca de Vima/); assert.match(info, /Versión del APK · 2\.3\.4/);
    assert.match(info, /Desarrollo/); assert.doesNotMatch(info, /última versión/i);
    const labels = tree.root.findAllByType('Pressable' as never).map(n => n.props.accessibilityLabel);
    assert.equal(labels.some(label => /foto|editar|pago|soporte|conductor/i.test(label ?? '')), false);
    await h.act(async () => button(tree, 'Cambiar apariencia').props.onPress()); assert.ok(h.calls.some((c: unknown[]) => c[0] === 'theme'));
    await h.act(async () => button(tree, 'Cerrar sesión').props.onPress()); assert.equal(loggedOut, 0);
    await h.act(async () => button(tree, 'Confirmar cierre de sesión').props.onPress());
    assert.equal(loggedOut, 1); assert.deepEqual(h.calls.slice(-3), [['clear'], ['dismiss'], ['replace', '/auth']]);
  } finally { await h.act(async () => tree.unmount()); }
});

test('About Vima is a discrete final Profile section in both themes, without replacing settings or logout', async () => {
  for (const dark of [false, true]) {
    const h = harness({ current: async () => account }, dark);
    const tree: ReactTestRenderer = await h.renderAccount();
    try {
      const about = tree.root.findByProps({ testID: 'vima-about' });
      const views = tree.root.findAll(n => typeof n.type === 'string');
      assert.ok(views.indexOf(about) > views.indexOf(button(tree, 'Cerrar sesión')));
      assert.equal(about.findAllByType('Pressable' as never).length, 0);
      assert.ok(button(tree, 'Cambiar apariencia'));
      assert.equal(h.calls.length, 0); // Metadata reading has no session/update/navigation side effect.
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('existing phone enters Passenger without registration; rapid taps use one verification', async () => {
  let calls = 0;
  const h = harness({ current: async () => null, startOtp: async () => ({ challengeId: 'c', expiresIn: 600 }),
    verifyOtp: async () => { calls++; return { status: 'authenticated', session: account }; } });
  const tree: ReactTestRenderer = await h.renderAuth();
  try {
    await h.act(async () => input(tree, 'Teléfono mexicano').props.onChangeText('5512345678'));
    await h.act(async () => button(tree, 'Continuar').props.onPress());
    await h.act(async () => input(tree, 'Código de verificación de seis dígitos').props.onChangeText('123456'));
    await h.act(async () => { const press = button(tree, 'Verificar código').props.onPress; press(); press(); });
    assert.equal(calls, 1); assert.deepEqual(h.calls.at(-1), ['replace', '/passenger']);
    assert.equal(tree.root.findAllByProps({ accessibilityLabel: 'Nombre completo' }).length, 0);
  } finally { await h.act(async () => tree.unmount()); }
});

test('Passenger presentation reveals restored state only after the existing active-request bootstrap, without remount', async () => {
  const { createHarness } = require('./support/passenger-renderer.cjs');
  const { createPassengerFixtureGateway } = await import('../src/dev/passenger/gateway.ts');
  let release!: (value: null) => void;
  const active = new Promise<null>(resolve => { release = resolve; });
  const fixture = createPassengerFixtureGateway({ after: () => () => {}, delay: async () => {} });
  const h = createHarness({ renderRestoration: ({ ready }: { ready: boolean }) => ready ? null : React.createElement('View', { testID: 'restore-before-home' }) });
  const tree: ReactTestRenderer = await h.render({ ...fixture.gateway, source: 'server', activeRequest: () => active });
  try {
    assert.ok(tree.root.findByProps({ testID: 'restore-before-home' }));
    await h.act(async () => release(null));
    assert.equal(tree.root.findAllByProps({ testID: 'restore-before-home' }).length, 0);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('Perfil is functional only with a product boundary; QA and unavailable modules remain disabled', async () => {
  const { createHarness } = require('./support/passenger-renderer.cjs');
  const { createPassengerFixtureGateway } = await import('../src/dev/passenger/gateway.ts');
  let opened = 0;
  for (const enabled of [false, true]) {
    const h = createHarness(enabled ? { account: () => opened++ } : {});
    const fixture = createPassengerFixtureGateway({ after: () => () => {}, delay: async () => {} });
    const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      assert.equal(button(tree, 'Perfil').props.disabled, !enabled);
      assert.equal(button(tree, 'Perfil').props.accessibilityState.selected, false);
      assert.equal(button(tree, 'Viajes').props.disabled, true); assert.equal(button(tree, 'Pagos').props.disabled, true);
      if (enabled) { await h.act(async () => button(tree, 'Perfil').props.onPress()); assert.equal(opened, 1); }
    } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('logout storage failure is recoverable and cannot claim a successful local logout', async () => {
  const h = harness({ current: async () => account, logout: async () => { throw new ProductAuthClientError(0, 'session_storage_unavailable'); } });
  const tree: ReactTestRenderer = await h.renderAccount();
  try {
    await h.act(async () => button(tree, 'Cerrar sesión').props.onPress());
    await h.act(async () => button(tree, 'Confirmar cierre de sesión').props.onPress());
    assert.equal(h.calls.some((c: unknown[]) => c[0] === 'clear' || c[0] === 'replace'), false);
    assert.equal(button(tree, 'Confirmar cierre de sesión').props.disabled, false);
    assert.ok(tree.root.findAll(n => n.props.accessibilityRole === 'alert').length);
  } finally { await h.act(async () => tree.unmount()); }
});
