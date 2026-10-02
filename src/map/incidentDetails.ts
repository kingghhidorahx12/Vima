export interface IncidentDetails {
  readonly category?: string;
  readonly description?: string;
  readonly severity?: string;
}

const categories: Record<string, string> = {
  accident: 'Accidente', fog: 'Niebla', dangerousConditions: 'Condiciones peligrosas',
  rain: 'Lluvia', ice: 'Hielo', jam: 'Congestión', laneClosed: 'Carril cerrado',
  roadClosed: 'Vía cerrada', roadWorks: 'Obras', wind: 'Viento', flooding: 'Inundación',
  brokenDownVehicle: 'Vehículo averiado',
};
const delays: Record<string, string> = { minor: 'Tráfico lento', moderate: 'Tráfico en cola', major: 'Tráfico detenido' };
/** Only documented Orbis vector-tile attributes; unknown/absent values stay absent.
 * Tiles do not supply street names. Do not turn road_category into an address. */
export function incidentDetails(properties: unknown): IncidentDetails {
  if (!properties || typeof properties !== 'object') return {};
  const p = properties as Record<string, unknown>;
  return {
    category: typeof p.icon_category_0 === 'string' && Object.hasOwn(categories, p.icon_category_0) ? categories[p.icon_category_0] : undefined,
    description: typeof p.description_0 === 'string' && p.description_0.trim() ? p.description_0.trim().slice(0, 500) : undefined,
    severity: typeof p.magnitude_of_delay === 'string' && Object.hasOwn(delays, p.magnitude_of_delay) ? delays[p.magnitude_of_delay] : undefined,
  };
}
