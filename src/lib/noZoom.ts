// 加到主屏幕后是「应用」形态，能双指缩放会一下子露出网页感，这里禁掉。
//
// 为什么不能只靠 viewport：
//   iOS Safari 从 iOS 10 起**故意忽略** `user-scalable=no` 和 `maximum-scale`（无障碍考虑），
//   所以 iPhone 上只能拦 Safari 私有的手势事件 gesturestart / gesturechange / gestureend。
//   Android Chrome 看 index.html 的 viewport 就够了，这里拦也不冲突。

let bound = false;

export function disablePinchZoom(): void {
  if (bound) return;
  bound = true;

  const stop = (e: Event) => e.preventDefault();

  // Safari 私有：双指捏合
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });

  // 兜底：两指及以上的滑动也拦掉。
  // 只拦多指，单指正常滚动、横向滑动分类栏都不受影响。
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}
