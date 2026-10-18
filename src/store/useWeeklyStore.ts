import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WeeklyPlans } from '@/types';
import { isCloudEnabled } from '@/lib/supabase';
import { cloudGetWeekly, cloudList, cloudSet } from '@/lib/cloudSync';
import { idbStorage, whenHydrated } from '@/lib/persistStorage';
import { useAuthStore } from './useAuthStore';
import { useDishStore } from './useDishStore';
import { canEditFamilyMenu, logMenuAudit, useFamilyStore } from './useFamilyStore';
import { logOp } from '@/lib/opLog';

interface WeeklyState {
  /** 个人菜单 */
  plans: WeeklyPlans;
  /** 云端已拉取（per-user） */
  loaded: boolean;
  /** 当前查看模式：personal 个人私有 / family 家庭共享 */
  mode: 'personal' | 'family';
  /** 家庭共享菜单（存在 weekly_menus 表，key = familyId，双方共写共读） */
  familyPlans: WeeklyPlans;
  familyLoaded: boolean;

  load: () => Promise<void>;
  setMode: (mode: 'personal' | 'family') => Promise<void>;
  addDishToDay: (day: string, dishId: string) => Promise<void>;
  removeDishFromDay: (day: string, dishId: string) => Promise<void>;
  clearDay: (day: string) => Promise<void>;
  resetForUser: () => void;
}

async function writeCloud(key: string, plans: WeeklyPlans): Promise<void> {
  await cloudSet('weekly_menus', key, {
    data: plans,
    updated_at: Date.now(),
  });
}

/** 当前编辑目标：家庭模式 → 家庭 id（共享）；个人模式 → 我的 uid（私有） */
function targetKey(get: () => WeeklyState): { key: string | null; isFamily: boolean } {
  if (get().mode === 'family') {
    const fid = useFamilyStore.getState().family?.id;
    if (fid) return { key: fid, isFamily: true };
  }
  return { key: useAuthStore.getState().user?.uid ?? null, isFamily: false };
}

/** 菜名（写历史记录用，找不到就退回 id） */
function dishNameOf(dishId: string): string {
  return useDishStore.getState().items.find((d) => d.id === dishId)?.name ?? dishId;
}

export const useWeeklyStore = create<WeeklyState>()(
  persist(
    (set, get) => ({
      plans: {},
      loaded: false,
      mode: 'personal',
      familyPlans: {},
      familyLoaded: false,

      load: async () => {
        // 先等 IndexedDB 缓存恢复完，避免云端新数据被旧缓存覆盖
        await whenHydrated(useWeeklyStore);
        if (!isCloudEnabled()) {
          set({ loaded: true });
          return;
        }
        const me = useAuthStore.getState().user?.uid;
        const remote = await cloudList<WeeklyPlans>('weekly_menus');
        const mine = remote.find((r: { id: string }) => r.id === me);
        set({ plans: mine?.data ?? {}, loaded: true });
      },

      setMode: async (mode) => {
        if (mode === 'family') {
          const fid = useFamilyStore.getState().family?.id;
          if (!fid) return; // 没加入家庭不允许切
          // 每次切到家庭都拉最新一份，家人可能刚改过
          const data = await cloudGetWeekly(fid);
          set({ familyPlans: data ?? {}, familyLoaded: true, mode: 'family' });
          return;
        }
        set({ mode: 'personal' });
      },

      addDishToDay: async (day, dishId) => {
        const { key, isFamily } = targetKey(get);
        if (!key) return;
        if (isFamily && !canEditFamilyMenu()) return; // 只读成员不能改家庭菜单
        const base = isFamily ? get().familyPlans : get().plans;
        const cur = base[day] ?? [];
        if (cur.includes(dishId)) return;
        const plans = { ...base, [day]: [...cur, dishId] };
        set(isFamily ? { familyPlans: plans } : { plans });
        await writeCloud(key, plans);
        if (isFamily) {
          await logMenuAudit(key, 'add', day, dishNameOf(dishId));
          logOp('家庭菜单·添加菜品', day, dishNameOf(dishId));
        } else {
          logOp('个人菜单·添加菜品', day, dishNameOf(dishId));
        }
      },

      removeDishFromDay: async (day, dishId) => {
        const { key, isFamily } = targetKey(get);
        if (!key) return;
        if (isFamily && !canEditFamilyMenu()) return;
        const base = isFamily ? get().familyPlans : get().plans;
        const cur = base[day] ?? [];
        const plans = { ...base, [day]: cur.filter((x) => x !== dishId) };
        set(isFamily ? { familyPlans: plans } : { plans });
        await writeCloud(key, plans);
        if (isFamily) {
          await logMenuAudit(key, 'remove', day, dishNameOf(dishId));
          logOp('家庭菜单·移除菜品', day, dishNameOf(dishId));
        } else {
          logOp('个人菜单·移除菜品', day, dishNameOf(dishId));
        }
      },

      clearDay: async (day) => {
        const { key, isFamily } = targetKey(get);
        if (!key) return;
        if (isFamily && !canEditFamilyMenu()) return;
        const base = isFamily ? get().familyPlans : get().plans;
        const count = (base[day] ?? []).length;
        const plans = { ...base };
        delete plans[day];
        set(isFamily ? { familyPlans: plans } : { plans });
        await writeCloud(key, plans);
        if (isFamily) {
          await logMenuAudit(key, 'clear', day, `共 ${count} 道菜`);
          logOp('家庭菜单·清空', day, `共 ${count} 道菜`);
        } else {
          logOp('个人菜单·清空', day, `共 ${count} 道菜`);
        }
      },

      resetForUser: () => {
        set({ plans: {}, loaded: false, mode: 'personal', familyPlans: {}, familyLoaded: false });
      },
    }),
    {
      name: 'cook-weekly',
      version: 1,
      storage: idbStorage,
      // 云端模式下不持久化（per-user 实时从云端拉），本地模式才存缓存
      partialize: (s) => (isCloudEnabled() ? {} : { plans: s.plans }),
    }
  )
);
