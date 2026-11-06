// 腾讯云 COS 上传/删除中转（Netlify Function）。
//
// 为什么需要它：COS 的 SecretId/SecretKey 不能进前端，
// 前端把文件 POST 到这里，函数用服务端密钥生成签名后调 COS REST API。
//
// 环境变量（Netlify 后台配，绝不带 VITE_ 前缀）：
//   COS_SECRET_ID / COS_SECRET_KEY  CAM 子账号密钥（编程访问 + QcloudCOSDataFullControl）
//   COS_BUCKET                      完整桶名，如 bigcook-1311958566
//   COS_REGION                      地域，如 ap-guangzhou
//   UPLOAD_TOKEN                    上传令牌，和前端的 VITE_UPLOAD_TOKEN 同值
//
// 防滥用（项目暂无登录体系，这是「挡住路过脚本」级别，不是真认证）：
//   - 上传令牌校验
//   - contentType 白名单（image/webp、image/jpeg、image/png）
//   - 单文件 ≤ 5MB
//   - key 前缀白名单（dishes/ ingredients/ seeds/ avatars/），禁止路径穿越

import { createHmac, createHash } from 'node:crypto';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
const ALLOWED_PREFIXES = ['dishes/', 'ingredients/', 'seeds/', 'avatars/'];

function hmacSha1(key: string, data: string): string {
  return createHmac('sha1', key).update(data).digest('hex');
}

function sha1(data: string): string {
  return createHash('sha1').update(data).digest('hex');
}

/**
 * COS XML API 签名（文档：https://cloud.tencent.com/document/product/436/7778）
 * 只把 host 和 content-type（如有）签进去，q-header-list 声明哪些头参与校验。
 */
function buildAuthorization(opts: {
  secretId: string;
  secretKey: string;
  method: string; // 小写，如 put / delete
  pathname: string; // 已编码，如 /dishes/a.webp
  headers: Record<string, string>;
}): string {
  const now = Math.floor(Date.now() / 1000);
  // 前后各留 60s 余量防时钟漂移，签名 10 分钟内有效
  const keyTime = `${now - 60};${now + 600}`;
  const signKey = hmacSha1(opts.secretKey, keyTime);

  const headerEntries = Object.entries(opts.headers)
    .map(([k, v]) => [k.toLowerCase(), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const headerStr = headerEntries.map(([k, v]) => `${k}=${v}`).join('&');
  const headerList = headerEntries.map(([k]) => k).join(';');

  const httpString = `${opts.method}\n${opts.pathname}\n\n${headerStr}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);

  return (
    `q-sign-algorithm=sha1&q-ak=${encodeURIComponent(opts.secretId)}` +
    `&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
    `&q-header-list=${headerList}&q-url-param-list=&q-signature=${signature}`
  );
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-object-key, x-upload-token',
  'Access-Control-Max-Age': '86400',
};

function ok(message = 'ok', status = 200): Response {
  // 204 No Content 禁止带 body（undici 的 Response 构造函数会直接抛错）
  if (status === 204) {
    return new Response(null, { status, headers: CORS_HEADERS });
  }
  return new Response(message, { status, headers: CORS_HEADERS });
}

function fail(status: number, message: string): Response {
  return new Response(message, { status, headers: CORS_HEADERS });
}

export default async (req: Request): Promise<Response> => {
  // OPTIONS 预检请求：浏览器跨域 POST/DELETE 会先发这个
  if (req.method === 'OPTIONS') {
    return ok('', 204);
  }
  const method = req.method;
  if (method !== 'POST' && method !== 'DELETE') {
    return fail(405, 'Method Not Allowed');
  }

  const {
    COS_SECRET_ID = '',
    COS_SECRET_KEY = '',
    COS_BUCKET = '',
    COS_REGION = '',
    UPLOAD_TOKEN = '',
  } = process.env;
  if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION) {
    return fail(500, '服务端缺少 COS_* 环境变量（Netlify → Site settings → Environment variables）');
  }

  // 上传令牌：Function 是公网地址，令牌能挡住不知道站点细节的随手调用。
  // 它随前端 bundle 发布，是半公开值，不等于身份认证。
  if (UPLOAD_TOKEN && req.headers.get('x-upload-token') !== UPLOAD_TOKEN) {
    return fail(403, '上传令牌不匹配');
  }

  const key = (req.headers.get('x-object-key') ?? '').trim().replace(/^\/+/, '');
  if (!key || key.includes('..') || !ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return fail(400, `非法的对象 key：${key.slice(0, 80)}`);
  }

  const host = `${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`;
  // key 由前端生成（时间戳+随机串.webp，纯 ASCII），逐段编码稳妥且对 ASCII 无影响
  const pathname = `/${key.split('/').map(encodeURIComponent).join('/')}`;
  const url = `https://${host}${pathname}`;

  const signedHeaders: Record<string, string> = { host };
  const extraHeaders: Record<string, string> = {};
  let body: ArrayBuffer | undefined;

  if (method === 'POST') {
    const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ALLOWED_TYPES.has(contentType)) {
      return fail(400, `不支持的文件类型：${contentType || '未知'}`);
    }
    body = await req.arrayBuffer();
    if (body.byteLength === 0) return fail(400, '文件内容为空');
    if (body.byteLength > MAX_SIZE) return fail(400, '文件超过 5MB 上限');
    signedHeaders['content-type'] = contentType;
    extraHeaders['Content-Type'] = contentType;
    // 文件名带时间戳（内容不变 URL 不变），一年强缓存 + immutable，省流量的关键
    extraHeaders['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  const authorization = buildAuthorization({
    secretId: COS_SECRET_ID,
    secretKey: COS_SECRET_KEY,
    method: method === 'POST' ? 'put' : 'delete',
    pathname,
    headers: signedHeaders,
  });

  let cosRes: Response;
  try {
    cosRes = await fetch(url, {
      method: method === 'POST' ? 'PUT' : 'DELETE',
      headers: { Authorization: authorization, ...extraHeaders },
      body,
    });
  } catch (e) {
    // fetch 本身失败（网络不通、签名错误导致 COS 返回非 HTTP 响应、DNS 解析不到等）
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return fail(502, `COS 调用 fetch 失败：${detail} | url=${url}`);
  }

  if (cosRes.ok) return ok();
  // 删除时对象不存在 = 幂等成功，保持和 Supabase 适配器一致
  if (method === 'DELETE' && cosRes.status === 404) return ok();

  const detail = await cosRes.text().catch(() => '');
  return fail(502, `COS 返回 HTTP ${cosRes.status}：${detail.slice(0, 200)}`);
};
