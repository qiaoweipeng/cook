// key / URL 的纯函数工具。
//
// 这里只放「不依赖环境变量、不依赖网络」的逻辑 —— 方便单测，
// 也让各平台适配器共用同一套拼接/解析规则，避免各写一份。

/** data: / blob: / http(s): 这类值本身就能直接给浏览器用 */
export function isDirectImageUrl(value: string): boolean {
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    /^https?:\/\//i.test(value)
  );
}

/** 去掉首尾空白和开头的斜杠：`/dishes/a.webp` → `dishes/a.webp` */
export function normalizeKey(value: string): string {
  return value.trim().replace(/^\/+/, '');
}

/** decodeURIComponent 的容错版：历史数据里可能有非法编码，原样返回比整条解析失败更好 */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * 拼 `base + key`，path 逐段 URL 编码。
 *
 * 为什么逐段编码而不是整串 encodeURIComponent：
 * key 里的 `/` 是目录分隔符，整串编码会把它变成 %2F，对象存储找不到文件。
 */
export function joinUrl(base: string, key: string): string {
  const segments = normalizeKey(key).split('/').map(encodeURIComponent);
  return `${base.replace(/\/+$/, '')}/${segments.join('/')}`;
}

/**
 * Supabase Storage 的 key 解析：
 *   - 完整 URL：截 `/storage/v1/object/public/<bucket>/` 之后的部分
 *   - 相对路径：`/seeds/a.webp`、`dishes/a.webp` 都原样归一化
 *   - 其他平台的 http(s) 地址 / Base64：返回 null
 */
export function parseSupabaseKey(value: string, bucket: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('data:') || v.startsWith('blob:')) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = v.indexOf(marker);
  if (i >= 0) {
    const raw = v.slice(i + marker.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      // 历史数据里可能有非法编码，原样返回比整条解析失败更好
      return raw;
    }
  }

  if (/^https?:\/\//i.test(v)) return null;
  const key = normalizeKey(v);
  return key || null;
}

/**
 * 腾讯云 COS 的 key 解析：
 *   - 本桶完整 URL（以 publicBase 开头）→ 截域名后的部分
 *   - 其他 COS 域名 URL（换桶前的旧桶）→ 同样截出 key，保证换桶后老数据还能解析
 *   - 相对路径原样归一化；data:/blob:/非 COS 外链返回 null
 */
export function parseCosKey(value: string, publicBase: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('data:') || v.startsWith('blob:')) return null;

  const base = publicBase.trim().replace(/\/+$/, '');
  if (base && v.startsWith(`${base}/`)) {
    return safeDecode(v.slice(base.length + 1));
  }

  // 任意 COS 域名（<bucket>.cos.<region>.myqcloud.com/<key>）
  const m = v.match(/^https?:\/\/[^/]+\.cos\.[a-z0-9-]+\.myqcloud\.com\/(.+)$/i);
  if (m) return safeDecode(m[1]);

  if (/^https?:\/\//i.test(v)) return null;
  const key = normalizeKey(v);
  return key || null;
}
