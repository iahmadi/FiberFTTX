import type { AuthUser } from '../types/erp';

export function userHasPermission(
  user: AuthUser | null | undefined,
  ...requiredPerms: string[]
): boolean {
  if (!user || !user.is_active) return false;
  if (user.isSuperAdmin) return true;
  if (requiredPerms.length === 0) return true;
  return requiredPerms.some((perm) => user.permissions.includes(perm));
}
