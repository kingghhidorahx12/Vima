import type { DriverState } from './contracts.ts';
import type { MatchingClient } from './client.ts';
import type { PostPinCommand, TripTelemetry } from './lifecycle.ts';
import { normalizeCoordinate } from '../../map/models.ts';

type Entry = { kind: 'telemetry'; sample: TripTelemetry } | { kind: 'command'; commandId: string; command: PostPinCommand };
interface Journal { version: 1; requestId: string; assignmentId: string; entries: Entry[] }
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
type Client = Pick<MatchingClient, 'driver' | 'telemetry' | 'lifecycleCommand'>;
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v);
function decode(raw: string): Journal {
  const v = JSON.parse(raw) as Journal;
  if (!v || v.version !== 1 || !id(v.requestId) || !id(v.assignmentId) || !Array.isArray(v.entries)) throw new Error('invalid_driver_journal');
  for (const entry of v.entries) {
    if (entry.kind === 'telemetry') {
      if (!integer(entry.sample.sequence) || !entry.sample.sequence || !integer(entry.sample.capturedAt)) throw new Error('invalid_driver_journal');
      normalizeCoordinate(entry.sample.coordinate);
    } else if (entry.kind !== 'command' || !id(entry.commandId) ||
      !['complete_stop', 'incur_addition', 'finish', 'cash_received', 'cash_problem'].includes(entry.command.name)) throw new Error('invalid_driver_journal');
  }
  return v;
}

/** An ordered durable outbox, never a local trip state. Every replay starts with authoritative GET. */
export function createDriverJournal(storage: Storage, accountId: string, client: Client, received: (state: DriverState) => void) {
  const key = `vima.driver-journal.v1.${accountId}`;
  let tail: Promise<unknown> = Promise.resolve();
  let acknowledged: DriverState | undefined;
  const latest = (snapshot: DriverState) => acknowledged && acknowledged.revision > snapshot.revision ? acknowledged : snapshot;
  const observe = (snapshot: DriverState) => {
    if (snapshot.accountId !== accountId) throw new Error('journal_account_mismatch');
    acknowledged = latest(snapshot); received(acknowledged); return acknowledged;
  };
  const currentSnapshot = (snapshot: DriverState) => {
    const current = latest(snapshot);
    if (current.assignment?.requestId !== snapshot.assignment?.requestId || current.assignment?.value.id !== snapshot.assignment?.value.id)
      throw new Error('journal_requires_reconcile');
    return current;
  };
  const serial = <T>(work: () => Promise<T>) => { const next = tail.then(work); tail = next.catch(() => {}); return next; };
  const read = async () => { const raw = await storage.getItem(key); return raw === null ? null : decode(raw); };
  const write = (v: Journal) => storage.setItem(key, JSON.stringify(v));
  async function current(snapshot: DriverState) {
    snapshot = currentSnapshot(snapshot);
    const assignment = snapshot.assignment;
    if (snapshot.accountId !== accountId || !assignment || !['IN_PROGRESS', 'PAYMENT_PENDING'].includes(assignment.state)) throw new Error('offline_not_available');
    const journal = await read();
    if (journal && (journal.requestId !== assignment.requestId || journal.assignmentId !== assignment.value.id)) throw new Error('journal_requires_reconcile');
    return journal ?? { version: 1 as const, requestId: assignment.requestId, assignmentId: assignment.value.id, entries: [] };
  }
  async function sync() {
    const snapshot = await client.driver(); // A failed GET never clears durable work.
    if (snapshot.accountId !== accountId) throw new Error('journal_account_mismatch');
    observe(snapshot);
    const journal = await read(); if (!journal) return snapshot;
    const assignment = snapshot.assignment;
    if (!assignment || assignment.requestId !== journal.requestId || assignment.value.id !== journal.assignmentId) {
      await storage.removeItem(key); return snapshot;
    }
    if (!['IN_PROGRESS', 'PAYMENT_PENDING'].includes(assignment.state)) throw new Error('journal_state_mismatch');
    let confirmed = latest(snapshot);
    while (journal.entries.length) {
      const entry = journal.entries[0]!;
      if (entry.kind === 'telemetry') {
        confirmed = await client.telemetry(journal.requestId, journal.assignmentId, entry.sample);
      } else {
        if (entry.command.name === 'finish' && confirmed.assignment?.state === 'IN_PROGRESS' &&
          confirmed.assignment.lifecycle.meter?.lastSequence !== entry.command.finalTelemetrySequence) throw new Error('journal_telemetry_pending');
        confirmed = await client.lifecycleCommand(journal.requestId, journal.assignmentId, entry.commandId, entry.command);
      }
      confirmed = observe(confirmed);
      // Persist acknowledgements one at a time; crash before write retries the same stable identity.
      journal.entries.shift(); await write(journal);
    }
    await storage.removeItem(key); return confirmed;
  }
  return {
    sync: () => serial(sync),
    enqueueTelemetry: (snapshot: DriverState, coordinate: TripTelemetry['coordinate'], capturedAt: number) => serial(async () => {
      snapshot = currentSnapshot(snapshot);
      if (snapshot.assignment?.state !== 'IN_PROGRESS' || !integer(capturedAt)) throw new Error('offline_not_available');
      const journal = await current(snapshot);
      if (journal.entries.some(e => e.kind === 'command' && e.command.name === 'finish')) throw new Error('finish_already_queued');
      const sequence = Math.max(snapshot.assignment.lifecycle.meter!.lastSequence,
        ...journal.entries.filter(e => e.kind === 'telemetry').map(e => e.sample.sequence)) + 1;
      const sample = { sequence, coordinate: normalizeCoordinate(coordinate), capturedAt };
      journal.entries.push({ kind: 'telemetry', sample }); await write(journal); return sample;
    }),
    enqueueCommand: (snapshot: DriverState, commandId: string, command: PostPinCommand) => serial(async () => {
      snapshot = currentSnapshot(snapshot);
      if (!id(commandId)) throw new Error('invalid_command_id');
      const journal = await current(snapshot);
      if ((command.name === 'cash_received' || command.name === 'cash_problem')
        ? snapshot.assignment?.state !== 'PAYMENT_PENDING' : snapshot.assignment?.state !== 'IN_PROGRESS') throw new Error('offline_not_available');
      if (command.name === 'complete_stop' && command.stopIndex !== snapshot.assignment!.lifecycle.completedStops +
        journal.entries.filter(e => e.kind === 'command' && e.command.name === 'complete_stop').length) throw new Error('stop_out_of_order');
      if (command.name === 'incur_addition' && (!snapshot.assignment!.additionCodes.includes(command.code) ||
        snapshot.assignment!.lifecycle.incurredAdditionCodes.includes(command.code) || journal.entries.some(e =>
          e.kind === 'command' && e.command.name === 'incur_addition' && e.command.code === command.code))) throw new Error('invalid_addition_intent');
      if (journal.entries.some(e => e.kind === 'command' && (e.commandId === commandId || e.command.name === 'finish' ||
        e.command.name === 'cash_received' || e.command.name === 'cash_problem'))) throw new Error('command_already_queued');
      const frozen = { ...command };
      if (frozen.name === 'finish') {
        frozen.finalTelemetrySequence = Math.max(snapshot.assignment!.lifecycle.meter?.lastSequence ?? 0,
          ...journal.entries.filter(e => e.kind === 'telemetry').map(e => e.sample.sequence));
        if (!frozen.finalTelemetrySequence) throw new Error('journal_telemetry_pending');
      }
      journal.entries.push({ kind: 'command', commandId, command: frozen }); await write(journal);
    }),
    pending: () => serial(async () => (await read())?.entries.length ?? 0),
    pendingCommands: () => serial(async () => (await read())?.entries.filter(e => e.kind === 'command').map(e => e.command) ?? []),
  };
}
