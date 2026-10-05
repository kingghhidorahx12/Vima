import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteFitIntent } from '../../map/Camera';
import { normalizeCoordinate } from '../../map/models.ts';
import type { Place, RideQuote } from './model';

export interface PassengerRouteFitIntent extends RouteFitIntent {
  /** Actual settled sheet viewport, captured with this intent (not a percentage estimate). */
  readonly sheetHeight: number;
}

/** Camera-only validation. Does not alter or normalize the provider's route payload. */
export function routeFitCandidate(quote: RideQuote | undefined, origin: Place | null, destination: Place | null) {
  if (!quote?.id || !origin || !destination || quote.origin?.id !== origin.id || quote.destination?.id !== destination.id) return undefined;
  try {
    const start = normalizeCoordinate(origin.coordinate); const end = normalizeCoordinate(destination.coordinate);
    if (JSON.stringify(quote.origin.coordinate) !== JSON.stringify(start) ||
      JSON.stringify(quote.destination.coordinate) !== JSON.stringify(end)) return undefined;
    const geometry = quote.route.geometry;
    if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') return undefined;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    if (!lines.length || lines.some(line => line.length < 2)) return undefined;
    const coordinates = [start, ...lines.flat().map(normalizeCoordinate), end];
    return { coordinates, key: JSON.stringify([quote.id, origin.id, start, destination.id, end, geometry]) };
  } catch { return undefined; }
}

export function usePassengerRouteFit({ quote, origin, destination, reviewing, confirming, searchActive, ready,
  measuredSheetHeight, confirmationRequest }: {
  quote?: RideQuote; origin: Place | null; destination: Place | null;
  reviewing: boolean; confirming: boolean; searchActive: boolean; ready: boolean;
  measuredSheetHeight?: number; confirmationRequest?: number;
}): PassengerRouteFitIntent | undefined {
  const candidate = useMemo(() => routeFitCandidate(quote, origin, destination), [quote, origin, destination]);
  const seen = useRef(new Set<string>());
  const serial = useRef(0);
  const [issued, setIssued] = useState<{ key: string; intent: PassengerRouteFitIntent }>();
  const key = candidate && !searchActive && (reviewing ? `review:${candidate.key}`
    : confirming && confirmationRequest ? `confirm:${confirmationRequest}:${candidate.key}` : undefined);
  const token = reviewing ? key : confirmationRequest ? `confirm:${confirmationRequest}` : undefined;
  useEffect(() => {
    if (!token || !key || !candidate || !ready || measuredSheetHeight === undefined ||
      !Number.isFinite(measuredSheetHeight) || measuredSheetHeight <= 0 || seen.current.has(token)) return;
    seen.current.add(token);
    setIssued({ key, intent: { sequence: ++serial.current, coordinates: candidate.coordinates, sheetHeight: measuredSheetHeight } });
  }, [candidate, key, token, measuredSheetHeight, ready]);
  return ready && key && issued?.key === key ? issued.intent : undefined;
}
