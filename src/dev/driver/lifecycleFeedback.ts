import { ApiError } from '../../services/api/client.ts';

/** Presentation only: never infer completion or discard a queued operation. */
export function lifecycleCommandMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'incorrect_pin') return 'PIN incorrecto.';
  if (error instanceof Error && error.message === 'journal_telemetry_pending')
    return 'Falta confirmar una muestra GPS del viaje. Sincroniza y vuelve a finalizar; no es necesario desplazarte.';
  if (error instanceof Error && ['command_already_queued', 'finish_already_queued'].includes(error.message))
    return 'La operación ya está guardada. Sincroniza el viaje para confirmar el mismo intento.';
  if (error instanceof Error && ['journal_requires_reconcile', 'offline_not_available'].includes(error.message))
    return 'El estado del viaje cambió. Sincroniza antes de volver a intentarlo.';
  return 'Acción sin confirmar. Actualiza el estado y reintenta.';
}
