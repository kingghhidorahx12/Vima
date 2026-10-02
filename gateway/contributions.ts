import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GeospatialError, type ResolvedPlace } from '../src/services/geospatial/contracts.ts';
import { normalizeSearchText } from '../src/services/geospatial/regionalRanking.ts';
import type { VimaLocalPlace } from '../src/services/geospatial/localPlaces.ts';
import type { Coordinate } from '../src/map/models.ts';

export interface Contribution { contributionId: string; status: 'pending'; place: ResolvedPlace }
interface StoredContribution extends Contribution { keyHash: string; createdAt: number }
const clean = (value: unknown, maximum: number, required: boolean) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f]/.test(value) || required && !value.trim())
    throw new GeospatialError('invalid_result');
  return value.trim();
};
const near = (a: Coordinate, b: Coordinate) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b[1] - a[1]); const dLng = radians(b[0] - a[0]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) <= 150;
};
export function createContributionRepository(directory: string, catalog: readonly VimaLocalPlace[], now = Date.now) {
  const path = join(directory, 'place-contributions.v1.json');
  let tail = Promise.resolve();
  async function read(): Promise<StoredContribution[]> {
    try {
      const data = JSON.parse(await readFile(path, 'utf8')) as { version: unknown; contributions: unknown };
      if (data.version !== 1 || !Array.isArray(data.contributions)) throw new Error('corrupt_runtime_data');
      return data.contributions as StoredContribution[];
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
      throw new GeospatialError('network_recoverable');
    }
  }
  return {
    async add(input: { name: unknown; coordinate: Coordinate; reference?: unknown }, idempotencyKey: string): Promise<Contribution> {
      const previous = tail; let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const name = clean(input.name, 120, true)!; const reference = clean(input.reference, 240, false);
        if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) throw new GeospatialError('invalid_result');
        const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
        const existing = await read(); const replay = existing.find(item => item.keyHash === keyHash);
        if (replay) return { contributionId: replay.contributionId, status: 'pending', place: replay.place };
        if (existing.length >= 1000) throw new GeospatialError('network_recoverable');
        const duplicate = [...catalog.filter(place => place.status === 'verified'), ...existing.map(item => item.place)]
          .some(place => normalizeSearchText(place.name) === normalizeSearchText(name) && near(place.coordinate, input.coordinate));
        if (duplicate) throw new GeospatialError('invalid_result');
        const contributionId = randomUUID(); const id = `contribution:${contributionId}`;
        const place: ResolvedPlace = { id, canonicalId: id, name, address: reference ?? '',
          coordinate: input.coordinate, provenance: 'contribution' };
        const item: StoredContribution = { contributionId, status: 'pending', place, keyHash, createdAt: now() };
        await mkdir(directory, { recursive: true });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify({ version: 1, contributions: [...existing, item] }), { flag: 'wx' });
        await rename(temporary, path);
        return { contributionId, status: 'pending', place };
      } finally { release(); }
    },
  };
}
