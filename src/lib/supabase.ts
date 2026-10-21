// Supabase PostgreSQL 客户端
//   - Supabase 的数据 API 就是标准 PostgREST，所以这里保持和原来一样的调用方式
//   - 认证用 anon key（前端可公开的 JWT），配合表的 RLS 策略使用
//   - 站点地址：https://<project-ref>.supabase.co/rest/v1

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** 是否启用了云端模式 */
export function isCloudEnabled(): boolean {
  return Boolean(SUPABASE_URL) && Boolean(ANON_KEY);
}

// 只在真正缺失时提示，避免正常使用时刷屏。
// 常见场景：托管平台（Netlify 等）构建时没配环境变量 → 页面显示「本地模式」
if (!isCloudEnabled()) {
  const missing = [
    SUPABASE_URL ? '' : 'VITE_SUPABASE_URL',
    ANON_KEY ? '' : 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean);
  console.warn(
    `[supabase] 未配置云端变量：${missing.join('、')}。\n` +
      '注意 Vite 的环境变量在 **构建时** 就被内联进 bundle，' +
      '托管平台（Netlify 等）必须在 Site settings → Environment variables 里单独配一份，' +
      '本地有 .env 没用（.env 已被 git 忽略）。'
  );
}

/** 云端地址（用于 UI 提示） */
export function getCloudHost(): string {
  if (!SUPABASE_URL) return '';
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return SUPABASE_URL;
  }
}

function getBaseUrl(): string {
  return `${SUPABASE_URL}/rest/v1`;
}

/**
 * 每个请求都要带的认证头。
 *
 * Supabase 有两代 key，两者可以并存（旧版 2026 年底弃用）：
 *   1) 旧版 anon key：JWT，形如 eyJhbGciOi... → apikey 和 Authorization: Bearer 都要带
 *   2) 新版 publishable key：形如 sb_publishable_xxx，**不是 JWT** → 只能放 apikey 头
 *      官方文档明确：非 JWT 的 key 放 Bearer 会因 JWT 校验失败，必须只走 apikey 头
 *
 * 这里按 key 前缀自动判断用哪种方式，填哪种都能跑。
 */
function authHeaders(): Record<string, string> {
  const isLegacyJwt = ANON_KEY.startsWith('eyJ');
  return {
    apikey: ANON_KEY,
    ...(isLegacyJwt ? { Authorization: `Bearer ${ANON_KEY}` } : {}),
  };
}

// ---- 低层 fetch ----

type FetchOptions = RequestInit & {
  /** 查询参数对象，会拼到 URL 上 */
  query?: Record<string, string | number | undefined>;
  /** 是否返回单条（application/vnd.pgrst.object+json），结果会被包成对象 */
  single?: boolean;
  /** Prefer 头，比如 'return=representation' / 'count=exact' */
  prefer?: string;
  /** 超时毫秒，默认 60000（图片上传需要更长时间） */
  timeout?: number;
};

class PgError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'PgError';
  }
}

export async function pgFetch(path: string, opts: FetchOptions = {}): Promise<any> {
  if (!isCloudEnabled()) {
    throw new PgError(0, 'Supabase 未配置（缺 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY）');
  }
  const { query, single, prefer, timeout = 60000, headers, ...rest } = opts;
  let url = `${getBaseUrl()}/${path.replace(/^\/+/, '')}`;
  if (query) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
    }
    const s = sp.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const h: Record<string, string> = {
    ...authHeaders(),
    Accept: single ? 'application/vnd.pgrst.object+json' : 'application/json',
    ...((headers as Record<string, string>) ?? {}),
  };
  if (prefer) h['Prefer'] = prefer;
  if (rest.body && !h['Content-Type']) h['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...rest, headers: h, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new PgError(res.status, `PostgREST ${res.status}: ${text || res.statusText}`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) return await res.json();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 常用 CRUD 封装 ----

/** 查表：query 里写 PostgREST 过滤表达式，比如 { id: 'eq.dish_001' } */
export async function pgSelect<T = any>(
  table: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T[]> {
  return (await pgFetch(table, { method: 'GET', query })) as T[];
}

/** 查一条：单对象返回 */
export async function pgSelectOne<T = any>(
  table: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T | null> {
  const res = await pgFetch(table, { method: 'GET', query, single: true });
  return (res as any) ?? null;
}

/** 插入一行或多行。返回写入后的数据（带 Prefer: return=representation） */
export async function pgInsert<T = any>(table: string, rows: object | object[]): Promise<T[]> {
  const body = JSON.stringify(Array.isArray(rows) ? rows : [rows]);
  return (await pgFetch(table, {
    method: 'POST',
    body,
    prefer: 'return=representation',
  })) as T[];
}

/** 按主键删除：DELETE /<table>?id=eq.<id> */
export async function pgDeleteById(table: string, id: string): Promise<void> {
  await pgFetch(table, { method: 'DELETE', query: { id: `eq.${id}` } });
}

/** 按主键更新：PATCH /<table>?id=eq.<id> */
export async function pgUpdateById<T = any>(table: string, id: string, patch: object): Promise<T[]> {
  return (await pgFetch(table, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    query: { id: `eq.${id}` },
    prefer: 'return=representation',
  })) as T[];
}

/**
 * 统计表行数：HEAD + Prefer: count=exact，从 Content-Range 头解析（形如 `*\/42`）。
 * select 用 * 而不是 id：有的表（如 dish_ingredients）没有 id 列。
 * Supabase 默认的单次返回上限是 1000 行，这里只数不取，不受影响。
 */
export async function pgCount(table: string): Promise<number> {
  if (!isCloudEnabled()) throw new PgError(0, 'Supabase 未配置');
  const url = `${getBaseUrl()}/${table}?select=*&limit=0`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      ...authHeaders(),
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) throw new PgError(res.status, `PostgREST ${res.status}`);
  const cr = res.headers.get('content-range') ?? '';
  const m = cr.match(/\/(\d+)/);
  if (!m) throw new PgError(0, `无法解析行数：${cr || '无 content-range 头'}`);
  return Number(m[1]);
}

/** 连通性自检：能不能读到 users 表（失败会抛出 PgError） */
export async function pingCloud(): Promise<boolean> {
  await pgCount('users');
  return true;
}

// ---- 对象存储（Storage）----

/** 图片统一放在这个 bucket 里（建法见 supabase/storage.sql） */
export const IMAGE_BUCKET = 'dish-images';

/** 公开 bucket 里某个文件的访问地址 */
export function storagePublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
}

/**
 * 删掉 Storage 里的一个文件 —— 用于「回滚」：数据库没存住地址时，
 * 把刚传上去的图一并删掉，避免桶里留下没人引用的孤儿文件。
 */
export async function storageDelete(path: string): Promise<void> {
  await pgFetch(`${IMAGE_BUCKET}/${path}`, { method: 'DELETE' });
}

/**
 * 从「完整 URL」或「相对路径」反推出桶内的对象路径，失败返回 null。
 * storageDelete 需要它：库里存的是 URL，删的时候要的是 `dishes/xxx.webp`。
 */
export function storagePathFromUrl(value: string): string | null {
  if (!value) return null;
  let p = value.trim();
  if (p.startsWith('data:') || p.startsWith('blob:')) return null; // 不是桶里的文件
  // 完整 URL → 截出 /storage/v1/object/public/dish-images/ 后面的部分
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const i = p.indexOf(marker);
  if (i >= 0) return p.slice(i + marker.length);
  // 相对路径 /dishes/xxx.webp 或 dishes/xxx.webp
  if (p.startsWith('/')) return p.replace(/^\/+/, '');
  if (!/^https?:\/\//i.test(p)) return p;
  return null;
}

/**
 * 把数据库里存的图片字段解析成浏览器能直接用的 src。
 *
 * ⚠️ 这个坑踩过：数据库里存的**不一定是完整 URL**，有三种形态混在一起 ——
 *   1. 完整 URL   `https://xxx.supabase.co/storage/v1/object/public/dish-images/dishes/xxx.webp`
 *                 （`storageUpload` 的返回值就是这种）
 *   2. 相对路径   `/dishes/xxx.jpg`（手动粘贴、或历史数据）
 *   3. Base64     `data:image/webp;base64,...`（Storage 挂了时的降级方案）
 *
 * 之前所有渲染处都是 `src={dish.coverImage}` 直接用，第 2 种就会去请求
 * **你自己网站域名下的 /dishes/xxx.jpg**，那个路径当然不存在 → 404 → 白图。
 * 桶里的文件其实好好的，只是没人把它拼成完整地址。
 *
 * 所以渲染前**一律**过这个函数，别再直接 src={xxx}。
 */
export function resolveImageUrl(value?: string | null): string {
  if (!value) return '';
  const v = value.trim();
  if (!v) return '';
  // Base64 / data URI：原样用
  if (v.startsWith('data:')) return v;
  // blob: 预览用
  if (v.startsWith('blob:')) return v;
  // 已经是完整 http(s) 地址
  if (/^https?:\/\//i.test(v)) return v;
  // 站内绝对路径 /xxx → 拼到 bucket 公共地址后面
  if (v.startsWith('/')) return storagePublicUrl(v.replace(/^\/+/, ''));
  // 裸路径 dishes/xxx.jpg
  return storagePublicUrl(v);
}

/**
 * 上传文件到 Storage（同名自动覆盖）。
 * 返回的 URL 直接存进数据库的 text 字段即可，浏览器会走 CDN 缓存。
 *
 * 头说明：
 *   - `x-upsert: true` 允许覆盖同名文件
 *   - `cache-control` 给一年强缓存：图片内容不变（每次上传都是新文件名），浏览器第二次起不再下载
 */
export async function storageUpload(
  path: string,
  body: Blob,
  contentType: string
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': contentType,
      'x-upsert': 'true',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Storage 上传失败（HTTP ${res.status}）：${detail.slice(0, 160)}`);
  }
  return storagePublicUrl(path);
}

export { PgError };
