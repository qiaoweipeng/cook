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
  /** 人工播种：把「种子里有、云端没有」的菜补到云端（管理端系统页触发） */
  seedMissingToCloud: () => Promise<{ written: number }>;
  /** 人工种子覆盖：用种子版本覆盖云端指定菜品（危险操作，逐道调用） */
  overwriteDishFromSeed: (id: string) => Promise<void>;
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
 * 种子里有、但当前数据里还没有的菜 —— 人工播种时把这些补进去（只加不删）。
 * 用户自己删过的（dismissed）不算缺失，补回去等于删了白删。
 */
export function missingSeedDishes(haveIds: Set<string>): Dish[] {
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
        let remote: Array<{ id: string; data: Dish }>;
        try {
          // throwOnError：拉取失败必须和「云端空表」区分开。
          // 以前失败被吞成 []，会被下面误判为空表 → 把 51 道种子全量覆盖到云端，
          // cover_image 被种子的 null 抹掉 —— 种子前 9 道菜的图就是这么丢的。
          remote = await cloudList<Dish>('dishes', { throwOnError: true });
        } catch (e) {
          console.error('[load] 云端拉取失败，本次跳过云端比对（绝不写云端）：', e);
          set({ loaded: true, loading: false, cloudAvailable: false });
          return;
        }

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

        // 清理已下架的菜（连云端一起删）—— 这是代码里明确下架的 id（如「番茄炒蛋」），
        // 目的明确且幂等，不算「播种」，保留自动执行
        const retired = new Set(RETIRED_DISH_IDS);
        for (const r of remote) {
          if (retired.has(r.data.id)) await cloudDelete('dishes', r.data.id);
        }
        const valid = remote.filter((r) => !retired.has(r.data.id));
        /*
          load 一律只读。以前这里有两个自动写入路径：
            1) valid.length === 0 时把 51 道种子全量覆盖云端 ——
               拉取失败被误判成空表时就是灾难（README「图片消失第二回」的根因）；
            2) 自动补缺失种子 —— 刷新会让删掉的种子菜复活，同样不受控。
          现在播种改为人工控制：缺什么、什么时候补，由管理员在系统页手动执行
          （seedMissingToCloud / overwriteDishFromSeed）。
        */
        set({
          items: valid.map((r) => r.data).sort((a, b) => a.createdAt - b.createdAt),
          loaded: true,
          loading: false,
          cloudAvailable: true,
        });
      },

      add: async (dish) => {
        set((s) => ({ items: [...s.items, dish] }));
        await writeCloud(dish);
        logOp('新增菜品', dish.name);
      },

      update: async (id, patch) => {
        const old = get().items.find((it) => it.id === id);
        if (!old) return;
        // 跳过 undefined 的字段：DishEditor 每次都把 coverImage 放进 patch，
        // 即使用户没重新上传图片，值也是 undefined。直接 spread 会把 old.coverImage
        // 覆盖成 undefined，然后 dishToRow 又把 undefined 转成 null —— 编辑一次丢一次图。
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) cleaned[k] = v;
        }
        const next = { ...old, ...cleaned };
        set((s) => ({ items: s.items.map((it) => (it.id === id ? next : it)) }));
        await writeCloud(next);
        logOp('编辑菜品', old.name);
      },

      remove: async (id) => {
        const usage = await checkDishUsage(id);
        if (!usage.ok) throw new Error(usage.reason ?? '该菜品正在被使用，无法删除');
        const old = get().items.find((it) => it.id === id);
        set((s) => ({ items: s.items.filter((it) => it.id !== id) }));
        try {
          // throwOnError：云端删除失败必须报错并回滚。以前 cloudDelete 静默吞错，
          // 界面删了、云端还在，下次 load 拉回来 —— 「删了又复活」
          await cloudDelete('dishes', id, { throwOnError: true });
        } catch (e) {
          // 回滚：把菜放回本地，让用户当场看到删除失败，而不是刷新后发现菜复活
          if (old) {
            set((s) => ({
              items: [...s.items, old].sort((a, b) => a.createdAt - b.createdAt),
            }));
          }
          throw e;
        }
        // 删的是种子菜 → 记一笔，人工播种时跳过（必须在云端删除成功后再记，
        // 否则删除失败回滚后，dismissed 记录会让未来播种跳过这道其实还在的菜）
        if (seedDishes.some((d) => d.id === id)) dismissSeed(DISMISSED_DISHES_KEY, id);
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

      seedMissingToCloud: async () => {
        // 显式失败：读不到云端就报错，绝不带着「可能读空了」的状态往下写
        const remote = await cloudList<Dish>('dishes', { throwOnError: true });
        const missing = missingSeedDishes(new Set(remote.map((r) => r.data.id)));
        for (const dish of missing) await writeCloud(dish);
        // 种进云端的菜同时并进本地 store，界面立刻可见
        if (missing.length) {
          const curIds = new Set(get().items.map((d) => d.id));
          const added = missing.filter((d) => !curIds.has(d.id));
          set((s) => ({
            items: [...s.items, ...added].sort((a, b) => a.createdAt - b.createdAt),
          }));
        }
        logOp('播种种子数据', '', `补入 ${missing.length} 道缺失菜品`);
        return { written: missing.length };
      },

      overwriteDishFromSeed: async (id) => {
        const seed = seedDishes.find((d) => d.id === id);
        if (!seed) throw new Error('种子里没有这道菜');
        await writeCloud({ ...seed });
        // 本地同步替换（浅拷贝，避免后续 mutate 污染种子常量）
        set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...seed } : it)) }));
        logOp('种子覆盖', seed.name);
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
