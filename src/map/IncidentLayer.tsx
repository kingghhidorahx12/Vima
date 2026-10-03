import { Layer, VectorSource } from '@maplibre/maplibre-react-native';
import { visualTokens as t } from '../design/tokens';
import { trafficTileUrls } from './traffic';
import { incidentDetails, type IncidentDetails } from './incidentDetails';
import { useLayerTransition } from './useLayerTransition';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { mapPersonality } from '../motion/mapPersonality';

/** One functional incidents layer: closures/accidents/works share the same toggle. */
export function IncidentLayer({ onSelect, enabled = true }: { onSelect?: (details: IncidentDetails) => void; enabled?: boolean }) {
  const { mounted, visible, duration } = useLayerTransition(enabled, true);
  const { reducedMotion } = useMotionPolicy();
  if (!mounted) return null;
  return <VectorSource id="vima-traffic-incidents" tiles={[trafficTileUrls.incidents]} minzoom={0} maxzoom={22}
    onPress={onSelect && enabled ? event => {
      const point = event.nativeEvent.features.find(feature => feature.geometry.type === 'Point');
      if (!point) return;
      event.stopPropagation();
      onSelect(incidentDetails(point.properties));
    } : undefined}>
    <Layer id="vima-incident-lines" type="line" source-layer="Traffic incident flow"
      paint={{ 'line-width': 4, 'line-opacity': visible ? 0.8 : 0, 'line-opacity-transition': { duration },
        'line-color': ['case', ['in', ['get', 'icon_category_0'], ['literal', ['accident', 'roadClosed', 'laneClosed']]],
          t.colors.red, t.colors.amber] }} />
    <Layer id="vima-incident-entrance" type="circle" source-layer="Traffic incident points"
      filter={['==', ['get', 'point_type'], 'start_point']}
      paint={{ 'circle-radius': visible ? 10 : 6, 'circle-radius-transition': { duration },
        'circle-color': t.colors.amber, 'circle-opacity': !reducedMotion && enabled && !visible ? mapPersonality.pulseOpacity : 0,
        'circle-opacity-transition': { duration } }} />
    <Layer id="vima-incident-points" type="circle" source-layer="Traffic incident points"
      filter={['==', ['get', 'point_type'], 'start_point']}
      paint={{ 'circle-radius': visible ? 6 : 5, 'circle-radius-transition': { duration },
        'circle-opacity': visible ? 1 : 0, 'circle-opacity-transition': { duration },
        'circle-stroke-opacity': visible ? 1 : 0, 'circle-stroke-opacity-transition': { duration },
        'circle-stroke-width': 2, 'circle-stroke-color': t.colors.white,
        'circle-color': ['case', ['in', ['get', 'icon_category_0'], ['literal', ['accident', 'roadClosed', 'laneClosed']]],
          t.colors.red, t.colors.amber] }} />
  </VectorSource>;
}
