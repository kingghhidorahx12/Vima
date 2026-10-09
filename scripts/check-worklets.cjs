const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformFileSync } = require('@babel/core');

for (const filename of ['src/motion/ElementEntrance.tsx', 'src/motion/PassengerScenePresence.tsx', 'src/motion/mapPersonality.ts', 'src/features/passenger/MapControls.tsx', 'src/features/passenger/MapCompass.tsx', 'src/motion/helpers.ts', 'src/motion/timing.ts', 'src/motion/usePressFeedback.ts', 'src/motion/ScreenTransition.tsx', 'src/motion/SearchPulse.tsx', 'src/motion/VimaLaunchSurface.tsx', 'src/map/MapPlacePin.tsx', 'src/map/DriverVehicleMarker.tsx', 'src/design/components/VimaThemeToggle.tsx', 'src/map/vehicleMotion.ts', 'src/map/useVehicleMotion.ts', 'src/map/VehicleLayer.tsx', 'src/map/routeGeometry.ts', 'src/map/RouteLayer.tsx', 'src/design/components/rideSheetGeometry.ts', 'src/design/components/VimaRideSheet.tsx', 'src/features/passenger/PassengerMapPin.tsx']) {
  const result = transformFileSync(filename, {
    caller: { name: 'metro', platform: 'android', engine: 'hermes', isDev: true },
  });
  assert.ok(result.code.includes('__workletHash'), `Worklets transform missing: ${filename}`);
  console.log(`Worklets transform OK: ${filename}`);
}

// The full scene must use the transformed stable presence, without an exiting tree.
const passenger = fs.readFileSync('src/features/passenger/PassengerScreen.tsx', 'utf8');
assert.match(passenger, /<PassengerScenePresence scene=\{scene\} style=\{styles\.fill\}\s+pointerEvents=\{detachedPanel \? 'box-none' : undefined\}>/);
assert.match(passenger, /<Animated\.View ref=\{viewportNode\} testID="passenger-sheet-viewport"/);
assert.match(passenger, /<View ref=\{headerNode\} testID="passenger-sheet-header"/);
assert.match(passenger, /<View ref=\{contentNode\} testID="passenger-sheet-content"/);
assert.doesNotMatch(passenger, /(?:<Animated\.View|<View) key=\{[^}]*measureKey[^}]*\} testID="passenger-sheet-(?:viewport|header)"/);
assert.doesNotMatch(passenger, /<ElementEntrance key=\{scene\}/);
assert.match(passenger, /const measuredForCurrentGeneration = headerMeasure\?\.key === measureKey && contentMeasure\?\.key === measureKey &&/);
assert.match(passenger, /if \(active && currentMeasureKey\.current === measureKey && Number\.isFinite\(measuredHeight\)/);
const presence = fs.readFileSync('src/motion/PassengerScenePresence.tsx', 'utf8');
assert.match(presence, /testID="passenger-phase-presence"/);
assert.match(presence, /cancelAnimation\(progress\)/);
assert.doesNotMatch(presence, /\bexiting\s*=/);
assert.doesNotMatch(presence, /\bkey\s*=/);
console.log('Passenger scene presence uses one transformed, interruptible worklet');
