import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import type { AuthConfig, Principal } from './auth.ts';
import { MatchingError } from './auth.ts';
import type { AuthoritativeRideQuote } from '../../src/services/pricing/contracts.ts';
import { decodeQuoteResponse } from '../../src/services/pricing/normalize.ts';
import { decodeRoute } from '../../src/services/geospatial/normalize.ts';
import type { RouteResult } from '../../src/services/geospatial/contracts.ts';
import { normalizeCoordinate, type Coordinate } from '../../src/map/models.ts';
import type { Assignment } from '../../src/features/passenger/model.ts';
import { matchingPolicy } from '../../src/features/passenger/matchingPolicy.ts';
import type { DriverAvailability, DriverState, MatchingPassengerSnapshot, RequestState } from '../../src/services/matching/contracts.ts';
import { isMatchingLocationFresh, matchingLocationPolicy } from '../../src/services/matching/policy.ts';

export interface MatchingClock { now(): number; schedule(delay: number, callback: () => void): () => void }
export const systemMatchingClock: MatchingClock = { now: Date.now, schedule(delay, callback) {
  const timer = setTimeout(callback, delay); timer.unref(); return () => clearTimeout(timer);
} };
const offerTtl = 20_000;
type StoredAssignment = Omit<Assignment, 'driver' | 'vehicle'> & { driverId: string };
interface RequestRecord {
  id: string; requestId: string; owner: string; revision: number; state: RequestState;
  quote: AuthoritativeRideQuote; createdAt: number; deadline: number; searchStartedAt: number; round: number;
  offered: string[]; excluded: string[]; assignment?: StoredAssignment;
}
type Location = { coordinate: Coordinate; heading?: number; receivedAt: number; revision: number };
interface DriverRecord {
  id: string; availability: DriverAvailability; revision: number; expiryCount: number; locationRevision: number; location?: Location;
}
interface OfferRecord {
  id: string; requestId: string; driverId: string; state: 'ACTIVE' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: number; route: RouteResult; sample: Assignment['sample'];
}
type Receipt = { kind: 'request'; request: RequestRecord } |
  { kind: 'driver'; driver: DriverRecord; offer?: OfferRecord; request?: RequestRecord };
interface Snapshot {
  version: 2; requests: Record<string, RequestRecord>; drivers: Record<string, DriverRecord>; offers: Record<string, OfferRecord>;
  requestIds: Record<string, string>; actions: Record<string, { fingerprint: string; result: Receipt }>;
}
export interface MatchingOptions {
  auth: AuthConfig; directory: string; clock?: MatchingClock;
  quote: (id: string, owner: string) => AuthoritativeRideQuote | undefined;
  eta: (origin: Coordinate, pickup: Coordinate) => Promise<RouteResult>;
}
const invalid = () => { throw new MatchingError(400, 'invalid_matching_input'); };
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) return invalid();
  return value;
};
function heading(route: RouteResult): number {
  const lines = route.geometry.geometry.type === 'LineString' ? [route.geometry.geometry.coordinates] : route.geometry.geometry.coordinates;
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!; const b = line[i]!;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const lat1 = a[1]! * Math.PI / 180; const lat2 = b[1]! * Math.PI / 180; const delta = (b[0]! - a[0]!) * Math.PI / 180;
    return (Math.atan2(Math.sin(delta) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta)) * 180 / Math.PI + 360) % 360;
  }
  throw new MatchingError(503, 'pickup_route_unavailable');
}
function migrateSnapshot(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as { version?: unknown }).version !== 1) return raw;
  const value = structuredClone(raw) as Record<string, unknown>;
  const drivers = value.drivers as Record<string, DriverRecord> | undefined;
  const requests = value.requests as Record<string, RequestRecord> | undefined;
  const offers = value.offers as Record<string, OfferRecord> | undefined;
  const oldDriver = (driver: DriverRecord) => {
    if (!driver || typeof driver !== 'object' || Object.keys(driver).some(key => !['id', 'availability', 'revision', 'expiryCount', 'locationRevision'].includes(key)) ||
      !['OFFLINE', 'AVAILABLE', 'PAUSED', 'ASSIGNED'].includes(driver.availability) || driver.expiryCount >= 3 && driver.availability === 'AVAILABLE') throw new Error();
  };
  if (drivers && typeof drivers === 'object') for (const driver of Object.values(drivers)) oldDriver(driver);
  const actions = value.actions as Record<string, { result?: Record<string, unknown> }> | undefined;
  if (actions && typeof actions === 'object') for (const action of Object.values(actions)) {
    const result = action?.result;
    if (result?.kind === 'driver') {
      if (Object.keys(result).some(key => !['kind', 'driver', 'offer', 'request', 'location'].includes(key))) throw new Error();
      oldDriver(result.driver as DriverRecord);
    }
  }
  if (drivers && typeof drivers === 'object') for (const driver of Object.values(drivers)) {
    if (driver && typeof driver === 'object' && driver.availability === 'AVAILABLE') {
      driver.availability = 'LOCATING'; driver.revision = Number.isSafeInteger(driver.revision) ? driver.revision + 1 : driver.revision;
    }
  }
  if (offers && requests && typeof offers === 'object' && typeof requests === 'object') for (const offer of Object.values(offers)) {
    if (offer?.state === 'ACTIVE' && drivers?.[offer.driverId]?.availability === 'LOCATING') {
      offer.state = 'REVOKED'; const request = requests[offer.requestId];
      if (request && Number.isSafeInteger(request.revision)) request.revision++;
    }
  }
  if (actions && typeof actions === 'object') for (const action of Object.values(actions)) {
    const result = action?.result; const driver = result?.driver as DriverRecord | undefined;
    if (!driver || typeof driver !== 'object') continue;
    const oldLocation = result!.location as Location | undefined;
    if (oldLocation && typeof oldLocation === 'object') driver.location = oldLocation;
    delete result!.location;
    if (driver.availability === 'AVAILABLE' && !driver.location) driver.availability = 'LOCATING';
  }
  value.version = 2; return value;
}

function validateSnapshot(raw: unknown, auth: AuthConfig): Snapshot {
  const value = migrateSnapshot(raw) as Snapshot;
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const fields = (v: object, allowed: string[]) => { if (Object.keys(v).some(key => !allowed.includes(key))) throw new Error(); };
  if (!object(value) || value.version !== 2 || !['requests', 'drivers', 'offers', 'requestIds', 'actions'].every(k => object(value[k as keyof Snapshot]))) throw new Error();
  fields(value, ['version', 'requests', 'drivers', 'offers', 'requestIds', 'actions']);
  const request = (r: RequestRecord) => {
    if (!object(r) || !identifier(r.id) || !identifier(r.requestId) || auth.principal(r.owner)?.role !== 'passenger' || !integer(r.revision) ||
      !['SEARCHING', 'ASSIGNED', 'CANCELLED', 'NO_DRIVER_FOUND'].includes(r.state) || !integer(r.createdAt) ||
      r.deadline !== r.createdAt + matchingPolicy.limitMs || !integer(r.searchStartedAt) || r.searchStartedAt < r.createdAt ||
      r.searchStartedAt > r.deadline || !integer(r.round) || !Array.isArray(r.offered) || !Array.isArray(r.excluded) ||
      [...r.offered, ...r.excluded].some(id => auth.principal(id)?.role !== 'driver') || new Set(r.offered).size !== r.offered.length) throw new Error();
    fields(r, ['id', 'requestId', 'owner', 'revision', 'state', 'quote', 'createdAt', 'deadline', 'searchStartedAt', 'round', 'offered', 'excluded', 'assignment']);
    if (new Set(r.excluded).size !== r.excluded.length || r.excluded.some(id => !r.offered.includes(id))) throw new Error();
    decodeQuoteResponse({ status: 'priced', quote: r.quote });
    if ((r.state === 'ASSIGNED') !== !!r.assignment) throw new Error();
    if (r.assignment) {
      const a = r.assignment;
      fields(a, ['id', 'driverId', 'etaMinutes', 'pin', 'sample', 'routeToOrigin']);
      if (!identifier(a.id) || !/^\d{4}$/.test(a.pin) || auth.principal(a.driverId)?.role !== 'driver' ||
        !Number.isFinite(a.etaMinutes) || a.etaMinutes < 0 || !Number.isFinite(a.sample.heading) ||
        a.sample.heading < 0 || a.sample.heading >= 360 || !integer(a.sample.sequence)) throw new Error();
      normalizeCoordinate(a.sample.coordinate);
      const lines = a.routeToOrigin.geometry.type === 'LineString' ? [a.routeToOrigin.geometry.coordinates] : a.routeToOrigin.geometry.coordinates;
      if (a.routeToOrigin.type !== 'Feature' || !lines.length) throw new Error();
      for (const line of lines) { if (line.length < 2) throw new Error(); line.forEach(normalizeCoordinate); }
    }
  };
  const location = (sample: Location) => {
    if (!object(sample) || !integer(sample.receivedAt) || !integer(sample.revision) ||
      sample.heading !== undefined && (!Number.isFinite(sample.heading) || sample.heading < 0 || sample.heading >= 360)) throw new Error();
    fields(sample, ['coordinate', 'heading', 'receivedAt', 'revision']); normalizeCoordinate(sample.coordinate);
  };
  const driver = (d: DriverRecord) => {
    if (!object(d) || auth.principal(d.id)?.role !== 'driver' || !integer(d.revision) || !integer(d.locationRevision) || !integer(d.expiryCount) ||
      !['OFFLINE', 'LOCATING', 'AVAILABLE', 'PAUSED', 'ASSIGNED'].includes(d.availability) || (d.expiryCount >= 3 && d.availability === 'AVAILABLE') ||
      (d.availability === 'AVAILABLE' && !d.location)) throw new Error();
    fields(d, ['id', 'availability', 'revision', 'expiryCount', 'locationRevision', 'location']);
    if (d.location) { location(d.location); if (d.location.revision !== d.locationRevision) throw new Error(); }
  };
  const offer = (o: OfferRecord) => {
    if (!object(o) || !identifier(o.id) || !identifier(o.requestId) || auth.principal(o.driverId)?.role !== 'driver' || !integer(o.expiresAt) ||
      !['ACTIVE', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED'].includes(o.state)) throw new Error();
    fields(o, ['id', 'requestId', 'driverId', 'state', 'expiresAt', 'route', 'sample']);
    decodeRoute(o.route); normalizeCoordinate(o.sample.coordinate);
    if (!Number.isFinite(o.sample.heading) || o.sample.heading < 0 || o.sample.heading >= 360 || !integer(o.sample.sequence)) throw new Error();
  };
  for (const [id, r] of Object.entries(value.requests)) { request(r); if (id !== r.id || value.requestIds[`${r.owner}:${r.requestId}`] !== id) throw new Error(); }
  for (const [key, id] of Object.entries(value.requestIds)) { const r = value.requests[id]; if (!r || `${r.owner}:${r.requestId}` !== key) throw new Error(); }
  for (const [id, d] of Object.entries(value.drivers)) { driver(d); if (id !== d.id) throw new Error(); }
  const busy = new Set<string>(); const groups = new Map<string, number>();
  for (const [id, o] of Object.entries(value.offers)) {
    offer(o); const r = value.requests[o.requestId];
    if (id !== o.id || !r || !r.offered.includes(o.driverId) || !value.drivers[o.driverId]) throw new Error();
    if (o.state === 'ACTIVE') {
      if (busy.has(o.driverId) || r.state !== 'SEARCHING' || value.drivers[o.driverId]!.availability !== 'AVAILABLE' || r.excluded.includes(o.driverId)) throw new Error();
      busy.add(o.driverId); groups.set(r.id, (groups.get(r.id) ?? 0) + 1);
    }
  }
  if ([...groups.values()].some(size => size > 2)) throw new Error();
  for (const r of Object.values(value.requests)) if (r.assignment) {
    if (busy.has(r.assignment.driverId) || value.drivers[r.assignment.driverId]?.availability !== 'ASSIGNED') throw new Error();
    busy.add(r.assignment.driverId);
  }
  for (const d of Object.values(value.drivers)) if (d.availability === 'ASSIGNED' && !Object.values(value.requests).some(r => r.assignment?.driverId === d.id)) throw new Error();
  for (const action of Object.values(value.actions)) {
    if (!object(action) || typeof action.fingerprint !== 'string' || !object(action.result)) throw new Error();
    if (action.result.kind === 'request') { fields(action.result, ['kind', 'request']); request(action.result.request); }
    else if (action.result.kind === 'driver') {
      fields(action.result, ['kind', 'driver', 'offer', 'request']);
      driver(action.result.driver); if (action.result.offer) offer(action.result.offer); if (action.result.request) request(action.result.request);
    } else throw new Error();
  }
  return value;
}

/** Single-process, durable commit authority. Network ETA never runs in the serialized section. */
export class MatchingCoordinator {
  private state: Snapshot;
  private tail: Promise<unknown> = Promise.resolve();
  private clock: MatchingClock;
  private file: string;
  private passes = new Map<string, symbol>();
  private retryAt = new Map<string, number>();
  private listeners = new Set<() => void>();
  private cancelTimer?: () => void;
  private closed = false;
  private failed = false;
  private options: MatchingOptions;
  constructor(options: MatchingOptions) {
    this.options = options;
    this.clock = options.clock ?? systemMatchingClock;
    mkdirSync(options.directory, { recursive: true }); this.file = join(options.directory, 'matching-v1.json');
    try { this.state = validateSnapshot(JSON.parse(readFileSync(this.file, 'utf8')), options.auth); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('invalid_matching_snapshot');
      this.state = { version: 2, requests: {}, drivers: {}, offers: {}, requestIds: {}, actions: {} };
    }
    for (const id of options.auth.drivers) this.state.drivers[id] ??= { id, availability: 'OFFLINE', revision: 0, expiryCount: 0, locationRevision: 0 };
    this.persist(this.state);
  }
  async start() { await this.lock(() => { this.sweep(); }); this.kick(); }
  close() { this.closed = true; this.cancelTimer?.(); for (const listener of [...this.listeners]) listener(); }
  private lock<T>(work: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(() => { if (this.failed || this.closed) throw new MatchingError(503, 'matching_unavailable'); return work(); });
    this.tail = result.catch(() => {}); return result;
  }
  private persist(state: Snapshot) {
    const temp = `${this.file}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
      const fd = openSync(temp, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temp, this.file);
    } catch { this.failed = true; throw new MatchingError(503, 'matching_storage_unavailable'); }
  }
  private commit(next: Snapshot) {
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.persist(next); this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
  private requireRole(p: Principal, role: Principal['role']) { if (p.role !== role || this.options.auth.principal(p.accountId)?.role !== role) throw new MatchingError(403, 'forbidden'); }
  private owned(s: Snapshot, p: Principal, id: string) {
    this.requireRole(p, 'passenger'); const r = s.requests[identifier(id)];
    if (!r) throw new MatchingError(404, 'request_not_found');
    if (r.owner !== p.accountId) throw new MatchingError(403, 'forbidden'); return r;
  }
  private active(s: Snapshot, driverId: string) { return Object.values(s.offers).find(o => o.driverId === driverId && o.state === 'ACTIVE'); }
  private fresh(location: Location | undefined, now = this.clock.now()) { return !!location && isMatchingLocationFresh(location.receivedAt, now); }
  private revoke(s: Snapshot, r: RequestRecord) {
    for (const o of Object.values(s.offers)) if (o.requestId === r.id && o.state === 'ACTIVE') {
      o.state = 'REVOKED'; s.drivers[o.driverId]!.revision++;
    }
  }
  private sweep() {
    const next = structuredClone(this.state); const now = this.clock.now();
    for (const r of Object.values(next.requests)) if (r.state === 'SEARCHING' && now >= r.deadline) {
      r.state = 'NO_DRIVER_FOUND'; r.revision++; this.revoke(next, r);
    }
    for (const o of Object.values(next.offers)) if (o.state === 'ACTIVE' && now >= o.expiresAt) {
      o.state = 'EXPIRED'; const d = next.drivers[o.driverId]!; d.expiryCount++; d.revision++;
      if (d.expiryCount >= 3) d.availability = 'PAUSED';
      next.requests[o.requestId]!.revision++;
    }
    for (const d of Object.values(next.drivers)) if (d.availability === 'AVAILABLE' && !this.fresh(d.location, now)) {
      d.availability = 'LOCATING'; d.revision++;
      const offer = this.active(next, d.id);
      if (offer) { offer.state = 'REVOKED'; next.requests[offer.requestId]!.revision++; }
    }
    this.commit(next); this.arm();
  }
  private arm() {
    this.cancelTimer?.(); if (this.closed || this.failed) return;
    const times = [...Object.values(this.state.requests).filter(r => r.state === 'SEARCHING').map(r => r.deadline),
      ...Object.values(this.state.offers).filter(o => o.state === 'ACTIVE').map(o => o.expiresAt),
      ...Object.values(this.state.drivers).filter(d => d.availability === 'AVAILABLE' && d.location)
        .map(d => d.location!.receivedAt + matchingLocationPolicy.ttlMs), ...this.retryAt.values()];
    if (times.length) this.cancelTimer = this.clock.schedule(Math.max(0, Math.min(...times) - this.clock.now()), () => {
      for (const [id, time] of this.retryAt) if (time <= this.clock.now()) this.retryAt.delete(id);
      void this.lock(() => this.sweep()).then(() => this.kick()).catch(() => {});
    });
  }
  private assignment(value: StoredAssignment): Assignment {
    const { driverId, ...a } = value; return { ...structuredClone(a), ...this.options.auth.profile(driverId) };
  }
  private passenger(r: RequestRecord): MatchingPassengerSnapshot {
    const q = r.quote;
    return { id: r.id, revision: r.revision, requestState: r.state,
      phase: r.state === 'ASSIGNED' ? 'assigned' : r.state === 'CANCELLED' ? 'cancelled' : r.state === 'NO_DRIVER_FOUND' ? 'expired' : r.round ? 'reassigning' : 'searching',
      searchStartedAt: r.searchStartedAt, searchDeadlineAt: r.deadline,
      quote: { id: q.id, origin: q.origin, destination: q.destination, stops: q.stops, route: q.route.geometry,
        durationMinutes: Math.ceil((q.route.trafficDurationSeconds ?? q.route.durationSeconds) / 60), distanceKm: Math.round(q.route.distanceMeters / 100) / 10,
        paymentMethod: 'Efectivo', pricing: { status: 'priced', quote: q } },
      ...(r.assignment ? { assignment: this.assignment(r.assignment) } : {}) };
  }
  private driverReceipt(s: Snapshot, id: string): Receipt {
    const offer = this.active(s, id); const request = Object.values(s.requests).find(r => r.assignment?.driverId === id) ?? (offer ? s.requests[offer.requestId] : undefined);
    return { kind: 'driver', driver: s.drivers[id]!, ...(offer ? { offer } : {}), ...(request ? { request } : {}) };
  }
  private view(receipt: Receipt): MatchingPassengerSnapshot | DriverState {
    if (receipt.kind === 'request') return structuredClone(this.passenger(receipt.request));
    const { driver: d, offer: o, request: r } = receipt;
    return { accountId: d.id, revision: d.revision, availability: d.availability, expiryCount: d.expiryCount,
      profile: this.options.auth.profile(d.id), ...(d.location ? { location: { coordinate: d.location.coordinate,
        ...(d.location.heading !== undefined ? { heading: d.location.heading } : {}), receivedAt: d.location.receivedAt } } : {}),
      ...(o && r ? { offer: { id: o.id, requestId: r.id, expiresAt: o.expiresAt,
        etaMinutes: Math.ceil((o.route.trafficDurationSeconds ?? o.route.durationSeconds) / 60), pickup: r.quote.origin } } : {}),
      ...(r?.assignment ? { assignment: { requestId: r.id, pickup: r.quote.origin, value: this.assignment(r.assignment) } } : {}) };
  }
  private async mutation(p: Principal, id: string, fingerprint: unknown, change: (next: Snapshot) => Receipt, afterCommit?: (receipt: Receipt) => void) {
    const result = await this.lock(() => {
      this.sweep(); const key = `${p.accountId}:${identifier(id)}`; const encoded = JSON.stringify(fingerprint); const old = this.state.actions[key];
      if (old) { if (old.fingerprint !== encoded) throw new MatchingError(409, 'idempotency_conflict'); return this.view(old.result); }
      const next = structuredClone(this.state); const receipt = change(next);
      next.actions[key] = { fingerprint: encoded, result: structuredClone(receipt) }; this.commit(next); afterCommit?.(receipt); this.arm(); return this.view(receipt);
    }).finally(() => this.kick());
    return result;
  }
  async create(p: Principal, quoteId: string, requestId: string): Promise<MatchingPassengerSnapshot> {
    this.requireRole(p, 'passenger'); identifier(quoteId); identifier(requestId);
    const result = await this.lock(() => {
      this.sweep(); const key = `${p.accountId}:${requestId}`; const existing = this.state.requestIds[key];
      if (existing) {
        const r = this.state.requests[existing]!;
        if (r.quote.id !== quoteId) throw new MatchingError(409, 'idempotency_conflict');
        return this.passenger(r);
      }
      const quote = this.options.quote(quoteId, p.accountId); const now = this.clock.now();
      if (!quote || quote.expiresAt <= now) throw new MatchingError(409, 'quote_unavailable');
      decodeQuoteResponse({ status: 'priced', quote });
      const r: RequestRecord = { id: randomUUID(), requestId, owner: p.accountId, revision: 1, state: 'SEARCHING',
        quote: structuredClone(quote), createdAt: now, deadline: now + matchingPolicy.limitMs, searchStartedAt: now, round: 0, offered: [], excluded: [] };
      const next = structuredClone(this.state); next.requests[r.id] = r; next.requestIds[key] = r.id; this.commit(next); this.arm();
      return this.passenger(r);
    }).finally(() => this.kick()); return structuredClone(result);
  }
  async fetch(p: Principal, id: string) {
    const value = await this.lock(() => { this.sweep(); return structuredClone(this.passenger(this.owned(this.state, p, id))); });
    this.kick(); return value;
  }
  async cancel(p: Principal, tripId: string, commandId: string, reason: string) {
    this.requireRole(p, 'passenger');
    if (!['user', 'edit', 'schedule'].includes(reason)) return invalid();
    return this.mutation(p, commandId, ['cancel', tripId, reason], s => {
      const r = this.owned(s, p, tripId);
      if (r.state !== 'SEARCHING') throw new MatchingError(409, 'request_not_searching');
      r.state = 'CANCELLED'; r.revision++; this.revoke(s, r); return { kind: 'request', request: r };
    }) as Promise<MatchingPassengerSnapshot>;
  }
  async driver(p: Principal): Promise<DriverState> {
    this.requireRole(p, 'driver'); const value = await this.lock(() => { this.sweep(); return this.view(this.driverReceipt(this.state, p.accountId)) as DriverState; });
    this.kick(); return value;
  }
  async availability(p: Principal, value: 'AVAILABLE' | 'OFFLINE', operationId: string) {
    this.requireRole(p, 'driver'); if (!['AVAILABLE', 'OFFLINE'].includes(value)) return invalid();
    return this.mutation(p, operationId, ['availability', value], s => {
      const d = s.drivers[p.accountId]!; if (d.availability === 'ASSIGNED') throw new MatchingError(409, 'driver_assigned');
      if (value === 'OFFLINE') { const offer = this.active(s, d.id); if (offer) { offer.state = 'REVOKED'; s.requests[offer.requestId]!.revision++; } }
      d.availability = value === 'OFFLINE' ? 'OFFLINE' : this.fresh(d.location) ? 'AVAILABLE' : 'LOCATING';
      if (value === 'AVAILABLE') d.expiryCount = 0; d.revision++;
      return this.driverReceipt(s, d.id);
    }) as Promise<DriverState>;
  }
  async location(p: Principal, point: Coordinate, bearing: number | undefined, operationId: string) {
    this.requireRole(p, 'driver'); let coordinate: Coordinate;
    try { coordinate = normalizeCoordinate(point); } catch { return invalid(); }
    if (bearing !== undefined && (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360)) return invalid();
    return this.mutation(p, operationId, ['location', coordinate, bearing ?? null], s => {
      const d = s.drivers[p.accountId]!;
      if (!['LOCATING', 'AVAILABLE'].includes(d.availability)) throw new MatchingError(409, 'driver_unavailable');
      d.locationRevision++; d.revision++; d.location = { coordinate, ...(bearing !== undefined ? { heading: bearing } : {}),
        receivedAt: this.clock.now(), revision: d.locationRevision };
      d.availability = 'AVAILABLE'; return this.driverReceipt(s, d.id);
    }) as Promise<DriverState>;
  }
  async offerAction(p: Principal, offerId: string, action: 'accept' | 'reject', actionId: string) {
    this.requireRole(p, 'driver'); identifier(offerId); if (!['accept', 'reject'].includes(action)) return invalid();
    return this.mutation(p, actionId, [action, offerId], s => {
      const o = s.offers[offerId]; if (!o) throw new MatchingError(404, 'offer_not_found');
      if (o.driverId !== p.accountId) throw new MatchingError(403, 'forbidden');
      const r = s.requests[o.requestId]!; const d = s.drivers[p.accountId]!;
      if (o.state !== 'ACTIVE' || r.state !== 'SEARCHING' || d.availability !== 'AVAILABLE') throw new MatchingError(409, 'offer_inactive');
      o.state = action === 'accept' ? 'ACCEPTED' : 'REJECTED'; d.revision++; r.revision++;
      if (action === 'accept') {
        r.state = 'ASSIGNED'; d.availability = 'ASSIGNED';
        r.assignment = { id: randomUUID(), driverId: d.id, etaMinutes: Math.ceil((o.route.trafficDurationSeconds ?? o.route.durationSeconds) / 60),
          pin: String(randomInt(1000, 10000)), sample: o.sample, routeToOrigin: o.route.geometry };
        this.revoke(s, r);
      }
      return this.driverReceipt(s, d.id);
    }) as Promise<DriverState>;
  }
  async cancelAssignment(p: Principal, requestId: string, actionId: string) {
    this.requireRole(p, 'driver'); identifier(requestId);
    return this.mutation(p, actionId, ['cancel-assignment', requestId], s => {
      const r = s.requests[requestId]; if (!r) throw new MatchingError(404, 'request_not_found');
      if (r.assignment?.driverId !== p.accountId) throw new MatchingError(403, 'forbidden');
      const d = s.drivers[p.accountId]!;
      delete r.assignment; r.excluded.push(d.id); r.round++; r.searchStartedAt = Math.min(this.clock.now(), r.deadline);
      r.state = this.clock.now() >= r.deadline ? 'NO_DRIVER_FOUND' : 'SEARCHING'; r.revision++;
      d.availability = d.expiryCount >= 3 ? 'PAUSED' : this.fresh(d.location) ? 'AVAILABLE' : 'LOCATING'; d.revision++;
      return this.driverReceipt(s, d.id);
    }) as Promise<DriverState>;
  }
  async wait(p: Principal, requestId: string | undefined, after: number, signal?: AbortSignal): Promise<{ revision: number }> {
    if (!Number.isSafeInteger(after) || after < 0) return invalid();
    let waiting!: Promise<{ revision: number }>;
    await this.lock(() => {
      this.sweep();
      const revision = () => requestId ? this.owned(this.state, p, requestId).revision :
        (this.requireRole(p, 'driver'), this.state.drivers[p.accountId]!.revision);
      const current = revision();
      waiting = new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new MatchingError(499, 'cancelled')); return; }
        if (current > after) { resolve({ revision: current }); return; }
        let cancel: () => void = () => {};
        const cleanup = () => { cancel(); this.listeners.delete(check); signal?.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); reject(new MatchingError(499, 'cancelled')); };
        const check = () => { if (this.closed || this.failed) { cleanup(); reject(new MatchingError(503, 'matching_unavailable')); }
          else if (revision() > after) { cleanup(); resolve({ revision: revision() }); } };
        cancel = this.clock.schedule(25_000, () => { cleanup(); resolve({ revision: revision() }); });
        this.listeners.add(check); signal?.addEventListener('abort', abort, { once: true });
      });
    }); this.kick(); return waiting;
  }
  private kick() {
    if (this.closed || this.failed) return;
    void this.lock(() => {
      this.sweep();
      for (const r of Object.values(this.state.requests)) {
        if (r.state !== 'SEARCHING' || this.passes.has(r.id) || this.retryAt.has(r.id) || Object.values(this.state.offers).some(o => o.requestId === r.id && o.state === 'ACTIVE')) continue;
        const candidates = Object.values(this.state.drivers).filter(d => {
          const location = d.location;
          return d.availability === 'AVAILABLE' && this.fresh(location) &&
            !this.active(this.state, d.id) && !r.offered.includes(d.id) && !r.excluded.includes(d.id);
        }).map(d => ({ driver: structuredClone(d), location: structuredClone(d.location!) }));
        if (!candidates.length) continue;
        const generation = Symbol(); this.passes.set(r.id, generation);
        void this.plan(structuredClone(r), candidates, generation);
      }
    }).catch(() => {});
  }
  private async plan(request: RequestRecord, candidates: { driver: DriverRecord; location: Location }[], generation: symbol) {
    // This continuation starts after the lock callback returns. All network I/O is outside it.
    await Promise.resolve();
    const results = await Promise.all(candidates.map(async candidate => {
      try {
        const route = decodeRoute(await this.options.eta(candidate.location.coordinate, request.quote.origin.coordinate));
        const sample = { coordinate: candidate.location.coordinate, heading: candidate.location.heading ?? heading(route), sequence: candidate.location.revision };
        return { ...candidate, route, sample };
      } catch { return undefined; }
    }));
    let retry = false;
    try {
      await this.lock(() => {
        this.sweep(); if (this.passes.get(request.id) !== generation) return;
        this.passes.delete(request.id); const r = this.state.requests[request.id];
        if (!r || r.state !== 'SEARCHING') return;
        if (r.revision !== request.revision) { retry = true; return; }
        const next = structuredClone(this.state); const target = next.requests[r.id]!;
        const eligible = results.filter(result => {
          if (!result) return false;
          const current = next.drivers[result.driver.id]!; const location = current.location;
          return current.revision === result.driver.revision && current.locationRevision === result.location.revision &&
            current.availability === 'AVAILABLE' && this.fresh(location) &&
            !this.active(next, current.id) && !target.offered.includes(current.id) && !target.excluded.includes(current.id);
        }).filter(result => result !== undefined).sort((a, b) =>
          (a.route.trafficDurationSeconds ?? a.route.durationSeconds) - (b.route.trafficDurationSeconds ?? b.route.durationSeconds) || a.driver.id.localeCompare(b.driver.id)).slice(0, 2);
        for (const result of eligible) {
          const id = randomUUID(); next.offers[id] = { id, requestId: r.id, driverId: result.driver.id, state: 'ACTIVE',
            expiresAt: Math.min(this.clock.now() + offerTtl, r.deadline), route: result.route, sample: result.sample };
          target.offered.push(result.driver.id); next.drivers[result.driver.id]!.revision++;
        }
        if (eligible.length) { target.revision++; this.commit(next); }
        else if (results.some(Boolean)) retry = true;
        else this.retryAt.set(r.id, this.clock.now() + 5_000);
        this.arm();
      });
    } catch { this.passes.delete(request.id); }
    if (retry) this.kick();
  }
}
