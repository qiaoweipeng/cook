// 记下用户主动删掉的「种子数据」id。
//
// 背景：两个 store 的 load 现在会把种子里新增的内容补进云端（只加不删，见各自的 load）。
// 但用户自己删掉的那几项不能跟着补回来 —— 否则每次刷新都复活，删了等于没删。
//
// 刻意只写 localStorage、不进 zustand 的 persist：
// 走 persist 就得 bump storage version 再写 migrate，为这点事动 schema 不划算。
// 代价是换设备 / 清缓存后记录会丢，那种情况下删过的东西会回来一次，可以接受。

export const DISMISSED_DISHES_KEY = 'cook:deleted-seed-dishes';
export const DISMISSED_INGREDIENTS_KEY = 'cook:deleted-seed-ingredients';

function readRaw(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    // localStorage 被禁或数据坏了：退化成「什么都不记得」，最坏是删过的东西复活
    return [];
  }
}

/** load 补种子时用：这些 id 跳过，不要补 */
export function readDismissed(key: string): Set<string> {
  return new Set(readRaw(key));
}

/** remove 时调：删的是种子数据就记一笔 */
export function dismissSeed(key: string, id: string): void {
  try {
    const next = new Set(readRaw(key));
    next.add(id);
    localStorage.setItem(key, JSON.stringify([...next]));
  } catch {
    /* 写不进去就算了，不影响主流程 */
  }
}

/** 「重置为种子」时调：既然要完整种子，就别再记着删过什么 */
export function clearDismissed(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
}
