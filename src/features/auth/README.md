# Acceso y cuenta

La presentación P1 reutiliza la autenticación productiva OTP P1.1 existente.

El cierre integrado respeta deadlines por operación, invalida el Passenger montado
en 401 definitivo y acota storage sin saltar la serialización nativa. Entrada de
producto, perfil interno aislado y procedimiento Android/configuración en
[PRODUCT_ACCESS_ROLLOUT.md](../../../docs/PRODUCT_ACCESS_ROLLOUT.md). Driver productivo
permanece como propuesta administrativa sin implementar.
Contrato, límites, archivos y QA pendiente en
[ACCESS_ACCOUNT_P1.md](../../../docs/ACCESS_ACCOUNT_P1.md).

Las sesiones de producto usan `services/auth/productSession.ts` y el namespace
SecureStore `vima.product-session.v1`. `services/storage/credentials.ts` y
LiveAccountGate permanecen exclusivos de QA. No copiar tokens a Zustand,
TanStack Query ni SQLite; la cuenta sólo expone identidad pública validada.
