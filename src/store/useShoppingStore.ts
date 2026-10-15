import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isCloudEnabled } from '@/lib/cloudbase';
import { cloudList, cloudSet } from '@/lib/cloudSync';
import { idbStorage, whenHydrated } from '@/lib/persistStorage';
import { useAuthStore } from './useAuthStore';

interface ShoppingState {
  selectedDishIds: string[];
  checkedKeys: string[];
  /** 云端已拉取（per-user） */
  loaded: boolean;

  load: () => Promise<void>;
  toggleDish: (id: string) => Promise<void>;
  clearDishes: () => Promise<void>;
  toggleCheckedKey: (key: string) => Promise<void>;
  setCheckedKeys: (keys: string[]) => void;
  clearChecked: () => Promise<void>;
  resetForUser: () => void;
}

async function writeShopping(uid: string, payload: { selectedDishIds: string[]; checkedKeys: string[] }) {
  await cloudSet('shopping_lists', uid, {
    data: payload,
    updated_at: Date.now(),
  });
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => ({
      selectedDishIds: [],
      checkedKeys: [],
      loaded: false,

      load: async () => {
        // 先等 IndexedDB 缓存恢复完，避免云端新数据被旧缓存覆盖
        await whenHydrated(useShoppingStore);
        if (!isCloudEnabled()) {
          set({ loaded: true });
          return;
        }
        // 拉自己那份
        const remote = await cloudList<{ selectedDishIds: string[]; checkedKeys: string[] }>('shopping_lists');
        const me = useAuthStore.getState().user?.uid;
        if (me) {
          const mine = remote.find((r: { id: string }) => r.id === me);
          set({
            selectedDishIds: mine?.data.selectedDishIds ?? [],
            checkedKeys: mine?.data.checkedKeys ?? [],
            loaded: true,
          });
        } else {
          set({ loaded: true });
        }
      },

      toggleDish: async (id) => {
        const next = get().selectedDishIds.includes(id)
          ? get().selectedDishIds.filter((x) => x !== id)
          : [...get().selectedDishIds, id];
        set({ selectedDishIds: next });
        const me = useAuthStore.getState().user?.uid;
        if (me) await writeShopping(me, { selectedDishIds: next, checkedKeys: get().checkedKeys });
      },

      clearDishes: async () => {
        set({ selectedDishIds: [] });
        const me = useAuthStore.getState().user?.uid;
        if (me) await writeShopping(me, { selectedDishIds: [], checkedKeys: get().checkedKeys });
      },

      toggleCheckedKey: async (key) => {
        const next = get().checkedKeys.includes(key)
          ? get().checkedKeys.filter((x) => x !== key)
          : [...get().checkedKeys, key];
        set({ checkedKeys: next });
        const me = useAuthStore.getState().user?.uid;
        if (me) await writeShopping(me, { selectedDishIds: get().selectedDishIds, checkedKeys: next });
      },

      setCheckedKeys: (keys) => set({ checkedKeys: keys }),

      clearChecked: async () => {
        set({ checkedKeys: [] });
        const me = useAuthStore.getState().user?.uid;
        if (me) await writeShopping(me, { selectedDishIds: get().selectedDishIds, checkedKeys: [] });
      },

      resetForUser: () => {
        set({ selectedDishIds: [], checkedKeys: [], loaded: false });
      },
    }),
    {
      name: 'cook-shopping',
      version: 2,
      storage: idbStorage,
      // 不持久化云端模式的数据（per-user 实时从云端拉），本地模式才存缓存
      partialize: (s) => (isCloudEnabled() ? {} : { selectedDishIds: s.selectedDishIds, checkedKeys: s.checkedKeys }),
    }
  )
);
