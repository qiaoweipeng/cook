import type { Dish, Ingredient } from '@/types';

export type UnitKind = 'mass' | 'volume' | 'count';

export interface BaseValue {
  value: number;
  kind: UnitKind;
}

const massMap: Record<string, number> = {
  g: 1,
  克: 1,
  kg: 1000,
  公斤: 1000,
  斤: 500,
  两: 50,
};

const volumeMap: Record<string, number> = {
  ml: 1,
  毫升: 1,
  l: 1000,
  升: 1000,
};

/**
 * 把数量按 unit 标准化为基础单位
 * - mass → 克
 * - volume → 毫升
 * - count → 数量本身
 *
 * 用 unitGrams / unitMl 提示，可以把「个 / 瓶」统一到质量或体积维度
 * 这样不同菜谱写「100 g 五花肉」和食材库的「1 斤 五花肉 ¥22」能正确换算
 */
export function normalizeToBase(
  amount: number,
  unit: string,
  hint?: { unitGrams?: number; unitMl?: number }
): BaseValue {
  const u = unit.trim().toLowerCase();
  if (massMap[u] !== undefined) return { value: amount * massMap[u], kind: 'mass' };
  if (volumeMap[u] !== undefined) return { value: amount * volumeMap[u], kind: 'volume' };
  if (hint?.unitMl !== undefined) return { value: amount * hint.unitMl, kind: 'volume' };
  if (hint?.unitGrams !== undefined) return { value: amount * hint.unitGrams, kind: 'mass' };
  return { value: amount, kind: 'count' };
}

/** 一道菜里某项食材的小计（按换算后的 cost 计算） */
export function lineCost(
  dishIngredient: { ingredientId: string; amount: number; unit: string },
  ingredients: Ingredient[]
): number {
  const ing = ingredients.find((i) => i.id === dishIngredient.ingredientId);
  if (!ing) return 0;

  const hint = { unitGrams: ing.unitGrams, unitMl: ing.unitMl };
  const dBase = normalizeToBase(dishIngredient.amount, dishIngredient.unit, hint);
  const iBase = normalizeToBase(1, ing.unit, hint);

  // 同维度：可以换算
  if (dBase.kind === iBase.kind && iBase.value > 0) {
    const basePrice = ing.pricePerUnit / iBase.value; // 基础单位价格 (元/克 或 元/毫升)
    return Math.round(basePrice * dBase.value * 100) / 100;
  }
  // 跨维度兜底，按 1:1 估算（不精确但有数字）
  return Math.round(ing.pricePerUnit * dishIngredient.amount * 100) / 100;
}

/** 一道菜的总成本 */
export function calcDishCost(dish: Dish, ingredients: Ingredient[]): number {
  return Math.round(
    dish.ingredients.reduce((sum, di) => sum + lineCost(di, ingredients), 0) * 100
  ) / 100;
}

/** 把基础单位还原成可读的展示单位 */
export function formatBaseValue(value: number, kind: UnitKind): { amount: number; unit: string } {
  if (kind === 'mass') {
    if (value >= 1000) return { amount: Math.round((value / 500) * 100) / 100, unit: '斤' };
    return { amount: Math.round(value), unit: 'g' };
  }
  if (kind === 'volume') {
    if (value >= 1000) return { amount: Math.round((value / 1000) * 100) / 100, unit: 'L' };
    return { amount: Math.round(value), unit: 'ml' };
  }
  return { amount: Math.round(value * 100) / 100, unit: '' };
}
