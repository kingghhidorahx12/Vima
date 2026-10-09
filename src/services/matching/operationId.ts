export type DriverOperationKind = 'availability_available' | 'availability_offline' | 'location' |
  'offer_accept' | 'offer_reject' | 'assignment_cancel' | 'lifecycle';
let sequence = 0;
/** Create once per intent; the pending mutation retains this ID across ambiguous retries. */
export function driverOperationId(kind: DriverOperationKind) {
  return `driver:${kind}:${Date.now()}:${++sequence}:${Math.random().toString(36).slice(2, 12)}`;
}
