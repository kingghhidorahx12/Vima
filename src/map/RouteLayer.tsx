import { useMapContext } from './MapContext';
import { RouteLayer as LegacyRoute } from './legacy/RouteLayer';
import { GoogleRouteLayer } from './google/GoogleRouteLayer';
import type { RouteFeature } from './routeGeometry';
import type { RouteAppearance } from './models';

export interface RouteLayerProps {
  readonly id: string; readonly data: RouteFeature; readonly state: 'active' | 'completed';
  readonly activeTone: 'carbon' | 'greenDark'; readonly appearance: RouteAppearance; readonly reveal?: boolean;
}
export function RouteLayer(props: RouteLayerProps) {
  const { provider } = useMapContext();
  const { appearance } = props;
  return provider === 'google' ? <GoogleRouteLayer {...props} /> : <LegacyRoute {...props}
    appearance={{ paint: { 'line-width': appearance.width, 'line-opacity': appearance.opacity },
      layout: { 'line-cap': appearance.cap, 'line-join': appearance.join } }} />;
}
