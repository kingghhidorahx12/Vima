import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { visualTokens as t } from '../../design/tokens';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';
import { type PlaceMediaResolver } from '../../services/geospatial/placeMedia';
import { useVimaTheme } from '../../design/themes';

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
  const [failedKey, setFailedKey] = useState<string>();
  const category = fallback(place);
  const color = category.tone === 'positive' ? theme.roles.positiveStrong : category.tone === 'location'
    ? theme.roles.location : category.tone === 'danger' ? theme.roles.danger : theme.roles.control;
  return <View accessible={false} style={[styles.container, { width: size, height: size, backgroundColor: theme.roles.subtleSurface }]}>
    <VimaGlyph name={category.icon} color={color} />
    {media && failedKey !== media.cacheKey ? <Image key={media.cacheKey}
      source={{ uri: media.uri, cacheKey: media.cacheKey }} cachePolicy="memory-disk"
      recyclingKey={canonicalPlaceId} contentFit="cover" transition={180}
      onError={() => setFailedKey(media.cacheKey)} style={styles.image} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.fieldPx, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
});
