import { validateTrip } from '../../features/trip/contracts.ts';
import { passengerTrip, validPlace, type Assignment } from '../../features/passenger/model.ts';
import { decodeQuoteResponse } from '../pricing/normalize.ts';
import { normalizeCoordinate } from '../../map/models.ts';
import type { DriverState, MatchingIdentity, MatchingPassengerSnapshot, RevisionSignal } from './contracts.ts';

const fail = () => { throw new Error('Invalid matching response'); };
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const revision = (v: number) => Number.isSafeInteger(v) && v >= 0;
function assignment(a: Assignment) {
  if (!a || !text(a.id) || !text(a.driver?.name) || !Number.isFinite(a.driver.rating) || a.driver.rating < 0 || a.driver.rating > 5 ||
    !text(a.vehicle?.name) || !text(a.vehicle.plate) || !text(a.vehicle.color) || !Number.isFinite(a.etaMinutes) || a.etaMinutes < 0 ||
    !/^\d{4}$/.test(a.pin) || !a.sample || !revision(a.sample.sequence) || !Number.isFinite(a.sample.heading) ||
    a.sample.heading < 0 || a.sample.heading >= 360 || a.routeToOrigin?.type !== 'Feature') return fail();
  normalizeCoordinate(a.sample.coordinate);
  const geometry = a.routeToOrigin.geometry;
  if (!['LineString', 'MultiLineString'].includes(geometry.type)) return fail();
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  if (!lines.length) return fail();
  for (const line of lines) { if (!Array.isArray(line) || line.length < 2) return fail(); line.forEach(normalizeCoordinate); }
}
export function decodeMatchingTrip(raw: unknown): MatchingPassengerSnapshot {
  const v = raw as MatchingPassengerSnapshot;
  if (!v || !text(v.id)) return fail(); validateTrip(v, v.id); passengerTrip(v);
  if (!['SEARCHING', 'ASSIGNED', 'CANCELLED', 'NO_DRIVER_FOUND'].includes(v.requestState) ||
    !revision(v.searchStartedAt!) || !revision(v.searchDeadlineAt!) || v.searchStartedAt! > v.searchDeadlineAt!) return fail();
  if ((v.requestState === 'SEARCHING' && !['searching', 'reassigning'].includes(v.phase)) ||
    (v.requestState === 'ASSIGNED' && v.phase !== 'assigned') || (v.requestState === 'CANCELLED' && v.phase !== 'cancelled') ||
    (v.requestState === 'NO_DRIVER_FOUND' && v.phase !== 'expired')) return fail();
  if (decodeQuoteResponse(v.quote.pricing).status !== 'priced') return fail();
  if (v.assignment) assignment(v.assignment);
  return v;
}
export function decodeDriver(raw: unknown): DriverState {
  const d = raw as DriverState;
  if (!d || !text(d.accountId) || !revision(d.revision) || !revision(d.expiryCount) ||
    !['OFFLINE', 'AVAILABLE', 'PAUSED', 'ASSIGNED'].includes(d.availability) || !text(d.profile?.driver?.name)) return fail();
  if (d.location) { normalizeCoordinate(d.location.coordinate); if (!revision(d.location.receivedAt)) return fail(); }
  if (d.offer && (!text(d.offer.id) || !text(d.offer.requestId) || !revision(d.offer.expiresAt) ||
    !Number.isFinite(d.offer.etaMinutes) || d.offer.etaMinutes < 0 || !validPlace(d.offer.pickup))) return fail();
  if (d.assignment) { if (!text(d.assignment.requestId) || !validPlace(d.assignment.pickup)) return fail(); assignment(d.assignment.value); }
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
