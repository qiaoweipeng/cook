// 腾讯云 CloudBase PG 模式客户端
//   - 不再用 @cloudbase/js-sdk 的 database()（那是文档数据库）
//   - 改用 PostgREST REST API 直接调 PostgreSQL
//   - 认证用 Publishable Key（前端可公开的 JWT）

const ENV_ID = (import.meta.env.VITE_TCB_ENV_ID ?? '').trim();
const PUBLISHABLE_KEY = (import.meta.env.VITE_TCB_PUBLISHABLE_KEY ?? '').trim();

/** 是否启用了云端模式 */
export function isCloudEnabled(): boolean {
  return Boolean(ENV_ID) && Boolean(PUBLISHABLE_KEY);
}

/** 环境 ID（用于 UI 提示） */
export function getEnvId(): string {
  return ENV_ID;
}

function getBaseUrl(): string {
  return `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`;
}

// ---- 低层 fetch ----

type FetchOptions = RequestInit & {
  /** 查询参数对象，会拼到 URL 上 */
  query?: Record<string, string | number | undefined>;
  /** 是否返回单条（application/vnd.pgrst.object+json），结果会被包成对象 */
  single?: boolean;
  /** Prefer 头，比如 'return=representation' */
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
    throw new PgError(0, 'CloudBase 未配置（缺 ENV_ID 或 PUBLISHABLE_KEY）');
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
    Authorization: `Bearer ${PUBLISHABLE_KEY}`,
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
    // return=minimal 时也可能 204，否则解析 JSON
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

/** 统计表行数：HEAD + Prefer: count=exact，从 Content-Range 头解析（形如 `*\/42`）。
 *  select 用 * 而不是 id：有的表（如 dish_ingredients）没有 id 列。 */
export async function pgCount(table: string): Promise<number> {
  if (!isCloudEnabled()) throw new PgError(0, 'CloudBase 未配置');
  const url = `${getBaseUrl()}/${table}?select=*&limit=0`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) throw new PgError(res.status, `PostgREST ${res.status}`);
  const cr = res.headers.get('content-range') ?? '';
  const m = cr.match(/\/(\d+)/);
  if (!m) throw new PgError(0, `无法解析行数：${cr || '无 content-range 头'}`);
  return Number(m[1]);
}

export { PgError };
