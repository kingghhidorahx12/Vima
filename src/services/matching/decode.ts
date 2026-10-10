import { activeRequestStates, assignedRequestStates } from './lifecycle.ts';
import { validateTrip } from '../../features/trip/contracts.ts';
import { passengerTrip, validPlace, type Assignment } from '../../features/passenger/model.ts';
import { decodeQuoteResponse, decodePriceBreakdown } from '../pricing/normalize.ts';
import type { TripLifecycle } from './lifecycle.ts';
import { normalizeCoordinate } from '../../map/models.ts';
import type { DriverState, MatchingIdentity, MatchingPassengerSnapshot, RevisionSignal } from './contracts.ts';

const fail = () => { throw new Error('Invalid matching response'); };
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const revision = (v: number) => Number.isSafeInteger(v) && v >= 0;
function lifecycle(life: TripLifecycle, state: string) {
  if (!life || !revision(life.completedStops) || !Array.isArray(life.incurredAdditionCodes) || !life.incurredAdditionCodes.every(text) ||
    new Set(life.incurredAdditionCodes).size !== life.incurredAdditionCodes.length || 'telemetry' in life) return fail();
  for (const at of [life.arrivedAt, life.startedAt, life.completedAt, life.cancelledAt]) if (at !== undefined && !revision(at)) return fail();
  if (['ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED'].includes(state) && !revision(life.arrivedAt!)) return fail();
  if (['IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED'].includes(state) && (!revision(life.startedAt!) || !life.meter)) return fail();
  if (life.meter && (!revision(life.meter.lastSequence) || !revision(life.meter.distanceMeters) || !revision(life.meter.durationSeconds))) return fail();
  if (['PAYMENT_PENDING', 'COMPLETED'].includes(state) !== !!life.settlement) return fail();
  if (life.settlement) {
    const s = life.settlement;
    if (!['normal', 'early'].includes(s.kind) || !text(s.assignmentId) || !revision(s.createdAt) || !text(s.pricingBasisId) ||
      !text(s.configVersion) || !['URBANO', 'REGIONAL'].includes(s.profile) || s.overrideId !== undefined && !text(s.overrideId) ||
      !revision(s.finalTelemetrySequence) || s.finalTelemetrySequence < 1 || s.finalTelemetrySequence !== life.meter?.lastSequence ||
      !s.metrics || s.metrics.lastSequence !== life.meter.lastSequence || s.metrics.distanceMeters !== life.meter.distanceMeters ||
      s.metrics.durationSeconds !== life.meter.durationSeconds || !Array.isArray(s.incurredAdditionCodes) ||
      JSON.stringify(s.incurredAdditionCodes) !== JSON.stringify(life.incurredAdditionCodes)) return fail();
    decodePriceBreakdown(s.price);
  }
  if (state === 'COMPLETED' && (!revision(life.completedAt!) || !['cash_received', 'cash_problem'].includes(life.paymentOutcome!) ||
    (life.paymentOutcome === 'cash_problem' ? !text(life.disputeId) : life.disputeId !== undefined))) return fail();
}
function assignment(a: Omit<Assignment, 'pin'> & { pin?: string }, driver = false) {
  if (!a || !text(a.id) || !text(a.driver?.name) || !Number.isFinite(a.driver.rating) || a.driver.rating < 0 || a.driver.rating > 5 ||
    !text(a.vehicle?.name) || !text(a.vehicle.plate) || !text(a.vehicle.color) || !Number.isFinite(a.etaMinutes) || a.etaMinutes < 0 ||
    (driver ? 'pin' in a : !/^\d{4}$/.test(a.pin ?? '')) || !a.sample || !revision(a.sample.sequence) || !Number.isFinite(a.sample.heading) ||
    a.sample.heading < 0 || a.sample.heading >= 360 || a.routeToOrigin?.type !== 'Feature') return fail();
  normalizeCoordinate(a.sample.coordinate);
  if (a.sample.capturedAt !== undefined && !revision(a.sample.capturedAt) ||
    a.sample.headingKnown !== undefined && typeof a.sample.headingKnown !== 'boolean') return fail();
  const geometry = a.routeToOrigin.geometry;
  if (!['LineString', 'MultiLineString'].includes(geometry.type)) return fail();
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  if (!lines.length) return fail();
  for (const line of lines) { if (!Array.isArray(line) || line.length < 2) return fail(); line.forEach(normalizeCoordinate); }
}
export function decodeMatchingTrip(raw: unknown): MatchingPassengerSnapshot {
  const v = raw as MatchingPassengerSnapshot;
  if (!v || !text(v.id)) return fail(); validateTrip(v, v.id); passengerTrip(v);
  if (![...activeRequestStates, 'COMPLETED', 'CANCELLED', 'NO_DRIVER_FOUND'].includes(v.requestState) ||
    !revision(v.searchStartedAt!) || !revision(v.searchDeadlineAt!) || v.searchStartedAt! > v.searchDeadlineAt!) return fail();
  if ((v.requestState === 'SEARCHING' && !['searching', 'reassigning'].includes(v.phase)) ||
    ((assignedRequestStates as readonly string[]).includes(v.requestState) && v.phase !== 'assigned') || (v.requestState === 'COMPLETED' && v.phase !== 'completed') || (v.requestState === 'CANCELLED' && v.phase !== 'cancelled') ||
    (v.requestState === 'NO_DRIVER_FOUND' && v.phase !== 'expired')) return fail();
  if (decodeQuoteResponse(v.quote.pricing).status !== 'priced') return fail();
  if (v.assignment) assignment(v.assignment);
  lifecycle(v.lifecycle, v.requestState);
  return v;
}
export function decodeDriver(raw: unknown): DriverState {
  const d = raw as DriverState;
  if (!d || !text(d.accountId) || !revision(d.revision) || !revision(d.expiryCount) ||
    !['OFFLINE', 'LOCATING', 'AVAILABLE', 'PAUSED', 'ASSIGNED'].includes(d.availability) || !text(d.profile?.driver?.name)) return fail();
  if (d.location) { normalizeCoordinate(d.location.coordinate); if (!revision(d.location.receivedAt) ||
    d.location.heading !== undefined && (!Number.isFinite(d.location.heading) || d.location.heading < 0 || d.location.heading >= 360)) return fail(); }
  if (d.availability === 'AVAILABLE' && !d.location) return fail();
  if (d.offer && (!text(d.offer.id) || !text(d.offer.requestId) || !revision(d.offer.expiresAt) ||
    !Number.isFinite(d.offer.etaMinutes) || d.offer.etaMinutes < 0 || !validPlace(d.offer.pickup))) return fail();
  if (d.assignment) { if (!text(d.assignment.requestId) || !validPlace(d.assignment.pickup)) return fail(); assignment(d.assignment.value, true);
    if (!(assignedRequestStates as readonly string[]).includes(d.assignment.state) || !d.assignment.lifecycle ||
      !Array.isArray(d.assignment.stops) || !d.assignment.stops.every(validPlace) || !Array.isArray(d.assignment.additionCodes)) return fail();
    lifecycle(d.assignment.lifecycle, d.assignment.state); }
  if (d.lastTrip) {
    if (!text(d.lastTrip.requestId) || !text(d.lastTrip.assignmentId) || !['COMPLETED', 'CANCELLED'].includes(d.lastTrip.state)) return fail();
    lifecycle(d.lastTrip.lifecycle, d.lastTrip.state);
  }
  if ((d.availability === 'ASSIGNED') !== !!d.assignment) return fail();
  return d;
}
export function decodeIdentity(raw: unknown): MatchingIdentity {
  const v = raw as MatchingIdentity;
  if (!v || !text(v.accountId) || !['passenger', 'driver'].includes(v.role) || typeof v.matchingAvailable !== 'boolean') return fail();
  return v;
}
export function decodeRevision(raw: unknown): RevisionSignal {
  const v = raw as RevisionSignal; if (!v || !revision(v.revision)) return fail(); return { revision: v.revision };
}
