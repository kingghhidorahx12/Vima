import type { TripCommand } from '../../features/trip/contracts.ts';
import { isMatching, type Connection, type PassengerGateway, type PassengerTrip, type RideQuote } from '../../features/passenger/model.ts';
import { matchingPhaseAt, matchingPolicy, type MatchingPolicy } from '../../features/passenger/matchingPolicy.ts';
import { fixtureAssignment, fixturePlaces, fixtureQuote } from './fixtures.ts';

export type FixtureOutcome = 'prolonged' | 'assigned';
/** Separate from motion timings: these are controllable test transport/scenario delays. */
export interface FixtureClock { after(callback: () => void, ms: number): () => void; delay(ms: number): Promise<void>; now?: () => number }
const realClock: FixtureClock = { after: (callback, ms) => { const id = setTimeout(callback, ms); return () => clearTimeout(id); },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
let fixtureInstance = 0;

export function createPassengerFixtureGateway(clock: FixtureClock = realClock, options: {
  locate?: PassengerGateway['locate']; policy?: MatchingPolicy;
} = {}) {
  const policy = options.policy ?? matchingPolicy;
  const now = clock.now ?? Date.now;
  const instance = `${Date.now()}-${++fixtureInstance}`;
  let generation = 0;
  let current: PassengerTrip | undefined;
  let connection: Connection = 'online';
  let outcome: FixtureOutcome = 'prolonged';
  let availableLocation = true;
  let includeStop = false;
  let failNext = false;
  let sequence = 0;
  let cancellations: (() => void)[] = [];
  const requests = new Map<string, PassengerTrip>();
  const listeners = new Set<() => void>();
  const connections = new Set<() => void>();
  const cancelTimers = () => { cancellations.forEach((cancel) => cancel()); cancellations = []; };
  const check = () => { if (connection !== 'online') throw new Error('Sin conexión · Intentando reconectar');
    if (failNext) { failNext = false; throw new Error('Error recuperable'); } };
  const publish = (phase: PassengerTrip['phase']) => {
    if (!current || current.phase === 'cancelled' || current.phase === 'expired') return;
    current = { ...current, phase, revision: current.revision + 1,
      assignment: phase === 'assigned' ? fixtureAssignment(current.quote, ++sequence) : undefined };
    listeners.forEach((listener) => listener());
  };
  const synchronizeSearch = () => {
    if (!current || !isMatching(current.phase)) return;
    const phase = matchingPhaseAt(now() - current.searchStartedAt!, policy);
    if (phase !== current.phase && !(phase === 'searching' && current.phase === 'reassigning')) publish(phase);
    if (phase === 'expired') cancelTimers();
  };
  const matching = () => {
    cancelTimers();
    const elapsed = now() - current!.searchStartedAt!;
    for (const deadline of [policy.lateAfterMs, policy.prolongedAfterMs, policy.limitMs]) {
      if (deadline > elapsed) cancellations.push(clock.after(synchronizeSearch, deadline - elapsed));
    }
    // Optional assigned fixture result; not a search timeout or a product policy.
    if (outcome === 'assigned') cancellations.push(clock.after(() => {
      synchronizeSearch();
      if (current && isMatching(current.phase)) { cancelTimers(); publish('assigned'); }
    }, 5200));
  };
  const gateway: PassengerGateway = {
    scope: `VIMA_PASSENGER_DEV_FIXTURES_ONLY-${instance}`, source: 'fixture',
    locate: async (signal) => { if (!availableLocation) return null; return options.locate ? options.locate(signal) : fixturePlaces[0]!; },
    recentPlaces: async () => { check(); return fixturePlaces.slice(1); },
    findPlaces: async (query) => { check(); return fixturePlaces.filter((place) => `${place.name} ${place.address}`.toLowerCase().includes(query.toLowerCase())); },
    quote: async (draft) => { check(); return fixtureQuote({ ...draft, stops: includeStop ? [fixturePlaces[3]!] : draft.stops }); },
    request: async (quote: RideQuote, requestId) => {
      const startedIn = generation;
      await clock.delay(700); check();
      if (startedIn !== generation) throw new Error('Operación cerrada');
      const known = requests.get(requestId);
      if (known) return current?.id === known.id ? current : known;
      synchronizeSearch();
      if (current?.phase === 'assigned') return current;
      if (current && isMatching(current.phase)) throw new Error('Acción no disponible');
      current = { id: `fixture-trip-${instance}-${++sequence}`, revision: 1, phase: 'searching', quote,
        searchStartedAt: now(), searchDeadlineAt: now() + policy.limitMs };
      requests.set(requestId, current); matching(); return current;
    },
    fetch: async (tripId) => { check(); synchronizeSearch(); if (!current || tripId !== current.id) throw new Error('Viaje no encontrado'); return current; },
    execute: async (command: TripCommand) => {
      const startedIn = generation;
      await clock.delay(400); check();
      if (startedIn !== generation) throw new Error('Operación cerrada');
      if (!current || command.tripId !== current.id) throw new Error('Viaje no encontrado');
      synchronizeSearch();
      if (command.name !== 'cancel') throw new Error('Acción no disponible');
      if (current.phase === 'assigned' && (command.payload.reason === 'edit' || command.payload.reason === 'schedule')) return current;
      cancelTimers(); publish('cancelled');
      return current;
    },
    subscribeTrip: (_tripId, changed, reconnected) => {
      const listener = () => { if (current) changed({ tripId: current.id }); };
      const reconnect = () => { if (connection === 'online') reconnected(); };
      listeners.add(listener); connections.add(reconnect);
      return () => { listeners.delete(listener); connections.delete(reconnect); };
    },
    getConnection: () => connection,
    subscribeConnection: (listener) => { connections.add(listener); return () => { connections.delete(listener); }; },
  };
  return { gateway, controls: {
    setOutcome: (value: FixtureOutcome) => { outcome = value; },
    advance: (phase: 'expanding' | 'prolonged' | 'assigned') => {
      if (!current || !isMatching(current.phase)) return;
      cancelTimers();
      if (phase !== 'assigned') {
        const elapsed = phase === 'expanding' ? policy.lateAfterMs : policy.prolongedAfterMs;
        current = { ...current, searchStartedAt: now() - elapsed, searchDeadlineAt: now() - elapsed + policy.limitMs };
      }
      publish(phase);
      if (phase !== 'assigned') matching();
    },
    driverCancels: () => { if (current?.phase === 'assigned') {
      current = { ...current, searchStartedAt: now(), searchDeadlineAt: now() + policy.limitMs };
      publish('reassigning'); matching();
    } },
    setConnection: (value: Connection) => { connection = value; connections.forEach((listener) => listener()); },
    setLocationAvailable: (value: boolean) => { availableLocation = value; },
    setStop: (value: boolean) => { includeStop = value; },
    failNext: () => { failNext = true; },
    dispose: () => { generation += 1; cancelTimers(); listeners.clear(); connections.clear(); },
  } };
}
