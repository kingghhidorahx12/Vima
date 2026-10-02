import type { Assignment, Place, RideDraft, RideQuote } from '../../features/passenger/model.ts';

/** Explicit sample records only. No API/service/product module imports this file. */
export const fixturePlaces: readonly Place[] = [
  { id: 'fixture-origin', name: 'Casa', address: 'Av. Insurgentes Sur', coordinate: [-99.1645, 19.4262] },
  { id: 'fixture-park', name: 'Parque', address: 'Av. Álvaro Obregón', coordinate: [-99.1588, 19.4199] },
  { id: 'fixture-office', name: 'Trabajo', address: 'Calle Colima', coordinate: [-99.1647, 19.4202] },
  { id: 'fixture-stop', name: 'Parada', address: 'Calle Durango', coordinate: [-99.162, 19.4225] },
];
export function fixtureQuote(draft: RideDraft): RideQuote {
  return { ...draft, id: `fixture-quote-${draft.origin.id}-${draft.destination.id}-${draft.stops.length}`,
    route: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates:
      [draft.origin.coordinate, ...draft.stops.map((stop) => stop.coordinate), draft.destination.coordinate].map((point) => [...point]) } },
    durationMinutes: 12, distanceKm: 3.4, price: { amount: 85, currency: 'MXN' }, paymentMethod: 'Efectivo' };
}
export function fixtureAssignment(quote: RideQuote, sequence: number): Assignment {
  const coordinate = [-99.1661, 19.429] as const;
  return { id: `fixture-assignment-${sequence}`, driver: { name: 'Alex', rating: 4.9 },
    vehicle: { name: 'Vehículo', plate: 'ABC-123', color: 'Gris' }, etaMinutes: 4, pin: '4826',
    sample: { coordinate, heading: 145, sequence }, routeToOrigin: { type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: [[...coordinate], [...quote.origin.coordinate]] } } };
}
