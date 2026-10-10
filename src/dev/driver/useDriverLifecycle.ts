import { useCallback, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
import type { DriverState } from '../../services/matching/contracts';
import type { MatchingClient } from '../../services/matching/client';
import type { LifecycleCommand, PostPinCommand } from '../../services/matching/lifecycle';
import { createDriverJournal } from '../../services/matching/driverJournal';
import { driverOperationId } from '../../services/matching/operationId';
import { ApiError } from '../../services/api/client';
import type { Coordinate } from '../../map/models';
import { lifecycleCommandMessage } from './lifecycleFeedback';

export function useDriverLifecycle(client: MatchingClient, accountId: string, received: (snapshot: DriverState) => void) {
  const [journal] = useState(() => createDriverJournal(Storage, accountId, client, received));
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [queued, setQueued] = useState(0); const [error, setError] = useState('');
  const [pendingCommands, setPendingCommands] = useState<PostPinCommand[]>([]);
  const pending = useRef<{ assignmentId: string; command: LifecycleCommand; id: string } | undefined>(undefined);
  const sync = useCallback(async () => {
    try { await journal.sync(); setError(''); }
    catch { setError('No se pudo sincronizar. Las operaciones guardadas se conservarán.'); }
    finally { try { setQueued(await journal.pending()); setPendingCommands(await journal.pendingCommands()); }
      catch { setError('No se pudo leer el registro local. No se ha borrado.'); } }
  }, [journal]);
  const command = async (snapshot: DriverState, input: LifecycleCommand) => {
    if (busyRef.current || !snapshot.assignment) return;
    busyRef.current = true; setBusy(true); setError('');
    const a = snapshot.assignment;
    try {
      if (['arrive', 'start', 'no_show'].includes(input.name)) {
        if (!pending.current || pending.current.assignmentId !== a.value.id || JSON.stringify(pending.current.command) !== JSON.stringify(input))
          pending.current = { assignmentId: a.value.id, command: input, id: driverOperationId('lifecycle') };
        received(await client.lifecycleCommand(a.requestId, a.value.id, pending.current.id, input)); pending.current = undefined;
      } else {
        const postPin = input as PostPinCommand;
        await journal.enqueueCommand(snapshot, driverOperationId('lifecycle'), postPin);
        setQueued(await journal.pending()); await sync();
      }
    } catch (e) {
      if (e instanceof ApiError) pending.current = undefined;
      setError(lifecycleCommandMessage(e));
    } finally { busyRef.current = false; setBusy(false); }
  };
  const telemetry = async (snapshot: DriverState, coordinate: Coordinate, capturedAt: number) => {
    if (snapshot.assignment?.state !== 'IN_PROGRESS' || capturedAt < snapshot.assignment.lifecycle.startedAt!) return;
    await journal.enqueueTelemetry(snapshot, coordinate, capturedAt); setQueued(await journal.pending()); await sync();
  };
  return { busy, queued, pendingCommands, error, sync, command, telemetry };
}
