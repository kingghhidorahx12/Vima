import type { DriverAvailability, RequestState } from '../../src/services/matching/contracts.ts';
import type { DriverActionIntent } from '../../src/services/matching/driverActions.ts';

export type AvailabilityReason = 'explicit_available' | 'explicit_offline' | 'location_fix' | 'location_ttl' |
  'offer_accept' | 'offer_expiry_pause' | 'assignment_cancel' | 'snapshot_migration';
export type MatchingServerEvent =
  | { event: 'driver_action_http_received' | 'driver_action_commit'; driverId: string; intent: DriverActionIntent['kind']; operationId: string; requestId?: string; offerId?: string }
  | { event: 'request_active' | 'request_terminal'; requestId: string; owner: string; state: RequestState; revision: number }
  | { event: 'offer_commit'; offerId: string; requestId: string; owner: string; driverId: string; requestRevision: number; driverRevision: number; expiresAt: number }
  | { event: 'driver_state_offer'; offerId: string; requestId: string; driverId: string; revision: number; expiresAt: number }
  | { event: 'availability_transition'; driverId: string; from: DriverAvailability; to: DriverAvailability; reason: AvailabilityReason; revision: number };
export type MatchingServerTrace = (event: MatchingServerEvent) => void;
export const matchingServerTrace: MatchingServerTrace = event => console.info(JSON.stringify(event));
