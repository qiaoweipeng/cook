// 腾讯云 COS 适配器。
//
// 和 Supabase 适配器的最大区别：COS 的 SecretId/SecretKey 绝不能进前端，
// 所以上传/删除不直连 COS REST API，而是转发给 Netlify Function
// （netlify/functions/cos-upload.ts）用服务端密钥代签上传。
//
// 渲染（publicUrl）不涉及密钥，直接拼公网域名，浏览器/SW 直读桶。

import { joinUrl, normalizeKey, parseCosKey } from './paths';
import type { ImageStorageProvider } from './types';

/** 当前桶的公网访问域名（不带路径），构建时内联，形如 https://xxx-123.cos.ap-guangzhou.myqcloud.com */
const PUBLIC_BASE = (import.meta.env.VITE_COS_PUBLIC_BASE ?? '').trim().replace(/\/+$/, '');

/** 上传/删除共用的中转函数地址。
 *  - 线上/本地 netlify dev：默认相对路径 '/.netlify/functions/cos-upload' 走同域
 *  - 本地 pnpm dev：用 VITE_UPLOAD_FUNCTION_URL 指到线上部署好的 Function（省得本地装 netlify-cli）
 */
const FUNCTION_URL = (import.meta.env.VITE_UPLOAD_FUNCTION_URL ?? '/.netlify/functions/cos-upload').trim();

async function callFunction(
  method: 'POST' | 'DELETE',
  key: string,
  body?: Blob,
  contentType?: string
): Promise<void> {
  const headers: Record<string, string> = { 'x-object-key': normalizeKey(key) };
  const token = (import.meta.env.VITE_UPLOAD_TOKEN ?? '').trim();
  if (token) headers['x-upload-token'] = token;
  if (contentType) headers['Content-Type'] = contentType;

  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, { method, headers, body });
  } catch {
    throw new Error(
      '无法连接图片上传服务。本地开发请用 npx netlify dev 启动（vite dev 不带 Functions）；线上请确认 Functions 已部署。'
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `COS ${method === 'POST' ? '上传' : '删除'}失败（HTTP ${res.status}）：${detail.slice(0, 160)}`
    );
  }
}

export const cosImageProvider: ImageStorageProvider = {
  id: 'cos',

  isEnabled(): boolean {
    return Boolean(PUBLIC_BASE);
  },

  /** 上传：文件发给服务端函数，由它带密钥 PUT 到 COS（同名覆盖） */
  upload(key: string, body: Blob, contentType: string): Promise<void> {
    return callFunction('POST', key, body, contentType);
  },

  /** 删除：同样走服务端函数；对象不存在时函数按幂等返回成功 */
  remove(key: string): Promise<void> {
    return callFunction('DELETE', key);
  },

  publicUrl(key: string): string {
    return joinUrl(PUBLIC_BASE, key);
  },

  parseKey(value: string): string | null {
    return parseCosKey(value, PUBLIC_BASE);
  },
};
