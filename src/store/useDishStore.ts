import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dish } from '@/types';
import { seedDishes } from '@/data/seedDishes';
import { isCloudEnabled } from '@/lib/cloudbase';
import { cloudDelete, cloudList, cloudSet } from '@/lib/cloudSync';
import { useAuthStore } from './useAuthStore';

interface DishState {
  items: Dish[];
  loaded: boolean;
  loading: boolean;
  cloudAvailable: boolean;

  load: () => Promise<void>;
  add: (dish: Dish) => Promise<void>;
  update: (id: string, patch: Partial<Dish>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  resetToSeed: () => Promise<void>;
}

async function writeCloud(dish: Dish): Promise<void> {
  await cloudSet('dishes', dish.id, {
    data: dish,
    created_by: useAuthStore.getState().user?.uid ?? 'anonymous',
    updated_at: Date.now(),
  });
}

export const useDishStore = create<DishState>()(
  persist(
    (set, get) => ({
      items: seedDishes,
      loaded: false,
      loading: false,
      cloudAvailable: false,

      load: async () => {
        if (!isCloudEnabled()) {
          set({ loaded: true, cloudAvailable: false });
          return;
        }
        set({ loading: true });
        const remote = await cloudList<Dish>('dishes');
        if (remote.length === 0) {
          // 云端是空表 → 上传种子
          for (const dish of seedDishes) await writeCloud(dish);
          set({ items: seedDishes, loaded: true, loading: false, cloudAvailable: true });
        } else {
          // 云端已有数据 → 直接以云端为准，不做「localOnly 补传」
          // 原因：localStorage 里的旧数据可能引用了已被替换/重命名的 ingredientId，
          // 补传会触发外键约束冲突
          const items = remote.map((r) => r.data).sort((a, b) => a.createdAt - b.createdAt);
          set({ items, loaded: true, loading: false, cloudAvailable: true });
        }
      },

      add: async (dish) => {
        set((s) => ({ items: [...s.items, dish] }));
        await writeCloud(dish);
      },

      update: async (id, patch) => {
        const old = get().items.find((it) => it.id === id);
        if (!old) return;
        const next = { ...old, ...patch };
        set((s) => ({ items: s.items.map((it) => (it.id === id ? next : it)) }));
        await writeCloud(next);
      },

      remove: async (id) => {
        set((s) => ({ items: s.items.filter((it) => it.id !== id) }));
        await cloudDelete('dishes', id);
      },

      toggleFavorite: async (id) => {
        const old = get().items.find((it) => it.id === id);
        if (!old) return;
        const next = { ...old, favorite: !old.favorite };
        set((s) => ({ items: s.items.map((it) => (it.id === id ? next : it)) }));
        await writeCloud(next);
      },

      resetToSeed: async () => {
        const items = get().items;
        const seedIds = new Set(seedDishes.map((d) => d.id));
        // 删除非种子的菜品
        for (const it of items) {
          if (!seedIds.has(it.id)) await cloudDelete('dishes', it.id);
        }
        set({ items: seedDishes });
      },
    }),
    {
      name: 'cook-dishes',
      version: 3,
      // 只缓存 items，其他 cloud 状态不持久化
      partialize: (s) => ({ items: s.items }),
    }
  )
);
