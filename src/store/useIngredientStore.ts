import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ingredient } from '@/types';
import { seedIngredients } from '@/data/seedIngredients';

interface IngredientState {
  items: Ingredient[];
  add: (ing: Ingredient) => void;
  /** 批量新增（不查重） */
  addMany: (ings: Ingredient[]) => void;
  update: (id: string, patch: Partial<Ingredient>) => void;
  remove: (id: string) => void;
  removeAll: () => void;
  /** 完全替换（清空后写入） */
  replaceAll: (ings: Ingredient[]) => void;
  /** 按 ID 合并：现有 ID 覆盖，不存在则添加 */
  bulkMerge: (ings: Ingredient[]) => void;
  resetToSeed: () => void;
}

export const useIngredientStore = create<IngredientState>()(
  persist(
    (set) => ({
      items: seedIngredients,
      add: (ing) => set((s) => ({ items: [...s.items, ing] })),
      addMany: (ings) => set((s) => ({ items: [...s.items, ...ings] })),
      update: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
      removeAll: () => set({ items: [] }),
      replaceAll: (ings) => set({ items: ings }),
      bulkMerge: (ings) =>
        set((s) => {
          const map = new Map<string, Ingredient>();
          for (const it of s.items) map.set(it.id, it);
          for (const it of ings) map.set(it.id, it); // 同 ID 直接覆盖
          return { items: Array.from(map.values()) };
        }),
      resetToSeed: () => set({ items: seedIngredients }),
    }),
    {
      name: 'cook-ingredients',
      version: 2,
      migrate: () => undefined as never,
    }
  )
);
