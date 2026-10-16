export type ProductCapability = 'passenger' | 'driver';
export function validProductCapabilities(value: unknown): value is ProductCapability[] {
  return Array.isArray(value) && (value.length === 1 && value[0] === 'passenger' ||
    value.length === 2 && value[0] === 'passenger' && value[1] === 'driver');
}
