import type { Assignment, PassengerTrip, Place } from '../../features/passenger/model.ts';
import type { TripLifecycle } from './lifecycle.ts';
import type { Coordinate } from '../../map/models.ts';

export type RequestState = 'SEARCHING' | 'ASSIGNED' | 'ARRIVED_PICKUP' | 'IN_PROGRESS' | 'PAYMENT_PENDING' | 'COMPLETED' | 'CANCELLED' | 'NO_DRIVER_FOUND';
export type DriverAvailability = 'OFFLINE' | 'LOCATING' | 'AVAILABLE' | 'PAUSED' | 'ASSIGNED';
export interface DriverState {
  accountId: string; revision: number; availability: DriverAvailability; expiryCount: number;
  profile: { driver: Assignment['driver']; vehicle: Assignment['vehicle'] };
  lastTrip?: { requestId: string; assignmentId: string; state: 'COMPLETED' | 'CANCELLED'; lifecycle: TripLifecycle };
  location?: { coordinate: Coordinate; heading?: number; receivedAt: number };
  offer?: { id: string; requestId: string; expiresAt: number; etaMinutes: number; pickup: Place };
  assignment?: { requestId: string; pickup: Place; value: Omit<Assignment, 'pin'>; state: RequestState; lifecycle: TripLifecycle; stops: readonly Place[]; additionCodes: readonly string[] };
}
export interface MatchingIdentity { accountId: string; role: 'passenger' | 'driver'; matchingAvailable: boolean }
export interface RevisionSignal { revision: number }
export interface MatchingPassengerSnapshot extends PassengerTrip { requestState: RequestState; lifecycle: TripLifecycle }
