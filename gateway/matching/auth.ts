import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Assignment } from '../../src/features/passenger/model.ts';

export class MatchingError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export interface Principal { accountId: string; role: 'passenger' | 'driver' }
export interface DriverProfile { driver: Assignment['driver']; vehicle: Assignment['vehicle'] }
export interface AuthConfig {
  authenticate(header: string | undefined): Principal;
  principal(id: string): Principal | undefined;
  profile(id: string): DriverProfile;
  drivers: readonly string[];
}
export function createAuthConfig(input: unknown): AuthConfig {
  const fail = () => { throw new Error('invalid_auth_config'); };
  if (!input || typeof input !== 'object' || !('accounts' in input) || !Array.isArray(input.accounts) || !input.accounts.length) return fail();
  const accounts = new Map<string, Principal>(); const profiles = new Map<string, DriverProfile>();
  const hashes: { digest: Buffer; principal: Principal }[] = [];
  const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 128;
  for (const raw of input.accounts) {
    if (!raw || !text(raw.accountId) || !/^[A-Za-z0-9._-]+$/.test(raw.accountId) ||
      !text(raw.token) || raw.token.length < 32 || /\s/.test(raw.token) ||
      !['passenger', 'driver'].includes(raw.role) || ['__proto__', 'constructor', 'prototype'].includes(raw.accountId) || accounts.has(raw.accountId)) return fail();
    const principal: Principal = { accountId: raw.accountId, role: raw.role };
    const digest = createHash('sha256').update(raw.token).digest();
    if (hashes.some(entry => timingSafeEqual(entry.digest, digest))) return fail();
    if (raw.role === 'driver') {
      if (!raw.driver || !text(raw.driver.name) || !Number.isFinite(raw.driver.rating) || raw.driver.rating < 0 || raw.driver.rating > 5 ||
        !raw.vehicle || !text(raw.vehicle.name) || !text(raw.vehicle.plate) || !text(raw.vehicle.color)) return fail();
      profiles.set(raw.accountId, { driver: { name: raw.driver.name, rating: raw.driver.rating },
        vehicle: { name: raw.vehicle.name, plate: raw.vehicle.plate, color: raw.vehicle.color } });
    }
    accounts.set(principal.accountId, principal); hashes.push({ digest, principal });
  }
  return {
    drivers: [...profiles.keys()], principal: id => accounts.get(id),
    profile(id) { const profile = profiles.get(id); if (!profile) throw new MatchingError(403, 'forbidden'); return structuredClone(profile); },
    authenticate(header) {
      if (!header || !/^Bearer [^\s]{32,128}$/.test(header)) throw new MatchingError(401, 'unauthorized');
      const digest = createHash('sha256').update(header.slice(7)).digest();
      let result: Principal | undefined;
      for (const entry of hashes) if (timingSafeEqual(entry.digest, digest)) result = entry.principal;
      if (!result) throw new MatchingError(401, 'unauthorized');
      return result;
    },
  };
}
export function loadAuthConfig(path?: string): AuthConfig | undefined {
  if (!path?.trim()) return undefined;
  try { return createAuthConfig(JSON.parse(readFileSync(path, 'utf8'))); }
  catch { throw new Error('invalid_auth_config'); }
}
