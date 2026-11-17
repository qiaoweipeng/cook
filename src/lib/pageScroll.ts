/*
  页面滚动位置记忆。

  场景：首页往下翻了很多屏 → 点进菜品详情 → 返回。
  不记位置的话只能回到顶部，用户还得重新翻一遍。

  位置只存在内存里：重新打开 App（页面重新加载）就清空，本来也是重新开始看。
*/
const positions = new Map<string, number>();

export function savePageScroll(path: string, y: number) {
  positions.set(path, y);
}

export function getPageScroll(path: string) {
  return positions.get(path);
}

/*
  「这次进入该页面要还原到 y」的标记：由路由层打，由页面自己消费。

  为什么不让路由层直接滚：列表页是分批渲染的，路由层滚的时候页面高度往往还不够，
  一滚就被截断（表现就是停在底部 loading 上）。页面自己消费这个目标值，
  就能一边补渲染一边滚，直到真正滚到位。
*/
let restoreTarget: { path: string; y: number } | null = null;

export function markScrollRestore(path: string, y: number) {
  restoreTarget = { path, y };
}

export function clearScrollRestore() {
  restoreTarget = null;
}

/*
  取出「本次进入该页面要还原到 y」的目标值。

  这里只读不清：StrictMode 下组件的 layout effect 会执行两次（第一次会被 cleanup），
  如果第一次就消费掉，第二次拿不到值，恢复就完全不会发生。
  标记由路由层在每次导航时重新 mark 或 clear，不会残留。
*/
export function peekScrollRestore(path: string) {
  if (!restoreTarget || restoreTarget.path !== path) return null;
  return restoreTarget.y;
}
