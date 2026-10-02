import { Layer, VectorSource } from '@maplibre/maplibre-react-native';
import { visualTokens as t } from '../design/tokens';
import { trafficTileUrls } from './traffic';

/** Orbis v2 relative_speed is 0..1; closed roads override speed colors. */
export function TrafficFlowLayer() {
  return <VectorSource id="vima-traffic-flow" tiles={[trafficTileUrls.flow]} minzoom={0} maxzoom={22}>
    <Layer id="vima-traffic-flow-lines" type="line" source-layer="Traffic flow"
      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      paint={{ 'line-width': 3, 'line-opacity': 0.8,
        'line-color': ['case', ['==', ['get', 'road_closure'], true], t.colors.red,
          ['<', ['coalesce', ['get', 'relative_speed'], 1], 0.4], t.colors.red,
          ['<', ['coalesce', ['get', 'relative_speed'], 1], 0.7], t.colors.amber, t.colors.green] }} />
  </VectorSource>;
}
