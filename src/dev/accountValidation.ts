import { ApiError } from '../services/api/client.ts';
import { RequestTimeoutError } from '../services/api/deadline.ts';

/** Safe copy only: never echo the token, configured URL or raw upstream body. */
export function accountValidationMessage(error: unknown): string {
  if (error instanceof RequestTimeoutError || error instanceof Error && error.name === 'AbortError')
    return 'La validación tardó demasiado. Reintenta con la cuenta guardada.';
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La credencial no es válida. Revisa el token de esta cuenta.';
    if (error.status === 403) return 'La cuenta no tiene acceso a este servicio. Revisa su configuración.';
    return 'El servicio no pudo validar la cuenta. Reintenta en unos momentos.';
  }
  if (error instanceof TypeError) return 'No se pudo conectar. Revisa tu conexión y reintenta con la cuenta guardada.';
  return 'No se pudo preparar la cuenta. Revisa la configuración QA y reintenta.';
}
