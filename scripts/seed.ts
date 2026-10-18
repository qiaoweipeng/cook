/**
 * 数据库种子脚本：把内置的菜谱 / 食材灌进 Supabase
 *
 * 用法（在项目根目录执行）：
 *   pnpm seed                 # 只填充「空表」，已有数据的表会跳过（安全，默认行为）
 *   pnpm seed -- --force      # 强制同步：已存在的行按 id 更新（菜品会重建其关联表）
 *   pnpm seed -- --only=dishes
 *   pnpm seed -- --dry        # 只打印将要做的事，不写库
 *
 * 说明：
 *   - 建表必须在 Supabase 控制台的 SQL Editor 里执行 supabase/schema.sql（PostgREST 不支持 DDL），
 *     这个脚本只负责「插入数据」。
 *   - 用的就是前端同一个 anon key + RLS，所以不需要额外密钥。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedDishes, RETIRED_DISH_IDS } from '@/data/seedDishes';
import { seedIngredients } from '@/data/seedIngredients';
import { dishToRow, ingToRow } from '@/lib/rowMapper';

// ---------------------------------------------------------------- 环境变量

function loadEnv(): { url: string; key: string } {
  let raw = '';
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    /* 文件不存在时退回 process.env */
  }
  const map: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return { url: (map.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''), key: map.VITE_SUPABASE_ANON_KEY ?? '' };
}

const { url: SUPABASE_URL, key: ANON_KEY } = loadEnv();
const API = `${SUPABASE_URL}/rest/v1`;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('✘ 缺少环境变量。请在项目根目录的 .env 里配置：');
  console.error('    VITE_SUPABASE_URL=https://<项目>.supabase.co');
  console.error('    VITE_SUPABASE_ANON_KEY=<anon key>');
  process.exit(1);
}

// Supabase 有两代 key：旧 anon key 是 JWT，新版 publishable key 不是 JWT。
// 非 JWT 的 key 只能放 apikey 头（放 Bearer 会 JWT 校验失败），这里按前缀判断。
const HEADERS: Record<string, string> = {
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
  ...(ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${ANON_KEY}` } : {}),
};

// ---------------------------------------------------------------- 命令行参数

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const DRY = argv.includes('--dry');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = (onlyArg?.split('=')[1] as 'dishes' | 'ingredients' | undefined) ?? 'all';

// ---------------------------------------------------------------- 工具

async function api(path: string, init: RequestInit & { prefer?: string } = {}) {
  const headers: Record<string, string> = { ...HEADERS };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${API}/${path}`, { ...init, headers });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`HTTP ${res.status} ${path}\n${msg.slice(0, 300)}`);
  }
  return res;
}

/** 查询某表当前行数 */
async function countRows(table: string): Promise<number> {
  const res = await fetch(`${API}/${table}?select=*&limit=0`, {
    method: 'HEAD',
    headers: { apikey: ANON_KEY, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`查行数失败 ${table}: HTTP ${res.status}`);
  const cr = res.headers.get('content-range') ?? '';
  const m = cr.match(/\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** 批量插入（PostgREST 支持数组一次写多行） */
async function bulkInsert(table: string, rows: unknown[]) {
  if (rows.length === 0) return;
  await api(table, { method: 'POST', body: JSON.stringify(rows), prefer: 'return=minimal' });
}

// ---------------------------------------------------------------- 食材

async function seedIngredientTable() {
  const exists = await countRows('ingredients');
  if (exists > 0 && !FORCE) {
    console.log(`⏭  食材库已有 ${exists} 条，跳过（想覆盖请加 --force）`);
    return;
  }
  const rows = seedIngredients.map(ingToRow);
  console.log(DRY ? `[dry] 将写入 ${rows.length} 条食材` : `写入 ${rows.length} 条食材…`);
  if (DRY) return;
  if (FORCE && exists > 0) {
    // 逐条 upsert：先试着改，改不到（0 行）再插入，和前端 cloudSync 的写法保持一致
    let updated = 0;
    for (const r of rows) {
      const res = await fetch(`${API}/ingredients?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        headers: { ...HEADERS, Prefer: 'return=representation' },
        body: JSON.stringify(r),
      });
      if (!res.ok) throw new Error(`更新食材失败 ${r.id}: HTTP ${res.status}`);
      const patched: unknown[] = await res.json();
      if (patched.length === 0) await bulkInsert('ingredients', [r]);
      else updated += 1;
    }
    console.log(`✔ 食材库：更新 ${updated} 条，新增 ${rows.length - updated} 条`);
  } else {
    await bulkInsert('ingredients', rows);
    console.log(`✔ 食材库：新增 ${rows.length} 条`);
  }
}

// ---------------------------------------------------------------- 菜品

async function seedDishTable() {
  const exists = await countRows('dishes');
  if (exists > 0 && !FORCE) {
    console.log(`⏭  菜单已有 ${exists} 道菜，跳过（想覆盖请加 --force）`);
    return;
  }

  const dishes = seedDishes.filter((d) => !RETIRED_DISH_IDS.includes(d.id));
  console.log(
    DRY
      ? `[dry] 将写入 ${dishes.length} 道菜（另有 ${RETIRED_DISH_IDS.length} 个已下架 id 被排除）`
      : `写入 ${dishes.length} 道菜…`
  );
  if (DRY) return;

  for (const d of dishes) {
    const row = dishToRow(d);
    // 1) 主表：先 PATCH，0 行命中再 INSERT（与前端 upsertDishRow 同策略）
    const patch = await fetch(`${API}/dishes?id=eq.${encodeURIComponent(d.id)}`, {
      method: 'PATCH',
      headers: { ...HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!patch.ok) throw new Error(`写主表失败 ${d.id}: HTTP ${patch.status}`);
    const patched: unknown[] = await patch.json();
    if (patched.length === 0) await bulkInsert('dishes', [row]);

    // 2) 关联表：先清后写，避免重复/残留
    if (FORCE) {
      for (const t of ['dish_tags', 'dish_ingredients', 'dish_steps']) {
        await api(`${t}?dish_id=eq.${encodeURIComponent(d.id)}`, {
          method: 'DELETE',
          prefer: 'return=minimal',
        });
      }
    }
    await bulkInsert(
      'dish_tags',
      (d.tags ?? []).filter(Boolean).map((tag) => ({ dish_id: d.id, tag }))
    );
    await bulkInsert(
      'dish_ingredients',
      (d.ingredients ?? []).map((di) => ({
        dish_id: d.id,
        ingredient_id: di.ingredientId,
        amount: di.amount ?? null,
        unit: di.unit ?? null,
      }))
    );
    await bulkInsert(
      'dish_steps',
      (d.steps ?? []).map((s, i) => ({
        dish_id: d.id,
        step_order: s.order ?? i + 1,
        step_text: s.text,
      }))
    );
  }
  console.log(`✔ 菜单：${dishes.length} 道菜写入完成`);
}

// ---------------------------------------------------------------- 主流程

(async () => {
  console.log(`云端：${SUPABASE_URL.replace('https://', '')}`);
  console.log(`模式：${DRY ? 'dry-run' : FORCE ? 'force（更新已存在的行）' : '只填空表'}\n`);

  if (ONLY === 'all' || ONLY === 'ingredients') await seedIngredientTable();
  if (ONLY === 'all' || ONLY === 'dishes') await seedDishTable();

  if (!DRY) {
    console.log('\n最终行数：');
    console.log(`  dishes            ${await countRows('dishes')}`);
    console.log(`  dish_tags         ${await countRows('dish_tags')}`);
    console.log(`  dish_ingredients  ${await countRows('dish_ingredients')}`);
    console.log(`  dish_steps        ${await countRows('dish_steps')}`);
    console.log(`  ingredients       ${await countRows('ingredients')}`);
  }
})().catch((e) => {
  console.error('\n✘ 种子写入失败：', e instanceof Error ? e.message : e);
  process.exit(1);
});
