export type PlaceImageRef =
  | { readonly source: 'vima'; readonly assetId: string; readonly version: number; readonly attribution?: string }
  | { readonly source: 'external'; readonly provider: string; readonly externalRef: string;
      readonly attribution?: string; readonly expiresAt?: string };

export interface PlaceMediaSource { readonly uri: string; readonly cacheKey: string }
export type PlaceMediaResolver = (canonicalPlaceId: string, image: PlaceImageRef) => PlaceMediaSource | undefined;
export const placeAssetId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);

/** Reject URLs as identity and preserve only a stable, typed image reference. */
export function parsePlaceImageRef(value: unknown): PlaceImageRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const image = value as Record<string, unknown>;
  if (image.attribution !== undefined && (typeof image.attribution !== 'string' || image.attribution.length > 240)) return undefined;
  if (image.source === 'vima') {
    if (Object.keys(image).some(key => !['source', 'assetId', 'version', 'attribution'].includes(key)) ||
      !placeAssetId(image.assetId) || !Number.isSafeInteger(image.version) || (image.version as number) < 1) return undefined;
    return { source: 'vima', assetId: image.assetId, version: image.version as number,
      ...(image.attribution === undefined ? {} : { attribution: image.attribution as string }) };
  }
  if (image.source === 'external') {
    if (Object.keys(image).some(key => !['source', 'provider', 'externalRef', 'attribution', 'expiresAt'].includes(key)) ||
      typeof image.provider !== 'string' || !/^[a-z][a-z0-9-]{1,50}$/.test(image.provider) ||
      typeof image.externalRef !== 'string' || !image.externalRef.trim() || image.externalRef.length > 200 ||
      /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(image.externalRef) ||
      image.expiresAt !== undefined && (typeof image.expiresAt !== 'string' || !Number.isFinite(Date.parse(image.expiresAt)))) return undefined;
    return { source: 'external', provider: image.provider, externalRef: image.externalRef,
      ...(image.attribution === undefined ? {} : { attribution: image.attribution as string }),
      ...(image.expiresAt === undefined ? {} : { expiresAt: image.expiresAt as string }) };
  }
  return undefined;
}

export function createPlaceMediaResolver(baseUrl: string): PlaceMediaResolver {
  const base = new URL(baseUrl);
  return (canonicalPlaceId, image) => {
    if (!canonicalPlaceId || image.source !== 'vima' || !placeAssetId(image.assetId) ||
      !Number.isSafeInteger(image.version) || image.version < 1) return undefined;
    const uri = new URL(`/v1/media/place-images/${image.assetId}/thumbnail?v=${image.version}`, base);
    return { uri: uri.toString(), cacheKey: `place-image:${image.assetId}:v${image.version}:thumb` };
  };
}
