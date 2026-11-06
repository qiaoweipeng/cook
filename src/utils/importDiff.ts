/*
  Excel 导入的「比对计划」：把解析出来的 Excel 行和系统现有食材逐条对比，
  分成三组 —— 新增 / 冲突（要用户选边）/ 无变化（静默跳过）。

  匹配规则（按优先级）：
  ① Excel 填了 ID 且系统有该 ID   → 按 ID 匹配，内容不同则进冲突（哪怕改名也认这条 ID）
  ② Excel 填了 ID 但系统没有       → 新增，沿用用户填的 ID
  ③ ID 留空（解析时自动生成）且系统有同名 → 按名称匹配进冲突（提示「系统已有同名食材」）
  ④ ID 留空且无同名                → 新增（用自动生成的 ID）

  注意：Excel 没有图片列，所以「用 Excel 覆盖」时必须保留系统原图片，
  否则一导入图片全被清空（见 buildMergeList）。
*/
import type { Ingredient } from '@/types';

/** 解析时给空 ID 行自动生成的前缀（见 excel.ts）—— 带这个前缀 = 用户没填 ID */
const AUTO_ID_PREFIX = 'ing_imp_';

/** 一个字段的系统值 vs Excel 值（只记有差异的） */
export interface ConflictFieldDiff {
  label: string;
  systemValue: string;
  excelValue: string;
}

export interface ImportConflict {
  /** 对比表的 rowKey：直接用解析行的 id（空 ID 行解析时已生成全局唯一 id） */
  key: string;
  excel: Ingredient;
  system: Ingredient;
  matchBy: 'id' | 'name';
  diffs: ConflictFieldDiff[];
}

export interface ImportPlan {
  /** 直接加进库里的新食材（规则 ②④） */
  news: Ingredient[];
  /** 需要用户逐条选「用 Excel / 保留系统」的（规则 ①③，且内容确实有差异） */
  conflicts: ImportConflict[];
  /** ID 相同且内容完全一样 —— 静默跳过，不打扰用户 */
  skipped: Ingredient[];
}

const NUTRI_LABELS: { key: keyof NonNullable<Ingredient['nutrition']>; label: string; unit: string }[] = [
  { key: 'calories', label: '热量', unit: 'kcal' },
  { key: 'protein', label: '蛋白质', unit: 'g' },
  { key: 'fat', label: '脂肪', unit: 'g' },
  { key: 'carbs', label: '碳水', unit: 'g' },
  { key: 'sodium', label: '钠', unit: 'mg' },
  { key: 'fiber', label: '膳食纤维', unit: 'g' },
];

function fmtNum(v: number | undefined | null): string {
  return v === undefined || v === null ? '—' : String(v);
}

function fmtPrice(p: { price: number; amount?: number } | undefined, unit: string): string {
  return p ? `¥${p.price} / ${p.amount ?? 1}${unit}` : '—';
}

/** 逐字段对比两条食材，返回有差异的字段列表（空数组 = 完全一样） */
export function diffIngredients(system: Ingredient, excel: Ingredient): ConflictFieldDiff[] {
  const diffs: ConflictFieldDiff[] = [];
  const push = (label: string, systemValue: string, excelValue: string) => {
    if (systemValue !== excelValue) diffs.push({ label, systemValue, excelValue });
  };

  push('名称', system.name, excel.name);
  push('分类', system.category, excel.category);
  push('单位', system.unit, excel.unit);
  push('备注', system.note ?? '—', excel.note ?? '—');

  // 价格：两边出现过的平台都要比（一边没录 = 「—」）
  const platforms = new Set([
    ...Object.keys(system.prices ?? {}),
    ...Object.keys(excel.prices ?? {}),
  ]);
  for (const p of platforms) {
    const sp = system.prices?.[p];
    const ep = excel.prices?.[p];
    if (sp?.price !== ep?.price || sp?.amount !== ep?.amount) {
      diffs.push({
        label: `${p}价格`,
        systemValue: fmtPrice(sp, system.unit),
        excelValue: fmtPrice(ep, excel.unit),
      });
    }
  }

  for (const f of NUTRI_LABELS) {
    const sv = system.nutrition?.[f.key];
    const ev = excel.nutrition?.[f.key];
    if (sv !== ev) {
      diffs.push({
        label: `${f.label}(${f.unit})`,
        systemValue: fmtNum(sv),
        excelValue: fmtNum(ev),
      });
    }
  }
  return diffs;
}

/** 把 Excel 解析结果和系统现有食材比对，产出「新增 / 冲突 / 跳过」三组 */
export function planImport(excelItems: Ingredient[], systemItems: Ingredient[]): ImportPlan {
  const sysById = new Map<string, Ingredient>();
  const sysByName = new Map<string, Ingredient>();
  for (const it of systemItems) {
    sysById.set(it.id, it);
    // 同名只认第一条：理论上名称唯一，重名时别让后面的顶掉前面的
    if (!sysByName.has(it.name)) sysByName.set(it.name, it);
  }

  const plan: ImportPlan = { news: [], conflicts: [], skipped: [] };
  for (const row of excelItems) {
    const userFilledId = !row.id.startsWith(AUTO_ID_PREFIX);
    // 规则 ①②：填了 ID 只看 ID；规则 ③④：没填 ID 才按名称兜底
    const sys = userFilledId ? sysById.get(row.id) : sysByName.get(row.name);

    if (!sys) {
      plan.news.push(row);
      continue;
    }
    const diffs = diffIngredients(sys, row);
    if (diffs.length === 0) {
      plan.skipped.push(row);
    } else {
      plan.conflicts.push({
        key: row.id,
        excel: row,
        system: sys,
        matchBy: userFilledId ? 'id' : 'name',
        diffs,
      });
    }
  }
  return plan;
}

/**
 * 用户选完边之后，生成最终要写入的合并列表：
 * 新增的全部写入；冲突里选了「用 Excel」的才写入 ——
 * 但必须强制换回系统原 ID（菜品靠 ID 引用食材，换 ID 引用就断了），
 * 并保留系统图片（Excel 没有图片列，直接覆盖会把图清没）。
 */
export function buildMergeList(
  plan: ImportPlan,
  choices: Record<string, 'excel' | 'system'>
): Ingredient[] {
  const overwrite = plan.conflicts
    .filter((c) => choices[c.key] === 'excel')
    .map((c) => ({ ...c.excel, id: c.system.id, image: c.system.image }));
  return [...plan.news, ...overwrite];
}
