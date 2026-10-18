// 「按用户隔离」的 store 统一收口
//
// shopping（采购清单）、weekly（菜单，按日期）、family（家庭）这三份数据都是 per-user 的，
// 但它们是全局单例 store，内存里会留着上一个用户的数据。
// 一旦出现「uid 变了但某个 load() 还没回来 / 失败了」的窗口，新用户就会看到上一个用户的内容。
//
// 所以约定：**任何切换登录用户的入口，都必须先 reset 再 load**，不要只 load。

import { useShoppingStore } from './useShoppingStore';
import { useWeeklyStore } from './useWeeklyStore';
import { useFamilyStore } from './useFamilyStore';
import { isCloudEnabled } from '@/lib/supabase';

/** 清掉上一个用户留在内存里的 per-user 数据（同时会让 UI 回到 loading 态） */
export function resetUserScopedStores(): void {
  useShoppingStore.getState().resetForUser();
  useWeeklyStore.getState().resetForUser();
  useFamilyStore.getState().resetForUser();
}

/** reset 之后按「当前登录用户」重新拉一遍；单个 store 失败不影响其他 */
export async function reloadUserScopedStores(): Promise<void> {
  if (!isCloudEnabled()) return;
  await Promise.allSettled([
    useShoppingStore.getState().load(),
    useWeeklyStore.getState().load(),
    useFamilyStore.getState().load(),
  ]);
}

/** 切换用户时的标准动作：先清，再拉 */
export async function switchUserScopedStores(): Promise<void> {
  resetUserScopedStores();
  await reloadUserScopedStores();
}
