import type { Dish, Ingredient } from '@/types';
import { DEFAULT_PLATFORM } from './platforms';

/*
  当前比价平台：界面上切换平台时由 usePriceStore 同步进来，
  各页面算成本时不用层层传参，默认就跟着当前选中的平台走。
*/
let currentPlatform: string = DEFAULT_PLATFORM;
export function setCurrentPlatform(platform: string) {
  currentPlatform = platform;
}
export function getCurrentPlatform() {
  return currentPlatform;
}

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
  mg: 0.001,
};

const volumeMap: Record<string, number> = {
  ml: 1,
  毫升: 1,
  l: 1000,
  升: 1000,
};

/**
 * 老数据里残留的「个 / 把 / 头」等计数单位：
 * 只用于让旧菜谱还能大概算出成本，新数据统一用 斤 / g / kg / ml / L。
 */
const legacyCountMap: Record<string, { value: number; kind: 'mass' | 'volume' }> = {
  个: { value: 100, kind: 'mass' },
  把: { value: 200, kind: 'mass' },
  头: { value: 40, kind: 'mass' },
  块: { value: 10, kind: 'mass' },
  根: { value: 200, kind: 'mass' },
  颗: { value: 400, kind: 'mass' },
  只: { value: 150, kind: 'mass' },
  袋: { value: 500, kind: 'mass' },
  盒: { value: 400, kind: 'mass' },
  包: { value: 150, kind: 'mass' },
  瓶: { value: 500, kind: 'volume' },
};

/**
 * 把数量按 unit 标准化为基础单位
 * - mass → 克
 * - volume → 毫升
 * - count → 数量本身
 */
export function normalizeToBase(amount: number, unit: string): BaseValue {
  const u = (unit ?? '').trim().toLowerCase();
  if (massMap[u] !== undefined) return { value: amount * massMap[u], kind: 'mass' };
  if (volumeMap[u] !== undefined) return { value: amount * volumeMap[u], kind: 'volume' };
  const legacy = legacyCountMap[(unit ?? '').trim()];
  if (legacy) return { value: amount * legacy.value, kind: legacy.kind };
  return { value: amount, kind: 'count' };
}

/** 归一化后的「元 / 克」或「元 / 毫升」 */
export function pricePerBase(
  ing: Ingredient,
  platform: string
): BaseValue | null {
  const p = ing.prices?.[platform];
  if (!p || !Number.isFinite(p.price) || p.price <= 0) return null;
  const amount = p.amount && p.amount > 0 ? p.amount : 1;
  // 这一份的单价（元 / 食材计价单位）
  const perUnit = p.price / amount;
  const base = normalizeToBase(1, ing.unit);
  if (base.value <= 0) return null;
  return { value: perUnit / base.value, kind: base.kind };
}

/**
 * 折算成人看得懂的比价单位：
 * - 固体 → 元/斤
 * - 液体 → 元/L
 * - 老计数单位 → 元/个、元/把…
 */
export function displayUnitPrice(
  ing: Ingredient,
  platform: string
): { value: number; unit: string } | null {
  const base = pricePerBase(ing, platform);
  if (!base) return null;
  if (base.kind === 'mass') return { value: base.value * 500, unit: '斤' };
  if (base.kind === 'volume') return { value: base.value * 1000, unit: 'L' };
  return { value: base.value, unit: ing.unit };
}

/** 找这个食材最便宜的平台（没录价的平台跳过） */
export function cheapestPlatform(
  ing: Ingredient
): { platform: string; value: number; unit: string } | null {
  let best: { platform: string; value: number; unit: string } | null = null;
  for (const platform of Object.keys(ing.prices ?? {})) {
    const d = displayUnitPrice(ing, platform);
    if (!d || d.value <= 0) continue;
    if (!best || d.value < best.value) best = { platform, ...d };
  }
  return best;
}

/** 选定平台没录价时，退回第一个有价格的平台，避免整道菜成本算成 0 */
function resolvePricePlatform(ing: Ingredient, platform: string): string | null {
  if (pricePerBase(ing, platform)) return platform;
  return Object.keys(ing.prices ?? {}).find((p) => pricePerBase(ing, p)) ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 一道菜里某项食材的小计（按选定平台的单价折算） */
export function lineCost(
  dishIngredient: { ingredientId: string; amount: number; unit: string },
  ingredients: Ingredient[],
  platform: string = currentPlatform
): number {
  const ing = ingredients.find((i) => i.id === dishIngredient.ingredientId);
  if (!ing) return 0;

  const usePlatform = resolvePricePlatform(ing, platform);
  if (!usePlatform) return 0;
  const price = pricePerBase(ing, usePlatform);
  if (!price) return 0;

  const dBase = normalizeToBase(dishIngredient.amount, dishIngredient.unit);
  if (dBase.kind === price.kind) return round2(price.value * dBase.value);

  // 跨维度兜底：按「一份」估算，不至于整道菜没数
  const p = ing.prices[usePlatform];
  const amount = p.amount && p.amount > 0 ? p.amount : 1;
  return round2((p.price / amount) * dishIngredient.amount);
}

/** 一道菜的总成本 */
export function calcDishCost(
  dish: Dish,
  ingredients: Ingredient[],
  platform: string = currentPlatform
): number {
  return round2(
    dish.ingredients.reduce((sum, di) => sum + lineCost(di, ingredients, platform), 0)
  );
}

/** 一道菜的营养总和（按食材库每 100g/100ml 的成分按用量折算后相加） */
export interface DishNutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sodium: number;
  fiber: number;
}

/**
 * 一道菜的营养总和。
 * 食材库里每项食材的营养口径是「每 100g / 每 100ml」，
 * 这里把菜谱里的用量换算成 g / ml 后按比例折算再累加；
 * 没录营养的食材（一般是调料）和无法折算成重量的老计数单位直接跳过。
 * 一道菜里没有任何可计算的食材时返回 null，让表格显示「—」。
 */
export function calcDishNutrition(
  dish: Dish,
  ingredients: Ingredient[]
): DishNutrition | null {
  let hasData = false;
  const total: DishNutrition = {
    calories: 0, protein: 0, fat: 0, carbs: 0, sodium: 0, fiber: 0,
  };

  for (const di of dish.ingredients) {
    const ing = ingredients.find((i) => i.id === di.ingredientId);
    if (!ing?.nutrition) continue;
    const base = normalizeToBase(di.amount, di.unit);
    // count 类（个/把/根…）不知道具体克重，没法套每 100g 的成分
    if (base.kind === 'count' || base.value <= 0) continue;

    const ratio = base.value / 100;
    total.calories += ing.nutrition.calories * ratio;
    total.protein += ing.nutrition.protein * ratio;
    total.fat += ing.nutrition.fat * ratio;
    total.carbs += ing.nutrition.carbs * ratio;
    total.sodium += ing.nutrition.sodium * ratio;
    total.fiber += ing.nutrition.fiber * ratio;
    hasData = true;
  }

  if (!hasData) return null;
  return {
    calories: Math.round(total.calories),
    protein: round2(total.protein),
    fat: round2(total.fat),
    carbs: round2(total.carbs),
    sodium: Math.round(total.sodium),
    fiber: round2(total.fiber),
  };
}

/** 把基础单位还原成可读的展示单位 */
export function formatBaseValue(value: number, kind: UnitKind): { amount: number; unit: string } {
  if (kind === 'mass') {
    if (value >= 500) return { amount: Math.round((value / 500) * 100) / 100, unit: '斤' };
    return { amount: Math.round(value), unit: 'g' };
  }
  if (kind === 'volume') {
    if (value >= 1000) return { amount: Math.round((value / 1000) * 100) / 100, unit: 'L' };
    return { amount: Math.round(value), unit: 'ml' };
  }
  return { amount: Math.round(value * 100) / 100, unit: '' };
}
