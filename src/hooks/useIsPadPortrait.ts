import { useEffect, useState } from 'react';

const QUERY = '(orientation: portrait) and (min-width: 768px)';

/**
 * 是否为「Pad 竖屏」：竖屏方向 + 宽度 ≥ 768px。
 * 目前只用于菜单卡片墙的列数 —— Pad 竖屏 3 列；手机竖屏（<768）不命中，仍 2 列。
 *
 * 为什么不能只用宽度断点：iPad Pro 12.9 竖屏和 iPad 9.7 横屏的宽度都是 1024，
 * 纯宽度没法让前者 3 列、后者 4 列，必须带上方向。
 * PC 竖屏（竖窗/竖屏显示器，≥768）也会命中 → 3 列，
 * 这是确认过的预期行为：PC 竖屏不做专门适配，默认就是 3 列。
 */
export function useIsPadPortrait(): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setMatch(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return match;
}
