import { useEffect, useState } from 'react';
import { matchingPolicy } from './matchingPolicy.ts';
import type { PassengerPhase, PassengerTrip } from './model';

/** Copy milestones are local projections; only the server may expire or assign the request. */
export function projectMatchingPhase(trip: PassengerTrip | undefined, phase: PassengerPhase, now: number): PassengerPhase {
  if (trip?.searchStartedAt === undefined || !['searching', 'reassigning'].includes(phase)) return phase;
  const elapsed = now - trip.searchStartedAt;
  return elapsed >= matchingPolicy.prolongedAfterMs ? 'prolonged' : elapsed >= matchingPolicy.lateAfterMs ? 'expanding' : phase;
}
export function useMatchingProjection(trip: PassengerTrip | undefined, phase: PassengerPhase, live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live || trip?.searchStartedAt === undefined || !['searching', 'reassigning'].includes(phase)) return;
    let timer: ReturnType<typeof setTimeout>;
    const sample = () => {
      const current = Date.now(); setNow(current);
      const next = [matchingPolicy.lateAfterMs, matchingPolicy.prolongedAfterMs].map(ms => trip.searchStartedAt! + ms).find(time => time > current);
      if (next !== undefined) timer = setTimeout(sample, next - current);
    };
    timer = setTimeout(sample, 0);
    return () => clearTimeout(timer);
  }, [live, phase, trip?.searchStartedAt]);
  return live ? projectMatchingPhase(trip, phase, now) : phase;
}
