import type { Coordinate } from '../../map/models.ts';
import type { PriceBreakdown } from '../pricing/contracts.ts';

export const activeRequestStates = ['SEARCHING', 'ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING'] as const;
export const assignedRequestStates = ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING'] as const;
export type LifecycleCommand =
  | { name: 'arrive' | 'no_show' | 'cash_received' | 'cash_problem' }
  | { name: 'start'; pin: string }
  | { name: 'complete_stop'; stopIndex: number }
  | { name: 'incur_addition'; code: string }
  | { name: 'finish'; kind: 'normal' | 'early'; finalTelemetrySequence: number };
export type PostPinCommand = Exclude<LifecycleCommand, { name: 'start' } | { name: 'arrive' | 'no_show' | 'cash_received' | 'cash_problem' }>
  | { name: 'cash_received' | 'cash_problem' };
export interface TripTelemetry { sequence: number; coordinate: Coordinate; capturedAt: number; heading?: number }
export interface TripMeter {
  lastSequence: number; distanceMeters: number; durationSeconds: number;
}
export interface TripSettlement {
  kind: 'normal' | 'early'; assignmentId: string; createdAt: number; finalTelemetrySequence: number;
  metrics: TripMeter; incurredAdditionCodes: string[]; price: PriceBreakdown;
  pricingBasisId: string; configVersion: string; profile: 'URBANO' | 'REGIONAL'; overrideId?: string;
}
export interface TripLifecycle {
  arrivedAt?: number; startedAt?: number; completedStops: number;
  meter?: TripMeter; incurredAdditionCodes: string[]; settlement?: TripSettlement;
  completedAt?: number; cancelledAt?: number; paymentOutcome?: 'cash_received' | 'cash_problem'; disputeId?: string;
}
