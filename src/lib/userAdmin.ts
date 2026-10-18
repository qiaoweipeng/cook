// 用户管理：云端 users 表的读写、启停、头像
// 超级管理员账号是硬编码的（不依赖 users 表就能登录），但会在 users 表里留一行用来存头像

import { isCloudEnabled, pgSelect, pgInsert, pgUpdateById, PgError } from './supabase';

export const ADMIN_UID = '0000';
export const ADMIN_PASSWORD = '000000';

export interface UserRow {
  id: string;
  nick: string;
  display_name: string;
  salt: string;
  password_hash: string;
  avatar?: string | null;
  disabled?: boolean;
  created_at?: string;
}

/** 列是否存在探测（avatars/disabled 可能还没 ALTER） */
let usersExtrasColumnMissing = false;

/** 安全更新：列还没加时自动降级，只更新一定存在的列 */
async function safeUpdateUser(uid: string, patch: Record<string, unknown>): Promise<void> {
  if (usersExtrasColumnMissing) {
    // 只更新一定存在的列
    const safe: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) {
      if (k === 'avatar' || k === 'disabled') continue;
      safe[k] = patch[k];
    }
    await pgUpdateById('users', uid, safe);
    return;
  }
  try {
    await pgUpdateById('users', uid, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('avatar') || msg.includes('disabled')) {
      usersExtrasColumnMissing = true;
      console.warn('[userAdmin] users.avatar/disabled 列不存在，已降级。ALTER TABLE users ADD COLUMN avatar text; ADD COLUMN disabled boolean NOT NULL DEFAULT false;');
      const safe: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) {
        if (k === 'avatar' || k === 'disabled') continue;
        safe[k] = patch[k];
      }
      await pgUpdateById('users', uid, safe);
      return;
    }
    throw e;
  }
}

export async function getUser(uid: string): Promise<UserRow | null> {
  if (!isCloudEnabled()) return null;
  const rows = await pgSelect<UserRow>('users', { id: `eq.${uid}`, limit: 1 });
  return rows[0] ?? null;
}

export async function listUsers(): Promise<UserRow[]> {
  if (!isCloudEnabled()) return [];
  return pgSelect<UserRow>('users', {
    select: 'id,nick,display_name,avatar,disabled,created_at',
  });
}

export async function setUserDisabled(uid: string, disabled: boolean): Promise<void> {
  if (!isCloudEnabled()) return;
  if (uid === ADMIN_UID) throw new Error('超级管理员账号不可停用');
  await safeUpdateUser(uid, { disabled });
}

export async function setUserAvatar(uid: string, avatar: string | null): Promise<void> {
  if (!isCloudEnabled()) return;
  await safeUpdateUser(uid, { avatar });
}

/** 启动时调用：保证 users 表里有一行 0000，用来存管理员头像（登录走硬编码） */
export async function ensureAdminRow(): Promise<void> {
  if (!isCloudEnabled()) return;
  const existing = await getUser(ADMIN_UID);
  if (existing) return;
  const fixedSalt = 'admin-builtin-salt-v1';
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(fixedSalt + ADMIN_PASSWORD)
  );
  const hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  try {
    await pgSelect('users', { id: `eq.__never_match__`, limit: 1 }); // 探测列
    // 先尝试带 avatar/disabled 插入；列缺则降级
    try {
      await pgSelect('users', {
        select: 'avatar',
        id: `eq.__never_match__`,
        limit: 1,
      });
      // avatar 列可用
    } catch (e) {
      usersExtrasColumnMissing = true;
    }
    const base = {
      id: ADMIN_UID,
      nick: ADMIN_UID,
      display_name: '超级管理员',
      salt: fixedSalt,
      password_hash: hash,
      created_at: new Date().toISOString(),
    };
    if (usersExtrasColumnMissing) {
      await pgInsert('users', base);
    } else {
      await pgInsert('users', { ...base, avatar: null, disabled: false });
    }
  } catch (e) {
    if (e instanceof PgError) {
      console.warn('[userAdmin] ensureAdminRow 失败：', e.message);
    } else {
      throw e;
    }
  }
}
