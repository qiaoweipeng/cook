import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WeeklyPlans } from '@/types';
import { isCloudEnabled } from '@/lib/cloudbase';
import { cloudList, cloudSet } from '@/lib/cloudSync';
import { useAuthStore } from './useAuthStore';

interface WeeklyState {
  /** 日期 key（YYYY-MM-DD）→ 当天菜品 id 列表 */
  plans: WeeklyPlans;
  /** 云端已拉取（per-user） */
  loaded: boolean;

  load: () => Promise<void>;
  addDishToDay: (day: string, dishId: string) => Promise<void>;
  removeDishFromDay: (day: string, dishId: string) => Promise<void>;
  clearDay: (day: string) => Promise<void>;
  resetForUser: () => void;
}

async function writeCloud(plans: WeeklyPlans): Promise<void> {
  const me = useAuthStore.getState().user?.uid;
  if (!me) return;
  await cloudSet('weekly_menus', me, {
    data: plans,
    updated_at: Date.now(),
  });
}

export const useWeeklyStore = create<WeeklyState>()(
  persist(
    (set, get) => ({
      plans: {},
      loaded: false,

      load: async () => {
        if (!isCloudEnabled()) {
          set({ loaded: true });
          return;
        }
        const me = useAuthStore.getState().user?.uid;
        const remote = await cloudList<WeeklyPlans>('weekly_menus');
        const mine = remote.find((r: { id: string }) => r.id === me);
        set({ plans: mine?.data ?? {}, loaded: true });
      },

      addDishToDay: async (day, dishId) => {
        const cur = get().plans[day] ?? [];
        if (cur.includes(dishId)) return;
        const plans = { ...get().plans, [day]: [...cur, dishId] };
        set({ plans });
        await writeCloud(plans);
      },

      removeDishFromDay: async (day, dishId) => {
        const cur = get().plans[day] ?? [];
        const plans = { ...get().plans, [day]: cur.filter((x) => x !== dishId) };
        set({ plans });
        await writeCloud(plans);
      },

      clearDay: async (day) => {
        const plans = { ...get().plans };
        delete plans[day];
        set({ plans });
        await writeCloud(plans);
      },

      resetForUser: () => {
        set({ plans: {}, loaded: false });
      },
    }),
    {
      name: 'cook-weekly',
      version: 1,
      // 云端模式下不持久化（per-user 实时从云端拉），本地模式才存 localStorage
      partialize: (s) => (isCloudEnabled() ? {} : { plans: s.plans }),
    }
  )
);
