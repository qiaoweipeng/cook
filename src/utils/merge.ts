import type { Dish, Ingredient, MergedItem } from '@/types';
import { getCurrentPlatform } from './price';
import { normalizeToBase, pricePerBase, type UnitKind } from './price';

/**
 * 把多道菜的食材清单合并成一份采购清单
 * - 同食材按基础单位 (g / ml) 累加
 * - 总价 = 累加后的数量 × 选定平台的基础单价
 */
export function mergeShoppingList(
  dishes: Dish[],
  ingredients: Ingredient[],
  platform: string = getCurrentPlatform()
): MergedItem[] {
  const map = new Map<string, MergedItem & { _baseKind: UnitKind }>();

  for (const dish of dishes) {
    for (const di of dish.ingredients) {
      const ing = ingredients.find((i) => i.id === di.ingredientId);
      if (!ing) continue;

      // 选定平台没录价就退回任意一个有价格的平台，避免整条算成 0
      const usePlatform =
        (pricePerBase(ing, platform) ? platform : null) ??
        Object.keys(ing.prices ?? {}).find((p) => pricePerBase(ing, p));
      const price = usePlatform ? pricePerBase(ing, usePlatform) : null;

      const dBase = normalizeToBase(di.amount, di.unit);
      let lineCost = 0;
      if (price && usePlatform) {
        if (dBase.kind === price.kind) {
          lineCost = price.value * dBase.value;
        } else {
          // 跨维度兜底：按「份」估算
          const pp = ing.prices[usePlatform];
          const amount = pp.amount && pp.amount > 0 ? pp.amount : 1;
          lineCost = (pp.price / amount) * di.amount;
        }
      }

      // unitPrice 统一折算成比价单位：元/斤、元/L（没录价则为 0）
      const unitPrice = !price
        ? 0
        : price.kind === 'mass'
          ? price.value * 500
          : price.kind === 'volume'
            ? price.value * 1000
            : price.value;

      const existing = map.get(ing.id);
      if (existing) {
        existing.amount += dBase.value;
        existing.totalCost = Math.round((existing.totalCost + lineCost) * 100) / 100;
      } else {
        map.set(ing.id, {
          ingredientId: ing.id,
          ingredientName: ing.name,
          amount: dBase.value,
          unit: dBase.kind === 'mass' ? 'g' : dBase.kind === 'volume' ? 'ml' : ing.unit,
          unitPrice: Math.round(unitPrice * 100) / 100,
          totalCost: Math.round(lineCost * 100) / 100,
          _baseKind: dBase.kind,
        });
      }
    }
  }

  // 输出时把 amount 美化成可读单位（能凑成斤 / L 的就不用 g / ml）
  return Array.from(map.values())
    .map(({ _baseKind, amount, ...rest }) => {
      const display =
        _baseKind === 'mass' && amount >= 500
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
