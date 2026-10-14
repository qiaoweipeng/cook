import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dish } from '@/types';
import { seedDishes } from '@/data/seedDishes';

interface DishState {
  items: Dish[];
  add: (dish: Dish) => void;
  update: (id: string, patch: Partial<Dish>) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  resetToSeed: () => void;
}

export const useDishStore = create<DishState>()(
  persist(
    (set) => ({
      items: seedDishes,
      add: (dish) => set((s) => ({ items: [...s.items, dish] })),
      update: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
      toggleFavorite: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, favorite: !it.favorite } : it
          ),
        })),
      resetToSeed: () => set({ items: seedDishes }),
    }),
    {
      name: 'cook-dishes',
      version: 2,
      // 版本升级时清空旧 localStorage，强制使用最新种子
      migrate: () => undefined as never,
    }
  )
);
