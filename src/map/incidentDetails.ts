export interface IncidentDetails {
  readonly category: string;
  readonly icon?: 'car' | 'work' | 'route';
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
const descriptions: Record<string, string> = {
  accident: 'Accidente', roadworks: 'Obras', roadclosure: 'Cierre vial', closure: 'Cierre vial',
  trafficjam: 'Congestión', jam: 'Congestión', brokendownvehicle: 'Vehículo averiado',
};
function spanishDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, 500);
  const key = text.toLowerCase().replace(/[^a-z]/g, '');
  if (Object.hasOwn(descriptions, key)) return descriptions[key];
  // TomTom may fall back to English even with es-ES requested. Keep only identifiable Spanish copy.
  return /^(accidente|obras|congesti[oó]n|cierre|veh[ií]culo|tr[aá]fico|inundaci[oó]n|hielo|lluvia|niebla|viento|carril|calzada|peligro|circulaci[oó]n)\b/i.test(text) ? text : undefined;
}
/** Only documented Orbis vector-tile attributes; unknown/absent values stay absent.
 * Tiles do not supply street names. Do not turn road_category into an address. */
export function incidentDetails(properties: unknown): IncidentDetails {
  if (!properties || typeof properties !== 'object') return { category: 'Incidente vial' };
  const p = properties as Record<string, unknown>;
  const key = typeof p.icon_category_0 === 'string' ? p.icon_category_0 : '';
  return {
    category: Object.hasOwn(categories, key) ? categories[key]! : 'Incidente vial',
    ...(Object.hasOwn(categories, key) ? { icon: key === 'accident' || key === 'brokenDownVehicle' ? 'car' as const :
      key === 'roadWorks' ? 'work' as const : 'route' as const } : {}),
    description: spanishDescription(p.description_0),
    severity: typeof p.magnitude_of_delay === 'string' && Object.hasOwn(delays, p.magnitude_of_delay) ? delays[p.magnitude_of_delay] : undefined,
  };
}
