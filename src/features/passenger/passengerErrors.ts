export const passengerTripUpdateError = 'No pudimos actualizar tu viaje. Reintenta.';
export const passengerActionError = 'No pudimos completar la acción. Reintenta.';

const approvedProductMessages = new Set([
  'No se pudo guardar el lugar',
  'No se pudo obtener la dirección del lugar',
  'Agregar lugar no disponible',
  'No se pudo agregar el lugar',
  'No se pudo guardar el destino reciente',
  'No se pudo guardar en Favoritos',
  'No se pudo actualizar Favoritos',
  'No se pudo eliminar el lugar',
  'Servicio no disponible',
]);
const tripCodes = new Set([
  'trip_http_snapshot_rejected',
  'active_request_identity_violation',
  'invalid_identity_origin',
  'invalid_active_request',
  'active_request_unavailable',
]);
const tripMessages = new Set([
  'Invalid authoritative trip response',
  'Cannot reconcile different trips',
  'Unsupported passenger snapshot',
  'Invalid matching response',
]);

/** Visible copy is an explicit allowlist; exception text is never product copy. */
export function passengerErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return passengerActionError;
  const candidate = error as { message?: unknown; code?: unknown; name?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  if (tripCodes.has(code) || tripCodes.has(message) || tripMessages.has(message) || candidate.name === 'TripHttpSnapshotError')
    return passengerTripUpdateError;
  return approvedProductMessages.has(message) ? message : passengerActionError;
}
