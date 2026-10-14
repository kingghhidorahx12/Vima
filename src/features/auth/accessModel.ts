import { ProductAuthClientError } from '../../services/auth/productSession.ts';
export const otpResendSeconds = 60; // Existing Gateway phone-wide cooldown.
export const mexicanPhoneDigits = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('52') ? digits.slice(2) : digits;
};
export const validMexicanPhone = (value: string) => /^[1-9]\d{9}$/.test(value);
export const otpDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);
export const countdown = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
export function accessErrorMessage(error: unknown) {
  const code = error instanceof ProductAuthClientError ? error.code : error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    invalid_phone: 'Escribe un teléfono mexicano válido de 10 dígitos.',
    otp_rate_limited: 'Espera antes de solicitar otro código. Los reenvíos están limitados.',
    invalid_or_expired_code: 'El código es incorrecto o ya venció. Revísalo o solicita uno nuevo.',
    registration_expired: 'La verificación venció. Verifica tu número de nuevo.',
    account_exists: 'Este número ya tiene cuenta. Verifícalo de nuevo para entrar.',
    invalid_auth_response: 'No pudimos completar el acceso. Inténtalo de nuevo.',
    otp_unavailable: 'No se pudo enviar o verificar el código. Inténtalo más tarde.',
    invalid_name: 'Escribe tu nombre completo, de al menos dos caracteres.',
    network_recoverable: 'No hay conexión con Vima. Revisa internet e inténtalo de nuevo.',
    timeout: 'La respuesta tardó demasiado. Puedes reintentar.',
    request_timeout: 'La respuesta tardó demasiado. Puedes reintentar.',
    session_storage_unavailable: 'No pudimos completar el acceso seguro en este dispositivo. Reintenta cuando termine la operación pendiente.',
    VIMA_API_BASE_URL_REQUIRED: 'El servicio de acceso aún no está disponible.',
  };
  return messages[code] ?? 'No se pudo completar el acceso. Inténtalo de nuevo.';
}
