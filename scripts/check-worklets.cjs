const assert = require('node:assert/strict');
const { transformFileSync } = require('@babel/core');

for (const filename of ['src/motion/helpers.ts', 'src/motion/timing.ts', 'src/motion/ScreenTransition.tsx', 'src/motion/SearchPulse.tsx', 'src/map/vehicleMotion.ts', 'src/map/useVehicleMotion.ts', 'src/map/VehicleLayer.tsx', 'src/map/routeGeometry.ts', 'src/map/RouteLayer.tsx', 'src/design/components/rideSheetGeometry.ts', 'src/design/components/VimaRideSheet.tsx', 'src/design/components/VimaButton.tsx', 'src/features/passenger/PassengerScreen.tsx']) {
  const result = transformFileSync(filename, {
    caller: { name: 'metro', platform: 'android', engine: 'hermes', isDev: true },
  });
  assert.ok(result.code.includes('__workletHash'), `Worklets transform missing: ${filename}`);
  console.log(`Worklets transform OK: ${filename}`);
}
