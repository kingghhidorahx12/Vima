import { visualTokens as t } from '../../design/tokens';
import type { PassengerMapConfig } from './PassengerMap';
import { createVehicleMotion } from '../../map/vehicleMotion';
import { normalizeCoordinate } from '../../map/models';

/** Existing Passenger map composition shared by QA and productive account entry. */
export const passengerMapConfig: PassengerMapConfig = {
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
  // PassengerMap uses the shared vehicle renderer; keep the required legacy config intact.
  vehicleMotion: createVehicleMotion(() => { 'worklet'; return false; }),
};
