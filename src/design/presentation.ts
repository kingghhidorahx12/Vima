import { visualTokens as t } from './tokens/index.ts';
import { elevationStyle } from './themes/light.ts';
import { useVimaTheme } from './themes/index.tsx';

/** Geometry is shared. Presentation colors always come from the active global theme. */
export const passengerSurfaces = {
  card: { borderRadius: t.radii.cardPx, borderWidth: t.borders.standardWidthPx },
  floating: { borderRadius: t.radii.cardPx, borderWidth: t.borders.standardWidthPx,
    ...elevationStyle('level2', t.colors.carbon) },
  field: { borderRadius: t.radii.fieldPx, borderWidth: t.borders.standardWidthPx },
} as const;

export function usePassengerPresentation() {
  const { roles } = useVimaTheme();
  return {
    card: { backgroundColor: roles.elevatedSurface, borderColor: roles.border },
    floating: { backgroundColor: roles.elevatedSurface, borderColor: roles.border },
    field: { backgroundColor: roles.subtleSurface, borderColor: roles.border },
    pressed: { backgroundColor: roles.locationWash, borderColor: roles.location },
    focus: { borderColor: roles.location, boxShadow: [{ offsetX: 0, offsetY: 0,
      blurRadius: 0, spreadDistance: 2, color: roles.locationWash }] },
  } as const;
}
