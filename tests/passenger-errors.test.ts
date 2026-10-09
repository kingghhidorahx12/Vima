import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { passengerActionError, passengerErrorMessage, passengerTripUpdateError } from '../src/features/passenger/passengerErrors.ts';
import { TripHttpSnapshotError } from '../src/services/matching/tripHttpSnapshot.ts';

test('Passenger maps snapshot, identity and reconciliation exceptions to stable recoverable copy', () => {
  const internal = [
    new TripHttpSnapshotError('id_mismatch'),
    new Error('Invalid authoritative trip response'),
    new Error('Cannot reconcile different trips'),
    new Error('active_request_identity_violation'),
    new Error('Unsupported passenger snapshot'),
  ];
  for (const error of internal) {
    assert.equal(passengerErrorMessage(error), passengerTripUpdateError);
    assert.doesNotMatch(passengerErrorMessage(error), /authoritative|reconcile|identity|snapshot/i);
  }
});

test('Passenger visible errors use an explicit product allowlist and never arbitrary exception text', () => {
  assert.equal(passengerErrorMessage(new Error('No se pudo guardar el lugar')), 'No se pudo guardar el lugar');
  assert.equal(passengerErrorMessage(new Error('stack payload bearer SECRET')), passengerActionError);
  const screen = readFileSync('src/features/passenger/PassengerScreen.tsx', 'utf8');
  assert.doesNotMatch(screen, /flow\.error\.message/);
  assert.match(screen, /accessibilityLabel=\{visibleError\}/);
  assert.match(screen, /<StatusNotice retry>\{visibleError\}<\/StatusNotice>/);
});
