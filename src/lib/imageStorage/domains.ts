// 哪些跨域请求算「对象存储里的图片」——Service Worker 只对这类请求做缓存优先。
//
// 换平台检查清单里必须包含这一步：
// 只加适配器、不加域名，图片不走 SW 缓存，流量会重新烧起来（Supabase 那 5GB 就是这么爆的）。
//
// 只放静态正则，不读环境变量：sw.ts 是独立打包的，导入这里最安全。

interface HostRule {
  host: RegExp;
  /** 可选：进一步限制路径，避免把同域名的 API 请求也缓存了 */
  path?: RegExp;
}

const HOST_RULES: HostRule[] = [
  // Supabase Storage（当前使用）
  { host: /\.supabase\.co$/i, path: /^\/storage\/v1\/object\// },
  // 腾讯云 COS：<bucket>.cos.<region>.myqcloud.com
  { host: /\.myqcloud\.com$/i },
  // 阿里云 OSS：<bucket>.oss-<region>.aliyuncs.com
  { host: /\.aliyuncs\.com$/i },
];

export function isStorageImageRequest(url: URL): boolean {
  return HOST_RULES.some(
    (rule) => rule.host.test(url.host) && (!rule.path || rule.path.test(url.pathname))
  );
}
