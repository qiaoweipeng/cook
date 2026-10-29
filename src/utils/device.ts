// 设备类型判定（UA 级，不是宽度级）。
//
// 为什么不能用宽度：管理员后台的拦截规则是「Pad / 手机都禁入」，
// 而 useIsMobile 按宽度 <768 算，iPad 竖屏 768+ 会被漏过去放进后台。
// 设备类型运行期不变，所以是普通函数不是 hook。

/**
 * 是否为 PC（非手机/平板）。管理员后台只允许 PC 访问。
 * 触屏笔记本（Windows）返回 true —— 它是 PC，触屏只是附加输入。
 */
export function isPcDevice(): boolean {
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(ua)) return false;
  // iPadOS 13+ 默认以桌面模式请求网页，UA 伪装成 Macintosh；
  // Mac 全线产品没有触屏，触摸点数 > 1 的「Mac」一定是 iPad。
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return false;
  return true;
}
