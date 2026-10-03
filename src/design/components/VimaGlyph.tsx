import { StyleSheet, View } from 'react-native';
import { visualTokens as t } from '../tokens';

/** Simple geometric UI glyphs; the production icon master and stroke are still pending. */
export type VimaGlyphName = 'menu' | 'profile' | 'back' | 'chevron' | 'search' | 'home' | 'work' | 'favorite' | 'car' | 'clock' | 'route' | 'payment' | 'recenter' | 'layers' | 'commerce' | 'education' | 'health' | 'transport';
export function VimaGlyph({ name, color = t.colors.carbon }: { name: VimaGlyphName; color?: string }) {
  const line = { borderColor: color };
  const fill = { backgroundColor: color };
  return <View accessible={false} style={styles.box}>
    {name === 'menu' ? <><View style={[styles.menuLine, styles.menuTop, fill]} /><View style={[styles.menuLine, styles.menuMid, fill]} /><View style={[styles.menuLine, styles.menuBottom, fill]} /></> : null}
    {name === 'profile' ? <><View style={[styles.profileHead, line]} /><View style={[styles.profileBody, line]} /></> : null}
    {name === 'back' || name === 'chevron' ? <View style={[styles.chevron, line, name === 'back' && styles.back]} /> : null}
    {name === 'search' ? <><View style={[styles.searchCircle, line]} /><View style={[styles.searchHandle, fill]} /></> : null}
    {name === 'home' ? <><View style={[styles.houseRoof, line]} /><View style={[styles.houseBody, line]} /></> : null}
    {name === 'work' ? <><View style={[styles.workHandle, line]} /><View style={[styles.workBody, line]} /><View style={[styles.workMid, fill]} /></> : null}
    {name === 'favorite' ? <><View style={[styles.heartLeft, line]} /><View style={[styles.heartRight, line]} /><View style={[styles.heartBase, line]} /></> : null}
    {name === 'car' ? <><View style={[styles.carRoof, line]} /><View style={[styles.carBody, line]} /><View style={[styles.carWheelLeft, fill]} /><View style={[styles.carWheelRight, fill]} /></> : null}
    {name === 'clock' ? <><View style={[styles.clock, line]} /><View style={[styles.clockHand, line]} /></> : null}
    {name === 'route' ? <><View style={[styles.route, line]} /><View style={[styles.routeDot, fill]} /></> : null}
    {name === 'payment' ? <><View style={[styles.payment, line]} /><View style={[styles.paymentLine, fill]} /></> : null}
    {name === 'recenter' ? <><View style={[styles.recenterRing, line]} /><View style={[styles.recenterDot, fill]} /></> : null}
    {name === 'layers' ? <><View style={[styles.layerBack, line]} /><View style={[styles.layerFront, line]} /></> : null}
    {name === 'commerce' ? <><View style={[styles.shopAwning, line]} /><View style={[styles.shopBody, line]} /></> : null}
    {name === 'education' ? <><View style={[styles.bookLeft, line]} /><View style={[styles.bookRight, line]} /></> : null}
    {name === 'health' ? <><View style={[styles.crossVertical, fill]} /><View style={[styles.crossHorizontal, fill]} /></> : null}
    {name === 'transport' ? <><View style={[styles.carRoof, line]} /><View style={[styles.carBody, line]} /><View style={[styles.carWheelLeft, fill]} /><View style={[styles.carWheelRight, fill]} /></> : null}
  </View>;
}

const edge = t.borders.standardWidthPx;
const styles = StyleSheet.create({
  box: { width: t.components.iconSizesPx[2], height: t.components.iconSizesPx[2] },
  menuLine: { position: 'absolute', left: 4, width: 16, height: edge, borderRadius: t.radii.pillPx },
  menuTop: { top: 6 }, menuMid: { top: 12 }, menuBottom: { top: 18 },
  profileHead: { position: 'absolute', width: 8, height: 8, borderWidth: edge, borderRadius: t.radii.pillPx, top: 3, left: 8 },
  profileBody: { position: 'absolute', width: 16, height: 9, borderWidth: edge, borderBottomWidth: 0, borderTopLeftRadius: 9, borderTopRightRadius: 9, top: 13, left: 4 },
  chevron: { position: 'absolute', width: 8, height: 8, borderTopWidth: edge, borderRightWidth: edge, transform: [{ rotate: '45deg' }], top: 8, left: 7 },
  back: { transform: [{ rotate: '-135deg' }], left: 10 },
  searchCircle: { position: 'absolute', width: 13, height: 13, borderWidth: edge, borderRadius: t.radii.pillPx, top: 3, left: 3 },
  searchHandle: { position: 'absolute', width: 9, height: edge, transform: [{ rotate: '45deg' }], top: 17, left: 13 },
  houseRoof: { position: 'absolute', width: 13, height: 13, borderTopWidth: edge, borderLeftWidth: edge, transform: [{ rotate: '45deg' }], top: 4, left: 6 },
  houseBody: { position: 'absolute', width: 14, height: 10, borderWidth: edge, borderTopWidth: 0, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, top: 11, left: 5 },
  workHandle: { position: 'absolute', width: 8, height: 5, borderWidth: edge, borderBottomWidth: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2, top: 3, left: 8 },
  workBody: { position: 'absolute', width: 18, height: 13, borderWidth: edge, borderRadius: 2, top: 8, left: 3 },
  workMid: { position: 'absolute', width: 4, height: edge, top: 13, left: 10 },
  heartLeft: { position: 'absolute', width: 10, height: 10, borderWidth: edge, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 9, top: 5, left: 3, transform: [{ rotate: '-10deg' }] },
  heartRight: { position: 'absolute', width: 10, height: 10, borderWidth: edge, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 9, top: 5, left: 11, transform: [{ rotate: '10deg' }] },
  heartBase: { position: 'absolute', width: 12, height: 12, borderRightWidth: edge, borderBottomWidth: edge, transform: [{ rotate: '45deg' }], top: 7, left: 6 },
  carRoof: { position: 'absolute', width: 14, height: 7, borderWidth: edge, borderBottomWidth: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5, top: 5, left: 5 },
  carBody: { position: 'absolute', width: 20, height: 10, borderWidth: edge, borderRadius: 3, top: 10, left: 2 },
  carWheelLeft: { position: 'absolute', width: 3, height: 3, borderRadius: 2, top: 19, left: 5 },
  carWheelRight: { position: 'absolute', width: 3, height: 3, borderRadius: 2, top: 19, left: 16 },
  clock: { position: 'absolute', width: 18, height: 18, borderWidth: edge, borderRadius: t.radii.pillPx, top: 3, left: 3 },
  clockHand: { position: 'absolute', width: 6, height: 6, borderLeftWidth: edge, borderBottomWidth: edge, top: 6, left: 12 },
  route: { position: 'absolute', width: 14, height: 15, borderLeftWidth: edge, borderBottomWidth: edge, borderTopWidth: edge, borderRadius: 6, top: 4, left: 5 },
  routeDot: { position: 'absolute', width: 4, height: 4, borderRadius: t.radii.pillPx, top: 17, left: 16 },
  payment: { position: 'absolute', width: 20, height: 15, borderWidth: edge, borderRadius: 3, top: 5, left: 2 },
  paymentLine: { position: 'absolute', width: 18, height: edge, top: 10, left: 3 },
  recenterRing: { position: 'absolute', width: 18, height: 18, top: 3, left: 3, borderWidth: edge, borderRadius: t.radii.pillPx },
  recenterDot: { position: 'absolute', width: 4, height: 4, top: 10, left: 10, borderRadius: t.radii.pillPx },
  layerBack: { position: 'absolute', width: 14, height: 14, top: 7, left: 5, borderWidth: edge, transform: [{ rotate: '45deg' }] },
  layerFront: { position: 'absolute', width: 14, height: 14, top: 3, left: 5, borderWidth: edge, transform: [{ rotate: '45deg' }] },
  shopAwning: { position: 'absolute', width: 18, height: 6, top: 4, left: 3, borderWidth: edge, borderRadius: 2 },
  shopBody: { position: 'absolute', width: 16, height: 11, top: 10, left: 4, borderWidth: edge, borderRadius: 2 },
  bookLeft: { position: 'absolute', width: 9, height: 15, top: 5, left: 3, borderWidth: edge, borderRadius: 2 },
  bookRight: { position: 'absolute', width: 9, height: 15, top: 5, left: 12, borderWidth: edge, borderRadius: 2 },
  crossVertical: { position: 'absolute', width: 5, height: 18, top: 3, left: 10, borderRadius: 1 },
  crossHorizontal: { position: 'absolute', width: 18, height: 5, top: 10, left: 3, borderRadius: 1 },
});
