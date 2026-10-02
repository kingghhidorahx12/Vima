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
  if (!Number.isFinite(targetOffset) || targetOffset < minOffset || targetOffset > maxOffset
    || !allowedOffsets.length || !allowedOffsets.includes(targetOffset)
    || allowedOffsets.some((offset) => !Number.isFinite(offset) || offset < minOffset || offset > maxOffset)) {
    throw new Error('Invalid allowed sheet offsets for this state.');
  }
  return { height, minOffset, maxOffset, targetOffset, allowedOffsets: [...allowedOffsets] };
}
