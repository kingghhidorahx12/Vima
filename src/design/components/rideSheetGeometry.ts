import { visualTokens } from '../tokens/index.ts';

export type SheetSnap = 0 | 1 | 2;

/** Percentages describe visible height in the measured usable shell, after safe-area decisions. */
export function rideSheetGeometry(height: number, snap: SheetSnap) {
  if (!Number.isFinite(height) || height <= 0) throw new Error('Ride sheet needs a positive measured height.');
  const offsets = visualTokens.components.bottomSheetSnapPointsPercent.map((percent) => height * (1 - percent / 100));
  const targetOffset = offsets[snap];
  if (targetOffset === undefined) throw new Error('Unknown approved sheet snap.');
  return { height, offsets, minOffset: Math.min(...offsets), maxOffset: Math.max(...offsets), targetOffset };
}

export function nearestSheetSnap(offset: number, offsets: readonly number[]): number {
  'worklet';
  if (!Number.isFinite(offset) || !offsets.length) throw new Error('Invalid sheet geometry.');
  let nearest = offsets[0]!;
  for (const candidate of offsets) {
    if (Math.abs(candidate - offset) < Math.abs(nearest - offset)) nearest = candidate;
  }
  return nearest;
}

/** Global token offsets bound dragging; only state-approved offsets can be final positions. */
export function allowedSheetGeometry(height: number, targetOffset: number, allowedOffsets: readonly number[]) {
  const { minOffset, maxOffset } = rideSheetGeometry(height, 1);
  // Four arithmetic roundings cover equivalent height/percentage formulas without
  // introducing a visual-distance tolerance or widening the returned bounds.
  const equivalent = (a: number, b: number) => Math.abs(a - b)
    <= Number.EPSILON * Math.max(Math.abs(height), Math.abs(a), Math.abs(b)) * 4;
  const canonicalBound = (offset: number) => {
    if (!Number.isFinite(offset) || (offset < minOffset && !equivalent(offset, minOffset))
      || (offset > maxOffset && !equivalent(offset, maxOffset))) return undefined;
    if (equivalent(offset, minOffset)) return minOffset;
    if (equivalent(offset, maxOffset)) return maxOffset;
    return offset;
  };
  const canonicalAllowed = allowedOffsets.map(canonicalBound);
  const canonicalTarget = canonicalBound(targetOffset);
  const matched = canonicalAllowed.find((offset) => offset !== undefined && canonicalTarget !== undefined
    && equivalent(offset, canonicalTarget));
  if (!allowedOffsets.length || canonicalTarget === undefined || canonicalAllowed.some((offset) => offset === undefined)
    || matched === undefined) {
    throw new Error('Invalid allowed sheet offsets for this state.');
  }
  return { height, minOffset, maxOffset, targetOffset: matched, allowedOffsets: canonicalAllowed as number[] };
}
