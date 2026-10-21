import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dish } from '@/types';
import { seedDishes, RETIRED_DISH_IDS } from '@/data/seedDishes';
import {
  DISMISSED_DISHES_KEY,
  clearDismissed,
  dismissSeed,
  readDismissed,
} from '@/lib/seedDismiss';
import { isCloudEnabled, pgSelect } from '@/lib/supabase';
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

  /*
    保存后回读校验 —— 这是防止「图片悄悄丢」的最后一道防线。

    前面已经堵掉了两个已知漏洞（cover_image 列缺失时静默跳过、上传失败降级 Base64），
    但只要写入链路上还有任何一条分支能悄悄丢掉图片字段，这里就能兜住：
    写完立刻把这一行读回来比对，对不上就**明确报错**。

    代价是一次额外的 GET（只在保存时发生，不影响读性能）。
    收益：从「用户几天后才发现图没了」变成「保存当场就看到红色报错」。
  */
  if (dish.coverImage && isCloudEnabled()) {
    try {
      const [row] = await pgSelect<{ cover_image: string | null }>('dishes', {
        id: `eq.${dish.id}`,
        select: 'cover_image',
        limit: 1,
      });
      if (!row || row.cover_image !== dish.coverImage) {
        throw new Error(
          '图片没有存进数据库：写入后回读发现地址不一致，' +
            '图片已上传到 Storage 但记录丢失，请重新上传一次'
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('图片没有存进数据库')) throw e;
      // 校验本身失败（网络等）不阻断保存，但要留下痕迹
      console.warn('[cloud] 图片回读校验失败：', e);
    }
  }
}

/**
 * 种子里有、但当前数据里还没有的菜 —— load 时把这些补进去（只加不删）。
 * 用户自己删过的（dismissed）不算缺失，补回去等于删了白删。
 */
function missingSeedDishes(haveIds: Set<string>): Dish[] {
  const dismissed = readDismissed(DISMISSED_DISHES_KEY);
  return seedDishes.filter((d) => !haveIds.has(d.id) && !dismissed.has(d.id));
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
          // 没开云端同步时，本地缓存恢复完就直接用；
          // 这里同样把种子里新增的菜补上，否则关了云端的用户永远看不到后加的菜
          const cur = get().items;
          const missing = missingSeedDishes(new Set(cur.map((d) => d.id)));
          if (missing.length) {
            set({ items: [...cur, ...missing].sort((a, b) => a.createdAt - b.createdAt) });
          }
          set({ loaded: true, cloudAvailable: false });
          return;
        }
        set({ loading: true });
        const remote = await cloudList<Dish>('dishes');

        /* ========== 拉取诊断（排查图片丢失，查完可删） ==========
           看控制台这两行就知道是「云端没返回」还是「返回了但没进 store」：
             [菜品拉取] 云端返回 N 条，其中 M 条带 cover_image
             [菜品拉取] 样例：<菜名> → <cover_image 原值>
        */
        {
          const withCover = remote.filter((r) => !!r.data?.coverImage);
          console.log(
            `%c[菜品拉取] 云端返回 ${remote.length} 条，其中 ${withCover.length} 条带 cover_image`,
            'color:#1677ff;font-weight:bold'
          );
          for (const r of withCover.slice(0, 3)) {
            console.log('   样例:', r.data.name, '→', r.data.coverImage);
          }
          if (withCover.length === 0) {
            console.warn(
              '%c[菜品拉取] 云端一条 cover_image 都没有 —— 说明数据库里本来就没存，' +
                '或者 pgSelect 取字段时漏了 cover_image',
              'color:#d4380d;font-weight:bold'
            );
          }
        }

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
          /*
            云端已有数据 → 以云端为准，但把种子里**新增**的菜补进去（按 id 判断，只加不删）。

            以前是完全不补：那时补的是 localStorage 里的旧数据，确实可能引用已被替换 /
            重命名的 ingredientId 而触发外键冲突。现在补的是当前代码里的 seedDishes，
            引用的 id 全部有效（supabase/schema.sql 建表时也没加外键约束），不存在那个问题。

            不补的后果很实在：云端一旦有数据就再也不读种子了，
            种子里后加的菜（比如减脂那 8 道）永远进不来。

            dismissed：用户自己删过的菜不补，否则删完一刷新又回来了。
          */
          const missing = missingSeedDishes(new Set(valid.map((r) => r.data.id)));
          for (const dish of missing) await writeCloud(dish);

          const items = [...valid.map((r) => r.data), ...missing].sort(
            (a, b) => a.createdAt - b.createdAt
          );
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
        // 删的是种子菜 → 记一笔，以后补种子时跳过，不然会复活
        if (seedDishes.some((d) => d.id === id)) dismissSeed(DISMISSED_DISHES_KEY, id);
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
        // 主动重置 = 想要完整种子，把「已删除」记录清掉，否则下次 load 会跳过这几道
        clearDismissed(DISMISSED_DISHES_KEY);
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
