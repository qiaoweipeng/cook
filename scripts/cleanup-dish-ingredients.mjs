/**
 * 清理菜品遗留食材 + 统一补充菜籽油
 *
 * 做两件事：
 *   1. dish_ingredients 表里 ingredient_id 在 ingredients 表已不存在的遗留行 → 删掉
 *   2. 每道菜追加 15ml 的「非转基因食用菜籽油（自有品牌）」（已存在则跳过）
 *
 * 用法：
 *   pnpm cleanup-dish-ingredients              # 干跑，只打印不写库
 *   pnpm cleanup-dish-ingredients --apply      # 真执行
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ------------------------------------------------------ 环境变量
function loadEnv() {
  let raw = '';
  try { raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8'); } catch { }
  const map = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return { url: (map.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''), key: map.VITE_SUPABASE_ANON_KEY ?? '' };
}

const { url: SUPABASE_URL, key: ANON_KEY } = loadEnv();
const API = `${SUPABASE_URL}/rest/v1`;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('✘ .env 里缺 Supabase 配置');
  process.exit(1);
}

const DRY = !process.argv.includes('--apply');

const HEADERS = {
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
  ...(ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${ANON_KEY}` } : {}),
};

async function api(path, init = {}) {
  const headers = { ...HEADERS };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${API}/${path}`, { ...init, headers });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`HTTP ${res.status} ${path}\n${msg.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ------------------------------------------------------ 主流程
(async () => {
  console.log(`\n云端：${SUPABASE_URL.replace('https://', '')}`);
  console.log(`模式：${DRY ? 'DRY-RUN（只打印，不写库）' : 'APPLY（真执行）'}\n`);

  // 1. 拿 ingredients 表所有 id → Set
  const ingredients = await api('ingredients?select=id,name');
  const validIds = new Set(ingredients.map((r) => r.id));
  console.log(`食材库共 ${ingredients.length} 种`);

  // 2. 找菜籽油 id
  const oilMatch = ingredients.find((r) => r.name.includes('菜籽油'));
  if (!oilMatch) {
    console.error('✘ 食材库里没找到名字包含「菜籽油」的食材，已中止');
    console.error('  请先在数据库里建好「非转基因食用菜籽油（自有品牌）」，再跑这个脚本');
    process.exit(1);
  }
  const OIL_ID = oilMatch.id;
  console.log(`菜籽油 id = ${OIL_ID}  （「${oilMatch.name}」）`);

  // 3. 拉所有 dish_ingredients
  const allRows = await api('dish_ingredients?select=id,dish_id,ingredient_id,amount,unit');
  console.log(`dish_ingredients 共 ${allRows.length} 行`);

  // 4. 分出「遗留行」和「正常行」
  const orphanRows = allRows.filter((r) => !validIds.has(r.ingredient_id));
  const goodRows = allRows.filter((r) => validIds.has(r.ingredient_id));

  // 菜籽油已存在的菜品 id → 后面 append 时跳过
  const dishesWithOil = new Set(
    goodRows.filter((r) => r.ingredient_id === OIL_ID).map((r) => r.dish_id)
  );

  console.log(`\n=== 第 1 步：清理遗留食材 ===`);
  if (orphanRows.length === 0) {
    console.log('✔ 没有遗留食材，不需要清理');
  } else {
    const group = {};
    for (const r of orphanRows) {
      group[r.ingredient_id] = (group[r.ingredient_id] || 0) + 1;
    }
    console.log(`发现 ${orphanRows.length} 行遗留数据，涉及 ${Object.keys(group).length} 个不存在的 ingredient_id：`);
    for (const [iid, cnt] of Object.entries(group)) {
      const sampleDishes = orphanRows.filter((r) => r.ingredient_id === iid).map((r) => r.dish_id).slice(0, 3);
      console.log(`  ingredient_id=${iid}  ×${cnt} 行  (示例菜品: ${sampleDishes.join(', ')})`);
    }

    if (!DRY) {
      // 分批删（PostgREST IN 列表限制）
      const ids = orphanRows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const list = chunk.map((id) => `"${id}"`).join(',');
        await api(`dish_ingredients?id=in.(${list})`, { method: 'DELETE', prefer: 'return=minimal' });
      }
      console.log(`✔ 已删除 ${orphanRows.length} 行遗留数据`);
    } else {
      console.log(`[dry] 将删除 ${orphanRows.length} 行`);
    }
  }

  // 5. 拉所有菜品 id
  const dishes = await api('dishes?select=id,name');
  console.log(`\n=== 第 2 步：给每道菜追加 15ml 菜籽油 ===`);
  console.log(`菜品共 ${dishes.length} 道`);

  const toAppend = dishes.filter((d) => !dishesWithOil.has(d.id));
  console.log(`其中 ${dishesWithOil.size} 道已经有菜籽油了，需要追加 ${toAppend.length} 道`);

  if (toAppend.length === 0) {
    console.log('✔ 所有菜品都已经有菜籽油了');
  } else {
    if (!DRY) {
      const rows = toAppend.map((d) => ({
        dish_id: d.id,
        ingredient_id: OIL_ID,
        amount: 15,
        unit: 'ml',
      }));
      const CHUNK = 20;  // 拆小，免得请求太大或超时
      let written = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await api('dish_ingredients', { method: 'POST', body: JSON.stringify(chunk), prefer: 'return=minimal' });
        written += chunk.length;
        console.log(`  进度：${written}/${rows.length}`);
      }
      console.log(`✔ 已给 ${toAppend.length} 道菜追加 15ml 菜籽油`);
    } else {
      // 打印示例
      const sample = toAppend.slice(0, 5).map((d) => `  ${d.id}（${d.name}）`).join('\n');
      const more = toAppend.length > 5 ? `\n  …还有 ${toAppend.length - 5} 道` : '';
      console.log(`[dry] 将给以下菜品追加 15ml 菜籽油：\n${sample}${more}`);
    }
  }

  console.log(`\n=== 完成 ===\n`);
})().catch((e) => {
  console.error('✘ 执行失败：', e.message);
  process.exit(1);
});
