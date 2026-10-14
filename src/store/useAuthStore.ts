import { create } from 'zustand';
import { clearSession } from '@/lib/userAuth';

export interface AuthUser {
  uid: string;
  nickName?: string;
  phone?: string;
}

interface AuthState {
  user: AuthUser | null;
  /** 启动时正在检测登录态 */
  booting: boolean;
  setUser: (u: AuthUser | null) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  booting: true,
  setUser: (user) => set({ user, booting: false }),
  signOut: async () => {
    clearSession();
    set({ user: null });
  },
}));
