import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';

export type Role = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'QC' | 'WAREHOUSE';

export type Bindings = {
  DB: D1Database;
  APP_ENV: string;
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: User };
};


const SESSION_COOKIE = 'srikandi_session';
const SESSION_TTL_DAYS = 7;

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function digestText(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

async function pbkdf2(password: string, saltHex: string, iterations = 120000) {
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? []);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const hash = await pbkdf2(password, saltHex);
  return `pbkdf2$120000$${saltHex}$${hash}`;
}

export async function verifyPassword(password: string, encoded: string) {
  if (encoded === 'demo-hash') return password === 'Demo123!';
  const [scheme, iterations, saltHex, storedHash] = encoded.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !saltHex || !storedHash) return false;
  const derived = await pbkdf2(password, saltHex, Number(iterations));
  return derived === storedHash;
}

export async function createSession(db: D1Database, userId: number) {
  const id = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(id, userId, expires).run();
  return { id, expires };
}

export function setSessionCookie(c: Context<AppEnv>, sessionId: string, expires: string) {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  c.header('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly${secure}; SameSite=Strict; Expires=${new Date(expires).toUTCString()}`);
}

export function clearSessionCookie(c: Context<AppEnv>) {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`);
}

export function getSessionId(c: Context) {
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)srikandi_session=([^;]+)/);
  return match?.[1] ?? null;
}

export async function getCurrentUser(db: D1Database, sessionId: string | null): Promise<User | null> {
  if (!sessionId) return null;
  const row = await db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).bind(sessionId).first<User>();
  return row ?? null;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await getCurrentUser(c.env.DB, getSessionId(c));
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user);
  await next();
});

export function requireRole(roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user') as User | undefined;
    if (!user || !roles.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
    await next();
  });
}

export async function audit(c: Context<AppEnv>, action: string, entity: string, entityId?: string, metadata?: unknown) {
  const user = c.get('user') as User | undefined;
  const raw = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await digestText(`${raw}:srikandi-audit`);
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(user?.id ?? null, action, entity, entityId ?? null, metadata ? JSON.stringify(metadata) : null, ipHash).run();
}
