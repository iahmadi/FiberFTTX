import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface SessionPayload {
  uid: number;
  roleId: number;
  iat: number;
  exp: number;
  lastActivity: number;
  csrf: string;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role_id: number;
  role_name: string;
  is_active: number;
  permissions: string[];
  isSuperAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
  sessionPayload?: SessionPayload;
  rawToken?: string;
}

// In-memory active session revocation & idle activity tracking
const activeSessions = new Map<string, { lastActivity: number; timeoutMs: number }>();

export function getSessionTimeoutMinutes(): number {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM tbl_settings WHERE key_name = ?')
    .get('session_timeout_minutes') as { value: string } | undefined;
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 1440 ? parsed : 30;
}

export function createSessionToken(userId: number, roleId: number): {
  token: string;
  csrfToken: string;
  expiresAt: number;
  timeoutMinutes: number;
} {
  const timeoutMinutes = getSessionTimeoutMinutes();
  const now = Date.now();
  const exp = now + timeoutMinutes * 60 * 1000;
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const jti = crypto.randomBytes(16).toString('hex');

  const payload = {
    uid: userId,
    roleId,
    iat: now,
    exp,
    lastActivity: now,
    csrf: csrfToken,
    jti,
  };

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');

  const token = `${encoded}.${sig}`;
  activeSessions.set(jti, { lastActivity: now, timeoutMs: timeoutMinutes * 60 * 1000 });
  return { token, csrfToken, expiresAt: exp, timeoutMinutes };
}

export function verifySessionToken(token: string): (SessionPayload & { jti: string }) | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload & {
      jti: string;
    };
    const now = Date.now();
    const tracked = activeSessions.get(parsed.jti);
    const timeoutMs = getSessionTimeoutMinutes() * 60 * 1000;

    if (!tracked) {
      // If server restarted while token was still valid within exp, re-register if not expired
      if (now > parsed.exp) return null;
      activeSessions.set(parsed.jti, { lastActivity: now, timeoutMs });
    } else {
      if (now - tracked.lastActivity > timeoutMs) {
        activeSessions.delete(parsed.jti);
        return null;
      }
      tracked.lastActivity = now;
      tracked.timeoutMs = timeoutMs;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string): void {
  const parts = token.split('.');
  if (parts.length !== 2) return;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { jti?: string };
    if (parsed.jti) {
      activeSessions.delete(parsed.jti);
    }
  } catch {
    // ignore malformed token
  }
}

export function loadUserWithPermissions(userId: number): AuthenticatedUser | null {
  const db = getDb();
  const userRow = db
    .prepare(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.role_id, u.is_active, r.role_name
       FROM tbl_users u
       JOIN tbl_roles r ON r.id = u.role_id
       WHERE u.id = ?`,
    )
    .get(userId) as
    | {
        id: number;
        username: string;
        first_name: string;
        last_name: string;
        role_id: number;
        is_active: number;
        role_name: string;
      }
    | undefined;

  if (!userRow || userRow.is_active !== 1) return null;

  const permRows = db
    .prepare(
      `SELECT p.key_name
       FROM tbl_role_perms rp
       JOIN tbl_permissions p ON p.id = rp.perm_id
       WHERE rp.role_id = ?`,
    )
    .all(userRow.role_id) as Array<{ key_name: string }>;

  const isSuperAdmin = userRow.role_name === 'SuperAdmin';
  let permissions = permRows.map((p) => p.key_name);

  if (isSuperAdmin) {
    const allPerms = db.prepare('SELECT key_name FROM tbl_permissions').all() as Array<{
      key_name: string;
    }>;
    permissions = allPerms.map((p) => p.key_name);
  }

  return {
    id: userRow.id,
    username: userRow.username,
    first_name: userRow.first_name,
    last_name: userRow.last_name,
    role_id: userRow.role_id,
    role_name: userRow.role_name,
    is_active: userRow.is_active,
    permissions,
    isSuperAdmin,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!bearerToken) {
    res.status(401).json({ error: 'نشست کاربری نامعتبر است. لطفاً مجدداً وارد شوید.' });
    return;
  }

  const session = verifySessionToken(bearerToken);
  if (!session) {
    res.status(401).json({ error: 'مهلت نشست به پایان رسیده است. لطفاً دوباره وارد شوید.' });
    return;
  }

  // Enforce CSRF token check on mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const csrfHeader = req.headers['x-csrf-token'];
    if (typeof csrfHeader !== 'string' || csrfHeader !== session.csrf) {
      res.status(403).json({ error: 'توکن امنیتی CSRF نامعتبر است.' });
      return;
    }
  }

  const user = loadUserWithPermissions(session.uid);
  if (!user) {
    res.status(401).json({ error: 'حساب کاربری غیرفعال یا یافت نشد.' });
    return;
  }

  req.authUser = user;
  req.sessionPayload = session;
  req.rawToken = bearerToken;
  next();
}

export function requirePermission(...requiredPerms: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'احراز هویت انجام نشده است.' });
      return;
    }
    if (user.isSuperAdmin) {
      next();
      return;
    }
    const hasAny = requiredPerms.some((perm) => user.permissions.includes(perm));
    if (!hasAny) {
      res.status(403).json({ error: 'شما مجوز دسترسی به این عملیات را ندارید.' });
      return;
    }
    next();
  };
}

export function userHasPermission(user: AuthenticatedUser, perm: string): boolean {
  return user.isSuperAdmin || user.permissions.includes(perm);
}
