import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ingredient } from '@/types';
import { seedIngredients } from '@/data/seedIngredients';
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
          set({ loaded: true, cloudAvailable: false });
          return;
        }
        set({ loading: true });
        const remote = await cloudList<Ingredient>('ingredients');
        if (remote.length === 0) {
          for (const ing of seedIngredients) await writeCloud(ing);
          set({ items: seedIngredients, loaded: true, loading: false, cloudAvailable: true });
        } else {
          // 云端已有数据 → 以云端为准，不做 localOnly 合并
          const items = remote.map((r) => r.data);
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
