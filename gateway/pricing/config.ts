import { readFile } from 'node:fs/promises';
import { PricingError, type PricingConfig, type RateCard, type ConfiguredAddition } from './contracts.ts';
import { freezeSnapshot } from './quoteStore.ts';

const fail = (): never => { throw new PricingError('pricing_unavailable'); };
export function integer(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) fail();
  return value as number;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(value)) fail(); return value as string;
}
function additions(value: unknown): ConfiguredAddition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) fail();
  const seen = new Set<string>();
  return (value as unknown[]).map(item => {
    const a = object(item, ['code', 'kind', 'label', 'amountMinor']); const code = id(a.code);
    if (seen.has(code) || !['toll', 'extra'].includes(String(a.kind)) || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 160) fail();
    seen.add(code); return { code, kind: a.kind as 'toll' | 'extra', label: a.label as string, amountMinor: integer(a.amountMinor) };
  });
}
const rates = ['baseMinor', 'minimumMinor', 'distanceMinorPerKm', 'durationMinorPerMinute'] as const;
function rate(value: unknown): RateCard {
  const r = object(value, [...rates, 'additions']);
  return { baseMinor: integer(r.baseMinor), minimumMinor: integer(r.minimumMinor),
    distanceMinorPerKm: integer(r.distanceMinorPerKm), durationMinorPerMinute: integer(r.durationMinorPerMinute), additions: additions(r.additions) };
}
export function validatePricingConfig(value: unknown): PricingConfig {
  const c = object(value, ['version', 'currency', 'profiles', 'regions', 'intermunicipalOverrides', 'quoteTtlSeconds', 'rounding']);
  if (c.currency !== 'MXN') fail(); const profiles = object(c.profiles, ['URBANO', 'REGIONAL']);
  if (!Array.isArray(c.regions) || !c.regions.length || c.regions.length > 500) fail();
  const ids = new Set<string>();
  const regions = (c.regions as unknown[]).map(value => {
    const r = object(value, ['id', 'polygon']); const key = id(r.id);
    if (ids.has(key) || !Array.isArray(r.polygon) || r.polygon.length < 4 || r.polygon.length > 2048) fail();
    ids.add(key);
    const polygon = (r.polygon as unknown[]).map(p => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) fail();
      return [...p as [number, number]] as [number, number];
    });
    if (JSON.stringify(polygon[0]) !== JSON.stringify(polygon.at(-1))) fail();
    const area = polygon.slice(1).reduce((sum, point, i) => sum + polygon[i]![0] * point[1] - point[0] * polygon[i]![1], 0);
    if (Math.abs(area) < Number.EPSILON) fail();
    const orientation = (a: [number, number], b: [number, number], c: [number, number]) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < polygon.length - 1; i++) {
      const a = polygon[i]!; const b = polygon[i + 1]!;
      if (a[0] === b[0] && a[1] === b[1]) fail();
      for (let j = i + 2; j < polygon.length - 1; j++) {
        if (i === 0 && j === polygon.length - 2) continue;
        const c = polygon[j]!; const d = polygon[j + 1]!;
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
          Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
        if (orientation(a, b, c) * orientation(a, b, d) <= 0 && orientation(c, d, a) * orientation(c, d, b) <= 0) fail();
      }
    }
    return { id: key, polygon };
  });
  if (!Array.isArray(c.intermunicipalOverrides) || c.intermunicipalOverrides.length > 1000) fail();
  const overrides = new Set<string>(); const directions = new Set<string>();
  const intermunicipalOverrides = (c.intermunicipalOverrides as unknown[]).map(value => {
    const o = object(value, ['id', 'fromRegionId', 'toRegionId', 'direction', 'rateOverride', 'additions']);
    const key = id(o.id); const from = id(o.fromRegionId); const to = id(o.toRegionId);
    if (overrides.has(key) || from === to || !ids.has(from) || !ids.has(to) || !['both', 'one-way'].includes(String(o.direction))) fail();
    overrides.add(key);
    for (const pair of o.direction === 'both' ? [`${from}:${to}`, `${to}:${from}`] : [`${from}:${to}`]) {
      if (directions.has(pair)) fail(); directions.add(pair);
    }
    const raw = o.rateOverride === undefined ? {} : object(o.rateOverride, rates);
    const rateOverride = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, integer(v)]));
    return { id: key, fromRegionId: from, toRegionId: to, direction: o.direction as 'both' | 'one-way', rateOverride, additions: additions(o.additions) };
  });
  const rounding = c.rounding === undefined ? { incrementMinor: 1, mode: 'half_up' } : object(c.rounding, ['incrementMinor', 'mode']);
  if (rounding.mode !== 'half_up') fail();
  const config: PricingConfig = { version: id(c.version), currency: 'MXN', profiles: { URBANO: rate(profiles.URBANO), REGIONAL: rate(profiles.REGIONAL) },
    regions, intermunicipalOverrides, quoteTtlSeconds: c.quoteTtlSeconds === undefined ? 300 : integer(c.quoteTtlSeconds, true),
    rounding: { incrementMinor: integer(rounding.incrementMinor, true), mode: 'half_up' } };
  if (!Number.isSafeInteger(config.quoteTtlSeconds * 1000)) fail();
  for (const override of intermunicipalOverrides) {
    const codes = [...config.profiles.REGIONAL.additions ?? [], ...override.additions ?? []].map(a => a.code);
    if (new Set(codes).size !== codes.length) fail();
  }
  for (const profile of Object.values(config.profiles)) {
    const maximum = BigInt(Number.MAX_SAFE_INTEGER);
    const extras = (profile.additions ?? []).reduce((sum, a) => sum + BigInt(a.amountMinor), 0n);
    if (BigInt(Math.max(profile.baseMinor, profile.minimumMinor)) + extras > maximum) fail();
  }
  return config;
}
export type PricingConfiguration = { status: 'ready'; config: PricingConfig } | { status: 'pricing_not_configured' | 'pricing_unavailable' };
export async function loadPricingConfig(path: string | undefined): Promise<PricingConfiguration> {
  if (!path?.trim()) return { status: 'pricing_not_configured' };
  try { const raw = await readFile(path, 'utf8'); if (raw.length > 4_000_000) fail();
    return { status: 'ready', config: freezeSnapshot(validatePricingConfig(JSON.parse(raw))) }; }
  catch { return { status: 'pricing_unavailable' }; }
}
