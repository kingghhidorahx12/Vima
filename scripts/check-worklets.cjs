const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformFileSync } = require('@babel/core');

for (const filename of ['src/motion/ElementEntrance.tsx', 'src/motion/mapPersonality.ts', 'src/features/passenger/MapControls.tsx', 'src/features/passenger/MapCompass.tsx', 'src/motion/helpers.ts', 'src/motion/timing.ts', 'src/motion/usePressFeedback.ts', 'src/motion/ScreenTransition.tsx', 'src/motion/SearchPulse.tsx', 'src/motion/VimaLaunchSurface.tsx', 'src/map/vehicleMotion.ts', 'src/map/useVehicleMotion.ts', 'src/map/VehicleLayer.tsx', 'src/map/routeGeometry.ts', 'src/map/RouteLayer.tsx', 'src/design/components/rideSheetGeometry.ts', 'src/design/components/VimaRideSheet.tsx', 'src/features/passenger/PassengerMapPin.tsx']) {
  const result = transformFileSync(filename, {
    caller: { name: 'metro', platform: 'android', engine: 'hermes', isDev: true },
  });
  assert.ok(result.code.includes('__workletHash'), `Worklets transform missing: ${filename}`);
  console.log(`Worklets transform OK: ${filename}`);
}

// PassengerScreen delegates its former local animated style to ElementEntrance.
// Keep checking the transformed worklet above and the actual scene wiring here.
const passenger = fs.readFileSync('src/features/passenger/PassengerScreen.tsx', 'utf8');
assert.match(passenger, /<ElementEntrance key=\{scene\}[^>]*timing=\{sceneTiming\} exit exitTiming=\{sceneExitTiming\} distance=\{motionDistances\.sceneTransitionY\}/);
assert.match(passenger, /const sceneTiming = sceneSurface \? motionTimings\.sceneSurface : motionTimings\.scene;/);
assert.match(passenger, /const sceneExitTiming = sceneSurface \? motionTimings\.sceneSurfaceExit : motionTimings\.sceneExit;/);
console.log('Passenger scene presence uses transformed ElementEntrance worklet');
