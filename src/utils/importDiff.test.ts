/*
  导入比对逻辑的单元测试。
  覆盖用户确认的四条匹配规则：
  ① 填了 ID 且系统有 → 按 ID 匹配，有差异进冲突
  ② 填了 ID 但系统没有 → 新增，沿用填的 ID
  ③ ID 留空（ing_imp_ 前缀）但有同名 → 按名称匹配进冲突
  ④ ID 留空且无同名 → 新增
  外加两条防线：内容完全一样要静默跳过；覆盖时必须保留系统原 ID 和图片。
*/
import { describe, test, expect } from 'vitest';
import { planImport, buildMergeList, diffIngredients } from './importDiff';
import type { Ingredient } from '@/types';

/** 系统里已有的黄瓜：1 块钱 500g，带图 */
const cucumber: Ingredient = {
  id: 'ing_0001',
  name: '黄瓜',
  category: '蔬菜',
  unit: 'g',
  image: 'ingredients/cucumber.webp',
  prices: { 盒马NB: { price: 1, amount: 500 } },
  nutrition: { calories: 16, protein: 0.8, fat: 0.2, carbs: 2.9, sodium: 4, fiber: 0.5 },
  note: '凉拌好吃',
};

/** 从黄瓜复制一份出来改，省得每条用例从头写 */
function fromCucumber(patch: Partial<Ingredient>): Ingredient {
  return { ...cucumber, ...patch };
}

describe('planImport 匹配规则', () => {
  test('① 同 ID 内容不同 → 冲突，按 ID 匹配（哪怕改了名）', () => {
    // 用户导出后把 1 块改成 2 块，还顺手改了名
    const row = fromCucumber({ name: '青瓜', prices: { 盒马NB: { price: 2, amount: 1 } } });
    const plan = planImport([row], [cucumber]);

    expect(plan.news).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
    const c = plan.conflicts[0];
    expect(c.matchBy).toBe('id');
    expect(c.system.id).toBe('ing_0001');
    // 差异里应该同时看到名称和价格
    expect(c.diffs.map((d) => d.label)).toContain('名称');
    expect(c.diffs.map((d) => d.label)).toContain('盒马NB价格');
  });

  test('① 同 ID 内容完全一样 → 静默跳过，不进冲突', () => {
    const plan = planImport([fromCucumber({})], [cucumber]);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.news).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
  });

  test('② 填了 ID 但系统没有 → 新增，沿用用户填的 ID', () => {
    const row = fromCucumber({ id: 'ing_custom_9', name: '苦瓜' });
    const plan = planImport([row], [cucumber]);
    expect(plan.news).toHaveLength(1);
    expect(plan.news[0].id).toBe('ing_custom_9');
    expect(plan.conflicts).toHaveLength(0);
  });

  test('③ ID 留空但系统有同名 → 按名称匹配进冲突', () => {
    // 用户在 Excel 新增一行「黄瓜」，没填 ID，解析时自动生成了 ing_imp_ 前缀的 ID
    const row = fromCucumber({ id: 'ing_imp_1700000000000_3', prices: { 盒马NB: { price: 5, amount: 1 } } });
    const plan = planImport([row], [cucumber]);

    expect(plan.news).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].matchBy).toBe('name');
    expect(plan.conflicts[0].system.id).toBe('ing_0001');
  });

  test('④ ID 留空且无同名 → 新增（青瓜场景）', () => {
    const row = fromCucumber({ id: 'ing_imp_1700000000000_4', name: '青瓜' });
    const plan = planImport([row], [cucumber]);
    expect(plan.news).toHaveLength(1);
    expect(plan.news[0].name).toBe('青瓜');
    expect(plan.conflicts).toHaveLength(0);
  });

  test('用户 ID 恰好以 ing_imp_ 开头时按「未填」处理（约定大于配置）', () => {
    // 文档化的取舍：自动 ID 前缀就是「用户没填 ID」的标记
    const row = fromCucumber({ id: 'ing_imp_1', name: '不存在的菜' });
    const plan = planImport([row], [cucumber]);
    expect(plan.news).toHaveLength(1);
  });
});

describe('diffIngredients 字段级对比', () => {
  test('备注、单位、营养、平台价格的差异都能看出来', () => {
    const excel = fromCucumber({
      unit: 'kg',
      note: undefined,
      prices: { 朴朴超市: { price: 3, amount: 2 } },
      nutrition: { ...cucumber.nutrition!, calories: 99 },
    });
    const labels = diffIngredients(cucumber, excel).map((d) => d.label);
    expect(labels).toContain('单位');
    expect(labels).toContain('备注');
    expect(labels).toContain('盒马NB价格'); // 系统有、Excel 没了
    expect(labels).toContain('朴朴超市价格'); // Excel 新增的平台价
    expect(labels).toContain('热量(kcal)');
    // 没变的不该出现
    expect(labels).not.toContain('名称');
    expect(labels).not.toContain('蛋白质(g)');
  });

  test('完全一样 → 空数组', () => {
    expect(diffIngredients(cucumber, fromCucumber({}))).toHaveLength(0);
  });
});

describe('buildMergeList 生成最终写入列表', () => {
  const plan = (() => {
    const byId = fromCucumber({ prices: { 盒马NB: { price: 2, amount: 1 } } });
    const byName = fromCucumber({ id: 'ing_imp_1700000000000_3', note: '改备注' });
    const newRow = fromCucumber({ id: 'ing_imp_1700000000000_4', name: '青瓜' });
    return planImport([byId, byName, newRow], [cucumber]);
  })();

  test('选「用 Excel」的冲突：强制保留系统原 ID 和系统图片', () => {
    const choices: Record<string, 'excel' | 'system'> = {};
    for (const c of plan.conflicts) choices[c.key] = 'excel';
    const list = buildMergeList(plan, choices);

    // 1 条新增（青瓜）+ 2 条覆盖 = 3 条
    expect(list).toHaveLength(3);
    const overwrites = list.filter((i) => i.name !== '青瓜');
    // 两条覆盖都必须落回系统原 ID（按名称匹配的那条原本带着自动 ID）
    expect(overwrites.every((i) => i.id === 'ing_0001')).toBe(true);
    // 图片必须保留系统的（Excel 没有图片列）
    expect(overwrites.every((i) => i.image === 'ingredients/cucumber.webp')).toBe(true);
    // 内容确实用的是 Excel 的新值
    expect(overwrites.some((i) => i.prices?.['盒马NB']?.price === 2)).toBe(true);
  });

  test('选「保留系统」的冲突不进写入列表，新增不受影响', () => {
    const choices: Record<string, 'excel' | 'system'> = {};
    for (const c of plan.conflicts) choices[c.key] = 'system';
    const list = buildMergeList(plan, choices);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('青瓜');
  });
});
