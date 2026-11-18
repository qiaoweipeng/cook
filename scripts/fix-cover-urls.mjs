import { readFileSync } from 'node:fs';

const env = {};
readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const SUPABASE_URL = env.VITE_SUPABASE_URL + '/rest/v1';
const KEY = env.VITE_SUPABASE_ANON_KEY;
const COS_BASE = env.VITE_COS_PUBLIC_BASE.replace(/\/$/, '');

// 1) 拉全量菜品
const res = await fetch(`${SUPABASE_URL}/dishes?select=id,name,cover_image&order=name`, { headers: { apikey: KEY } });
const dishes = await res.json();

// 2) 识别哪些是 dishes/xxx.webp 相对路径，补前缀
const toUpdate = [];
const cos = [];
const supabase = [];
const other = [];
const noimg = [];

for (const d of dishes) {
  const img = d.cover_image;
  if (!img) {
    noimg.push(d);
  } else if (img.startsWith('dishes/')) {
    // COS 相对路径，补前缀
    toUpdate.push({ id: d.id, name: d.name, newCover: `${COS_BASE}/${img}`, oldCover: img });
    cos.push({ ...d, cover_image: `${COS_BASE}/${img}` });
  } else if (img.includes('cos.ap-guangzhou') || img.includes('/dishes/')) {
    cos.push(d);
  } else if (img.includes('supabase.co/storage')) {
    supabase.push(d);
  } else {
    other.push(d);
  }
}

console.log(`=== 修复前 ===`);
console.log(`总菜品: ${dishes.length}`);
console.log(`相对路径需补全: ${toUpdate.length}`);
console.log(`Supabase Storage 图: ${supabase.length}`);
console.log(`其他外链: ${other.length}`);
console.log();

// 3) 批量 PATCH 补前缀
let ok = 0;
for (const item of toUpdate) {
  const sp = new URLSearchParams({ id: `eq.${item.id}` });
  const pRes = await fetch(`${SUPABASE_URL}/dishes?${sp}`, {
    method: 'PATCH',
    headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ cover_image: item.newCover }),
  });
  if (pRes.ok) {
    console.log(`✅ ${item.name}: ${item.oldCover} → COS完整URL`);
    ok++;
  } else {
    console.error(`❌ ${item.name} 失败: HTTP ${pRes.status}`);
  }
}

// 4) 最终分类
console.log(`\n=== 最终统计 ===`);
const res2 = await fetch(`${SUPABASE_URL}/dishes?select=id,name,cover_image&order=name`, { headers: { apikey: KEY } });
const dishes2 = await res2.json();

const finalCos = dishes2.filter((d) => d.cover_image && d.cover_image.includes('cos.ap-guangzhou'));
const finalSupabase = dishes2.filter((d) => d.cover_image && d.cover_image.includes('supabase.co/storage'));
const finalOther = dishes2.filter((d) => d.cover_image && !d.cover_image.includes('cos') && !d.cover_image.includes('supabase'));
const finalNone = dishes2.filter((d) => !d.cover_image);

console.log(`COS 桶图: ${finalCos.length}`);
console.log(`Supabase Storage 图: ${finalSupabase.length}`);
console.log(`其他外链: ${finalOther.length}`);
console.log(`无图: ${finalNone.length}`);
console.log(`总计: ${dishes2.length}`);

if (finalOther.length) {
  console.log(`\n其他外链 (不在 COS 也不在 Supabase):`);
  for (const d of finalOther) {
    console.log(`  ${d.name}: ${d.cover_image?.slice(0, 80)}`);
  }
}
