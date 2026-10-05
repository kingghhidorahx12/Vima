export interface UsefulViewport { readonly width: number; readonly height: number; readonly top?: number }

/** MapLibre project() returns view-local dp on Android/iOS, not physical screen pixels. */
export function locationOutsideViewport(point: readonly number[], viewport: UsefulViewport, wasOutside: boolean): boolean {
  if (point.length !== 2 || !point.every(Number.isFinite) || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
    viewport.width <= 0 || viewport.height <= 0) return wasOutside;
  // Hide the CTA only after the entire core is comfortably back inside: hysteresis prevents edge chatter.
  const inset = wasOutside ? 24 : 8;
  return point[0]! < inset || point[0]! > viewport.width - inset || point[1]! < (viewport.top ?? 0) + inset || point[1]! > viewport.height - inset;
}
