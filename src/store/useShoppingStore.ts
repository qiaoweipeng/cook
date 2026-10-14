import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShoppingState {
  selectedDishIds: string[];
  checkedKeys: string[]; // ingredientId_unit 的拼接
  toggleDish: (id: string) => void;
  clearDishes: () => void;
  toggleCheckedKey: (key: string) => void;
  setCheckedKeys: (keys: string[]) => void;
  clearChecked: () => void;
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set) => ({
      selectedDishIds: [],
      checkedKeys: [],
      toggleDish: (id) =>
        set((s) => ({
          selectedDishIds: s.selectedDishIds.includes(id)
            ? s.selectedDishIds.filter((x) => x !== id)
            : [...s.selectedDishIds, id],
        })),
      clearDishes: () => set({ selectedDishIds: [] }),
      toggleCheckedKey: (key) =>
        set((s) => ({
          checkedKeys: s.checkedKeys.includes(key)
            ? s.checkedKeys.filter((x) => x !== key)
            : [...s.checkedKeys, key],
        })),
      setCheckedKeys: (keys) => set({ checkedKeys: keys }),
      clearChecked: () => set({ checkedKeys: [] }),
    }),
    {
      name: 'cook-shopping',
      version: 1,
    }
  )
);
