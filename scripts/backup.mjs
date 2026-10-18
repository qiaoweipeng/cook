#!/usr/bin/env node
/**
 * Supabase 全库备份 / 恢复
 *
 * 备份：把 14 张表全量导出成 JSON 文件
 *   pnpm backup
 *   pnpm backup -- --dir=../Dropbox/cook-backup      # 指定备份目录
 *
 * 恢复：用备份文件覆盖数据库（会先清空目标表，危险，需显式 --force）
 *   pnpm backup -- --restore=backups/20261018-203000.json --force
 *
 * 说明：用的是前端同一个 anon key + RLS，不需要额外密钥；
 *       表之间没有外键，所以恢复顺序无所谓。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const TABLES = [
  'dishes',
  'dish_tags',
  'dish_ingredients',
  'dish_steps',
  'ingredients',
  'users',
  'shopping_lists',
  'weekly_menus',
  'families',
  'family_members',
  'family_invites',
  'family_menu_audit',
  'login_logs',
  'op_logs',
];

const PAGE = 1000; // PostgREST 单次返回上限，超过要分页

// ---------------------------------------------------------------- 环境变量

function loadEnv() {
  let raw = '';
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    /* 忽略 */
  }
  const map = { ...process.env };
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return {
    url: (map.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''),
    key: map.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

const { url, key } = loadEnv();
if (!url || !key) {
  console.error('✘ 缺少环境变量，请先在 .env 里配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const API = `${url}/rest/v1`;
const HEADERS = {
  apikey: key,
  'Content-Type': 'application/json',
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
};

// ---------------------------------------------------------------- 参数

const argv = process.argv.slice(2);
const getArg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
};
const restoreFile = getArg('restore');
const outDir = getArg('dir') ?? 'backups';
const FORCE = argv.includes('--force');

// ---------------------------------------------------------------- 备份

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${API}/${table}?select=*`, {
      headers: { ...HEADERS, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) {
      throw new Error(`导出 ${table} 失败：HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

async function backup() {
  console.log(`导出目标：${url.replace('https://', '')}\n`);
  const dump = { _meta: { exportedAt: new Date().toISOString(), source: url.replace('https://', '') } };

  for (const t of TABLES) {
    const rows = await fetchAll(t);
    dump[t] = rows;
    console.log(`  ${t.padEnd(20)} ${rows.length} 行`);
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-');
  const dir = resolve(process.cwd(), outDir);
  const file = join(dir, `${stamp}.json`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(dump, null, 2));

  const kb = (readFileSync(file).length / 1024).toFixed(1);
  console.log(`\n✔ 已备份：${file}  (${kb} KB，共 ${TABLES.length} 张表)`);
}

// ---------------------------------------------------------------- 恢复

async function restore(file) {
  if (!FORCE) {
    console.error('✘ 恢复会先清空目标表再写入，属于破坏性操作。');
    console.error('  确认无误请加 --force：');
    console.error(`  pnpm backup -- --restore=${file} --force`);
    process.exit(1);
  }
  const dump = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`从 ${file} 恢复（备份时间 ${dump._meta?.exportedAt ?? '未知'}）\n`);

  for (const t of TABLES) {
    const rows = dump[t] ?? [];
    if (rows.length === 0) {
      console.log(`  ${t.padEnd(20)} 空，跳过`);
      continue;
    }
    // 清空：PostgREST 要求 DELETE 带过滤条件，用「主键不为空」覆盖全表
    const del = await fetch(`${API}/${t}?id=not.is.null`, {
      method: 'DELETE',
      headers: { apikey: key, Prefer: 'return=minimal' },
    });
    if (!del.ok) throw new Error(`清空 ${t} 失败：HTTP ${del.status}`);

    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE);
      const ins = await fetch(`${API}/${t}`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify(chunk),
      });
      if (!ins.ok) throw new Error(`写入 ${t} 失败：HTTP ${ins.status} ${(await ins.text()).slice(0, 200)}`);
    }
    console.log(`  ${t.padEnd(20)} ${rows.length} 行`);
  }
  console.log('\n✔ 恢复完成，建议刷新页面 / 清掉浏览器 IndexedDB 缓存再看');
}

// ---------------------------------------------------------------- 入口

restoreFile
  ? restore(resolve(process.cwd(), restoreFile)).catch((e) => {
      console.error('\n✘ 恢复失败：', e.message);
      process.exit(1);
    })
  : backup().catch((e) => {
      console.error('\n✘ 备份失败：', e.message);
      process.exit(1);
    });
