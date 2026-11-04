// 图片存储统一入口 —— 业务代码只从这里导入。
//
// 当前实现：Supabase Storage（见 ./supabase.ts）。
// 以后换腾讯 COS / 阿里 OSS：
//   1. 新增 ./cos.ts 实现 ImageStorageProvider（上传走服务端签名/中转，密钥不进前端）
//   2. 把适配器加进下面的 PROVIDERS
//   3. 在 ./domains.ts 登记图片域名（否则 SW 不缓存）
//   4. 改环境变量 VITE_IMAGE_PROVIDER + 把旧桶对象按相同 key 复制到新桶
// 业务代码（上传、删除、<img src>）一行都不用改。

import { supabaseImageProvider } from './supabase';
import { cosImageProvider } from './cos';
import { isDirectImageUrl, normalizeKey } from './paths';
import type { ImageStorageProvider } from './types';

const PROVIDERS: ImageStorageProvider[] = [supabaseImageProvider, cosImageProvider];

const requested = (import.meta.env.VITE_IMAGE_PROVIDER ?? 'supabase').trim().toLowerCase();
const active: ImageStorageProvider =
  PROVIDERS.find((p) => p.id === requested) ?? supabaseImageProvider;

if (requested && requested !== active.id) {
  console.warn(
    `[imageStorage] 未知的 VITE_IMAGE_PROVIDER=${requested}，已回退到 ${active.id}`
  );
}

/** 当前生效的平台标识，便于页面/日志显示 */
export const IMAGE_PROVIDER_ID = active.id;

/** 当前存储是否可用（缺 URL / 缺公钥时为 false） */
export function isImageStorageEnabled(): boolean {
  return active.isEnabled();
}

/**
 * 从「任意平台的历史 URL」或「相对 key」解析出对象 key。
 * 解析不了（外部链接、Base64）返回 null。
 */
export function parseImageKey(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('data:') || v.startsWith('blob:')) return null;

  for (const p of PROVIDERS) {
    const key = p.parseKey(v);
    if (key) return key;
  }

  // 相对路径（如种子数据里的 `/seeds/xxx.webp`）不属于任何平台，也当 key 处理
  if (!isDirectImageUrl(v)) return normalizeKey(v) || null;
  return null;
}

/**
 * 数据库里存的值 → 浏览器可直接用的 src。
 *
 * 唯一允许拼 URL 的地方。规则：
 *   - data:/blob: → 原样
 *   - 已知平台的完整 URL → 抽出 key，再按**当前**平台拼（换平台后老数据自动指向新桶）
 *   - 相对 key → 按当前平台拼
 *   - 其他外链 → 原样
 */
export function resolveImageUrl(value?: string | null): string {
  if (!value) return '';
  const v = value.trim();
  if (!v) return '';
  if (v.startsWith('data:') || v.startsWith('blob:')) return v;

  const key = parseImageKey(v);
  if (key) return active.publicUrl(key);
  return v;
}

/** 上传一张图，成功返回 key（数据库只该存这个值） */
export async function uploadImage(
  key: string,
  body: Blob,
  contentType: string
): Promise<string> {
  if (!active.isEnabled()) {
    throw new Error('图片存储未配置（检查 VITE_IMAGE_PROVIDER 与对应平台的环境变量）');
  }
  await active.upload(key, body, contentType);
  return normalizeKey(key);
}

/** 删除一张图（传 key 或完整 URL 都可以） */
export async function deleteImage(value: string): Promise<void> {
  const key = parseImageKey(value);
  if (!key) throw new Error(`无法解析图片 key：${value.slice(0, 80)}`);
  await active.remove(key);
}
