import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { darkTheme } from '../src/design/themes/dark.ts';
import { lightTheme } from '../src/design/themes/light.ts';
import { driverConnectionLabel, driverGpsLabel, driverMapFallback, driverPresentation,
  driverSurfaceVariant } from '../src/features/driver/driverPresentation.ts';
import { resolveVimaThemeName } from '../src/design/themes/resolve.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';

const place = { id: 'pickup', name: 'Plaza', address: 'Centro', coordinate: [-99.88, 19.79] as [number, number] };
const profile = { driver: { name: 'Conductor', rating: 4.9 }, vehicle: { name: 'Auto', plate: 'VIMA', color: 'Blanco' } };
const state = (availability: DriverState['availability']): DriverState => ({ accountId: 'private', revision: 2,
  availability, expiryCount: 0, profile, ...(availability === 'AVAILABLE' ? {
    location: { coordinate: place.coordinate, receivedAt: 1 },
  } : {}), ...(availability === 'ASSIGNED' ? { assignment: { requestId: 'request', pickup: place,
    value: { id: 'assignment', driver: profile.driver, vehicle: profile.vehicle, etaMinutes: 7, pin: '1234',
      sample: { coordinate: place.coordinate, heading: 0, sequence: 1 },
      routeToOrigin: { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const,
        coordinates: [place.coordinate, [-99.87, 19.8]] } },
    } } } : {}) });

test('Driver presentation maps real states to compact and operational critical actions', () => {
  assert.deepEqual(['OFFLINE', 'LOCATING', 'AVAILABLE', 'PAUSED'].map(value => driverSurfaceVariant(value as DriverState['availability'])),
    ['compact', 'compact', 'compact', 'compact']);
  assert.equal(driverSurfaceVariant('ASSIGNED'), 'operational');
  assert.deepEqual(driverPresentation(state('OFFLINE')), { availability: 'OFFLINE', variant: 'compact',
    title: 'No estás disponible', copy: 'Activa tu disponibilidad para recibir viajes.', tone: 'neutral',
    action: 'availability_available', actionLabel: 'Conectarme' });
  assert.equal(driverPresentation(state('AVAILABLE')).action, 'availability_offline');
  assert.equal(driverPresentation(state('PAUSED')).action, 'availability_available');
  assert.equal(driverPresentation(state('ASSIGNED')).action, 'assignment_cancel');
});

test('human GPS and connectivity statuses expose no telemetry or identifiers', () => {
  assert.deepEqual(driverConnectionLabel('online'), { label: 'En línea', tone: 'positive' });
  assert.equal(driverConnectionLabel('reconnecting').label, 'Conexión inestable');
  assert.equal(driverConnectionLabel('offline').label, 'Sin conexión');
  assert.equal(driverGpsLabel(state('AVAILABLE'), '').label, 'Ubicación precisa');
  assert.equal(driverGpsLabel(state('LOCATING'), '').label, 'Buscando señal');
  assert.equal(driverGpsLabel(state('LOCATING'), 'Activa los servicios de ubicación').label, 'Sin ubicación');
});

test('Driver panel keeps critical actions outside secondary scroll and Offer remains frozen', () => {
  const panel = readFileSync('src/features/driver/DriverStatePanel.tsx', 'utf8');
  const screen = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  const offer = readFileSync('src/dev/driver/DriverOffer.tsx', 'utf8');
  assert.match(panel, /testID="driver-critical-region"/);
  assert.ok(panel.indexOf('presentation.actionLabel') < panel.indexOf('testID="driver-secondary-content"'));
  assert.ok(panel.indexOf('accessibilityRole="alert"') < panel.indexOf('presentation.actionLabel'));
  assert.match(panel, /presentation\.variant === 'operational'/);
  assert.equal((screen.match(/<SafeAreaView/g) ?? []).length, 1);
  assert.doesNotMatch(panel, /surface:\s*\{[^}]*\bheight:/s);
  assert.doesNotMatch(screen, /Driver P0|assigned\.value\.id|accountId\} ·/);
  assert.match(screen, /renderPhase=\{\(\) => offer \? <View>\s*<DriverOffer/);
  assert.match(offer, /testID="driver-critical-offer"/);
  assert.ok(offer.indexOf('Oferta ·') < offer.indexOf('label="Aceptar"'));
  assert.ok(offer.indexOf('label="Aceptar"') < offer.indexOf('label="Rechazar"'));
  assert.doesNotMatch(offer, /<ScrollView/);
});

test('light and dark share public contracts and DEV is the only dark preview gate', () => {
  assert.deepEqual(Object.keys(darkTheme), Object.keys(lightTheme));
  assert.deepEqual(Object.keys(darkTheme.surfaces), Object.keys(lightTheme.surfaces));
  assert.deepEqual(Object.keys(darkTheme.text), Object.keys(lightTheme.text));
  assert.equal(resolveVimaThemeName(true, 'dark'), 'dark');
  assert.equal(resolveVimaThemeName(true, ' light '), 'light');
  assert.equal(resolveVimaThemeName(false, 'dark'), 'light');
  const panel = readFileSync('src/features/driver/DriverStatePanel.tsx', 'utf8');
  assert.doesNotMatch(panel, /dark\s*\?\s*</);
  assert.doesNotMatch(panel, /dark\s*&&\s*</);
});

test('Driver uses one Atlacomulco fallback and location pulse is exclusive to LOCATING', () => {
  assert.deepEqual(driverMapFallback, [-99.88795, 19.79021]);
  const screen = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  assert.match(screen, /const target = location\?\.coordinate \?\? driverMapFallback/);
  assert.match(screen, /active=\{availability === 'LOCATING' && foreground && focused\}/);
  assert.doesNotMatch(screen, /zoom:\s*[0123]\b/);
});
