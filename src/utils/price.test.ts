/*
  成本 / 营养计算的单元测试。
  这里的断言值全部是手算出来的，用意是：以后谁改了 price.ts 的换算逻辑，
  跑一遍 `pnpm test` 立刻知道有没有把「元/斤」「每 100g 营养」这些口径改歪。
*/
import { describe, test, expect } from 'vitest';
import {
  normalizeToBase,
  displayUnitPrice,
  cheapestPlatform,
  lineCost,
  calcDishCost,
  calcDishNutrition,
  setCurrentPlatform,
  formatBaseValue,
} from './price';
import type { Dish, Ingredient } from '@/types';

// ---------- 测试用的固定食材 ----------

/** 土豆：盒马NB 2.6 元/500g，朴朴 1.9 元/500g；营养是「每 100g」的口径 */
const potato: Ingredient = {
  id: 'ing_potato',
  name: '土豆',
  category: '蔬菜',
  unit: 'g',
  prices: {
    盒马NB: { price: 2.6, amount: 500 },
    朴朴超市: { price: 1.9, amount: 500 },
  },
  nutrition: { calories: 77, protein: 2.0, fat: 0.1, carbs: 17.5, sodium: 6, fiber: 2.2 },
};

/** 鸡蛋：盒马NB 8.9 元/500g */
const egg: Ingredient = {
  id: 'ing_egg',
  name: '鸡蛋',
  category: '蛋奶',
  unit: 'g',
  prices: { 盒马NB: { price: 8.9, amount: 500 } },
  nutrition: { calories: 143, protein: 13.3, fat: 8.8, carbs: 2.8, sodium: 131, fiber: 0 },
};

/** 牛奶：12 元/L，营养口径是「每 100ml」 */
const milk: Ingredient = {
  id: 'ing_milk',
  name: '牛奶',
  category: '蛋奶',
  unit: 'L',
  prices: { 盒马NB: { price: 12, amount: 1 } },
  nutrition: { calories: 65, protein: 3.2, fat: 3.8, carbs: 4.8, sodium: 40, fiber: 0 },
};

/** 盐：调料，不录营养 */
const salt: Ingredient = {
  id: 'ing_salt',
  name: '盐',
  category: '调料',
  unit: 'g',
  prices: { 盒马NB: { price: 3, amount: 500 } },
};

const allIngredients = [potato, egg, milk, salt];

/** 快速造一道菜：只关心 ingredients，其余字段填占位值 */
function makeDish(ingredients: Dish['ingredients']): Dish {
  return {
    id: 'dish_test',
    name: '测试菜',
    category: '家常',
    tags: [],
    difficulty: 1,
    cookTimeMin: 10,
    servings: 2,
    ingredients,
    steps: [],
    favorite: false,
    createdAt: 0,
  };
}

// ---------- normalizeToBase：单位换算成 g / ml / count ----------

describe('normalizeToBase 单位归一化', () => {
  test('0.5 斤 = 250 克', () => {
    expect(normalizeToBase(0.5, '斤')).toEqual({ value: 250, kind: 'mass' });
  });

  test('1 升 = 1000 毫升（大小写不敏感）', () => {
    expect(normalizeToBase(1, 'L')).toEqual({ value: 1000, kind: 'volume' });
    expect(normalizeToBase(1, 'l')).toEqual({ value: 1000, kind: 'volume' });
  });

  test('老计数单位按映射折算成克：2 个土豆 ≈ 200 克', () => {
    expect(normalizeToBase(2, '个')).toEqual({ value: 200, kind: 'mass' });
  });

  test('不认识的单位原样当 count 返回', () => {
    expect(normalizeToBase(3, '勺')).toEqual({ value: 3, kind: 'count' });
  });
});

// ---------- displayUnitPrice / cheapestPlatform：详情页次要折价、跨平台比价 ----------

describe('displayUnitPrice 折算单位价', () => {
  test('固体统一折成 元/斤', () => {
    expect(displayUnitPrice(potato, '盒马NB')).toEqual({ value: 2.6, unit: '斤' });
  });

  test('液体统一折成 元/L', () => {
    expect(displayUnitPrice(milk, '盒马NB')).toEqual({ value: 12, unit: 'L' });
  });

  test('按克计价的食材也折回 元/斤：盐 3 元/500g = 3 元/斤', () => {
    expect(displayUnitPrice(salt, '盒马NB')).toEqual({ value: 3, unit: '斤' });
  });

  test('该平台没录价 → null', () => {
    expect(displayUnitPrice(potato, '快乐猴')).toBeNull();
  });
});

describe('cheapestPlatform 找最低价', () => {
  test('两个平台里选更便宜的那个，返回原始记录（不折算）', () => {
    expect(cheapestPlatform(potato)).toEqual({
      platform: '朴朴超市',
      price: 1.9,
      amount: 500,
      unit: 'g',
    });
  });
});

// ---------- lineCost / calcDishCost：一道菜要花多少钱 ----------

describe('lineCost 单项小计', () => {
  test('250g 土豆 × 2.6 元/500g = 1.3 元', () => {
    expect(lineCost({ ingredientId: 'ing_potato', amount: 250, unit: 'g' }, allIngredients, '盒马NB')).toBe(1.3);
  });

  test('菜谱用克、食材按 500g 计价也能算：100g 鸡蛋 = 8.9/5 = 1.78 元', () => {
    expect(lineCost({ ingredientId: 'ing_egg', amount: 100, unit: 'g' }, allIngredients, '盒马NB')).toBe(1.78);
  });

  test('选定平台没录价时，自动退回有价的平台，不至于算成 0', () => {
    // 快乐猴没录土豆价，应退回盒马NB 的 2.6 元/500g
    expect(lineCost({ ingredientId: 'ing_potato', amount: 250, unit: 'g' }, allIngredients, '快乐猴')).toBe(1.3);
  });

  test('食材不存在 / 完全没价格 → 0', () => {
    expect(lineCost({ ingredientId: 'no_such', amount: 1, unit: 'g' }, allIngredients, '盒马NB')).toBe(0);
  });
});

describe('calcDishCost 整道菜成本', () => {
  test('土豆 250g + 鸡蛋 100g = 1.3 + 1.78 = 3.08 元', () => {
    const dish = makeDish([
      { ingredientId: 'ing_potato', amount: 250, unit: 'g' },
      { ingredientId: 'ing_egg', amount: 100, unit: 'g' },
    ]);
    expect(calcDishCost(dish, allIngredients, '盒马NB')).toBe(3.08);
  });

  test('切换平台后按新平台重算：土豆在朴朴更便宜', () => {
    const dish = makeDish([{ ingredientId: 'ing_potato', amount: 500, unit: 'g' }]);
    expect(calcDishCost(dish, allIngredients, '朴朴超市')).toBe(1.9);
  });

  test('不传平台时跟随全局当前平台', () => {
    setCurrentPlatform('朴朴超市');
    const dish = makeDish([{ ingredientId: 'ing_potato', amount: 500, unit: 'g' }]);
    expect(calcDishCost(dish, allIngredients)).toBe(1.9);
    setCurrentPlatform('盒马NB'); // 用完还原，别影响别的用例
  });
});

// ---------- calcDishNutrition：一道菜的营养总和 ----------

describe('calcDishNutrition 营养求和', () => {
  test('按用量折算：土豆 200g = 每 100g 的成分 × 2', () => {
    const dish = makeDish([{ ingredientId: 'ing_potato', amount: 200, unit: 'g' }]);
    const n = calcDishNutrition(dish, allIngredients);
    expect(n).toEqual({
      calories: 154,   // 77 × 2
      protein: 4,      // 2.0 × 2
      fat: 0.2,        // 0.1 × 2
      carbs: 35,       // 17.5 × 2
      sodium: 12,      // 6 × 2
      fiber: 4.4,      // 2.2 × 2
    });
  });

  test('250g = ×2.5，结果按各自的精度四舍五入', () => {
    const dish = makeDish([{ ingredientId: 'ing_potato', amount: 250, unit: 'g' }]);
    const n = calcDishNutrition(dish, allIngredients)!;
    expect(n.calories).toBe(193);   // 77 × 2.5 = 192.5 → 193
    expect(n.protein).toBe(5);      // 2.0 × 2.5
    expect(n.sodium).toBe(15);      // 6 × 2.5
  });

  test('液体按 ml 折算：200ml 牛奶 = 每 100ml × 2', () => {
    const dish = makeDish([{ ingredientId: 'ing_milk', amount: 200, unit: 'ml' }]);
    const n = calcDishNutrition(dish, allIngredients)!;
    expect(n.calories).toBe(130);   // 65 × 2
    expect(n.protein).toBe(6.4);    // 3.2 × 2
  });

  test('没录营养的调料会被跳过，不影响主料求和', () => {
    const dish = makeDish([
      { ingredientId: 'ing_potato', amount: 200, unit: 'g' },
      { ingredientId: 'ing_salt', amount: 5, unit: 'g' },
    ]);
    expect(calcDishNutrition(dish, allIngredients)!.calories).toBe(154);
  });

  test('整道菜没有任何可计算营养的食材 → 返回 null（表格显示「—」）', () => {
    const dish = makeDish([{ ingredientId: 'ing_salt', amount: 5, unit: 'g' }]);
    expect(calcDishNutrition(dish, allIngredients)).toBeNull();
  });

});

// ---------- formatBaseValue：展示单位还原 ----------

describe('formatBaseValue 展示单位', () => {
  test('1200g → 1.2 kg；600g → 600 g', () => {
    expect(formatBaseValue(1200, 'mass')).toEqual({ amount: 1.2, unit: 'kg' });
    expect(formatBaseValue(600, 'mass')).toEqual({ amount: 600, unit: 'g' });
  });

  test('1500ml → 1.5 L', () => {
    expect(formatBaseValue(1500, 'volume')).toEqual({ amount: 1.5, unit: 'L' });
  });
});
