const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformFileSync } = require('@babel/core');

for (const filename of ['src/motion/ElementEntrance.tsx', 'src/motion/PassengerScenePresence.tsx', 'src/motion/mapPersonality.ts', 'src/features/passenger/MapControls.tsx', 'src/features/passenger/MapCompass.tsx', 'src/motion/helpers.ts', 'src/motion/timing.ts', 'src/motion/usePressFeedback.ts', 'src/motion/ScreenTransition.tsx', 'src/motion/SearchPulse.tsx', 'src/motion/VimaLaunchSurface.tsx', 'src/map/vehicleMotion.ts', 'src/map/useVehicleMotion.ts', 'src/map/VehicleLayer.tsx', 'src/map/routeGeometry.ts', 'src/map/RouteLayer.tsx', 'src/design/components/rideSheetGeometry.ts', 'src/design/components/VimaRideSheet.tsx', 'src/features/passenger/PassengerMapPin.tsx']) {
  const result = transformFileSync(filename, {
    caller: { name: 'metro', platform: 'android', engine: 'hermes', isDev: true },
  });
  assert.ok(result.code.includes('__workletHash'), `Worklets transform missing: ${filename}`);
  console.log(`Worklets transform OK: ${filename}`);
}

// The full scene must use the transformed stable presence, without an exiting tree.
const passenger = fs.readFileSync('src/features/passenger/PassengerScreen.tsx', 'utf8');
assert.match(passenger, /<PassengerScenePresence scene=\{scene\} style=\{styles\.fill\}>/);
assert.match(passenger, /<Animated\.View key=\{measureKey\} testID="passenger-sheet-viewport"/);
assert.doesNotMatch(passenger, /<ElementEntrance key=\{scene\}/);
const presence = fs.readFileSync('src/motion/PassengerScenePresence.tsx', 'utf8');
assert.match(presence, /testID="passenger-phase-presence"/);
assert.match(presence, /cancelAnimation\(progress\)/);
assert.doesNotMatch(presence, /\bexiting\s*=/);
assert.doesNotMatch(presence, /\bkey\s*=/);
console.log('Passenger scene presence uses one transformed, interruptible worklet');
