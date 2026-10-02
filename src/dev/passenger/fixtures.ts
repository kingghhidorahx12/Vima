import type { Assignment, Place, RideDraft, RideQuote } from '../../features/passenger/model.ts';

/** Explicit sample records only. Public coordinates/provenance in docs/ATLACOMULCO_GROUND_TRUTH.md.
 * No API/service/product module imports this file. Routes/prices/assignment remain synthetic scenarios. */
export const fixturePlaces: readonly Place[] = [
  { id: 'fixture-origin', name: 'Plaza Atlacomulco', address: 'Vial Jorge Jiménez Cantú, Atlacomulco', coordinate: [-99.88795, 19.79021] },
  { id: 'fixture-park', name: 'Parque Atlacomulco', address: 'Atlacomulco, Estado de México', coordinate: [-99.8906, 19.79139] },
  { id: 'fixture-office', name: 'Centro Universitario UAEM Atlacomulco', address: 'Carretera Toluca–Atlacomulco km 60', coordinate: [-99.84073, 19.76183] },
  { id: 'fixture-stop', name: 'Plaza Atlacomulco', address: 'Vial Jorge Jiménez Cantú, Atlacomulco', coordinate: [-99.88795, 19.79021] },
];
export function fixtureQuote(draft: RideDraft): RideQuote {
  return { ...draft, id: `fixture-quote-${draft.origin.id}-${draft.destination.id}-${draft.stops.length}`,
    route: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates:
      [draft.origin.coordinate, ...draft.stops.map((stop) => stop.coordinate), draft.destination.coordinate].map((point) => [...point]) } },
    durationMinutes: 12, distanceKm: 3.4, price: { amount: 85, currency: 'MXN' }, paymentMethod: 'Efectivo' };
}
export function fixtureAssignment(quote: RideQuote, sequence: number): Assignment {
  const coordinate = fixturePlaces[1]!.coordinate; // Explicit DEV simulation, never an available live driver.
  return { id: `fixture-assignment-${sequence}`, driver: { name: 'Alex', rating: 4.9 },
    vehicle: { name: 'Vehículo', plate: 'ABC-123', color: 'Gris' }, etaMinutes: 4, pin: '4826',
    sample: { coordinate, heading: 145, sequence }, routeToOrigin: { type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: [[...coordinate], [...quote.origin.coordinate]] } } };
}
