import type { MatchingPassengerSnapshot } from './contracts.ts';
import { decodeMatchingTrip } from './decode.ts';
import { matchingDevTrace, type MatchingTrace } from './devTrace.ts';

export type TripHttpSnapshotOrigin = 'active_request' | 'request_create' | 'request_fetch' | 'request_command';
export type TripHttpSnapshotRejectReason =
  | 'id_invalid'
  | 'id_mismatch'
  | 'revision_invalid'
  | 'phase_invalid'
  | 'snapshot_invalid';

export class TripHttpSnapshotError extends Error {
  readonly code = 'trip_http_snapshot_rejected';
  readonly reason: TripHttpSnapshotRejectReason;
  constructor(reason: TripHttpSnapshotRejectReason) {
    super('Rejected authoritative trip snapshot');
    this.name = 'TripHttpSnapshotError';
    this.reason = reason;
  }
}

export interface TripHttpSnapshotContext {
  readonly origin: TripHttpSnapshotOrigin;
  readonly endpoint: 'active' | 'collection' | 'request' | 'commands';
  readonly expectedId?: string;
  readonly epoch?: number;
  readonly trace?: MatchingTrace;
}

const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const validRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Sanitized HTTP boundary for Passenger snapshots. This classifies only safe
 * envelope metadata; decodeMatchingTrip and validateTrip remain authoritative.
 */
export function decodeTripHttpSnapshot(raw: unknown, context: TripHttpSnapshotContext): MatchingPassengerSnapshot {
  const trace = context.trace ?? matchingDevTrace;
  const candidate = raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined;
  const incomingId = bounded(candidate?.id, 256) ? candidate.id : undefined;
  const revision = validRevision(candidate?.revision) ? candidate.revision : undefined;
  const phase = bounded(candidate?.phase, 64) ? candidate.phase : undefined;
  const fields = {
    origin: context.origin,
    endpoint: context.endpoint,
    expectedId: context.expectedId,
    incomingId,
    revision,
    phase,
    epoch: context.epoch,
  } as const;
  const reject = (reason: TripHttpSnapshotRejectReason): never => {
    trace('trip_http_snapshot', { ...fields, accepted: false, rejectReason: reason });
    throw new TripHttpSnapshotError(reason);
  };

  if (!incomingId) return reject('id_invalid');
  if (context.expectedId !== undefined && incomingId !== context.expectedId) return reject('id_mismatch');
  if (revision === undefined) return reject('revision_invalid');
  if (!phase) return reject('phase_invalid');
  try {
    const decoded = decodeMatchingTrip(raw);
    trace('trip_http_snapshot', { ...fields, accepted: true });
    return decoded;
  } catch {
    return reject('snapshot_invalid');
  }
}
