import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { visualTokens as t } from '../../design/tokens';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';
import { type PlaceMediaResolver } from '../../services/geospatial/placeMedia';

function fallback(place: PlaceSuggestion): { icon: VimaGlyphName; color: string } {
  const name = place.name.toLocaleLowerCase('es-MX');
  if (name.includes('casa')) return { icon: 'home', color: t.colors.greenDark };
  if (name.includes('trabajo')) return { icon: 'work', color: t.colors.carbon };
  if (['mall', 'market', 'shop', 'supermarket'].includes(place.category ?? '')) return { icon: 'commerce', color: t.colors.greenDark };
  if (['university', 'school', 'college'].includes(place.category ?? '')) return { icon: 'education', color: t.colors.blue };
  if (['hospital', 'clinic', 'pharmacy'].includes(place.category ?? '')) return { icon: 'health', color: t.colors.red };
  if (['airport', 'bus_station', 'station'].includes(place.category ?? '')) return { icon: 'transport', color: t.colors.blue };
  return { icon: 'route', color: t.colors.greenDark };
}

/** Media never participates in Search; the fixed container remains while the photo loads or fails. */
export function PlaceThumbnail({ place, resolveMedia }: { place: PlaceSuggestion; resolveMedia?: PlaceMediaResolver }) {
  const canonicalPlaceId = place.canonicalId ?? place.id;
  const media = place.image && resolveMedia?.(canonicalPlaceId, place.image);
  const [failedKey, setFailedKey] = useState<string>();
  const category = fallback(place);
  return <View accessible={false} style={styles.container}>
    <VimaGlyph name={category.icon} color={category.color} />
    {media && failedKey !== media.cacheKey ? <Image key={media.cacheKey}
      source={{ uri: media.uri, cacheKey: media.cacheKey }} cachePolicy="memory-disk"
      recyclingKey={canonicalPlaceId} contentFit="cover" transition={180}
      onError={() => setFailedKey(media.cacheKey)} style={styles.image} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.smallPx, backgroundColor: t.colors.background, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
});
