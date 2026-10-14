// 自建账号体系：昵称 + 密码，存到 PostgreSQL 的 users 表
// 密码用 加盐 SHA-256 存储（不要明文）

import { isCloudEnabled, pgSelect, pgInsert, PgError } from './cloudbase';

export const USERS_COLLECTION = 'users';
const SESSION_KEY = 'cook.auth.session';

export interface SessionUser {
  uid: string;
  nickName: string;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeNick(nick: string): string {
  return nick.trim().toLowerCase();
}

function requireCloud() {
  if (!isCloudEnabled()) {
    throw new PgError(0, 'CloudBase 未启用');
  }
}

export async function isNickTaken(nick: string): Promise<boolean> {
  requireCloud();
  // 用 list 模式：PostgREST 在 0 行时返回空数组 []，不会触发 406
  // 限制只查 id 字段，减少网络
  const rows = await pgSelect<{ id: string }>('users', {
    nick: `eq.${normalizeNick(nick)}`,
    select: 'id',
  });
  return rows.length > 0;
}

export async function registerUser(nick: string, password: string): Promise<SessionUser> {
  requireCloud();
  const key = normalizeNick(nick);
  if (await isNickTaken(key)) throw new Error('NICK_TAKEN');
  const salt = randomSalt();
  const passwordHash = await sha256Hex(salt + password);
  await pgInsert('users', {
    id: key,
    nick: key,
    display_name: nick.trim(),
    salt,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  });
  return { uid: key, nickName: nick.trim() };
}

export async function loginUser(nick: string, password: string): Promise<SessionUser> {
  requireCloud();
  const key = normalizeNick(nick);
  // 同样用 list 模式，避免用户不存在时 406
  const rows = await pgSelect<any>('users', { nick: `eq.${key}` });
  const rec = rows[0];
  if (!rec) throw new Error('USER_NOT_FOUND');
  const hash = await sha256Hex(rec.salt + password);
  if (hash !== rec.password_hash) throw new Error('BAD_PASSWORD');
  return { uid: rec.id, nickName: rec.display_name || nick.trim() };
}

// ---------------- 本地会话持久化 ----------------

export function saveSession(user: SessionUser): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj.uid === 'string') return obj as SessionUser;
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isUserDbEnabled(): boolean {
  return isCloudEnabled();
}
