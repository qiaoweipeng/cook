import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import type { Ingredient, IngredientCategory } from '@/types';

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

/** 表头顺序：人类可读，方便手填 */
export const EXCEL_HEADERS = [
  'ID',
  '名称',
  '分类',
  '单价(元)',
  '单位',
  '规格',
  '1单位=克',
  '1单位=毫升',
  '备注',
] as const;

/** 把对象转成 Excel 行（保留顺序，未定义字段留空） */
function toRow(i: Ingredient): Record<string, string | number | undefined> {
  return {
    ID: i.id,
    名称: i.name,
    分类: i.category,
    '单价(元)': i.pricePerUnit,
    单位: i.unit,
    规格: i.spec,
    '1单位=克': i.unitGrams,
    '1单位=毫升': i.unitMl,
    备注: i.note,
  };
}

/** 配对 INGREDIENT 类型一致：导出的全部字段 */
export function exportIngredientsToExcel(items: Ingredient[], filename?: string) {
  const rows = items.map(toRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...EXCEL_HEADERS] });
  // 让列宽好看一点
  ws['!cols'] = [
    { wch: 22 }, // ID
    { wch: 14 }, // 名称
    { wch: 10 }, // 分类
    { wch: 10 }, // 单价
    { wch: 8 }, // 单位
    { wch: 20 }, // 规格
    { wch: 10 }, // 1单位=克
    { wch: 10 }, // 1单位=毫升
    { wch: 24 }, // 备注
  ];
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
    pricePerUnit: 80,
    unit: '斤',
  };
  const ws = XLSX.utils.json_to_sheet([toRow(example)], { header: [...EXCEL_HEADERS] });
  ws['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 20 },
    { wch: 10 },
    { wch: 10 },
    { wch: 24 },
  ];
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
      const unit = cell(row['单位']) || '个';
      return {
        id,
        name,
        category,
        pricePerUnit: num(row['单价(元)']) ?? 0,
        unit,
        spec: cell(row['规格']) || undefined,
        unitGrams: num(row['1单位=克']),
        unitMl: num(row['1单位=毫升']),
        note: cell(row['备注']) || undefined,
      } as Ingredient;
    })
    .filter((x): x is Ingredient => x !== null);
}
