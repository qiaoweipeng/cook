import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isCloudEnabled } from '@/lib/supabase';
import { cloudList, cloudSet } from '@/lib/cloudSync';
import { idbStorage, whenHydrated } from '@/lib/persistStorage';
import { useAuthStore } from './useAuthStore';

export interface ExtraItem {
  id: string;
  name: string;
  price: number;
  unit?: string;
  source: 'manual' | 'ingredient';
  ingredientId?: string;
}

export interface ShoppingHistoryEntry {
  id: string;
  settledAt: number;
  platform: string;
  total: number;
  checkedTotal: number;
  selectedDishIds: string[];
  extraItems: ExtraItem[];
}

interface ShoppingState {
  selectedDishIds: string[];
  checkedKeys: string[];
  extraItems: ExtraItem[];
  extraCheckedIds: string[];
  /** 云端已拉取（per-user） */
  loaded: boolean;

  load: () => Promise<void>;
  toggleDish: (id: string) => Promise<void>;
  clearDishes: () => Promise<void>;
  toggleCheckedKey: (key: string) => Promise<void>;
  setCheckedKeys: (keys: string[]) => void;
  clearChecked: () => Promise<void>;

  // 其他手动添加项
  addExtraItem: (item: Omit<ExtraItem, 'id'>) => void;
  removeExtraItem: (id: string) => void;
  toggleExtraChecked: (id: string) => void;
  clearExtraItems: () => void;

  // 批量勾选
  selectAllCheckedKeys: (allKeys: string[]) => void;

  // 结算归档 + 清空当前
  settle: (payload: {
    platform: string;
    total: number;
    checkedTotal: number;
    historyRef?: ShoppingHistoryEntry[];
  }) => void;

  // 历史（localStorage，不进云端，因为每次结算就是快照）
  history: ShoppingHistoryEntry[];
  clearHistory: () => void;

  resetForUser: () => void;
}

const HISTORY_KEY = 'cook.shopping.history';
const MAX_HISTORY = 30;

function loadHistory(): ShoppingHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveHistory(list: ShoppingHistoryEntry[]) {
  const trimmed = list.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

async function writeShopping(
  uid: string,
  payload: { selectedDishIds: string[]; checkedKeys: string[]; extraItems: ExtraItem[]; extraCheckedIds: string[] }
) {
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
      extraItems: [],
      extraCheckedIds: [],
      history: [],
      loaded: false,

      load: async () => {
        // 先等 IndexedDB 缓存恢复完，避免云端新数据被旧缓存覆盖
        await whenHydrated(useShoppingStore);
        const history = loadHistory();
        set({ history });
        if (!isCloudEnabled()) {
          set({ loaded: true });
          return;
        }
        // 拉自己那份
        const remote = await cloudList<{
          selectedDishIds: string[];
          checkedKeys: string[];
          extraItems?: ExtraItem[];
          extraCheckedIds?: string[];
        }>('shopping_lists');
        const me = useAuthStore.getState().user?.uid;
        if (me) {
          const mine = remote.find((r: { id: string }) => r.id === me);
          set({
            selectedDishIds: mine?.data.selectedDishIds ?? [],
            checkedKeys: mine?.data.checkedKeys ?? [],
            extraItems: mine?.data.extraItems ?? [],
            extraCheckedIds: mine?.data.extraCheckedIds ?? [],
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
        if (me)
          await writeShopping(me, {
            selectedDishIds: next,
            checkedKeys: get().checkedKeys,
            extraItems: get().extraItems,
            extraCheckedIds: get().extraCheckedIds,
          });
      },

      clearDishes: async () => {
        set({ selectedDishIds: [] });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          await writeShopping(me, {
            selectedDishIds: [],
            checkedKeys: get().checkedKeys,
            extraItems: get().extraItems,
            extraCheckedIds: get().extraCheckedIds,
          });
      },

      toggleCheckedKey: async (key) => {
        const next = get().checkedKeys.includes(key)
          ? get().checkedKeys.filter((x) => x !== key)
          : [...get().checkedKeys, key];
        set({ checkedKeys: next });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          await writeShopping(me, {
            selectedDishIds: get().selectedDishIds,
            checkedKeys: next,
            extraItems: get().extraItems,
            extraCheckedIds: get().extraCheckedIds,
          });
      },

      setCheckedKeys: (keys) => set({ checkedKeys: keys }),

      clearChecked: async () => {
        set({ checkedKeys: [] });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          await writeShopping(me, {
            selectedDishIds: get().selectedDishIds,
            checkedKeys: [],
            extraItems: get().extraItems,
            extraCheckedIds: get().extraCheckedIds,
          });
      },

      // 其他项
      addExtraItem: (item) => {
        const state = get();
        const next = { id: genId(), ...item };
        set({ extraItems: [...state.extraItems, next] });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          void writeShopping(me, {
            selectedDishIds: state.selectedDishIds,
            checkedKeys: state.checkedKeys,
            extraItems: [...state.extraItems, next],
            extraCheckedIds: state.extraCheckedIds,
          });
      },

      removeExtraItem: (id) => {
        const state = get();
        set({
          extraItems: state.extraItems.filter((e) => e.id !== id),
          extraCheckedIds: state.extraCheckedIds.filter((x) => x !== id),
        });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          void writeShopping(me, {
            selectedDishIds: state.selectedDishIds,
            checkedKeys: state.checkedKeys,
            extraItems: state.extraItems.filter((e) => e.id !== id),
            extraCheckedIds: state.extraCheckedIds.filter((x) => x !== id),
          });
      },

      toggleExtraChecked: (id) => {
        const state = get();
        const next = state.extraCheckedIds.includes(id)
          ? state.extraCheckedIds.filter((x) => x !== id)
          : [...state.extraCheckedIds, id];
        set({ extraCheckedIds: next });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          void writeShopping(me, {
            selectedDishIds: state.selectedDishIds,
            checkedKeys: state.checkedKeys,
            extraItems: state.extraItems,
            extraCheckedIds: next,
          });
      },

      clearExtraItems: () => {
        const state = get();
        set({ extraItems: [], extraCheckedIds: [] });
        const me = useAuthStore.getState().user?.uid;
        if (me)
          void writeShopping(me, {
            selectedDishIds: state.selectedDishIds,
            checkedKeys: state.checkedKeys,
            extraItems: [],
            extraCheckedIds: [],
          });
      },

      selectAllCheckedKeys: (allKeys) => {
        set({ checkedKeys: allKeys });
      },

      // 结算：快照进历史 + 清空当前
      settle: ({ platform, total, checkedTotal }) => {
        const state = get();
        const entry: ShoppingHistoryEntry = {
          id: genId(),
          settledAt: Date.now(),
          platform,
          total,
          checkedTotal,
          selectedDishIds: [...state.selectedDishIds],
          extraItems: [...state.extraItems],
        };
        const history = loadHistory();
        saveHistory([entry, ...history]);
        set({
          selectedDishIds: [],
          checkedKeys: [],
          extraItems: [],
          extraCheckedIds: [],
        });
      },

      clearHistory: () => {
        saveHistory([]);
        set({ history: [] });
      },

      resetForUser: () => {
        set({
          selectedDishIds: [],
          checkedKeys: [],
          extraItems: [],
          extraCheckedIds: [],
          loaded: false,
        });
      },
    }),
    {
      name: 'cook-shopping',
      version: 3,
      storage: idbStorage,
      // 不持久化云端模式的数据（per-user 实时从云端拉），本地模式才存缓存
      partialize: (s) =>
        isCloudEnabled()
          ? {}
          : {
            selectedDishIds: s.selectedDishIds,
            checkedKeys: s.checkedKeys,
            extraItems: s.extraItems,
            extraCheckedIds: s.extraCheckedIds,
          },
    }
  )
);
