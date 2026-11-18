/**
 * 封面图统一迁移：所有菜品/食材的图片 → COS 相对 key
 *
 * 分三类处理：
 *   1. Supabase Storage URL → 提取 key → 直接改成相对路径（COS 桶里已有文件）
 *   2. 完整 COS URL → 提取 key → 改成相对路径（同样是"存相对 key"的原则）
 *   3. 外链（百度/微博/anywhere）→ 下载 → POST 到 Netlify Function 上传 COS → 存相对路径
 *
 * 用法：node scripts/migrate-images.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const env = {};
readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const SUPABASE_URL = env.VITE_SUPABASE_URL + '/rest/v1';
const KEY = env.VITE_SUPABASE_ANON_KEY;
const COS_BASE = env.VITE_COS_PUBLIC_BASE.replace(/\/+$/, '');
const FUNC_URL = env.VITE_UPLOAD_FUNCTION_URL || '/.netlify/functions/cos-upload';
const FUNC_TOKEN = env.VITE_UPLOAD_TOKEN;

const H = { apikey: KEY, 'Content-Type': 'application/json' };

// ---------- 工具 ----------

/** 从 Supabase Storage URL 提取 key */
function parseSupabase(url, bucketName = 'dish-images') {
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const i = url.indexOf(marker);
  if (i >= 0) {
    try { return decodeURIComponent(url.slice(i + marker.length)); } catch { return url.slice(i + marker.length); }
  }
  return null;
}

/** 从 COS URL 提取 key */
function parseCos(url) {
  const base = COS_BASE;
  if (base && url.startsWith(`${base}/`)) {
    try { return decodeURIComponent(url.slice(base.length + 1)); } catch { return url.slice(base.length + 1); }
  }
  const m = url.match(/^https?:\/\/[^/]+\.cos\.[a-z0-9-]+\.myqcloud\.com\/(.+)$/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return null;
}

function classify(url) {
  if (!url) return { kind: 'none' };
  if (url.startsWith('data:') || url.startsWith('blob:')) return { kind: 'local' };
  if (parseSupabase(url)) return { kind: 'supabase', key: parseSupabase(url) };
  if (parseCos(url)) return { kind: 'cos', key: parseCos(url) };
  if (/^https?:\/\//i.test(url)) return { kind: 'external' };
  // 相对路径
  const norm = url.trim().replace(/^\/+/, '');
  if (norm) return { kind: 'key', key: norm };
  return { kind: 'none' };
}

/** POST 到 Netlify Function 上传到 COS */
async function uploadToCos(key, fileBytes, contentType) {
  const res = await fetch(FUNC_URL, {
    method: 'POST',
    headers: {
      'x-object-key': key,
      'x-upload-token': FUNC_TOKEN,
      'Content-Type': contentType,
    },
    body: fileBytes,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`COS 上传 HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return true;
}

/** 下载外链图片 */
async function downloadExternal(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return { buf, contentType: ct };
}

function extFromMime(ct, fallback = 'jpg') {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[ct] || fallback;
}

function randomId(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// ---------- 主流程 ----------

console.log('=== 图片统一迁移：全部走 COS 相对 key ===\n');

const TABLES = [
  { table: 'dishes', folder: 'dishes', coverField: 'cover_image' },
  { table: 'ingredients', folder: 'ingredients', coverField: 'image' },
];

let totalPatched = 0;
let totalUploaded = 0;
let totalSkipped = 0;

for (const { table, folder, coverField } of TABLES) {
  console.log(`\n--- ${table}.${coverField} ---`);
  const res = await fetch(`${SUPABASE_URL}/${table}?select=id,name,${coverField}`, { headers: H });
  const rows = await res.json();
  if (!Array.isArray(rows)) { console.error(`拉 ${table} 失败`); continue; }

  for (const row of rows) {
    const url = row[coverField];
    if (!url) { totalSkipped++; continue; }

    const c = classify(url);

    if (c.kind === 'key') {
      // 已经是相对 key —— 检查前缀对不对（可能是旧的 /seeds/）
      if (!c.key.startsWith(`${folder}/`)) {
        const newKey = c.key.replace(/^\/+/, '');
        await patch(table, row.id, coverField, newKey);
        console.log(`  ➡️ ${row.name}: ${url} → ${newKey}`);
        totalPatched++;
      } else {
        totalSkipped++; // 已经对了
      }
      continue;
    }

    if (c.kind === 'cos' || c.kind === 'supabase') {
      // COS URL 或 Supabase URL —— 提取 key，改成相对路径
      await patch(table, row.id, coverField, c.key);
      const tag = c.kind === 'cos' ? 'COS' : 'Supabase→COS';
      console.log(`  ✂️  ${row.name}: ${tag} URL → ${c.key}`);
      totalPatched++;
      continue;
    }

    if (c.kind === 'local') {
      console.log(`  ⚠️  ${row.name}: data/blob — 跳过（需要重新上传）`);
      totalSkipped++;
      continue;
    }

    if (c.kind === 'external') {
      // 外链 —— 下载 → 上传 COS → 存相对 key
      console.log(`  ↓  ${row.name}: 下载外链…`);
      try {
        const { buf, contentType } = await downloadExternal(url);
        const ext = extFromMime(contentType);
        const newKey = `${folder}/${randomId()}.${ext}`;
        await uploadToCos(newKey, buf, contentType);
        await patch(table, row.id, coverField, newKey);
        console.log(`  ✅ ${row.name}: 外链 → ${newKey} (${buf.length} bytes)`);
        totalUploaded++;
      } catch (e) {
        console.error(`  ❌ ${row.name} 外链处理失败: ${e.message}`);
      }
      continue;
    }

    totalSkipped++;
  }
}

console.log(`\n=== 完成 ===`);
console.log(`已有 key 补齐前缀: ${totalPatched}`);
console.log(`外链下载上传 COS:  ${totalUploaded}`);
console.log(`跳过（已是相对 key）: ${totalSkipped}`);

async function patch(table, id, field, value) {
  const sp = new URLSearchParams({ id: `eq.${id}` });
  const r = await fetch(`${SUPABASE_URL}/${table}?${sp}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ [field]: value }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`PATCH ${table} ${id} HTTP ${r.status}: ${txt.slice(0, 160)}`);
  }
}
