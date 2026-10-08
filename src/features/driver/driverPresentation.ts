import type { DriverAvailability, DriverState } from '../../services/matching/contracts.ts';

export type DriverSurfaceVariant = 'compact' | 'operational';
export type DriverConnection = 'online' | 'reconnecting' | 'offline';

export interface DriverPresentation {
  readonly availability: DriverAvailability;
  readonly variant: DriverSurfaceVariant;
  readonly title: string;
  readonly copy: string;
  readonly tone: 'neutral' | 'positive' | 'warning' | 'critical';
  readonly action?: 'availability_available' | 'availability_offline' | 'assignment_cancel';
  readonly actionLabel?: string;
}

export function driverSurfaceVariant(availability: DriverAvailability): DriverSurfaceVariant {
  return availability === 'ASSIGNED' ? 'operational' : 'compact';
}

export function driverPresentation(state?: DriverState): DriverPresentation {
  const availability = state?.availability ?? 'OFFLINE';
  switch (availability) {
    case 'LOCATING': return { availability, variant: 'compact', title: 'Obteniendo tu ubicación',
      copy: 'Mantén el GPS activo para empezar a recibir viajes.', tone: 'neutral',
      action: 'availability_offline', actionLabel: 'Desconectarme' };
    case 'AVAILABLE': return { availability, variant: 'compact', title: 'Disponible para viajes',
      copy: 'Te mostraremos solicitudes cercanas a tu ubicación.', tone: 'positive',
      action: 'availability_offline', actionLabel: 'Desconectarme' };
    case 'PAUSED': return { availability, variant: 'compact', title: 'Disponibilidad en pausa',
      copy: 'Vuelve a conectarte cuando estés listo para recibir viajes.', tone: 'warning',
      action: 'availability_available', actionLabel: 'Volver a estar disponible' };
    case 'ASSIGNED': return { availability, variant: 'operational', title: 'Dirígete al pasajero',
      copy: 'Revisa el punto de recogida antes de continuar.', tone: 'positive',
      action: 'assignment_cancel', actionLabel: 'Cancelar asignación' };
    case 'OFFLINE':
    default: return { availability: 'OFFLINE', variant: 'compact', title: 'No estás disponible',
      copy: 'Conéctate para empezar a recibir solicitudes.', tone: 'neutral',
      action: 'availability_available', actionLabel: 'Disponible' };
  }
}

export function driverConnectionLabel(connection: DriverConnection) {
  if (connection === 'online') return { label: 'En línea', tone: 'positive' as const };
  if (connection === 'reconnecting') return { label: 'Conexión inestable', tone: 'warning' as const };
  return { label: 'Sin conexión', tone: 'critical' as const };
}

export function driverGpsLabel(state: DriverState | undefined, error: string) {
  const locationError = /ubicaci|gps|señal|servicios de localización/i.test(error);
  if (locationError) return { label: 'Sin ubicación', tone: 'critical' as const };
  if (state?.location) return { label: 'Ubicación precisa', tone: 'location' as const };
  if (state?.availability === 'LOCATING') return { label: 'Buscando señal', tone: 'warning' as const };
  return { label: 'Sin ubicación', tone: 'critical' as const };
}

export const driverMapFallback = [-99.88795, 19.79021] as const;
