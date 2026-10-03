import { Layer, VectorSource } from '@maplibre/maplibre-react-native';
import { visualTokens as t } from '../design/tokens';
import { trafficTileUrls } from './traffic';
import { useLayerTransition } from './useLayerTransition';

/** Orbis v2 relative_speed is 0..1; closed roads override speed colors. */
export function TrafficFlowLayer({ enabled = true }: { enabled?: boolean }) {
  const { mounted, visible, duration } = useLayerTransition(enabled);
  if (!mounted) return null;
  return <VectorSource id="vima-traffic-flow" tiles={[trafficTileUrls.flow]} minzoom={0} maxzoom={22}>
    <Layer id="vima-traffic-flow-lines" type="line" source-layer="Traffic flow"
      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      paint={{ 'line-width': 2.5, 'line-opacity': visible ? 0.6 : 0, 'line-opacity-transition': { duration },
        'line-color': ['case', ['==', ['get', 'road_closure'], true], t.colors.red,
          ['<', ['coalesce', ['get', 'relative_speed'], 1], 0.4], t.colors.red,
          ['<', ['coalesce', ['get', 'relative_speed'], 1], 0.7], t.colors.amber, t.colors.green] }} />
  </VectorSource>;
}
