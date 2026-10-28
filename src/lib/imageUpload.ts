// 图片上传链路：
//   选择本地图片 →（必要时）等比缩放 + 转 WebP → 上传 Supabase Storage → 只把 URL 存进数据库
//
// 「必要时」很关键：以前不管原图是什么格式都无脑重编码一次，
// 结果已经是 WebP 的图压完反而更大（原因见 compressImage 里的注释）。
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

/** 最终可能落地的文件格式 */
export type ImageExt = 'webp' | 'jpeg' | 'png' | 'gif';

/**
 * 只有认识的类型才允许「压缩完反而更大就退回原文件」——
 * 不认识的类型（比如 image/heic）只能走压缩路径，否则文件后缀会写错。
 */
const EXT_BY_MIME: Record<string, ImageExt> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
};

export interface PickedImage {
  /** 最终存进数据库的字符串：Storage 的公网 URL */
  url: string;
  /** true = 走了对象存储（目前恒为 true，Base64 降级已移除） */
  viaStorage: boolean;
  /** 压缩后的体积（字节），给用户看一眼 */
  size: number;
  /**
   * 桶内的对象路径（如 `dishes/xxx.webp`）。
   *
   * 存库失败时要用它把刚传上去的图删掉，保证「桶和数据库」始终一致：
   * 要么两边都有，要么两边都没有 —— 详见 DishEditor.onSave 里的回滚逻辑。
   */
  storagePath: string;
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
 * - 原图已经是 WebP 且尺寸不用缩：原样返回，一次都不重编码（原因见函数内注释）
 * - 其他情况：等比缩放到最长边 maxW（不放大）→ 优先 WebP，不支持则退回 JPEG
 * - 兜底：压完比原图还大的话，退回原文件，绝不越压越大
 */
export async function compressImage(
  file: File,
  maxW = MAX_W,
  quality = QUALITY
): Promise<{ blob: Blob; ext: ImageExt }> {
  const knownExt = EXT_BY_MIME[file.type];
  const img = await loadImage(file);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxW / (iw || maxW));

  /*
    原图已经是 WebP、而且尺寸不需要缩（scale === 1）时，一次都不重编码，直接原样上传。

    为什么非加这个判断不可 —— WebP 跟 JPEG 一样是**有损**格式。
    原图里已经带着上一轮压缩留下的块状伪影、振铃和色度噪声；
    把它解码回像素再编码一次，编码器会把这些伪影当成「细节」去忠实保留，
    而高频噪声恰恰是最难压的部分，占的 bit 最多 —— 于是输出反而比输入更大。
    这就是**代际损失**（generation loss）：每重编码一次，画质掉一点、体积可能涨一点。
    实测过的现象：一张压过一轮、不到 100KB 的 WebP，用 quality 0.82 再编一次能涨到 130KB。

    PNG 转 WebP 之所以能变小，是因为 PNG 是**无损**格式（deflate + 行滤波），本来就臃肿，
    换成有损编码属于降维打击，跟上面不是一回事。
    JPEG 转 WebP 通常也能再小 30~50%（WebP 的预测编码比 JPEG 的 DCT 更高效），所以值得压。

    结论：对「已经是有损格式 + 尺寸已达标」的输入，重编码没有任何收益，只有损失。
  */
  if (file.type === 'image/webp' && scale >= 1) {
    return { blob: file, ext: 'webp' };
  }

  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas 压缩');
  ctx.drawImage(img, 0, 0, w, h);

  let blob = await toBlob(canvas, quality);
  // toBlob 在不支持 WebP 时会静默产出一个非 webp 的结果，这里显式判断
  if (blob && blob.type === 'image/webp') {
    // 原图已经被压得很狠时，0.82 重编可能反而更大，那就用原来的文件
    if (knownExt && blob.size >= file.size) return { blob: file, ext: knownExt };
    return { blob, ext: 'webp' };
  }

  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
  if (!jpeg) throw new Error('图片压缩失败');
  if (knownExt && jpeg.size >= file.size) return { blob: file, ext: knownExt };
  return { blob: jpeg, ext: 'jpeg' };
}

/**
 * 压缩后转 dataURL。
 *
 * 目前用在头像上传：头像是存数据库 text 列的（不走 Storage），必须先把体积
 * 压小再存，否则用户列表每次加载都要把所有人的大头像跨境拉一遍。
 */
export async function compressToDataUrl(
  file: File,
  maxW = MAX_W,
  quality = QUALITY
): Promise<string> {
  const { blob } = await compressImage(file, maxW, quality);
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(blob);
  });
}

/**
 * 把已经存成 base64 的图（历史遗留数据）重新压缩成小尺寸 WebP dataURL。
 * 用途是「自愈」旧数据：旧头像上传时不压缩（一张能上 MB），拉到超大 base64
 * 就本地压一遍写回云端，下次起传输量回到几十 KB 级。
 */
export async function compressDataUrl(
  dataUrl: string,
  maxW: number,
  quality = QUALITY
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('图片解码失败'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxW / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas 压缩');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await toBlob(canvas, quality);
  if (!blob) throw new Error('图片压缩失败');
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(blob);
  });
}

/** 上传到 Supabase Storage，返回可直接访问的公网 URL + 桶内对象路径（供回滚用） */
export async function uploadToStorage(
  file: File,
  folder: 'dishes' | 'ingredients'
): Promise<{ url: string; size: number; path: string }> {
  const { blob, ext } = await compressImage(file);
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await storageUpload(path, blob, blob.type || `image/${ext}`);
  return { url, size: blob.size, path };
}

/**
 * 允许上传的格式：**静态**图片。
 *
 * GIF 这类动图不收：走压缩链路会被重编码成静态图，动画直接没了；
 * 原样上传又太占对象存储（动图动辄好几 MB）。所以干脆在入口拦掉，
 * 而不是只写一句「支持 JPG / PNG」的提示然后照单全收。
 */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
/** 喂给 <input accept> / antd Upload 的属性 */
export const IMAGE_ACCEPT = ALLOWED_MIME.join(',');

/**
 * 是不是 HEIC / HEIF —— iPhone 拍的照片默认的原图格式。
 *
 * 扩展名必须一起查，光看 MIME 会漏：浏览器对 .heic 的识别很不一致，
 * Chrome 有时给 image/heic、有时给 image/heif，Windows 上还经常直接给空字符串。
 */
function isHeic(file: File): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.(heic|heif|heics|hif)$/i.test(file.name);
}

/**
 * 上传前的格式校验。通过返回 null，不通过返回要直接提示给用户的文案。
 *
 * 光靠 accept 拦不住：用户在系统文件选择器里切成「所有文件」照样能选到 GIF ——
 * accept 只是给选择器的**建议**，不是约束。所以要在这再查一次真实的 MIME。
 */
export async function validateImageFile(file: File): Promise<string | null> {
  // HEIC / HEIF 单独点名拦掉：iPhone 原图格式，桌面 Chrome / Firefox 没有解码器，
  // 放进白名单也只会在 loadImage 那一步失败报「图片解析失败」，不如入口就把话说清楚。
  // 最容易撞上它的场景是从 iPhone「文件」App 里选原图；从相册选通常已经转好 JPG 了。
  if (isHeic(file)) {
    return '不支持 HEIC / HEIF（iPhone 原图格式），请先导出成 JPG 再上传';
  }

  if (!ALLOWED_MIME.includes(file.type)) {
    if (file.type === 'image/gif') {
      return '不支持 GIF 动图，请换成 JPG / PNG / WebP 静态图片';
    }
    return `不支持的格式（${file.type || '未知'}），仅支持 JPG / PNG / WebP`;
  }

  // WebP 也有动态版本（animated WebP），容器里带 ANIM / ANMF 块，
  // MIME 跟静态 WebP 一模一样，只能拆开文件头看。
  // ANIM 块就在文件最开头，扫前 4KB 足够。
  if (file.type === 'image/webp') {
    const head = new TextDecoder('latin1').decode(await file.slice(0, 4096).arrayBuffer());
    if (head.includes('ANIM') || head.includes('ANMF')) {
      return '不支持动态 WebP，请换成静态图片';
    }
  }

  return null;
}

/**
 * 统一入口：压缩 → 上传对象存储 → 返回 URL。
 *
 * ⚠️ 这里以前有个「失败自动降级成 Base64」的分支，已经**删掉**了。
 *
 * 那个降级是「图片丢失」的元凶：上传失败时它不报错，悄悄把图片转成 Base64
 * 存进数据库字段，界面照样提示「已保存」。但 Base64 一条能占几十 KB 到几 MB，
 * 一旦撑爆请求/超时，写入同样失败 —— 而用户看到的仍然是「保存成功」。
 * 结果就是：图进了 Storage 桶（或根本没进去）、数据库里没有地址、
 * 换个设备 / 清一次缓存从云端重拉，图片全没了，全程零报错。
 *
 * 现在：**能上传就上传，不能上传就明确失败**。
 * 失败必须让用户看见，否则就是在骗人。
 */
export async function pickImage(
  file: File,
  folder: 'dishes' | 'ingredients'
): Promise<PickedImage> {
  const invalid = await validateImageFile(file);
  if (invalid) throw new Error(invalid);

  if (!isCloudEnabled()) {
    throw new Error('未配置云端（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），无法上传图片');
  }

  try {
    const { url, size, path } = await uploadToStorage(file, folder);
    return { url, viaStorage: true, size, storagePath: path };
  } catch (e) {
    // 不再降级、不再假装成功，原样把失败抛给界面提示用户
    console.error('[image] 上传失败：', e);
    const detail = e instanceof Error ? e.message : String(e ?? '');
    throw new Error(`图片上传失败${detail ? '：' + detail.slice(0, 200) : '，请稍后重试'}`);
  }
}

/** 把字节数显示成人话，用于提示「已压缩到 xx KB」 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
