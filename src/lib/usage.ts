// 删除前的占用检查：被任何菜品/用户使用时拒绝
// - 食材：有菜品引用了它 → 拒
// - 菜品：有任何用户的采购清单/每周菜单包含它 → 拒

import { isCloudEnabled, pgSelect } from './supabase';
import { cloudList } from './cloudSync';
import { useDishStore } from '@/store/useDishStore';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';

export interface UsageInfo {
  ok: boolean;
  reason?: string;
  /** 食材：被哪些菜品 id 引用 */
  usedIn?: string[];
  /** 菜品：被哪些用户 uid 引用 */
  usedBy?: string[];
}

export async function checkIngredientUsage(ingredientId: string): Promise<UsageInfo> {
  if (isCloudEnabled()) {
    const rows = await pgSelect<{ dish_id: string }>('dish_ingredients', {
      ingredient_id: `eq.${ingredientId}`,
      select: 'dish_id',
      limit: 1000,
    });
    if (rows.length > 0) {
      const ids = Array.from(new Set(rows.map((r) => r.dish_id)));
      return {
        ok: false,
        usedIn: ids,
        reason: `有 ${ids.length} 道菜品正在使用此食材，请先删掉对应菜品`,
      };
    }
    return { ok: true };
  }
  // 本地模式
  const dishes = useDishStore.getState().items;
  const usedIn = dishes
    .filter((d) => d.ingredients.some((i) => i.ingredientId === ingredientId))
    .map((d) => `${d.name}（${d.id}）`);
  if (usedIn.length > 0) {
    return {
      ok: false,
      usedIn,
      reason: `有菜品正在使用此食材：${usedIn.slice(0, 3).join('、')}${usedIn.length > 3 ? '…' : ''}`,
    };
  }
  return { ok: true };
}

export async function checkDishUsage(dishId: string): Promise<UsageInfo> {
  if (isCloudEnabled()) {
    const [shops, weeklys] = await Promise.all([
      cloudList<{ selectedDishIds: string[] }>('shopping_lists'),
      cloudList<Record<string, string[]>>('weekly_menus'),
    ]);
    const usedBy: string[] = [];
    for (const s of shops) {
      if (s.data?.selectedDishIds?.includes(dishId)) usedBy.push(s.id);
    }
    for (const w of weeklys) {
      const data = w.data ?? {};
      for (const day of Object.values(data)) {
        if (Array.isArray(day) && day.includes(dishId)) {
          usedBy.push(w.id);
          break;
        }
      }
    }
    if (usedBy.length > 0) {
      return {
        ok: false,
        usedBy,
        reason: `有 ${usedBy.length} 个用户的采购清单/每周菜单正在使用此菜品，无法删除`,
      };
    }
    return { ok: true };
  }
  // 本地模式
  const inShop = useShoppingStore.getState().selectedDishIds.includes(dishId);
  const plans = useWeeklyStore.getState().plans;
  const inWeekly = Object.values(plans).some((ids) => ids.includes(dishId));
  if (inShop || inWeekly) {
    return {
      ok: false,
      reason: '本机的采购清单/每周菜单正在使用此菜品，无法删除',
    };
  }
  return { ok: true };
}
