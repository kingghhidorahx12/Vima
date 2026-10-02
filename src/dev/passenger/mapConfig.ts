import { visualTokens as t } from '../../design/tokens';
import type { PassengerMapConfig } from '../../features/passenger/PassengerMap';
import { createVehicleMotion } from '../../map/vehicleMotion';
import { normalizeCoordinate } from '../../map/models';

/** All temporary map measurements stay in this dev adapter, never become approved tokens. */
export const developmentMap: PassengerMapConfig = {
  route: { width: t.spacing.scalePx[0]!, opacity: 1, cap: 'round', join: 'round' },
  point: { radius: t.components.iconSizesPx[0]! / 2, strokeWidth: t.borders.standardWidthPx, strokeColor: t.colors.white },
  vehicle: { radius: t.components.iconSizesPx[1]! / 2, color: t.colors.carbon,
    strokeWidth: t.borders.standardWidthPx, strokeColor: t.colors.white },
  viewport: (quote, assignment, origin) => {
    const geometry = (assignment?.routeToOrigin ?? quote?.route)?.geometry;
    const points = geometry ? (geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat()) : [];
    const padding = { top: t.spacing.scalePx[5]!, left: t.spacing.mobileHorizontalMarginPx,
      right: t.spacing.mobileHorizontalMarginPx, bottom: 0 };
    return points.length >= 2 ? { coordinates: points.map(normalizeCoordinate), padding }
      : { center: origin?.coordinate ?? [-99.88795, 19.79021], zoom: 14, padding };
  },
  // Only a single assigned sample exists in this fixture. This is not a production jump policy.
  vehicleMotion: createVehicleMotion(() => { 'worklet'; return false; }),
};
