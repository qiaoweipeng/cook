// 本地缓存的存储后端：IndexedDB（容量几百 MB，不再受 localStorage 5MB 限制）
// 背景：菜品图片是 base64 文本，之前存 localStorage 很快就爆了 5MB 配额
// 用法：
//   persist 配置里加  storage: idbStorage
//   异步读取（load 等）开头加  await whenHydrated(useXxxStore)

import localforage from 'localforage';
import { createJSONStorage } from 'zustand/middleware';

localforage.config({
  name: 'cook',
  storeName: 'app_cache',
  description: '菜谱应用的本地缓存（菜品/食材/菜单/购物清单）',
});

/** zustand persist 的 IndexedDB 存储 */
export const idbStorage = createJSONStorage(() => localforage);

interface PersistApi {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: (state: unknown) => void) => () => void;
  };
}

/**
 * 等待 persist 从 IndexedDB 恢复完缓存。
 * IndexedDB 是异步的，不等的话可能出现「云端新数据刚 set，又被旧缓存覆盖」的时序问题。
 */
export function whenHydrated(store: PersistApi): Promise<void> {
  return new Promise((resolve) => {
    if (store.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/** 清掉旧版本存在 localStorage 里的缓存（已搬到 IndexedDB，顺手释放 5MB 配额） */
export function clearLegacyLocalCache(): void {
  for (const key of ['cook-dishes', 'cook-ingredients', 'cook-weekly', 'cook-shopping']) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略（比如隐私模式禁用 localStorage）
    }
  }
}
