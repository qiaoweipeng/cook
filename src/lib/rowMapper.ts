// 前端对象 ↔ 数据库行的字段转换
//
// 抽成独立模块是为了让「应用运行时」和「命令行种子脚本 scripts/seed.ts」共用同一份转换逻辑，
// 避免两处各写一遍导致字段漂移（改了表结构只需要改这里）。
// 注意：这个模块只允许依赖纯类型，不要引入 zustand store / 浏览器 API，
// 否则 Node 环境下跑种子脚本会因为没有 IndexedDB、window 而崩掉。

import type { Dish, Ingredient } from '@/types';
import { DEFAULT_PLATFORM } from '@/utils/platforms';

/** 前端 Dish → dishes 表的一行（snake_case） */
export function dishToRow(d: Dish) {
  return {
    id: d.id,
    name: d.name,
    category: d.category,
    difficulty: d.difficulty,
    cook_time_min: d.cookTimeMin,
    servings: d.servings,
    // '' 归一化为 null：编辑器把「清空图片」传成空串，落库统一存 null
    cover_image: d.coverImage || null,
    favorite: d.favorite ? 1 : 0,
    created_at: new Date(d.createdAt).toISOString(),
    tips: d.tips ?? null,
  };
}

/** dishes 表的一行 → 前端 Dish（关联表数据不在其中，需要调用方另外合并） */
export function rowToDish(r: any): Dish {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    difficulty: r.difficulty,
    cookTimeMin: r.cook_time_min,
    servings: r.servings,
    coverImage: r.cover_image ?? undefined,
    favorite: !!r.favorite,
    createdAt: new Date(r.created_at).getTime(),
    tips: r.tips ?? '',
    tags: [],
    ingredients: [],
    steps: [],
  };
}

/** 前端 Ingredient → ingredients 表的一行 */
export function ingToRow(i: Ingredient) {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    // 各平台价格整体放 jsonb：以后加超市不用改表结构
    prices: i.prices ?? {},
    note: i.note ?? null,
    image: i.image ?? null,
    calories: i.nutrition?.calories ?? null,
    protein: i.nutrition?.protein ?? null,
    fat: i.nutrition?.fat ?? null,
    carbs: i.nutrition?.carbs ?? null,
    sodium: i.nutrition?.sodium ?? null,
    fiber: i.nutrition?.fiber ?? null,
  };
}

/** ingredients 表的一行 → 前端 Ingredient */
export function rowToIng(r: any): Ingredient {
  const prices: Ingredient['prices'] =
    r.prices && typeof r.prices === 'object' ? { ...r.prices } : {};

  /*
    老数据兼容：以前是单列 price_per_unit + spec / unit_grams / unit_ml。
    新表还没迁移、或者云端还是旧行时，把旧单价按「份量」折算到默认平台下，
    页面至少还能显示合理的元/斤、元/L；等新种子写回云端后 legacy 标记会消失。
  */
  let unit: Ingredient['unit'] = r.unit;
  let legacy = false;
  if (Object.keys(prices).length === 0 && r.price_per_unit != null) {
    const price = Number(r.price_per_unit);
    const grams = Number(r.unit_grams ?? 0);
    const ml = Number(r.unit_ml ?? 0);
    if (ml > 0) {
      // 旧「瓶 / 盒」液体 → 折成升
      unit = 'L';
      prices[DEFAULT_PLATFORM] = { price, amount: ml / 1000 };
    } else if (grams > 0) {
      // 旧「个 / 把 / 袋 / 块」散装 → 折成斤
      unit = '斤';
      prices[DEFAULT_PLATFORM] = { price, amount: grams / 500 };
    } else {
      prices[DEFAULT_PLATFORM] = { price, amount: 1 };
    }
    legacy = true;
  }

  const hasNutrition =
    r.calories != null ||
    r.protein != null ||
    r.fat != null ||
    r.carbs != null ||
    r.sodium != null ||
    r.fiber != null;

  return {
    id: r.id,
    name: r.name,
    category: r.category,
    unit,
    prices,
    note: r.note ?? undefined,
    nutrition: hasNutrition
      ? {
        calories: Number(r.calories ?? 0),
        protein: Number(r.protein ?? 0),
        fat: Number(r.fat ?? 0),
        carbs: Number(r.carbs ?? 0),
        sodium: Number(r.sodium ?? 0),
        fiber: Number(r.fiber ?? 0),
      }
      : undefined,
    // 少了这行的话：图片能存进数据库，读回来时却丢了，页面永远显示不出来
    image: r.image ?? undefined,
    legacy,
  };
}

