import type { DriverState } from '../../services/matching/contracts.ts';
import type { CameraTarget, Coordinate } from '../../map/models.ts';
import { driverMapFallback } from './driverPresentation.ts';

export function driverMapContent(state?: DriverState) {
  const a = state?.assignment;
  return { location: state?.location,
    pickup: state?.offer?.pickup ?? (a && ['ASSIGNED', 'ARRIVED_PICKUP'].includes(a.state) ? a.pickup : undefined),
    route: a?.state === 'ASSIGNED' ? a.value.routeToOrigin : undefined };
}
const padding = { top: 48, bottom: 48, left: 48, right: 76 };
export const driverInitialCamera: CameraTarget = { center: driverMapFallback, zoom: 14 };
/** Camera identity depends on phase entry, never revision, GPS or offer countdown. */
export const initialDriverCameraIntent: { acquired: boolean; phase: string; target: CameraTarget } = { acquired: false, phase: '', target: driverInitialCamera };
export function advanceDriverCamera(previous: typeof initialDriverCameraIntent, state?: DriverState) {
    let { acquired, phase, target } = previous;
    const content = driverMapContent(state); const a = state?.assignment;
    const nextPhase = state?.offer ? `offer:${state.offer.id}` : a ? `${a.value.id}:${a.state}` : '';
    const acquisition = !acquired && !!content.location;
    if (content.location) acquired = true;
    const entering = nextPhase !== phase; phase = nextPhase;
    const contextEntry = entering && (!!state?.offer || a?.state === 'ASSIGNED');
    if (contextEntry) {
      const points: Coordinate[] = [];
      if (content.location) points.push(content.location.coordinate);
      if (content.pickup) points.push(content.pickup.coordinate);
      if (content.route) {
        const g = content.route.geometry;
        const coordinates = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
        points.push(...coordinates.map(c => [c[0]!, c[1]!] as Coordinate));
      }
      if (points.length > 1) target = { coordinates: points, padding };
      else if (points[0]) target = { center: points[0], zoom: 14, padding };
    } else if (content.location && (acquisition || entering && a?.state === 'IN_PROGRESS')) {
      target = { center: content.location.coordinate, zoom: 14, padding };
    }
    return { acquired, phase, target };
}
export function createDriverCameraIntents() {
  let current = initialDriverCameraIntent;
  return (state?: DriverState): CameraTarget => {
    current = advanceDriverCamera(current, state);
    return current.target;
  };
}
