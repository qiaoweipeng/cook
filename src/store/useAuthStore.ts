import { create } from 'zustand';
import { clearSession, isAdminUser, saveSession, type SessionUser } from '@/lib/userAuth';
import { getUser } from '@/lib/userAdmin';
import { isCloudEnabled } from '@/lib/supabase';

export interface AuthUser {
  uid: string;
  nickName?: string;
  phone?: string;
  role?: 'admin' | 'user';
  avatar?: string;
}

interface AuthState {
  user: AuthUser | null;
  /** 启动时正在检测登录态 */
  booting: boolean;
  setUser: (u: AuthUser | null) => void;
  signOut: () => Promise<void>;
  /** 重新从 users 表拉取当前用户的头像并更新 */
  refreshAvatar: () => Promise<void>;
  /** 仅更新头像（不重写其他字段） */
  setAvatar: (avatar: string | null) => void;
}

function toAuthUser(s: SessionUser | null): AuthUser | null {
  if (!s) return null;
  return {
    uid: s.uid,
    nickName: s.nickName,
    role: s.role,
    avatar: s.avatar,
  };
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  booting: true,

  setUser: (user) => {
    set({ user, booting: false });
    if (user) {
      saveSession({
        uid: user.uid,
        nickName: user.nickName ?? user.uid,
        role: user.role ?? 'user',
        avatar: user.avatar,
      });
    } else {
      clearSession();
    }
  },

  signOut: async () => {
    clearSession();
    set({ user: null });
  },

  refreshAvatar: async () => {
    const cur = get().user;
    if (!cur || !isCloudEnabled()) return;
    const row = await getUser(cur.uid);
    const avatar = (row?.avatar as string | null | undefined) ?? undefined;
    set({ user: { ...cur, avatar } });
    saveSession({
      uid: cur.uid,
      nickName: cur.nickName ?? cur.uid,
      role: cur.role ?? 'user',
      avatar,
    });
  },

  setAvatar: (avatar) => {
    const cur = get().user;
    if (!cur) return;
    set({ user: { ...cur, avatar: avatar ?? undefined } });
    saveSession({
      uid: cur.uid,
      nickName: cur.nickName ?? cur.uid,
      role: cur.role ?? 'user',
      avatar: avatar ?? undefined,
    });
  },
}));

/** 便捷：当前登录用户是否为超级管理员 */
export function useIsAdmin(): boolean {
  return isAdminUser(useAuthStore((s) => s.user));
}
