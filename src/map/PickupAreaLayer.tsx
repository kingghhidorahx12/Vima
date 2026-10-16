import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import type { Coordinate } from './models';
import { normalizeCoordinate } from './models';
import { useVimaTheme } from '../design/themes';

/** Geographic adjustment boundary only; never a street, route or proof of access. */
export function pickupArea(coordinate: Coordinate, meters: number) {
  const [lng, lat] = normalizeCoordinate(coordinate);
  if (!Number.isFinite(meters) || meters <= 0) throw new Error('invalid_pickup_adjustment_limit');
  const rad = Math.PI / 180, distance = meters / 6371000;
  const coordinates = Array.from({ length: 65 }, (_, i) => {
    const bearing = i / 64 * Math.PI * 2;
    const latitude = Math.asin(Math.sin(lat * rad) * Math.cos(distance) + Math.cos(lat * rad) * Math.sin(distance) * Math.cos(bearing));
    const longitude = lng * rad + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat * rad), Math.cos(distance) - Math.sin(lat * rad) * Math.sin(latitude));
    return [((longitude / rad + 540) % 360) - 180, latitude / rad];
  });
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [coordinates] } };
}
export function PickupAreaLayer({ reference, meters, outside }: { reference: Coordinate; meters: number; outside: boolean }) {
  const theme = useVimaTheme(); const data = useMemo(() => pickupArea(reference, meters), [reference, meters]);
  const color = outside ? theme.roles.danger : theme.roles.positive;
  return <GeoJSONSource id="passenger-pickup-area" data={data}>
    <Layer id="passenger-pickup-area-fill" type="fill" paint={{ 'fill-color': color, 'fill-opacity': 0.12 }} />
    <Layer id="passenger-pickup-area-border" type="line" paint={{ 'line-color': color, 'line-width': 1, 'line-dasharray': [3, 2] }} />
  </GeoJSONSource>;
}
