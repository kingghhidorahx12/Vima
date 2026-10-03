import { visualTokens as t } from './tokens/index.ts';
import { elevationStyle } from './themes/light.ts';

/** Passenger finish derived from the existing palette; brand colors stay authoritative. */
function wash(hex: string, opacity: number): string {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${rgb.join(', ')}, ${opacity})`;
}
export const surfaceColors = {
  border: wash(t.colors.carbon, 0.08),
  brandWash: wash(t.colors.greenDark, 0.06),
  warningWash: wash(t.colors.amber, 0.08),
  dangerWash: wash(t.colors.red, 0.06),
} as const;
export const passengerSurfaces = {
  card: { backgroundColor: t.colors.white, borderRadius: t.radii.cardPx,
    borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border },
  floating: { backgroundColor: t.colors.white, borderRadius: t.radii.cardPx,
    borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border,
    ...elevationStyle('level2', t.colors.carbon) },
  field: { backgroundColor: t.colors.background, borderRadius: t.radii.fieldPx,
    borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border },
  pressed: { backgroundColor: t.colors.accentBlueSoft, borderColor: t.colors.accentBlueGlow },
  focus: { borderColor: t.colors.accentBlue, boxShadow: [{ offsetX: 0, offsetY: 0,
    blurRadius: 0, spreadDistance: 2, color: t.colors.accentBlueGlow }] },
} as const;
