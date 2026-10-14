// cloudSync 适配 PostgreSQL 多表结构
// 内部把嵌套结构（前端 Dish）拆开写入 4 张关联表，读时再合并

import {
  pgDeleteById,
  pgFetch,
  pgInsert,
  pgSelect,
  pgUpdateById,
  PgError,
} from './cloudbase';
import type { Dish, Ingredient } from '@/types';

// ======================== 字段名转换 ========================
// 前端 camelCase ↔ 数据库 snake_case

function dishToRow(d: Dish) {
  return {
    id: d.id,
    name: d.name,
    emoji: d.emoji ?? null,
    category: d.category,
    difficulty: d.difficulty,
    cook_time_min: d.cookTimeMin,
    servings: d.servings,
    cover_color: d.coverColor ?? null,
    favorite: d.favorite ? 1 : 0,
    created_at: new Date(d.createdAt).toISOString(),
    tips: d.tips ?? null,
  };
}

function rowToDish(r: any): Dish {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji ?? '',
    category: r.category,
    difficulty: r.difficulty,
    cookTimeMin: r.cook_time_min,
    servings: r.servings,
    coverColor: r.cover_color ?? '#FFE5DC',
    favorite: !!r.favorite,
    createdAt: new Date(r.created_at).getTime(),
    tips: r.tips ?? '',
    tags: [],
    ingredients: [],
    steps: [],
  };
}

function ingToRow(i: Ingredient) {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    price_per_unit: i.pricePerUnit,
    unit: i.unit,
    spec: i.spec ?? null,
    unit_grams: i.unitGrams ?? null,
    unit_ml: i.unitMl ?? null,
  };
}

function rowToIng(r: any): Ingredient {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    pricePerUnit: Number(r.price_per_unit),
    unit: r.unit,
    spec: r.spec ?? undefined,
    unitGrams: r.unit_grams ?? undefined,
    unitMl: r.unit_ml ?? undefined,
  };
}

// ======================== dishes（4 张表） ========================

async function saveDishFull(d: Dish): Promise<void> {
  // 1. 主表 upsert
  await pgInsert('dishes', dishToRow(d));
  // 2. 关联表先删后插
  await pgFetch('dish_tags', { method: 'DELETE', query: { dish_id: `eq.${d.id}` } });
  await pgFetch('dish_ingredients', { method: 'DELETE', query: { dish_id: `eq.${d.id}` } });
  await pgFetch('dish_steps', { method: 'DELETE', query: { dish_id: `eq.${d.id}` } });
  const tags = (d.tags ?? []).map((t) => ({ dish_id: d.id, tag: t }));
  const ings = (d.ingredients ?? []).map((it) => ({
    dish_id: d.id,
    ingredient_id: it.ingredientId,
    amount: it.amount,
    unit: it.unit,
  }));
  const steps = (d.steps ?? []).map((s) => ({
    dish_id: d.id,
    step_order: s.order,
    step_text: s.text,
  }));
  if (tags.length) await pgInsert('dish_tags', tags);
  if (ings.length) await pgInsert('dish_ingredients', ings);
  if (steps.length) await pgInsert('dish_steps', steps);
}

async function listDishesMerged(): Promise<Array<{ id: string; data: Dish }>> {
  const [rows, tagRows, ingRows, stepRows] = await Promise.all([
    pgSelect<any>('dishes'),
    pgSelect<any>('dish_tags'),
    pgSelect<any>('dish_ingredients'),
    pgSelect<any>('dish_steps'),
  ]);
  const byId = new Map<string, Dish>();
  for (const r of rows) byId.set(r.id, rowToDish(r));
  for (const t of tagRows) byId.get(t.dish_id)?.tags.push(t.tag);
  for (const i of ingRows) {
    const d = byId.get(i.dish_id);
    if (d) d.ingredients.push({ ingredientId: i.ingredient_id, amount: Number(i.amount), unit: i.unit });
  }
  for (const s of stepRows) {
    const d = byId.get(s.dish_id);
    if (d) d.steps.push({ order: s.step_order, text: s.step_text });
  }
  // 关联表里的步骤/食材按 order 排好
  for (const d of byId.values()) {
    d.steps.sort((a, b) => a.order - b.order);
  }
  return Array.from(byId.values()).map((d) => ({ id: d.id, data: d }));
}

async function deleteDishFull(id: string): Promise<void> {
  await pgFetch('dish_tags', { method: 'DELETE', query: { dish_id: `eq.${id}` } });
  await pgFetch('dish_ingredients', { method: 'DELETE', query: { dish_id: `eq.${id}` } });
  await pgFetch('dish_steps', { method: 'DELETE', query: { dish_id: `eq.${id}` } });
  await pgDeleteById('dishes', id);
}

// ======================== ingredients ========================

async function saveIngredient(i: Ingredient): Promise<void> {
  // 简单 upsert：先尝试 update，0 行则 insert
  const updated = await pgUpdateById('ingredients', i.id, ingToRow(i));
  if (!updated || updated.length === 0) {
    await pgInsert('ingredients', ingToRow(i));
  }
}

async function listIngredientsFlat(): Promise<Array<{ id: string; data: Ingredient }>> {
  const rows = await pgSelect<any>('ingredients');
  return rows.map((r) => ({ id: r.id, data: rowToIng(r) }));
}

async function deleteIngredient(id: string): Promise<void> {
  await pgDeleteById('ingredients', id);
}

// ======================== shopping_lists ========================

async function saveShopping(uid: string, payload: { selectedDishIds: string[]; checkedKeys: string[] }, updatedAt: number): Promise<void> {
  const row = {
    id: uid,
    data: payload,
    updated_at: new Date(updatedAt).toISOString(),
  };
  const updated = await pgUpdateById('shopping_lists', uid, row);
  if (!updated || updated.length === 0) {
    await pgInsert('shopping_lists', row);
  }
}

async function listShopping(): Promise<Array<{ id: string; data: { selectedDishIds: string[]; checkedKeys: string[] } }>> {
  const rows = await pgSelect<any>('shopping_lists');
  return rows.map((r) => ({
    id: r.id,
    data: {
      selectedDishIds: r.data?.selectedDishIds ?? [],
      checkedKeys: r.data?.checkedKeys ?? [],
    },
  }));
}

async function deleteShopping(uid: string): Promise<void> {
  await pgDeleteById('shopping_lists', uid);
}

// ======================== weekly_menus ========================

async function saveWeekly(uid: string, payload: Record<string, string[]>, updatedAt: number): Promise<void> {
  const row = {
    id: uid,
    data: payload,
    updated_at: new Date(updatedAt).toISOString(),
  };
  const updated = await pgUpdateById('weekly_menus', uid, row);
  if (!updated || updated.length === 0) {
    await pgInsert('weekly_menus', row);
  }
}

async function listWeekly(): Promise<Array<{ id: string; data: Record<string, string[]> }>> {
  const rows = await pgSelect<any>('weekly_menus');
  return rows.map((r) => ({ id: r.id, data: r.data ?? {} }));
}

async function deleteWeekly(uid: string): Promise<void> {
  await pgDeleteById('weekly_menus', uid);
}

// ======================== 兼容旧接口 ========================

function swallow(e: unknown) {
  console.error('[cloud] failed', e);
}

export async function cloudSet(
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    if (collection === 'dishes') {
      // data: { data: Dish, ... }
      const dish = data.data as Dish;
      await saveDishFull(dish);
    } else if (collection === 'ingredients') {
      await saveIngredient(data.data as Ingredient);
    } else if (collection === 'shopping_lists') {
      await saveShopping(id, data.data as any, (data.updated_at as number) ?? Date.now());
    } else if (collection === 'weekly_menus') {
      await saveWeekly(id, data.data as Record<string, string[]>, (data.updated_at as number) ?? Date.now());
    } else {
      console.warn(`[cloud] unknown collection: ${collection}`);
    }
  } catch (e) {
    swallow(e);
  }
}

export async function cloudDelete(collection: string, id: string): Promise<void> {
  try {
    if (collection === 'dishes') await deleteDishFull(id);
    else if (collection === 'ingredients') await deleteIngredient(id);
    else if (collection === 'shopping_lists') await deleteShopping(id);
    else if (collection === 'weekly_menus') await deleteWeekly(id);
    else console.warn(`[cloud] unknown collection: ${collection}`);
  } catch (e) {
    swallow(e);
  }
}

export async function cloudList<T = any>(
  collection: string
): Promise<Array<{ id: string; data: T }>> {
  try {
    if (collection === 'dishes') return (await listDishesMerged()) as any;
    if (collection === 'ingredients') return (await listIngredientsFlat()) as any;
    if (collection === 'shopping_lists') return (await listShopping()) as any;
    if (collection === 'weekly_menus') return (await listWeekly()) as any;
    console.warn(`[cloud] unknown collection: ${collection}`);
    return [];
  } catch (e) {
    swallow(e);
    return [];
  }
}

export { PgError };
