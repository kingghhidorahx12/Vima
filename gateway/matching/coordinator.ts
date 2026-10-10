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
import { matchingServerTrace, type MatchingServerTrace, type MatchingServerEvent, type AvailabilityReason } from './trace.ts';
import type { PricingConfig } from '../pricing/contracts.ts';
import { validatePricingConfig } from '../pricing/config.ts';
import { activeRequestStates, assignedRequestStates, type LifecycleCommand, type TripTelemetry } from '../../src/services/matching/lifecycle.ts';
import { distanceMeters } from '../../src/services/geospatial/placeIdentity.ts';
import { emptyLifecycle, provenBasis, fingerprint, effectiveAdditions, earlyPrice, appendTelemetry, parseTelemetry,
  parseLifecycleCommand, conflict, natural, canonical, type DurableLifecycle } from './lifecycle.ts';
import type { DriverActionIntent } from '../../src/services/matching/driverActions.ts';

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
  pricingBasisId?: string; lifecycle?: DurableLifecycle;
}
type Location = { coordinate: Coordinate; heading?: number; receivedAt: number; revision: number };
interface DriverRecord {
  id: string; availability: DriverAvailability; revision: number; expiryCount: number; locationRevision: number; location?: Location;
  lastTerminalRequestId?: string;
}
interface OfferRecord {
  id: string; requestId: string; driverId: string; state: 'ACTIVE' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: number; route: RouteResult; sample: Assignment['sample'];
}
type Receipt = { kind: 'request'; request: RequestRecord } |
  { kind: 'driver'; driver: DriverRecord; offer?: OfferRecord; request?: RequestRecord };
interface Snapshot {
  version: 2 | 3 | 4; pricingBases?: Record<string, PricingConfig>; requests: Record<string, RequestRecord>; drivers: Record<string, DriverRecord>; offers: Record<string, OfferRecord>;
  activeRequestByOwner: Record<string, string>;
  requestIds: Record<string, string>; actions: Record<string, { fingerprint: string; result: Receipt }>;
}
export interface MatchingOptions {
  auth: AuthConfig; directory: string; clock?: MatchingClock;
  quote: (id: string, owner: string) => AuthoritativeRideQuote | undefined;
  eta: (origin: Coordinate, pickup: Coordinate) => Promise<RouteResult>;
  trace?: MatchingServerTrace;
  pricingConfig?: PricingConfig;
  quotePricingConfig?: (id: string, owner: string) => PricingConfig | undefined;
  pickupRadiusMeters?: number;
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

function validateSnapshot(raw: unknown, auth: AuthConfig, pricingConfig?: PricingConfig): Snapshot {
  const value = migrateSnapshot(raw) as Snapshot;
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const fields = (v: object, allowed: string[]) => { if (Object.keys(v).some(key => !allowed.includes(key))) throw new Error(); };
  const legacy = (value as { version: number })?.version === 2;
  if (!object(value) || (!legacy && value.version !== 3 && value.version !== 4) || !['requests', 'drivers', 'offers', 'requestIds', 'actions'].every(k => object(value[k as keyof Snapshot]))) throw new Error();
  fields(value, ['version', 'requests', 'drivers', 'offers', 'requestIds', 'actions', ...(!legacy ? ['activeRequestByOwner'] : []), ...(value.version === 4 ? ['pricingBases'] : [])]);
  const request = (r: RequestRecord) => {
    if (!object(r) || !identifier(r.id) || !identifier(r.requestId) || auth.principal(r.owner)?.role !== 'passenger' || !integer(r.revision) ||
      ![...activeRequestStates, 'COMPLETED', 'CANCELLED', 'NO_DRIVER_FOUND'].includes(r.state) || !integer(r.createdAt) ||
      r.deadline !== r.createdAt + matchingPolicy.limitMs || !integer(r.searchStartedAt) || r.searchStartedAt < r.createdAt ||
      r.searchStartedAt > r.deadline || !integer(r.round) || !Array.isArray(r.offered) || !Array.isArray(r.excluded) ||
      [...r.offered, ...r.excluded].some(id => auth.principal(id)?.role !== 'driver') || new Set(r.offered).size !== r.offered.length) throw new Error();
    fields(r, ['id', 'requestId', 'owner', 'revision', 'state', 'quote', 'createdAt', 'deadline', 'searchStartedAt', 'round', 'offered', 'excluded', 'assignment', 'pricingBasisId', 'lifecycle']);
    if (new Set(r.excluded).size !== r.excluded.length || r.excluded.some(id => !r.offered.includes(id))) throw new Error();
    decodeQuoteResponse({ status: 'priced', quote: r.quote });
    if ((assignedRequestStates as readonly string[]).includes(r.state) && !r.assignment ||
      r.assignment && ![...assignedRequestStates, 'COMPLETED', 'CANCELLED'].includes(r.state)) throw new Error();
    if (value.version !== 4 && (r.lifecycle || r.pricingBasisId || !['SEARCHING', 'ASSIGNED', 'CANCELLED', 'NO_DRIVER_FOUND'].includes(r.state))) throw new Error();
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
    fields(d, ['id', 'availability', 'revision', 'expiryCount', 'locationRevision', 'location', ...(value.version === 4 ? ['lastTerminalRequestId'] : [])]);
    if (d.lastTerminalRequestId !== undefined) {
      identifier(d.lastTerminalRequestId); const r = value.requests[d.lastTerminalRequestId];
      if (!r || r.assignment?.driverId !== d.id || !['COMPLETED', 'CANCELLED'].includes(r.state)) throw new Error();
    }
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
  for (const r of Object.values(value.requests)) if (r.assignment && (assignedRequestStates as readonly string[]).includes(r.state)) {
    if (busy.has(r.assignment.driverId) || value.drivers[r.assignment.driverId]?.availability !== 'ASSIGNED') throw new Error();
    busy.add(r.assignment.driverId);
  }
  for (const d of Object.values(value.drivers)) if (d.availability === 'ASSIGNED' && !Object.values(value.requests).some(r => r.assignment?.driverId === d.id && (assignedRequestStates as readonly string[]).includes(r.state))) throw new Error();
  for (const action of Object.values(value.actions)) {
    if (!object(action) || typeof action.fingerprint !== 'string' || !object(action.result)) throw new Error();
    if (action.result.kind === 'request') { fields(action.result, ['kind', 'request']); request(action.result.request); }
    else if (action.result.kind === 'driver') {
      fields(action.result, ['kind', 'driver', 'offer', 'request']);
      driver(action.result.driver); if (action.result.offer) offer(action.result.offer); if (action.result.request) request(action.result.request);
    } else throw new Error();
  }
  if (legacy) {
    value.activeRequestByOwner = {};
    const owners = new Set(Object.values(value.requests).map(r => r.owner));
    for (const owner of owners) {
      const active = Object.values(value.requests).filter(r => r.owner === owner && (activeRequestStates as readonly string[]).includes(r.state));
      const assigned = active.filter(r => r.state === 'ASSIGNED');
      if (assigned.length > 1) throw new Error();
      const keep = assigned[0] ?? active.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
      if (!keep) continue;
      value.activeRequestByOwner[owner] = keep.id;
      for (const r of active) if (r !== keep) {
        r.state = 'CANCELLED'; r.revision++;
        for (const o of Object.values(value.offers)) if (o.requestId === r.id && o.state === 'ACTIVE') {
          o.state = 'REVOKED'; value.drivers[o.driverId]!.revision++;
        }
      }
    }
    value.version = 3;
    return validateSnapshot(value, auth, pricingConfig);
  }
  if (!object(value.activeRequestByOwner)) throw new Error();
  for (const [owner, id] of Object.entries(value.activeRequestByOwner)) {
    if (typeof id !== 'string') throw new Error();
    const r = value.requests[id];
    if (!r || r.owner !== owner || !(activeRequestStates as readonly string[]).includes(r.state)) throw new Error();
  }
  for (const r of Object.values(value.requests)) if ((activeRequestStates as readonly string[]).includes(r.state) && value.activeRequestByOwner[r.owner] !== r.id) throw new Error();
  if (value.version === 3) {
    value.pricingBases = {};
    for (const r of Object.values(value.requests)) if ((activeRequestStates as readonly string[]).includes(r.state)) {
      const basis = provenBasis(pricingConfig, r.quote); const id = fingerprint(basis);
      value.pricingBases[id] = basis; r.pricingBasisId = id; r.lifecycle = emptyLifecycle();
    }
    for (const a of Object.values(value.actions)) {
      const r = a.result.request; const current = r && value.requests[r.id];
      if (r && current?.pricingBasisId) { r.pricingBasisId = current.pricingBasisId; r.lifecycle = emptyLifecycle(); }
    }
    value.version = 4;
  }
  if (!object(value.pricingBases)) throw new Error();
  for (const [id, basis] of Object.entries(value.pricingBases!)) {
    const validated = validatePricingConfig(basis);
    if (fingerprint(validated) !== id || canonical(validated) !== canonical(basis)) throw new Error();
  }
  const validateLife = (r: RequestRecord, historical = false) => {
    if (!r.pricingBasisId) {
      if (r.lifecycle || !['SEARCHING', 'ASSIGNED', 'CANCELLED', 'NO_DRIVER_FOUND'].includes(r.state) ||
        (activeRequestStates as readonly string[]).includes(r.state) && !historical) throw new Error();
      return;
    }
    const basis = value.pricingBases![r.pricingBasisId];
    if (!basis) throw new Error(); provenBasis(basis, r.quote);
    const life = r.lifecycle;
    if (!life || !natural(life.completedStops) || life.completedStops > r.quote.stops.length ||
      !Array.isArray(life.telemetry) || !Array.isArray(life.incurredAdditionCodes) ||
      new Set(life.incurredAdditionCodes).size !== life.incurredAdditionCodes.length ||
      life.incurredAdditionCodes.some(code => !effectiveAdditions(basis, r.quote).some(a => a.code === code))) throw new Error();
    fields(life, ['arrivedAt', 'startedAt', 'completedStops', 'meter', 'incurredAdditionCodes', 'telemetry', 'settlement',
      'completedAt', 'cancelledAt', 'paymentOutcome', 'disputeId']);
    for (const n of [life.arrivedAt, life.startedAt, life.completedAt, life.cancelledAt]) if (n !== undefined && (!natural(n) || n < r.createdAt)) throw new Error();
    if (['ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED'].includes(r.state) && !natural(life.arrivedAt)) throw new Error();
    const started = ['IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED'].includes(r.state);
    if (started !== (life.startedAt !== undefined) || started && life.startedAt! < life.arrivedAt!) throw new Error();
    if (!started && (life.meter || life.telemetry.length || life.completedStops || life.incurredAdditionCodes.length || life.settlement)) throw new Error();
    if (started) {
      const rebuilt = emptyLifecycle(); rebuilt.startedAt = life.startedAt;
      rebuilt.meter = { lastSequence: 0, distanceMeters: 0, durationSeconds: 0 };
      for (const sample of life.telemetry) if (!appendTelemetry(rebuilt, parseTelemetry(sample), Number.MAX_SAFE_INTEGER)) throw new Error();
      if (canonical(rebuilt.meter) !== canonical(life.meter)) throw new Error();
    }
    if (['PAYMENT_PENDING', 'COMPLETED'].includes(r.state) !== !!life.settlement) throw new Error();
    if (life.settlement) {
      const settlement = life.settlement;
      if (!life.telemetry.length || !['normal', 'early'].includes(settlement.kind) || !natural(settlement.createdAt) || settlement.createdAt < life.telemetry.at(-1)!.capturedAt ||
        settlement.assignmentId !== r.assignment?.id || settlement.finalTelemetrySequence !== life.meter!.lastSequence || !life.meter!.lastSequence ||
        canonical(settlement.metrics) !== canonical(life.meter) || canonical(settlement.incurredAdditionCodes) !== canonical(life.incurredAdditionCodes) ||
        settlement.pricingBasisId !== r.pricingBasisId || settlement.configVersion !== r.quote.configVersion || settlement.profile !== r.quote.profile ||
        settlement.overrideId !== r.quote.overrideId || settlement.kind === 'normal' && life.completedStops !== r.quote.stops.length ||
        canonical(settlement.price) !== canonical(settlement.kind === 'normal' ? r.quote.price : earlyPrice(basis, r.quote, life))) throw new Error();
      fields(settlement, ['kind', 'assignmentId', 'createdAt', 'finalTelemetrySequence', 'metrics', 'incurredAdditionCodes', 'price',
        'pricingBasisId', 'configVersion', 'profile', 'overrideId']);
    }
    if (r.state === 'COMPLETED') {
      if (!natural(life.completedAt) || life.completedAt < life.settlement!.createdAt || !['cash_received', 'cash_problem'].includes(life.paymentOutcome!)) throw new Error();
      if (life.paymentOutcome === 'cash_problem' ? !identifier(life.disputeId) : life.disputeId !== undefined) throw new Error();
    } else if (life.completedAt !== undefined || life.paymentOutcome || life.disputeId) throw new Error();
  };
  for (const r of Object.values(value.requests)) validateLife(r);
  for (const a of Object.values(value.actions)) if (a.result.request) validateLife(a.result.request, true);
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
  private transitions = new WeakMap<Snapshot, MatchingServerEvent[]>();
  private trace(event: MatchingServerEvent) { try { (this.options.trace ?? matchingServerTrace)(event); } catch { /* Logging cannot change commit authority. */ } }
  private availabilityTransition(s: Snapshot, d: DriverRecord, to: DriverAvailability, reason: AvailabilityReason) {
    if (to === 'OFFLINE' && reason !== 'explicit_offline') throw new Error('invalid_offline_transition');
    if (d.availability === to) return;
    const events = this.transitions.get(s) ?? [];
    events.push({ event: 'availability_transition', driverId: d.id, from: d.availability, to, reason, revision: d.revision });
    this.transitions.set(s, events); d.availability = to;
  }
  constructor(options: MatchingOptions) {
    this.options = options;
    this.clock = options.clock ?? systemMatchingClock;
    if (!Number.isFinite(options.pickupRadiusMeters ?? 150) || (options.pickupRadiusMeters ?? 150) <= 0) throw new Error('invalid_pickup_radius');
    mkdirSync(options.directory, { recursive: true }); this.file = join(options.directory, 'matching-v1.json');
    let previous: Snapshot | undefined;
    try { previous = JSON.parse(readFileSync(this.file, 'utf8')) as Snapshot; this.state = validateSnapshot(structuredClone(previous), options.auth, options.pricingConfig); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('invalid_matching_snapshot');
      this.state = { version: 4, pricingBases: {}, requests: {}, drivers: {}, offers: {}, requestIds: {}, actions: {}, activeRequestByOwner: {} };
    }
    for (const id of options.auth.drivers) this.state.drivers[id] ??= { id, availability: 'OFFLINE', revision: 0, expiryCount: 0, locationRevision: 0 };
    this.persist(this.state);
    if (previous) {
      for (const d of Object.values(this.state.drivers)) {
        const before = previous.drivers[d.id];
        if (before && before.availability !== d.availability) this.trace({ event: 'availability_transition',
          driverId: d.id, from: before.availability, to: d.availability, reason: 'snapshot_migration', revision: d.revision });
      }
      for (const r of Object.values(this.state.requests)) if (previous.requests[r.id]?.state !== r.state) {
        this.trace({ event: 'request_terminal', requestId: r.id, owner: r.owner, state: r.state, revision: r.revision });
      }
    }
  }
  get ready() { return !this.failed && !this.closed; }
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
    for (const d of Object.values(next.drivers)) if (this.state.drivers[d.id]?.availability !== d.availability &&
      !(this.transitions.get(next) ?? []).some(event => event.event === 'availability_transition' && event.driverId === d.id && event.to === d.availability)) {
      throw new Error('missing_availability_provenance');
    }
    const previous = this.state;
    this.persist(next); this.state = next;
    for (const event of this.transitions.get(next) ?? []) this.trace(event);
    for (const r of Object.values(next.requests)) if (previous.requests[r.id]?.state !== r.state) {
      this.trace({ event: (activeRequestStates as readonly string[]).includes(r.state) ? 'request_active' : 'request_terminal',
        requestId: r.id, owner: r.owner, state: r.state, revision: r.revision });
    }
    for (const o of Object.values(next.offers)) if (o.state === 'ACTIVE' && !previous.offers[o.id]) {
      const r = next.requests[o.requestId]!;
      this.trace({ event: 'offer_commit', offerId: o.id, requestId: r.id, owner: r.owner, driverId: o.driverId,
        requestRevision: r.revision, driverRevision: next.drivers[o.driverId]!.revision, expiresAt: o.expiresAt });
    }
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
      r.state = 'NO_DRIVER_FOUND'; r.revision++; delete next.activeRequestByOwner[r.owner]; this.revoke(next, r);
    }
    for (const o of Object.values(next.offers)) if (o.state === 'ACTIVE' && now >= o.expiresAt) {
      o.state = 'EXPIRED'; const d = next.drivers[o.driverId]!; d.expiryCount++; d.revision++;
      if (d.expiryCount >= 3) this.availabilityTransition(next, d, 'PAUSED', 'offer_expiry_pause');
      next.requests[o.requestId]!.revision++;
    }
    for (const d of Object.values(next.drivers)) if (d.availability === 'AVAILABLE' && !this.fresh(d.location, now)) {
      d.revision++; this.availabilityTransition(next, d, 'LOCATING', 'location_ttl');
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
      phase: (assignedRequestStates as readonly string[]).includes(r.state) ? 'assigned' : r.state === 'COMPLETED' ? 'completed' : r.state === 'CANCELLED' ? 'cancelled' : r.state === 'NO_DRIVER_FOUND' ? 'expired' : r.round ? 'reassigning' : 'searching',
      searchStartedAt: r.searchStartedAt, searchDeadlineAt: r.deadline,
      lifecycle: this.lifecycleView(r),
      quote: { id: q.id, origin: q.origin, destination: q.destination, stops: q.stops, route: q.route.geometry,
        durationMinutes: Math.ceil((q.route.trafficDurationSeconds ?? q.route.durationSeconds) / 60), distanceKm: Math.round(q.route.distanceMeters / 100) / 10,
        paymentMethod: 'Efectivo', pricing: { status: 'priced', quote: q } },
      ...(r.assignment ? { assignment: this.assignment(r.assignment) } : {}) };
  }
  private lifecycleView(r: RequestRecord) {
    const { telemetry: _telemetry, ...life } = r.lifecycle ?? emptyLifecycle(); return structuredClone(life);
  }
  private driverAssignment(value: StoredAssignment) {
    const { pin: _pin, ...assignment } = this.assignment(value); return assignment;
  }
  private driverReceipt(s: Snapshot, id: string): Receipt {
    const offer = this.active(s, id); const request = Object.values(s.requests).find(r => r.assignment?.driverId === id && (assignedRequestStates as readonly string[]).includes(r.state))
      ?? (offer ? s.requests[offer.requestId] : undefined) ?? s.requests[s.drivers[id]!.lastTerminalRequestId ?? ''];
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
      ...(r?.assignment && ['COMPLETED', 'CANCELLED'].includes(r.state) ? { lastTrip: { requestId: r.id, assignmentId: r.assignment.id,
        state: r.state as 'COMPLETED' | 'CANCELLED', lifecycle: this.lifecycleView(r) } } : {}),
      ...(r?.assignment && (assignedRequestStates as readonly string[]).includes(r.state) ? { assignment: { requestId: r.id, pickup: r.quote.origin, value: this.driverAssignment(r.assignment), state: r.state,
        lifecycle: this.lifecycleView(r), stops: r.quote.stops,
        additionCodes: r.pricingBasisId ? effectiveAdditions(this.state.pricingBases![r.pricingBasisId]!, r.quote).map(a => a.code) : [] } } : {}) };
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
      if (this.state.activeRequestByOwner[p.accountId]) throw new MatchingError(409, 'active_request_exists');
      const quote = this.options.quote(quoteId, p.accountId); const now = this.clock.now();
      if (!quote || quote.expiresAt <= now) throw new MatchingError(409, 'quote_unavailable');
      decodeQuoteResponse({ status: 'priced', quote });
      const r: RequestRecord = { id: randomUUID(), requestId, owner: p.accountId, revision: 1, state: 'SEARCHING',
        quote: structuredClone(quote), createdAt: now, deadline: now + matchingPolicy.limitMs, searchStartedAt: now, round: 0, offered: [], excluded: [] };
      const next = structuredClone(this.state);
      const basis = provenBasis(this.options.quotePricingConfig ? this.options.quotePricingConfig(quoteId, p.accountId) : this.options.pricingConfig, quote);
      r.pricingBasisId = fingerprint(basis); r.lifecycle = emptyLifecycle(); next.pricingBases![r.pricingBasisId] = basis;
      next.requests[r.id] = r; next.requestIds[key] = r.id;
      next.activeRequestByOwner[p.accountId] = r.id; this.commit(next); this.arm();
      return this.passenger(r);
    }).finally(() => this.kick()); return structuredClone(result);
  }
  async fetch(p: Principal, id: string) {
    const value = await this.lock(() => { this.sweep(); return structuredClone(this.passenger(this.owned(this.state, p, id))); });
    this.kick(); return value;
  }
  async activeRequest(p: Principal): Promise<MatchingPassengerSnapshot | null> {
    this.requireRole(p, 'passenger');
    const value = await this.lock(() => {
      this.sweep(); const id = this.state.activeRequestByOwner[p.accountId];
      return id ? structuredClone(this.passenger(this.owned(this.state, p, id))) : null;
    });
    this.kick(); return value;
  }
  async cancel(p: Principal, tripId: string, commandId: string, reason: string, assignmentId?: string) {
    this.requireRole(p, 'passenger');
    if (!['user', 'edit', 'schedule'].includes(reason)) return invalid();
    return this.mutation(p, commandId, ['cancel', tripId, reason, ...(assignmentId === undefined ? [] : [assignmentId])], s => {
      const r = this.owned(s, p, tripId);
      if (!['SEARCHING', 'ASSIGNED', 'ARRIVED_PICKUP'].includes(r.state)) conflict('request_not_cancellable');
      if (r.assignment) { if (r.assignment.id !== identifier(assignmentId)) conflict('stale_assignment'); this.releaseDriver(s, r); }
      (r.lifecycle ??= emptyLifecycle()).cancelledAt = this.clock.now(); r.state = 'CANCELLED'; r.revision++; delete s.activeRequestByOwner[r.owner]; this.revoke(s, r); return { kind: 'request', request: r };
    }) as Promise<MatchingPassengerSnapshot>;
  }
  async driver(p: Principal): Promise<DriverState> {
    this.requireRole(p, 'driver'); const value = await this.lock(() => { this.sweep(); return this.view(this.driverReceipt(this.state, p.accountId)) as DriverState; });
    if (value.offer) this.trace({ event: 'driver_state_offer', offerId: value.offer.id, requestId: value.offer.requestId,
      driverId: p.accountId, revision: value.revision, expiresAt: value.offer.expiresAt });
    this.kick(); return value;
  }
  async availability(p: Principal, value: 'AVAILABLE' | 'OFFLINE', operationId: string) {
    this.requireRole(p, 'driver'); if (!['AVAILABLE', 'OFFLINE'].includes(value)) return invalid();
    return this.mutation(p, operationId, ['availability', value], s => {
      const d = s.drivers[p.accountId]!; if (d.availability === 'ASSIGNED') throw new MatchingError(409, 'driver_assigned');
      if (value === 'OFFLINE') { const offer = this.active(s, d.id); if (offer) { offer.state = 'REVOKED'; s.requests[offer.requestId]!.revision++; } }
      if (value === 'AVAILABLE') d.expiryCount = 0; d.revision++;
      this.availabilityTransition(s, d, value === 'OFFLINE' ? 'OFFLINE' : this.fresh(d.location) ? 'AVAILABLE' : 'LOCATING',
        value === 'OFFLINE' ? 'explicit_offline' : 'explicit_available');
      return this.driverReceipt(s, d.id);
    }, () => this.traceDriverAction('driver_action_commit', p, operationId, { kind: value === 'AVAILABLE' ? 'availability_available' : 'availability_offline' })) as Promise<DriverState>;
  }
  async location(p: Principal, point: Coordinate, bearing: number | undefined, operationId: string) {
    this.requireRole(p, 'driver'); let coordinate: Coordinate;
    try { coordinate = normalizeCoordinate(point); } catch { return invalid(); }
    if (bearing !== undefined && (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360)) return invalid();
    return this.mutation(p, operationId, ['location', coordinate, bearing ?? null], s => {
      const d = s.drivers[p.accountId]!;
      if (!['LOCATING', 'AVAILABLE', 'ASSIGNED'].includes(d.availability)) throw new MatchingError(409, 'driver_unavailable');
      d.locationRevision++; d.revision++; d.location = { coordinate, ...(bearing !== undefined ? { heading: bearing } : {}),
        receivedAt: this.clock.now(), revision: d.locationRevision };
      if (d.availability !== 'ASSIGNED') this.availabilityTransition(s, d, 'AVAILABLE', 'location_fix'); return this.driverReceipt(s, d.id);
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
        r.state = 'ASSIGNED'; this.availabilityTransition(s, d, 'ASSIGNED', 'offer_accept');
        r.assignment = { id: randomUUID(), driverId: d.id, etaMinutes: Math.ceil((o.route.trafficDurationSeconds ?? o.route.durationSeconds) / 60),
          pin: String(randomInt(1000, 10000)), sample: o.sample, routeToOrigin: o.route.geometry };
        this.revoke(s, r);
      }
      return this.driverReceipt(s, d.id);
    }, () => this.traceDriverAction('driver_action_commit', p, actionId,
      { kind: action === 'accept' ? 'offer_accept' : 'offer_reject', offerId })) as Promise<DriverState>;
  }
  async cancelAssignment(p: Principal, requestId: string, actionId: string, assignmentId: string) {
    this.requireRole(p, 'driver'); identifier(requestId);
    return this.mutation(p, actionId, ['cancel-assignment', requestId, identifier(assignmentId)], s => {
      const r = s.requests[requestId]; if (!r) throw new MatchingError(404, 'request_not_found');
      this.currentAssignment(r, p, assignmentId);
      if (!['ASSIGNED', 'ARRIVED_PICKUP'].includes(r.state)) conflict('request_not_cancellable');
      const d = s.drivers[p.accountId]!;
      delete (r as RequestRecord).assignment; r.lifecycle = emptyLifecycle(); r.excluded.push(d.id); r.round++; r.searchStartedAt = Math.min(this.clock.now(), r.deadline);
      r.state = this.clock.now() >= r.deadline ? 'NO_DRIVER_FOUND' : 'SEARCHING'; r.revision++;
      if (r.state === 'NO_DRIVER_FOUND') delete s.activeRequestByOwner[r.owner];
      d.revision++; this.availabilityTransition(s, d, d.expiryCount >= 3 ? 'PAUSED' : this.fresh(d.location) ? 'AVAILABLE' : 'LOCATING', 'assignment_cancel');
      return this.driverReceipt(s, d.id);
    }, () => this.traceDriverAction('driver_action_commit', p, actionId, { kind: 'assignment_cancel', requestId })) as Promise<DriverState>;
  }
  private currentAssignment(r: RequestRecord | undefined, p: Principal, assignmentId: string): asserts r is RequestRecord & { assignment: StoredAssignment } {
    if (!r) throw new MatchingError(404, 'request_not_found');
    if (r.assignment?.driverId !== p.accountId) throw new MatchingError(403, 'forbidden');
    if (r.assignment.id !== identifier(assignmentId)) conflict('stale_assignment');
  }
  private releaseDriver(s: Snapshot, r: RequestRecord) {
    const d = s.drivers[r.assignment!.driverId]!; d.revision++;
    d.lastTerminalRequestId = r.id;
    this.availabilityTransition(s, d, d.expiryCount >= 3 ? 'PAUSED' : this.fresh(d.location) ? 'AVAILABLE' : 'LOCATING', 'assignment_terminal');
  }
  async lifecycleCommand(p: Principal, requestId: string, assignmentId: string, commandId: string, raw: LifecycleCommand): Promise<DriverState> {
    this.requireRole(p, 'driver'); identifier(requestId); identifier(assignmentId);
    const command = parseLifecycleCommand(raw);
    // The receipt fingerprint is opaque: command payloads, especially PINs, never enter logs or response metadata.
    return this.mutation(p, commandId, ['lifecycle', requestId, assignmentId, fingerprint(command)], s => {
      const r = s.requests[requestId]; this.currentAssignment(r, p, assignmentId);
      const life = r.lifecycle!; const now = this.clock.now(); const basis = s.pricingBases![r.pricingBasisId!]!;
      switch (command.name) {
        case 'arrive': {
          if (r.state !== 'ASSIGNED') conflict('invalid_trip_state');
          const location = s.drivers[p.accountId]!.location;
          if (!this.fresh(location) || distanceMeters(location!.coordinate, r.quote.origin.coordinate) > (this.options.pickupRadiusMeters ?? 150))
            conflict('pickup_location_required');
          life.arrivedAt = now; r.state = 'ARRIVED_PICKUP'; break;
        }
        case 'start':
          if (r.state !== 'ARRIVED_PICKUP') conflict('invalid_trip_state');
          if (command.pin !== r.assignment.pin) conflict('incorrect_pin');
          life.startedAt = now; life.meter = { lastSequence: 0, distanceMeters: 0, durationSeconds: 0 }; r.state = 'IN_PROGRESS'; break;
        case 'no_show':
          if (r.state !== 'ARRIVED_PICKUP' || now < life.arrivedAt! + 300_000) conflict('no_show_not_available');
          life.cancelledAt = now; r.state = 'CANCELLED'; break;
        case 'complete_stop':
          if (r.state !== 'IN_PROGRESS' || command.stopIndex !== life.completedStops || command.stopIndex >= r.quote.stops.length) conflict('stop_out_of_order');
          life.completedStops++; break;
        case 'incur_addition':
          if (r.state !== 'IN_PROGRESS') conflict('invalid_trip_state');
          if (!effectiveAdditions(basis, r.quote).some(a => a.code === command.code)) conflict('unknown_addition');
          if (life.incurredAdditionCodes.includes(command.code)) conflict('addition_already_incurred');
          life.incurredAdditionCodes.push(command.code); break;
        case 'finish': {
          if (r.state !== 'IN_PROGRESS') conflict('invalid_trip_state');
          if (!life.telemetry.length || command.finalTelemetrySequence !== life.meter!.lastSequence) conflict('final_telemetry_not_confirmed');
          if (command.kind === 'normal' && life.completedStops !== r.quote.stops.length) conflict('stops_pending');
          life.settlement = { kind: command.kind, assignmentId, createdAt: now, finalTelemetrySequence: command.finalTelemetrySequence,
            metrics: structuredClone(life.meter!), incurredAdditionCodes: [...life.incurredAdditionCodes],
            price: structuredClone(command.kind === 'normal' ? r.quote.price : earlyPrice(basis, r.quote, life)),
            pricingBasisId: r.pricingBasisId!, configVersion: r.quote.configVersion, profile: r.quote.profile,
            ...(r.quote.overrideId ? { overrideId: r.quote.overrideId } : {}) };
          r.state = 'PAYMENT_PENDING'; break;
        }
        case 'cash_received': case 'cash_problem':
          if (r.state !== 'PAYMENT_PENDING') conflict('invalid_trip_state');
          life.completedAt = now; life.paymentOutcome = command.name;
          if (command.name === 'cash_problem') life.disputeId = randomUUID();
          r.state = 'COMPLETED'; break;
      }
      r.revision++;
      if (r.state === 'COMPLETED' || r.state === 'CANCELLED') {
        delete s.activeRequestByOwner[r.owner]; this.releaseDriver(s, r);
        // Preserve terminal evidence in the request; DriverState no longer holds an active assignment.
      } else s.drivers[p.accountId]!.revision++;
      return this.driverReceipt(s, p.accountId);
    }) as Promise<DriverState>;
  }
  async telemetry(p: Principal, requestId: string, assignmentId: string, raw: TripTelemetry): Promise<DriverState> {
    this.requireRole(p, 'driver'); identifier(requestId); identifier(assignmentId); const sample = parseTelemetry(raw);
    return this.lock(() => {
      const next = structuredClone(this.state); const r = next.requests[requestId]; this.currentAssignment(r, p, assignmentId);
      if (r.state !== 'IN_PROGRESS') conflict('invalid_trip_state');
      if (appendTelemetry(r.lifecycle!, sample, this.clock.now())) {
        r.revision++; const d = next.drivers[p.accountId]!; d.revision++;
        d.locationRevision++; d.location = { coordinate: sample.coordinate, receivedAt: sample.capturedAt, revision: d.locationRevision };
        this.commit(next);
      }
      return this.view(this.driverReceipt(this.state, p.accountId)) as DriverState;
    });
  }
  /** HTTP calls this only after parsing the existing route/body; offer request identity comes from authority. */
  traceDriverAction(event: 'driver_action_http_received' | 'driver_action_commit', p: Principal, operationId: string,
    intent: { kind: DriverActionIntent['kind']; requestId?: string; offerId?: string }) {
    this.requireRole(p, 'driver'); identifier(operationId);
    const offer = intent.offerId ? this.state.offers[identifier(intent.offerId)] : undefined;
    const requestId = intent.kind === 'assignment_cancel' ? identifier(intent.requestId) : offer?.driverId === p.accountId ? offer.requestId : undefined;
    this.trace({ event, driverId: p.accountId, intent: intent.kind, operationId, requestId, offerId: intent.offerId });
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
