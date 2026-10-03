import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VimaLocalPlace } from '../src/services/geospatial/localPlaces.ts';
import { placeAssetId, type PlaceImageRef } from '../src/services/geospatial/placeMedia.ts';

export interface PlaceMediaRecord {
  readonly assetId: string; readonly canonicalPlaceId: string; readonly owner: string;
  readonly source: string; readonly license: string; readonly addedAt: string;
  readonly version: number; readonly attribution?: string;
}
export interface PlaceMediaCatalog {
  imageFor(canonicalPlaceId: string): PlaceImageRef | undefined;
  thumbnail(assetId: string, version?: number): Promise<Buffer | undefined>;
  readonly count: number;
}
const maximumBytes = 2_000_000;
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
function webp(bytes: Buffer): boolean {
  if (bytes.length < 26 || bytes.length > maximumBytes || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  let offset = 12; let first = true;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size & 1);
    if (end > bytes.length || first && !['VP8 ', 'VP8L', 'VP8X'].includes(type)) return false;
    if (first && (type === 'VP8L' && (size < 5 || bytes[offset + 8] !== 0x2f) ||
      type === 'VP8X' && size < 10 || type === 'VP8 ' && (size < 10 ||
        bytes.toString('hex', offset + 11, offset + 14) !== '9d012a'))) return false;
    first = false; offset = end;
  }
  return !first && offset === bytes.length;
}
const inside = (root: string, path: string) => { const part = relative(root, path); return part && part !== '..' && !part.startsWith(`..${sep}`) && !part.startsWith(sep); };
const label = (value: unknown) => typeof value === 'string' && !!value.trim() && value.length <= 240;

export function emptyPlaceMediaCatalog(): PlaceMediaCatalog {
  return { count: 0, imageFor: () => undefined, thumbnail: async () => undefined };
}
/** Optional, externally provisioned and reviewed WebP thumbnails; no uploads or provider photos. */
export async function loadPlaceMediaCatalog(directory: string | undefined, places: readonly VimaLocalPlace[]): Promise<PlaceMediaCatalog> {
  if (!directory?.trim()) return emptyPlaceMediaCatalog();
  let root: string; let raw: unknown;
  try {
    root = await realpath(resolve(directory));
    const checkout = await realpath(repositoryRoot);
    if (root === checkout || inside(checkout, root)) return emptyPlaceMediaCatalog();
    const manifestPath = join(root, 'manifest.v1.json');
    const manifestFile = await lstat(manifestPath);
    if (!manifestFile.isFile() || manifestFile.size > 1_000_000) return emptyPlaceMediaCatalog();
    const manifest = await readFile(manifestPath, 'utf8');
    raw = JSON.parse(manifest);
  } catch { return emptyPlaceMediaCatalog(); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyPlaceMediaCatalog();
  const document = raw as { version?: unknown; images?: unknown };
  if (document.version !== 1 || !Array.isArray(document.images) || document.images.length > 100) return emptyPlaceMediaCatalog();
  const approved = new Set(places.filter(place => place.status === 'verified').map(place => place.id));
  const byPlace = new Map<string, PlaceMediaRecord>(); const byAsset = new Map<string, PlaceMediaRecord>();
  async function thumbnail(assetId: string, version?: number): Promise<Buffer | undefined> {
    if (!placeAssetId(assetId)) return undefined;
    const entry = byAsset.get(assetId);
    if (!entry || version !== undefined && version !== entry.version) return undefined;
    try {
      const folder = join(root, assetId); const file = join(folder, 'thumb.webp');
      if ((await lstat(folder)).isSymbolicLink() || (await lstat(file)).isSymbolicLink()) return undefined;
      const real = await realpath(file);
      if (!inside(root, real) || !(await stat(real)).isFile() || (await stat(real)).size > maximumBytes) return undefined;
      const bytes = await readFile(real);
      return webp(bytes) ? bytes : undefined;
    } catch { return undefined; }
  }
  for (const item of document.images) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some(key => !['assetId', 'canonicalPlaceId', 'owner', 'source', 'license', 'addedAt', 'version', 'attribution'].includes(key)) ||
      !placeAssetId(entry.assetId) || typeof entry.canonicalPlaceId !== 'string' || !approved.has(entry.canonicalPlaceId) ||
      !label(entry.owner) || !label(entry.source) || !label(entry.license) ||
      typeof entry.addedAt !== 'string' || !Number.isFinite(Date.parse(entry.addedAt)) ||
      !Number.isSafeInteger(entry.version) || (entry.version as number) < 1 ||
      entry.attribution !== undefined && !label(entry.attribution) ||
      byPlace.has(entry.canonicalPlaceId) || byAsset.has(entry.assetId)) continue;
    const candidate = entry as unknown as PlaceMediaRecord;
    byAsset.set(candidate.assetId, candidate);
    if (await thumbnail(candidate.assetId, candidate.version)) byPlace.set(candidate.canonicalPlaceId, candidate);
    else byAsset.delete(candidate.assetId);
  }
  return { get count() { return byPlace.size; },
    imageFor(canonicalPlaceId) { const record = byPlace.get(canonicalPlaceId);
      return record ? { source: 'vima', assetId: record.assetId, version: record.version,
        ...(record.attribution ? { attribution: record.attribution } : {}) } : undefined; },
    thumbnail };
}
