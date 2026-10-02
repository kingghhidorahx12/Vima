import { Layer, VectorSource } from '@maplibre/maplibre-react-native';
import { visualTokens as t } from '../design/tokens';
import { trafficTileUrls } from './traffic';

/** One functional incidents layer: closures/accidents/works share the same toggle. */
export function IncidentLayer() {
  return <VectorSource id="vima-traffic-incidents" tiles={[trafficTileUrls.incidents]} minzoom={0} maxzoom={22}>
    <Layer id="vima-incident-lines" type="line" source-layer="Traffic incident flow"
      paint={{ 'line-width': 4, 'line-opacity': 0.8,
        'line-color': ['case', ['in', ['get', 'icon_category_0'], ['literal', ['accident', 'roadClosed', 'laneClosed']]],
          t.colors.red, t.colors.amber] }} />
    <Layer id="vima-incident-points" type="circle" source-layer="Traffic incident points"
      filter={['==', ['get', 'point_type'], 'start_point']}
      paint={{ 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': t.colors.white,
        'circle-color': ['case', ['in', ['get', 'icon_category_0'], ['literal', ['accident', 'roadClosed', 'laneClosed']]],
          t.colors.red, t.colors.amber] }} />
  </VectorSource>;
}
