import type { CameraTarget, Coordinate } from '../../map/models.ts';
import type { Assignment } from './model.ts';

export interface AssignmentView { phase: string; acquired: boolean; target?: CameraTarget }
export const initialAssignmentView: AssignmentView = { phase: '', acquired: false };
/** Entry/acquisition only: a GPS revision cannot take the camera back from manual inspection. */
export function advanceAssignmentView(previous: AssignmentView, assignment: Assignment | undefined,
  phase: string | undefined, viewport: CameraTarget, freshCoordinate?: Coordinate): AssignmentView {
  if (!assignment || !['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS'].includes(phase ?? '')) return initialAssignmentView;
  const key = assignment.id;
  const fresh = !!freshCoordinate;
  if (previous.phase === key && (previous.acquired || !fresh)) return previous;
  let target = viewport;
  if (fresh) {
    const pickupGeometry = assignment.routeToOrigin.geometry;
    const pickupPoints = pickupGeometry.type === 'LineString' ? pickupGeometry.coordinates : pickupGeometry.coordinates.flat();
    const points: Coordinate[] = viewport.coordinates ? [...viewport.coordinates]
      : phase !== 'IN_PROGRESS' ? pickupPoints.map(point => [point[0]!, point[1]!] as Coordinate) : [];
    points.push(freshCoordinate!);
    target = points.length > 1 ? { coordinates: points, zoom: viewport.zoom, bearing: viewport.bearing, pitch: viewport.pitch, padding: viewport.padding }
      : { center: freshCoordinate!, zoom: 14, padding: viewport.padding };
  }
  return { phase: key, acquired: fresh, target };
}
