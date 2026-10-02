import Storage from 'expo-sqlite/kv-store';
import { defaultTrafficLayers, parseTrafficLayers, type TrafficLayerPreferences } from '../../map/traffic';

const key = 'vima.map-layers.v1';
export const mapLayerStorage = {
  async read(): Promise<TrafficLayerPreferences> {
    try { const raw = await Storage.getItem(key); return raw ? parseTrafficLayers(JSON.parse(raw)) : defaultTrafficLayers; }
    catch { return defaultTrafficLayers; }
  },
  async write(value: TrafficLayerPreferences): Promise<void> {
    await Storage.setItem(key, JSON.stringify(parseTrafficLayers(value)));
  },
};
