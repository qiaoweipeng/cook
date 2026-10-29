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
  /** 只把云端缺的种子食材补上（不动已有数据） */
  seedMissingToCloud: () => Promise<number>;
  /** 用代码里的种子整体覆盖云端食材（全部重置） */
  overwriteFromSeed: () => Promise<void>;
}

async function writeCloud(ing: Ingredient, throwOnError = false): Promise<void> {
  await cloudSet(
    'ingredients',
    ing.id,
    {
      data: ing,
      updated_by: useAuthStore.getState().user?.uid ?? 'anonymous',
      updated_at: Date.now(),
    },
    throwOnError
  );
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
        /*
          拉取失败（网络抖动 / 网关 400）不能当成「云端是空表」：
          以前吞掉错误返回 []，接下来就会把本地种子全量写上去，
          等于用旧数据覆盖云端。现在失败就保留本地缓存，一个字节都不写。
        */
        let remote: Array<{ id: string; data: Ingredient }> | null = null;
        try {
          remote = await cloudList<Ingredient>('ingredients', { throwOnError: true });
        } catch (e) {
          console.error('[ingredients] 拉取云端失败，保留本地缓存', e);
        }
        if (!remote) {
          set({ loaded: true, loading: false, cloudAvailable: false });
          return;
        }
        /*
          以云端为准。种子里「云端没有的」食材不再自动补：
          播种统一改成系统管理页手动触发，避免任何加载路径偷偷写数据。
        */
        set({
          items: remote.map((r) => r.data),
          loaded: true,
          loading: false,
          cloudAvailable: true,
        });
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

      seedMissingToCloud: async () => {
        // 拉取失败必须抛错：否则「拉不到」会被当成「全都缺」，等于全量重写一遍
        const remote = await cloudList<Ingredient>('ingredients', { throwOnError: true });
        const have = new Set(remote.map((r) => r.data.id));
        const missing = seedIngredients.filter((ing) => !have.has(ing.id));
        for (const ing of missing) await writeCloud(ing, true);
        if (missing.length) set({ items: [...get().items, ...missing] });
        logOp('补缺失食材种子', '', `共 ${missing.length} 项`);
        return missing.length;
      },

      overwriteFromSeed: async () => {
        // 整体覆盖：85 条种子逐条 upsert，云端旧单价 / 旧单位一并换成新结构
        for (const ing of seedIngredients) await writeCloud(ing, true);
        set({ items: seedIngredients });
        logOp('用种子覆盖食材', '', `共 ${seedIngredients.length} 项`);
      },
    }),
    {
      name: 'cook-ingredients',
      version: 4,
      storage: idbStorage,
      // v3 → v4：价格结构换成多平台 prices，老缓存里的单单价直接丢掉，改用新种子
      migrate: () => ({ items: seedIngredients }) as IngredientState,
      partialize: (s) => ({ items: s.items }),
    }
  )
);
