// 图片上传链路：
//   选择本地图片 → 等比缩放 → 转 WebP（不支持则退回 JPEG）→ 上传 Supabase Storage → 只把 URL 存进数据库
//
// 为什么不用 Base64 存库：Base64 会让数据库体积和每次同步的流量都涨几十倍（详见 README「图片存储方案」）。
// 对象存储里存的是真正的二进制文件，数据库里只留一个几十字节的 URL，图片还能被浏览器/CDN 缓存。
//
// 降级策略：Storage 没开通 / 上传失败时，自动退回「压缩后存 Base64」，
// 保证功能永远可用，只是没享受到对象存储的好处。

import { isCloudEnabled, storageUpload } from './supabase';

/** 最长边压到多少像素。手机上卡片显示不到 400px，1000px 已经很宽裕 */
const MAX_W = 1000;
/** WebP 质量，0.8 左右观感和体积最平衡 */
const QUALITY = 0.82;

export interface PickedImage {
  /** 最终存进数据库的字符串：Storage 的 URL，或降级后的 dataURL */
  url: string;
  /** true = 走了对象存储；false = 降级成 Base64 */
  viaStorage: boolean;
  /** 压缩后的体积（字节），给用户看一眼 */
  size: number;
}

/** 把文件读成 <img>（用 objectURL，比 FileReader 转 dataURL 快且不占内存） */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解析失败，换一张试试'));
    };
    img.src = url;
  });
}

/** canvas → Blob（支持 WebP 就用 WebP，否则退回 JPEG） */
function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    } else {
      resolve(null);
    }
  });
}

/**
 * 本地图片 → 压缩后的 Blob。
 * - 等比缩放到最长边 maxW（不放大）
 * - 优先 WebP；浏览器不支持 WebP 编码时自动退回 JPEG
 */
export async function compressImage(
  file: File,
  maxW = MAX_W,
  quality = QUALITY
): Promise<{ blob: Blob; ext: 'webp' | 'jpeg' }> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxW / (img.naturalWidth || img.width));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas 压缩');
  ctx.drawImage(img, 0, 0, w, h);

  let blob = await toBlob(canvas, quality);
  // toBlob 在不支持 WebP 时会静默产出一个非 webp 的结果，这里显式判断
  if (blob && blob.type === 'image/webp') return { blob, ext: 'webp' };

  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
  if (!jpeg) throw new Error('图片压缩失败');
  return { blob: jpeg, ext: 'jpeg' };
}

/** 压缩后转 dataURL（降级方案：不依赖对象存储） */
async function compressToDataUrl(file: File, maxW = MAX_W, quality = QUALITY): Promise<string> {
  const { blob } = await compressImage(file, maxW, quality);
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(blob);
  });
}

/** 上传到 Supabase Storage，返回可直接访问的公网 URL */
export async function uploadToStorage(
  file: File,
  folder: 'dishes' | 'ingredients'
): Promise<{ url: string; size: number }> {
  const { blob, ext } = await compressImage(file);
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await storageUpload(path, blob, blob.type || `image/${ext}`);
  return { url, size: blob.size };
}

/**
 * 统一入口：优先走对象存储，失败自动降级成 Base64。
 * 调用方只需要拿 `url` 存库，并通过 `viaStorage` 提示用户当前用的是哪种。
 */
export async function pickImage(
  file: File,
  folder: 'dishes' | 'ingredients'
): Promise<PickedImage> {
  if (!isCloudEnabled()) {
    const dataUrl = await compressToDataUrl(file);
    return { url: dataUrl, viaStorage: false, size: dataUrl.length };
  }
  try {
    const { url, size } = await uploadToStorage(file, folder);
    return { url, viaStorage: true, size };
  } catch (e) {
    // bucket 没建 / 没权限 / 网络问题 → 退回本地压缩图，不让用户传不了图
    console.warn('[image] 对象存储上传失败，退回 Base64：', e);
    const dataUrl = await compressToDataUrl(file);
    return { url: dataUrl, viaStorage: false, size: dataUrl.length };
  }
}

/** 把字节数显示成人话，用于提示「已压缩到 xx KB」 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
