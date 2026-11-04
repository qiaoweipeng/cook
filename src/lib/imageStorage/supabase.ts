// Supabase Storage 适配器。
//
// 这是当前唯一的生产适配器：匿名公钥 + RLS 策略直接上传到 public bucket。
// 换成腾讯 COS / 阿里 OSS 时，新增同目录下的 cos.ts / oss.ts 即可，
// 业务代码不需要知道桶在哪、URL 长什么样。

import { getSupabaseAuthHeaders, getSupabaseUrl } from '@/lib/supabase';
import { joinUrl, normalizeKey, parseSupabaseKey } from './paths';
import type { ImageStorageProvider } from './types';

/** 图片统一放在这个 bucket 里（建法见 supabase/storage.sql） */
const BUCKET = 'dish-images';

function storageBaseUrl(): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${BUCKET}`;
}

function objectUrl(key: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/${BUCKET}/${encodeURIComponent(
    normalizeKey(key)
  ).replace(/%2F/g, '/')}`;
}

export const supabaseImageProvider: ImageStorageProvider = {
  id: 'supabase',

  isEnabled(): boolean {
    return Boolean(getSupabaseUrl()) && Boolean(getSupabaseAuthHeaders().apikey);
  },

  /**
   * 上传（同名覆盖）。
   *
   * 头说明：
   *   - x-upsert: true 允许覆盖同名文件
   *   - cache-control 一年强缓存：图片文件名带时间戳（内容不变则 URL 不变），
   *     浏览器第二次起不再下载，这是省 egress 的关键
   */
  async upload(key: string, body: Blob, contentType: string): Promise<void> {
    const res = await fetch(objectUrl(key), {
      method: 'POST',
      headers: {
        ...getSupabaseAuthHeaders(),
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
  },

  /** 删除；用于「数据库没存住」时的回滚，保证桶和数据库一致 */
  async remove(key: string): Promise<void> {
    const res = await fetch(objectUrl(key), {
      method: 'DELETE',
      headers: getSupabaseAuthHeaders(),
    });
    // 404 = 对象本来就不在，按幂等处理；其他错误要暴露出来
    if (!res.ok && res.status !== 404) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Storage 删除失败（HTTP ${res.status}）：${detail.slice(0, 160)}`);
    }
  },

  publicUrl(key: string): string {
    return joinUrl(storageBaseUrl(), key);
  },

  parseKey(value: string): string | null {
    return parseSupabaseKey(value, BUCKET);
  },
};
