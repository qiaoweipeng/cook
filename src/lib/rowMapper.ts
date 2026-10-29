// 前端对象 ↔ 数据库行的字段转换
//
// 抽成独立模块是为了让「应用运行时」和「命令行种子脚本 scripts/seed.ts」共用同一份转换逻辑，
// 避免两处各写一遍导致字段漂移（改了表结构只需要改这里）。
// 注意：这个模块只允许依赖纯类型，不要引入 zustand store / 浏览器 API，
// 否则 Node 环境下跑种子脚本会因为没有 IndexedDB、window 而崩掉。

import type { Dish, Ingredient } from '@/types';

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
    price_per_unit: i.pricePerUnit,
    unit: i.unit,
    spec: i.spec ?? null,
    note: i.note ?? null,
    unit_grams: i.unitGrams ?? null,
    unit_ml: i.unitMl ?? null,
    image: i.image ?? null,
  };
}

/** ingredients 表的一行 → 前端 Ingredient */
export function rowToIng(r: any): Ingredient {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    pricePerUnit: Number(r.price_per_unit),
    unit: r.unit,
    spec: r.spec ?? undefined,
    note: r.note ?? undefined,
    unitGrams: r.unit_grams ?? undefined,
    unitMl: r.unit_ml ?? undefined,
    // 少了这行的话：图片能存进数据库，读回来时却丢了，页面永远显示不出来
    image: r.image ?? undefined,
  };
}
