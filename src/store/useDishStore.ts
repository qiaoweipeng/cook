import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dish } from '@/types';
import { seedDishes, RETIRED_DISH_IDS } from '@/data/seedDishes';
import { isCloudEnabled } from '@/lib/supabase';
import { cloudDelete, cloudList, cloudSet } from '@/lib/cloudSync';
import { checkDishUsage } from '@/lib/usage';
import { logOp } from '@/lib/opLog';
import { idbStorage, whenHydrated } from '@/lib/persistStorage';
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
  // throwOnError: true — 图片较大可能超时，失败时必须让上层（DishEditor）提示用户，
  // 否则用户以为保存成功，刷新后图片丢失
  await cloudSet('dishes', dish.id, {
    data: dish,
    created_by: useAuthStore.getState().user?.uid ?? 'anonymous',
    updated_at: Date.now(),
  }, true);
}

export const useDishStore = create<DishState>()(
  persist(
    (set, get) => ({
      items: seedDishes,
      loaded: false,
      loading: false,
      cloudAvailable: false,

      load: async () => {
        // 先等 IndexedDB 缓存恢复完，避免云端新数据被旧缓存覆盖
        await whenHydrated(useDishStore);
        if (!isCloudEnabled()) {
          set({ loaded: true, cloudAvailable: false });
          return;
        }
        set({ loading: true });
        const remote = await cloudList<Dish>('dishes');
        // 清理已下架的菜（连云端一起删）
        const retired = new Set(RETIRED_DISH_IDS);
        for (const r of remote) {
          if (retired.has(r.data.id)) await cloudDelete('dishes', r.data.id);
        }
        const valid = remote.filter((r) => !retired.has(r.data.id));
        if (valid.length === 0) {
          // 云端是空表 → 上传种子
          for (const dish of seedDishes) await writeCloud(dish);
          set({ items: seedDishes, loaded: true, loading: false, cloudAvailable: true });
        } else {
          // 云端已有数据 → 直接以云端为准，不做「localOnly 补传」
          // 原因：localStorage 里的旧数据可能引用了已被替换/重命名的 ingredientId，
          // 补传会触发外键约束冲突
          const items = valid.map((r) => r.data).sort((a, b) => a.createdAt - b.createdAt);
          set({ items, loaded: true, loading: false, cloudAvailable: true });
        }
      },

      add: async (dish) => {
        set((s) => ({ items: [...s.items, dish] }));
        await writeCloud(dish);
        logOp('新增菜品', dish.name);
      },

      update: async (id, patch) => {
        const old = get().items.find((it) => it.id === id);
        if (!old) return;
        const next = { ...old, ...patch };
        set((s) => ({ items: s.items.map((it) => (it.id === id ? next : it)) }));
        await writeCloud(next);
        logOp('编辑菜品', old.name);
      },

      remove: async (id) => {
        const usage = await checkDishUsage(id);
        if (!usage.ok) throw new Error(usage.reason ?? '该菜品正在被使用，无法删除');
        const old = get().items.find((it) => it.id === id);
        set((s) => ({ items: s.items.filter((it) => it.id !== id) }));
        await cloudDelete('dishes', id);
        logOp('删除菜品', old?.name ?? id);
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
      version: 4,
      storage: idbStorage,
      // 只缓存 items，其他 cloud 状态不持久化
      partialize: (s) => ({ items: s.items }),
      // v4：从本地缓存里清掉已下架的菜（如「番茄炒蛋」）
      migrate: (persisted: any) => {
        if (Array.isArray(persisted?.items)) {
          persisted.items = persisted.items.filter(
            (d: Dish) => !RETIRED_DISH_IDS.includes(d.id)
          );
        }
        return persisted;
      },
    }
  )
);
