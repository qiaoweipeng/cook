// 自建账号体系：昵称 + 密码，存到 PostgreSQL 的 users 表
// 密码用 加盐 SHA-256 存储（不要明文）
//
// 特殊账号：超级管理员
//   账号 = 0000，密码 = 000000（硬编码，不依赖 users 表）
//   登录后角色 = admin，可以编辑所有内容
//   users 表里也会留一行 0000，用来存头像

import { isCloudEnabled, pgSelect, pgInsert, PgError } from './supabase';
import { ADMIN_UID, ADMIN_PASSWORD, getUser } from './userAdmin';

export const USERS_COLLECTION = 'users';
const SESSION_KEY = 'cook.auth.session';

export type UserRole = 'admin' | 'user';

export interface SessionUser {
  uid: string;
  nickName: string;
  role: UserRole;
  avatar?: string;
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
  const rows = await pgSelect<{ id: string }>('users', {
    nick: `eq.${normalizeNick(nick)}`,
    select: 'id',
  });
  return rows.length > 0;
}

export async function registerUser(nick: string, password: string): Promise<SessionUser> {
  requireCloud();
  const key = normalizeNick(nick);
  if (key === ADMIN_UID) {
    throw new Error('该昵称为系统保留，请换一个');
  }
  if (await isNickTaken(key)) throw new Error('NICK_TAKEN');
  const salt = randomSalt();
  const passwordHash = await sha256Hex(salt + password);
  await pgInsert('users', {
    id: key,
    nick: key,
    display_name: nick.trim(),
    salt,
    password_hash: passwordHash,
    disabled: false,
    created_at: new Date().toISOString(),
  });
  return { uid: key, nickName: nick.trim(), role: 'user' };
}

export async function loginUser(nick: string, password: string): Promise<SessionUser> {
  requireCloud();
  const key = normalizeNick(nick);
  // 拉出鉴权需要的字段（避开可能还没建的 avatar 列）
  const rows = await pgSelect<any>('users', {
    id: `eq.${key}`,
    select: 'id,nick,display_name,salt,password_hash,disabled',
    limit: 1,
  });
  const rec = rows[0];
  if (!rec) throw new Error('USER_NOT_FOUND');
  if (rec.disabled) throw new Error('USER_DISABLED');
  const hash = await sha256Hex(rec.salt + password);
  if (hash !== rec.password_hash) throw new Error('BAD_PASSWORD');
  // 单独再取头像（avatar 列可能还没建，列缺就当没头像）
  let avatar: string | undefined;
  try {
    const a = await pgSelect<{ avatar: string | null }>('users', {
      id: `eq.${key}`,
      select: 'avatar',
      limit: 1,
    });
    avatar = a[0]?.avatar || undefined;
  } catch {
    /* avatar 列不存在 */
  }
  return { uid: rec.id, nickName: rec.display_name || nick.trim(), role: 'user', avatar };
}

/** 超级管理员登录（账号 0000 / 密码 000000 硬编码） */
export async function tryAdminLogin(nick: string, password: string): Promise<SessionUser | null> {
  if (nick.trim() !== ADMIN_UID || password !== ADMIN_PASSWORD) return null;
  let avatar: string | undefined;
  if (isCloudEnabled()) {
    const u = await getUser(ADMIN_UID);
    avatar = (u?.avatar as string | null | undefined) ?? undefined;
  }
  return { uid: ADMIN_UID, nickName: '超级管理员', role: 'admin', avatar };
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
    if (obj && typeof obj.uid === 'string') {
      // 兼容旧版 session（没有 role/avatar）
      const role: UserRole = obj.uid === ADMIN_UID ? 'admin' : 'user';
      return {
        uid: obj.uid,
        nickName: obj.nickName ?? obj.uid,
        role,
        avatar: obj.avatar,
      } as SessionUser;
    }
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

/** 工具：判断当前用户是否为超级管理员 */
export function isAdminUser(user: { uid?: string; role?: UserRole } | null | undefined): boolean {
  if (!user) return false;
  return user.uid === ADMIN_UID || user.role === 'admin';
}
