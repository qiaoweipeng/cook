// 移动端屏蔽开发者工具快捷键。
//
// 先说清楚能做到什么程度：DevTools 是浏览器自己的功能，网页没法真正关掉它。
// 页面能做的只有「在 keydown 阶段拦下按键」——用键盘 F2 / F12 / Ctrl+Shift+I 这种入口，
// 拦得住；从浏览器菜单里点「开发者工具」，拦不住。
// 所以这里的目的不是安全，只是别让接外接键盘的 iPad 误触把调试面板弹出来。

const BLOCKED_FN_KEYS = new Set(['F2', 'F12']);

function isDevtoolsShortcut(e: KeyboardEvent): boolean {
  if (BLOCKED_FN_KEYS.has(e.key)) return true;

  const key = e.key.toUpperCase();

  // Chrome / Edge / Firefox：Ctrl+Shift+I（检查器）、Ctrl+Shift+J（控制台）、Ctrl+Shift+C（元素选择）
  // macOS 上是 ⌘+⌥+I / ⌘+⌥+J / ⌘+⌥+C，所以 metaKey + altKey 也要覆盖
  if (e.shiftKey && ['I', 'J', 'C'].includes(key)) {
    if (e.ctrlKey || e.metaKey) return true;
  }
  if (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(key)) return true;

  // Ctrl+U（查看源码）也算一条绕过入口
  if ((e.ctrlKey || e.metaKey) && key === 'U') return true;

  return false;
}

let bound = false;

export function disableDevtoolsShortcuts(): void {
  if (bound) return;
  bound = true;

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isDevtoolsShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    // 捕获阶段拦，比冒泡更早一步，避免被其他监听器先处理掉
    { capture: true }
  );
}
