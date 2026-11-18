// 图片存储统一入口 —— 业务代码只从这里导入。
//
// 设计原则：
//   1. 数据库存「相对 key」（如 dishes/xxx.webp），不存完整 URL
//   2. 换桶只改 VITE_IMAGE_PROVIDER，数据库一行不动
//   3. 不允许外链（百度/微博/anywhere）——外链不稳、跨域可能挂、也不符合「统一存储」原则
//      见 describeImageSource() 里的 EXTERNAL 分支
//
// 当前适配器：Supabase Storage + 腾讯云 COS（通过 VITE_IMAGE_PROVIDER 切）

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

/**
 * 判断一张图的存储来源，供 UI 显示来源标签。
 *
 * 返回：
 *   - { kind: 'none' }                         — 无图
 *   - { kind: 'local', label: '本地临时' }      — data:/blob:（截图粘贴、还没上传）
 *   - { kind: 'cos', label: '腾讯云 COS' }      — COS 桶的完整 URL
 *   - { kind: 'supabase', label: 'Supabase' }   — Supabase Storage 的完整 URL
 *   - { kind: 'external', label: '外链（不推荐）' } — 任何其他 http(s) 域名
 *   - { kind: 'key', label: '腾讯云 COS' | 'Supabase Storage', provider } — 相对 key
 */
export interface ImageSourceInfo {
  kind: 'none' | 'local' | 'cos' | 'supabase' | 'external' | 'key';
  /** UI 显示的可读标签 */
  label: string;
  /** 可选：相对 key 属于哪个 provider（用于区分 key 的来源） */
  provider?: string;
}

export function describeImageSource(value?: string | null): ImageSourceInfo {
  if (!value) return { kind: 'none', label: '无图' };
  const v = value.trim();
  if (!v) return { kind: 'none', label: '无图' };

  if (v.startsWith('data:') || v.startsWith('blob:')) {
    return { kind: 'local', label: '本地临时（尚未上传）' };
  }

  if (/^https?:\/\//i.test(v)) {
    if (/\.cos\.[a-z0-9-]+\.myqcloud\.com\//i.test(v)) {
      return { kind: 'cos', label: '腾讯云 COS' };
    }
    if (/supabase\.co\/storage\//i.test(v)) {
      return { kind: 'supabase', label: 'Supabase Storage' };
    }
    return { kind: 'external', label: '外链（不推荐）' };
  }

  // 相对 key（如 dishes/xxx.webp）—— 存的是哪个 provider 由当前 active 决定
  return { kind: 'key', label: active.id === 'cos' ? '腾讯云 COS' : 'Supabase Storage', provider: active.id };
}
