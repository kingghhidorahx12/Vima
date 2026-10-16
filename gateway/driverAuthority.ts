import type { DriverProfile } from './matching/auth.ts';

export type DriverPermission = { status: 'approved' | 'suspended' | 'revoked'; blocked: boolean; profile: DriverProfile };
export type DriverAdminCommand = { operationId: string; accountId: string; reason: string;
  action: 'approve' | 'suspend' | 'revoke' | 'security_block' | 'security_unblock';
  vehicle?: DriverProfile['vehicle'] };
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 128 && !/[\u0000-\u001f<>]/.test(v);
export function validDriverPermission(raw: unknown): raw is DriverPermission {
  const v = raw as DriverPermission;
  return !!v && Object.keys(v).every(k => ['status', 'blocked', 'profile'].includes(k)) &&
    ['approved', 'suspended', 'revoked'].includes(v.status) && typeof v.blocked === 'boolean' &&
    !!v.profile && Object.keys(v.profile).every(k => ['driver', 'vehicle'].includes(k)) &&
    !!v.profile.driver && Object.keys(v.profile.driver).every(k => ['name', 'rating', 'ratingCount'].includes(k)) &&
    text(v.profile.driver.name) && v.profile.driver.rating === null && v.profile.driver.ratingCount === 0 &&
    !!v.profile.vehicle && Object.keys(v.profile.vehicle).every(k => ['name', 'plate', 'color'].includes(k)) &&
    text(v.profile.vehicle.name) && text(v.profile.vehicle.plate) && text(v.profile.vehicle.color);
}
export function parseDriverAdmin(raw: unknown): DriverAdminCommand {
  const v = raw as DriverAdminCommand;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['operationId', 'accountId', 'reason', 'action', 'vehicle'].includes(k)) ||
    !text(v.operationId) || !/^[a-zA-Z0-9._:-]{1,128}$/.test(v.operationId) || !/^[0-9a-f-]{36}$/.test(v.accountId) || !text(v.reason) ||
    !['approve', 'suspend', 'revoke', 'security_block', 'security_unblock'].includes(v.action) ||
    (v.action !== 'approve' && v.vehicle !== undefined)) throw new Error('invalid_driver_admin_input');
  if (v.action === 'approve' && !validDriverPermission({ status: 'approved', blocked: false,
    profile: { driver: { name: 'Validated by account', rating: null, ratingCount: 0 }, vehicle: v.vehicle } })) throw new Error('invalid_driver_admin_input');
  return { operationId: v.operationId, accountId: v.accountId, reason: v.reason, action: v.action,
    ...(v.vehicle ? { vehicle: { name: v.vehicle.name, plate: v.vehicle.plate, color: v.vehicle.color } } : {}) };
}
