import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeospatialError, type PlaceSuggestion } from '../src/services/geospatial/contracts.ts';
import type { VimaLocalPlace } from '../src/services/geospatial/localPlaces.ts';
import { initialRegion } from '../src/services/geospatial/regionalRanking.ts';

export type PlaceSignalType = 'place_selected' | 'destination_confirmed' | 'trip_completed';
export interface PlaceSignal {
  eventId: string; type: PlaceSignalType; canonicalPlaceId: string; regionId: string;
  occurredAt: number; installationId: string;
}
interface Daily { canonicalPlaceId: string; regionId: string; day: string;
  uniqueSelected: number; uniqueConfirmed: number; completedTrips: number }
interface EventRecord { id: string; at: number }
interface Document { version: 1; daily: Daily[]; events: EventRecord[] }
const dayOf = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const eventTypes: readonly PlaceSignalType[] = ['place_selected', 'destination_confirmed', 'trip_completed'];
export function validatePlaceSignal(value: unknown, now: number): PlaceSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GeospatialError('invalid_result');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['eventId', 'type', 'canonicalPlaceId', 'regionId', 'occurredAt', 'installationId'].includes(key)) ||
    typeof v.eventId !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(v.eventId) ||
    !eventTypes.includes(v.type as PlaceSignalType) || typeof v.canonicalPlaceId !== 'string' ||
    !/^(vima-local:[a-z0-9-]{1,100}|tomtom:[a-f0-9]{32})$/.test(v.canonicalPlaceId) ||
    typeof v.regionId !== 'string' || !initialRegion.includes(v.regionId as typeof initialRegion[number]) ||
    typeof v.occurredAt !== 'number' || !Number.isSafeInteger(v.occurredAt) || Math.abs(v.occurredAt - now) > 86_400_000 ||
    typeof v.installationId !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(v.installationId))
    throw new GeospatialError('invalid_result');
  return v as unknown as PlaceSignal;
}
export function createPopularityRepository(directory: string, catalog: readonly VimaLocalPlace[], now = Date.now) {
  const path = join(directory, 'place-popularity.v1.json');
  const actorSeen = new Map<string, number>();
  let tail = Promise.resolve();
  async function read(): Promise<Document> {
    try {
      const document = JSON.parse(await readFile(path, 'utf8')) as Document;
      if (document.version !== 1 || !Array.isArray(document.daily) || !Array.isArray(document.events)) throw new Error();
      return document;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return { version: 1, daily: [], events: [] };
      throw new GeospatialError('network_recoverable');
    }
  }
  async function write(document: Document) {
    await mkdir(directory, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(document), { flag: 'wx' });
    await rename(temporary, path);
  }
  return {
    async signal(input: PlaceSignal): Promise<{ accepted: boolean }> {
      const previous = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const signal = validatePlaceSignal(input, now());
        const document = await read();
        if (document.events.some(event => event.id === signal.eventId)) return { accepted: false };
        for (const [key, at] of actorSeen) if (now() - at > 86_400_000) actorSeen.delete(key);
        const actorKey = createHash('sha256').update(`${signal.installationId}|${signal.canonicalPlaceId}|${signal.type}|${dayOf(signal.occurredAt)}`).digest('hex');
        const accepted = !actorSeen.has(actorKey);
        if (accepted) {
          actorSeen.set(actorKey, now());
          const day = dayOf(signal.occurredAt);
          let aggregate = document.daily.find(item => item.canonicalPlaceId === signal.canonicalPlaceId &&
            item.regionId === signal.regionId && item.day === day);
          if (!aggregate) {
            aggregate = { canonicalPlaceId: signal.canonicalPlaceId, regionId: signal.regionId, day,
              uniqueSelected: 0, uniqueConfirmed: 0, completedTrips: 0 };
            document.daily.push(aggregate);
          }
          if (signal.type === 'place_selected') aggregate.uniqueSelected++;
          if (signal.type === 'destination_confirmed') aggregate.uniqueConfirmed++;
          if (signal.type === 'trip_completed') aggregate.completedTrips++;
        }
        document.events = document.events.filter(event => now() - event.at <= 86_400_000).slice(-999);
        document.events.push({ id: signal.eventId, at: now() });
        document.daily = document.daily.filter(item => item.day >= dayOf(now() - 30 * 86_400_000)).slice(-3000);
        await write(document);
        return { accepted };
      } finally { release(); }
    },
    async discovery(regionId: string): Promise<{ popular: PlaceSuggestion[]; featured: PlaceSuggestion[] }> {
      if (!initialRegion.includes(regionId as typeof initialRegion[number])) throw new GeospatialError('invalid_result');
      const document = await read(); const threshold = dayOf(now() - 30 * 86_400_000);
      const verified = catalog.filter(place => place.status === 'verified' && place.regionId === regionId);
      const totals = verified.map(place => ({ place, records: document.daily.filter(item => item.canonicalPlaceId === place.id &&
        item.regionId === regionId && item.day >= threshold) }));
      const score = (records: Daily[]) => ({ completed: records.reduce((sum, item) => sum + item.completedTrips, 0),
        confirmed: records.reduce((sum, item) => sum + item.uniqueConfirmed, 0),
        selected: records.reduce((sum, item) => sum + item.uniqueSelected, 0) });
      const popular = totals.filter(item => item.records.length).map(item => ({ ...item, score: score(item.records) }))
        .sort((a, b) => b.score.completed - a.score.completed || b.score.confirmed - a.score.confirmed ||
          b.score.selected - a.score.selected).slice(0, 10).map(({ place }) => ({ id: place.id,
          canonicalId: place.id, name: place.name, address: place.address, category: place.category,
          regionId: place.regionId, provenance: place.provenance }));
      const featured = verified.slice(0, 10).map(place => ({ id: place.id, canonicalId: place.id,
        name: place.name, address: place.address, category: place.category,
        regionId: place.regionId, provenance: place.provenance }));
      return { popular, featured };
    },
  };
}
