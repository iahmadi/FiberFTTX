import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  tblPermissions,
  tblRolePermissions,
  tblRoles,
  tblUsers,
} from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthUserContext {
  id: number;
  uid: string | null;
  username: string;
  email: string | null;
  full_name: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
}

export interface AuthRequest extends Request {
  authUser?: AuthUserContext;
  firebaseUid?: string;
  firebaseEmail?: string;
  firebaseName?: string;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

export function hashLocalPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyLocalPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hex] = parts;
  const expected = Buffer.from(hex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function issueIntranetToken(userId: number, username: string): string {
  const payloadObj = {
    sub: userId,
    usr: username,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `local.${payloadB64}.${sig}`;
}

export function verifyIntranetToken(
  token: string,
): { sub: number; usr: string } | null {
  if (!token.startsWith('local.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as { sub: number; usr: string; exp: number };
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return { sub: Number(parsed.sub), usr: String(parsed.usr) };
  } catch {
    return null;
  }
}

export async function loadAuthUserContextById(
  userId: number,
): Promise<AuthUserContext | null> {
  const rows = await db
    .select({
      id: tblUsers.id,
      uid: tblUsers.uid,
      username: tblUsers.username,
      email: tblUsers.email,
      full_name: tblUsers.full_name,
      role_id: tblUsers.role_id,
      role_name: tblRoles.name,
      is_active: tblUsers.is_active,
    })
    .from(tblUsers)
    .innerJoin(tblRoles, eq(tblRoles.id, tblUsers.role_id))
    .where(eq(tblUsers.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.is_active) return null;

  const permsRows = await db
    .select({ key_name: tblPermissions.key_name })
    .from(tblRolePermissions)
    .innerJoin(tblPermissions, eq(tblPermissions.id, tblRolePermissions.permission_id))
    .where(eq(tblRolePermissions.role_id, user.role_id));

  const permissions = permsRows.map((p) => p.key_name);
  const isSuperAdmin = user.role_name === 'SuperAdmin';

  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role_id: user.role_id,
    role_name: user.role_name,
    is_active: user.is_active,
    isSuperAdmin,
    permissions,
  };
}

export async function syncFirebaseUserToDb(
  uid: string,
  email: string | undefined,
  displayName: string | undefined,
): Promise<AuthUserContext | null> {
  const existingByUid = await db
    .select({ id: tblUsers.id })
    .from(tblUsers)
    .where(eq(tblUsers.uid, uid))
    .limit(1);

  if (existingByUid[0]) {
    return loadAuthUserContextById(existingByUid[0].id);
  }

  const normalizedEmail = email?.trim().toLowerCase() || null;
  if (normalizedEmail) {
    const existingByEmail = await db
      .select({ id: tblUsers.id })
      .from(tblUsers)
      .where(eq(tblUsers.email, normalizedEmail))
      .limit(1);
    if (existingByEmail[0]) {
      await db
        .update(tblUsers)
        .set({ uid })
        .where(eq(tblUsers.id, existingByEmail[0].id));
      return loadAuthUserContextById(existingByEmail[0].id);
    }
  }

  // Provision new Firebase user: if no SuperAdmin has claimed UID yet, link to admin or installer role
  const roles = await db.select().from(tblRoles);
  const superRole = roles.find((r) => r.name === 'SuperAdmin');
  const installerRole = roles.find((r) => r.name === 'تکنسین نصاب') || roles[0];
  if (!installerRole) return null;

  const existingSuperAdmins = superRole
    ? await db
        .select({ id: tblUsers.id, uid: tblUsers.uid })
        .from(tblUsers)
        .where(eq(tblUsers.role_id, superRole.id))
    : [];

  const unclaimedAdmin = existingSuperAdmins.find((u) => !u.uid);
  if (unclaimedAdmin) {
    await db
      .update(tblUsers)
      .set({
        uid,
        email: normalizedEmail,
        full_name: displayName?.trim() || 'مدیر کل سیستم',
      })
      .where(eq(tblUsers.id, unclaimedAdmin.id));
    return loadAuthUserContextById(unclaimedAdmin.id);
  }

  const safeBaseUsername = (normalizedEmail?.split('@')[0] || `user_${uid.slice(0, 8)}`)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 32);
  const username = `${safeBaseUsername}_${uid.slice(0, 4)}`;

  const inserted = await db
    .insert(tblUsers)
    .values({
      uid,
      username,
      email: normalizedEmail,
      password_hash: '',
      full_name: displayName?.trim() || normalizedEmail || 'کاربر جدید',
      role_id: installerRole.id,
      is_active: true,
    })
    .onConflictDoNothing()
    .returning({ id: tblUsers.id });

  if (inserted[0]) {
    return loadAuthUserContextById(inserted[0].id);
  }
  const fallback = await db
    .select({ id: tblUsers.id })
    .from(tblUsers)
    .where(eq(tblUsers.uid, uid))
    .limit(1);
  return fallback[0] ? loadAuthUserContextById(fallback[0].id) : null;
}

export function userHasPermission(
  user: AuthUserContext | undefined,
  ...requiredPerms: string[]
): boolean {
  if (!user || !user.is_active) return false;
  if (user.isSuperAdmin) return true;
  if (requiredPerms.length === 0) return true;
  return requiredPerms.some((perm) => user.permissions.includes(perm));
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'احراز هویت الزامی است.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'توکن دسترسی نامعتبر است.' });
    return;
  }

  try {
    // 1. Check local HMAC intranet session token (for air-gapped intranet / password sign-in)
    if (token.startsWith('local.')) {
      const localClaims = verifyIntranetToken(token);
      if (!localClaims) {
        res.status(401).json({ error: 'نشست شبکه داخلی منقضی یا نامعتبر است.' });
        return;
      }
      const ctx = await loadAuthUserContextById(localClaims.sub);
      if (!ctx) {
        res.status(401).json({ error: 'حساب کاربری غیرفعال یا یافت نشد.' });
        return;
      }
      req.authUser = ctx;
      next();
      return;
    }

    // 2. Primary Firebase ID Token verification
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email;
    req.firebaseName = decoded.name;

    const ctx = await syncFirebaseUserToDb(decoded.uid, decoded.email, decoded.name);
    if (!ctx) {
      res.status(403).json({ error: 'حساب کاربری شما غیرفعال است یا دسترسی ندارد.' });
      return;
    }
    req.authUser = ctx;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'اعتبارسنجی نشست ناموفق بود.' });
  }
};

export function requirePermission(...perms: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!userHasPermission(req.authUser, ...perms)) {
      res.status(403).json({ error: 'شما مجوز انجام این عملیات را ندارید.' });
      return;
    }
    next();
  };
}
