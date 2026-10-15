import type { Dish, Ingredient, MergedItem } from '@/types';
import { normalizeToBase } from './price';

/**
 * 把多道菜的食材清单合并成一份采购清单
 * - 同食材按基础单位 (g / ml / 个) 累加
 * - 总价 = 累加后的数量 × 该食材的基础单价
 */
export function mergeShoppingList(
  dishes: Dish[],
  ingredients: Ingredient[]
): MergedItem[] {
  const map = new Map<string, MergedItem & { _baseKind: 'mass' | 'volume' | 'count' }>();

  for (const dish of dishes) {
    for (const di of dish.ingredients) {
      const ing = ingredients.find((i) => i.id === di.ingredientId);
      if (!ing) continue;

      const hint = { unitGrams: ing.unitGrams, unitMl: ing.unitMl };
      const dBase = normalizeToBase(di.amount, di.unit, hint);
      const iBase = normalizeToBase(1, ing.unit, hint);

      // 食材的基础单位价格 (元 / 基础单位)
      const basePrice = iBase.value > 0 ? ing.pricePerUnit / iBase.value : ing.pricePerUnit;
      const lineCost = basePrice * dBase.value;
      const displayUnit =
        dBase.kind === 'mass'
          ? 'g'
          : dBase.kind === 'volume'
          ? 'ml'
          : ing.unit;

      const existing = map.get(ing.id);
      if (existing) {
        existing.amount += dBase.value;
        existing.totalCost = Math.round((existing.totalCost + lineCost) * 100) / 100;
      } else {
        map.set(ing.id, {
          ingredientId: ing.id,
          ingredientName: ing.name,
          amount: dBase.value,
          unit: displayUnit,
          unitPrice: Math.round(basePrice * 10000) / 10000,
          totalCost: Math.round(lineCost * 100) / 100,
          _baseKind: dBase.kind,
        });
      }
    }
  }

  // 输出时把 amount 美化成可读单位
  return Array.from(map.values())
    .map(({ _baseKind, amount, ...rest }) => {
      const display =
        _baseKind === 'mass' && amount >= 1000
          ? { amount: Math.round((amount / 500) * 100) / 100, unit: '斤' }
          : _baseKind === 'volume' && amount >= 1000
          ? { amount: Math.round((amount / 1000) * 100) / 100, unit: 'L' }
          : { amount: Math.round(amount * 100) / 100, unit: rest.unit };
      return {
        ...rest,
        amount: display.amount,
        unit: display.unit,
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost);
}
