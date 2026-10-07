import type { Assignment, PassengerTrip, Place } from '../../features/passenger/model.ts';
import type { Coordinate } from '../../map/models.ts';

export type RequestState = 'SEARCHING' | 'ASSIGNED' | 'CANCELLED' | 'NO_DRIVER_FOUND';
export type DriverAvailability = 'OFFLINE' | 'AVAILABLE' | 'PAUSED' | 'ASSIGNED';
export interface DriverState {
  accountId: string; revision: number; availability: DriverAvailability; expiryCount: number;
  profile: { driver: Assignment['driver']; vehicle: Assignment['vehicle'] };
  location?: { coordinate: Coordinate; heading?: number; receivedAt: number };
  offer?: { id: string; requestId: string; expiresAt: number; etaMinutes: number; pickup: Place };
  assignment?: { requestId: string; pickup: Place; value: Assignment };
}
export interface MatchingIdentity { accountId: string; role: 'passenger' | 'driver'; matchingAvailable: boolean }
export interface RevisionSignal { revision: number }
export interface MatchingPassengerSnapshot extends PassengerTrip { requestState: RequestState }
