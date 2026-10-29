import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import type { Ingredient, IngredientCategory, IngredientUnit } from '@/types';
import { PRICE_PLATFORMS } from './platforms';

const VALID_CATEGORIES: IngredientCategory[] = [
  '蔬菜',
  '肉类',
  '海鲜',
  '调料',
  '主食',
  '蛋奶',
  '水果',
  '其他',
];

/** 计价单位只保留固体（斤/g/kg）和液体（ml/L） */
const VALID_UNITS: IngredientUnit[] = ['斤', 'g', 'kg', 'ml', 'L'];

const NUTRITION_HEADERS = [
  '热量(kcal/100)',
  '蛋白质(g)',
  '脂肪(g)',
  '碳水(g)',
  '钠(mg)',
  '膳食纤维(g)',
] as const;

/** 表头顺序：人类可读，方便手填；每个平台一列价格 + 一列份量 */
export const EXCEL_HEADERS = [
  'ID',
  '名称',
  '分类',
  '单位',
  ...PRICE_PLATFORMS.flatMap((p) => [`${p}价格(元)`, `${p}份量`]),
  ...NUTRITION_HEADERS,
  '备注',
];

/** 把对象转成 Excel 行（保留顺序，未定义字段留空） */
function toRow(i: Ingredient): Record<string, string | number | undefined> {
  const row: Record<string, string | number | undefined> = {
    ID: i.id,
    名称: i.name,
    分类: i.category,
    单位: i.unit,
  };
  for (const platform of PRICE_PLATFORMS) {
    const price = i.prices?.[platform];
    row[`${platform}价格(元)`] = price?.price;
    row[`${platform}份量`] = price?.amount;
  }
  row[NUTRITION_HEADERS[0]] = i.nutrition?.calories;
  row[NUTRITION_HEADERS[1]] = i.nutrition?.protein;
  row[NUTRITION_HEADERS[2]] = i.nutrition?.fat;
  row[NUTRITION_HEADERS[3]] = i.nutrition?.carbs;
  row[NUTRITION_HEADERS[4]] = i.nutrition?.sodium;
  row[NUTRITION_HEADERS[5]] = i.nutrition?.fiber;
  row['备注'] = i.note;
  return row;
}

/** 列宽：ID 名称宽一点，其余窄一点 */
function cols(): { wch: number }[] {
  return EXCEL_HEADERS.map((h) => {
    if (h === 'ID') return { wch: 22 };
    if (h === '名称') return { wch: 14 };
    if (h === '备注') return { wch: 24 };
    if (h.includes('价格')) return { wch: 12 };
    return { wch: 10 };
  });
}

/** 配对 INGREDIENT 类型一致：导出的全部字段 */
export function exportIngredientsToExcel(items: Ingredient[], filename?: string) {
  const rows = items.map(toRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...EXCEL_HEADERS] });
  ws['!cols'] = cols();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '食材库');
  const today = dayjs().format('YYYY-MM-DD');
  XLSX.writeFile(wb, filename ?? `cook-食材-${today}.xlsx`);
}

/** 下载模板：表头 + 一条示例数据，方便照着填 */
export function downloadIngredientTemplate() {
  const example: Ingredient = {
    id: 'ing_salmon',
    name: '三文鱼',
    category: '海鲜',
    unit: '斤',
    prices: {
      [PRICE_PLATFORMS[0]]: { price: 79.9, amount: 1 },
      [PRICE_PLATFORMS[1]]: { price: 69.9, amount: 1 },
      [PRICE_PLATFORMS[2]]: { price: 72.9, amount: 1 },
      [PRICE_PLATFORMS[3]]: { price: 65.9, amount: 1 },
    },
    nutrition: { calories: 208, protein: 20.4, fat: 13.4, carbs: 0, sodium: 59, fiber: 0 },
    note: '一份约 200 g',
  };
  const ws = XLSX.utils.json_to_sheet([toRow(example)], { header: [...EXCEL_HEADERS] });
  ws['!cols'] = cols();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '食材库(模板)');
  XLSX.writeFile(wb, `cook-食材-模板.xlsx`);
}

/** 单格清洗 —— Excel 把数字单元读到 number，其他单元的"1.0"也可能是字符串 */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 解析上传的 Excel → Ingredient[]（自动补 ID，分类兜底） */
export async function parseIngredientsExcel(file: File): Promise<Ingredient[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows
    .map((row, idx) => {
      const name = cell(row['名称']);
      if (!name) return null; // 空行跳过
      const cat = cell(row['分类']) as IngredientCategory;
      const category: IngredientCategory = VALID_CATEGORIES.includes(cat) ? cat : '其他';
      const idRaw = cell(row['ID']);
      const id = idRaw || `ing_imp_${dayjs().valueOf()}_${idx}`;
      const unitRaw = cell(row['单位']) as IngredientUnit;
      const unit: IngredientUnit = VALID_UNITS.includes(unitRaw) ? unitRaw : '斤';

      // 每个平台：价格填了才算录了这个平台的价；份量不填默认 1 份
      const prices: Ingredient['prices'] = {};
      for (const platform of PRICE_PLATFORMS) {
        const price = num(row[`${platform}价格(元)`]);
        if (price === undefined || price < 0) continue;
        prices[platform] = { price, amount: num(row[`${platform}份量`]) ?? 1 };
      }

      const cal = num(row[NUTRITION_HEADERS[0]]);
      const protein = num(row[NUTRITION_HEADERS[1]]);
      const fat = num(row[NUTRITION_HEADERS[2]]);
      const carbs = num(row[NUTRITION_HEADERS[3]]);
      const sodium = num(row[NUTRITION_HEADERS[4]]);
      const fiber = num(row[NUTRITION_HEADERS[5]]);
      const hasNutrition =
        cal !== undefined ||
        protein !== undefined ||
        fat !== undefined ||
        carbs !== undefined ||
        sodium !== undefined ||
        fiber !== undefined;

      return {
        id,
        name,
        category,
        unit,
        prices,
        nutrition: hasNutrition
          ? {
              calories: cal ?? 0,
              protein: protein ?? 0,
              fat: fat ?? 0,
              carbs: carbs ?? 0,
              sodium: sodium ?? 0,
              fiber: fiber ?? 0,
            }
          : undefined,
        note: cell(row['备注']) || undefined,
      } as Ingredient;
    })
    .filter((x): x is Ingredient => x !== null);
}
