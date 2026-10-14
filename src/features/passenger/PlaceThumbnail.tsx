import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { visualTokens as t } from '../../design/tokens';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';
import { type PlaceMediaResolver } from '../../services/geospatial/placeMedia';
import { useVimaTheme } from '../../design/themes';
import { productAuthClient } from '../../services/auth/productSession';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Static single-authority boundary removes QA storage from product bundles.
const qaCredentials = process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' && process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' ? (require('../../services/storage/credentials') as typeof import('../../services/storage/credentials')).credentials : null;
const productMedia = process.env.EXPO_PUBLIC_VIMA_AUTH_MODE === 'product' || process.env.EXPO_PUBLIC_VIMA_VARIANT === 'production';

function fallback(place: PlaceSuggestion): { icon: VimaGlyphName; tone: 'positive' | 'control' | 'location' | 'danger' } {
  const name = place.name.toLocaleLowerCase('es-MX');
  if (name.includes('casa')) return { icon: 'home', tone: 'positive' };
  if (name.includes('trabajo')) return { icon: 'work', tone: 'control' };
  if (['mall', 'market', 'shop', 'supermarket'].includes(place.category ?? '')) return { icon: 'commerce', tone: 'positive' };
  if (['university', 'school', 'college'].includes(place.category ?? '')) return { icon: 'education', tone: 'location' };
  if (['hospital', 'clinic', 'pharmacy'].includes(place.category ?? '')) return { icon: 'health', tone: 'danger' };
  if (['airport', 'bus_station', 'station'].includes(place.category ?? '')) return { icon: 'transport', tone: 'location' };
  return { icon: 'route', tone: 'positive' };
}

/** Media never participates in Search; the fixed container remains while the photo loads or fails. */
export function PlaceThumbnail({ place, resolveMedia, size = 48 }: { place: PlaceSuggestion; resolveMedia?: PlaceMediaResolver; size?: number }) {
  const theme = useVimaTheme();
  const canonicalPlaceId = place.canonicalId ?? place.id;
  const media = place.image && resolveMedia?.(canonicalPlaceId, place.image);
  const mediaUri = media?.uri;
  const [authorization, setAuthorization] = useState<{ uri: string; headers: { Authorization: string } }>();
  useEffect(() => {
    if (!mediaUri) return;
    let active = true;
    const controller = new AbortController(); let unsubscribe: (() => void) | undefined;
    if (productMedia) {
      let auth: ReturnType<typeof productAuthClient>;
      try { auth = productAuthClient(); } catch { return; }
      const read = () => {
        if (auth.getSnapshot().status !== 'authenticated') { setAuthorization(undefined); return; }
        void auth.mediaHeaders(mediaUri, controller.signal).then(headers => {
          if (active) setAuthorization({ uri: mediaUri, headers });
        }).catch(() => { if (active) setAuthorization(undefined); });
      };
      unsubscribe = auth.subscribe(read); read();
    } else if (qaCredentials && new URL(mediaUri).origin === new URL(process.env.EXPO_PUBLIC_VIMA_API_BASE_URL!).origin) {
      void qaCredentials.read().then(value => {
        if (active && value) setAuthorization({ uri: mediaUri, headers: { Authorization: 'Bearer ' + value } });
      }).catch(() => {});
    }
    return () => { active = false; controller.abort(); unsubscribe?.(); };
  }, [mediaUri]);
  const headers = authorization?.uri === media?.uri ? authorization?.headers : undefined;
  const [failedKey, setFailedKey] = useState<string>();
  const category = fallback(place);
  const color = category.tone === 'positive' ? theme.roles.positiveStrong : category.tone === 'location'
    ? theme.roles.location : category.tone === 'danger' ? theme.roles.danger : theme.roles.control;
  return <View accessible={false} style={[styles.container, { width: size, height: size, backgroundColor: theme.roles.subtleSurface }]}>
    <VimaGlyph name={category.icon} color={color} />
    {media && (!(productMedia || qaCredentials) || headers) && failedKey !== media.cacheKey ? <Image key={media.cacheKey}
      source={{ uri: media.uri, cacheKey: media.cacheKey,
        ...(headers ? { headers } : {}) }} cachePolicy={productMedia || qaCredentials ? 'none' : 'memory-disk'}
      recyclingKey={canonicalPlaceId} contentFit="cover" transition={180}
      onError={() => setFailedKey(media.cacheKey)} style={styles.image} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.fieldPx, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
});
