import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ingredient } from '@/types';
import { seedIngredients } from '@/data/seedIngredients';
import {
  DISMISSED_INGREDIENTS_KEY,
  clearDismissed,
  dismissSeed,
  readDismissed,
} from '@/lib/seedDismiss';
import { isCloudEnabled } from '@/lib/supabase';
import { cloudDelete, cloudList, cloudSet } from '@/lib/cloudSync';
import { checkIngredientUsage } from '@/lib/usage';
import { logOp } from '@/lib/opLog';
import { idbStorage, whenHydrated } from '@/lib/persistStorage';
import { useAuthStore } from './useAuthStore';

interface IngredientState {
  items: Ingredient[];
  loaded: boolean;
  loading: boolean;
  cloudAvailable: boolean;

  load: () => Promise<void>;
  add: (ing: Ingredient) => Promise<void>;
  addMany: (ings: Ingredient[]) => Promise<void>;
  update: (id: string, patch: Partial<Ingredient>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
  replaceAll: (ings: Ingredient[]) => Promise<void>;
  bulkMerge: (ings: Ingredient[]) => Promise<void>;
  resetToSeed: () => Promise<void>;
}

async function writeCloud(ing: Ingredient): Promise<void> {
  await cloudSet('ingredients', ing.id, {
    data: ing,
    updated_by: useAuthStore.getState().user?.uid ?? 'anonymous',
    updated_at: Date.now(),
  });
}

/**
 * 种子里有、但当前数据里还没有的食材 —— load 时把这些补进去（只加不删）。
 * 用户自己删过的（dismissed）不算缺失，补回去等于删了白删。
 */
function missingSeedIngredients(haveIds: Set<string>): Ingredient[] {
  const dismissed = readDismissed(DISMISSED_INGREDIENTS_KEY);
  return seedIngredients.filter((ing) => !haveIds.has(ing.id) && !dismissed.has(ing.id));
}

export const useIngredientStore = create<IngredientState>()(
  persist(
    (set, get) => ({
      items: seedIngredients,
      loaded: false,
      loading: false,
      cloudAvailable: false,

      load: async () => {
        // 先等 IndexedDB 缓存恢复完，避免云端新数据被旧缓存覆盖
        await whenHydrated(useIngredientStore);
        if (!isCloudEnabled()) {
          // 没开云端同步时，本地缓存恢复完就直接用；
          // 这里同样把种子里新增的食材补上，否则新菜的食材行会是空白
          const cur = get().items;
          const missing = missingSeedIngredients(new Set(cur.map((x) => x.id)));
          if (missing.length) set({ items: [...cur, ...missing] });
          set({ loaded: true, cloudAvailable: false });
          return;
        }
        set({ loading: true });
        const remote = await cloudList<Ingredient>('ingredients');
        if (remote.length === 0) {
          for (const ing of seedIngredients) await writeCloud(ing);
          set({ items: seedIngredients, loaded: true, loading: false, cloudAvailable: true });
        } else {
          /*
            云端已有数据 → 以云端为准，但把种子里**新增**的食材补进去（按 id 判断，只加不删）。

            这个必须补：新菜引用的食材要是云端没有，菜品详情里的食材行会整片空白、
            成本也算不出来。比如减脂菜单用到的鸡胸肉、糙米，都是后加进种子的。

            dismissed：用户自己删过的食材不补，否则删完一刷新又回来了。
          */
          const missing = missingSeedIngredients(new Set(remote.map((r) => r.data.id)));
          for (const ing of missing) await writeCloud(ing);

          const items = [...remote.map((r) => r.data), ...missing];
          set({ items, loaded: true, loading: false, cloudAvailable: true });
        }
      },

      add: async (ing) => {
        set((s) => ({ items: [...s.items, ing] }));
        await writeCloud(ing);
        logOp('新增食材', ing.name);
      },

      addMany: async (ings) => {
        set((s) => ({ items: [...s.items, ...ings] }));
        for (const ing of ings) await writeCloud(ing);
        logOp('批量新增食材', '', `共 ${ings.length} 项`);
      },

      update: async (id, patch) => {
        const old = get().items.find((it) => it.id === id);
        if (!old) return;
        const next = { ...old, ...patch };
        set((s) => ({ items: s.items.map((it) => (it.id === id ? next : it)) }));
        await writeCloud(next);
        logOp('编辑食材', old.name);
      },

      remove: async (id) => {
        const usage = await checkIngredientUsage(id);
        if (!usage.ok) throw new Error(usage.reason ?? '该食材被引用，无法删除');
        const old = get().items.find((it) => it.id === id);
        // 删的是种子食材 → 记一笔，以后补种子时跳过，不然会复活
        if (seedIngredients.some((x) => x.id === id)) {
          dismissSeed(DISMISSED_INGREDIENTS_KEY, id);
        }
        set((s) => ({ items: s.items.filter((it) => it.id !== id) }));
        await cloudDelete('ingredients', id);
        logOp('删除食材', old?.name ?? id);
      },

      removeAll: async () => {
        const items = get().items;
        for (const it of items) await cloudDelete('ingredients', it.id);
        set({ items: [] });
        logOp('清空食材库', '', `共 ${items.length} 项`);
      },

      replaceAll: async (ings) => {
        const old = get().items;
        for (const it of old) {
          if (!ings.some((x) => x.id === it.id)) await cloudDelete('ingredients', it.id);
        }
        for (const it of ings) await writeCloud(it);
        set({ items: ings });
        logOp('导入食材（替换模式）', '', `共 ${ings.length} 项`);
      },

      bulkMerge: async (ings) => {
        const map = new Map<string, Ingredient>();
        for (const it of get().items) map.set(it.id, it);
        for (const it of ings) map.set(it.id, it);
        const merged = Array.from(map.values());
        // 找出实际变化的写云端
        for (const it of ings) await writeCloud(it);
        set({ items: merged });
        logOp('导入食材（合并模式）', '', `共 ${ings.length} 项`);
      },

      resetToSeed: async () => {
        const items = get().items;
        const seedIds = new Set(seedIngredients.map((d) => d.id));
        for (const it of items) {
          if (!seedIds.has(it.id)) await cloudDelete('ingredients', it.id);
        }
        // 主动重置 = 想要完整种子，把「已删除」记录清掉
        clearDismissed(DISMISSED_INGREDIENTS_KEY);
        set({ items: seedIngredients });
      },
    }),
    {
      name: 'cook-ingredients',
      version: 3,
      storage: idbStorage,
      partialize: (s) => ({ items: s.items }),
    }
  )
);
