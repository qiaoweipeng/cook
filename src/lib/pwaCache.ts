// 离线缓存的手动清理（「我的」页面里那个按钮用）
//
// 只清 Service Worker 相关的东西：SW 注册 + Cache Storage 里的缓存。
// **不动** IndexedDB / localStorage —— 那里面是菜品、食材、采购清单的业务数据，
// 清掉等于删用户数据，跟「清缓存」不是一回事。

export interface ClearResult {
  /** 注销掉的 Service Worker 数量 */
  sw: number;
  /** 删掉的缓存仓库数量 */
  caches: number;
}

export async function clearPwaCache(): Promise<ClearResult> {
  let sw = 0;
  let cacheNames: string[] = [];

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    sw = regs.length;
    await Promise.all(regs.map((r) => r.unregister()));
  }

  if ('caches' in window) {
    cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((k) => caches.delete(k)));
  }

  return { sw, caches: cacheNames.length };
}

/** 当前有没有注册 Service Worker（决定「清除缓存」按钮要不要显示） */
export function hasServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}
