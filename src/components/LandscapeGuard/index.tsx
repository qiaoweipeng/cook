// 手机横屏遮罩：移动端只支持竖屏（和微信一样）。
//
// 这里兜的是「浏览器访问」的场景：
// manifest 里已配了 orientation: 'portrait'，安卓加到主屏幕后系统级锁竖屏、根本转不动；
// 但 iOS 的 PWA 和两端浏览器都锁不住方向，手机一横页面就被压扁，所以横屏时盖一层遮罩。
//
// 为什么不复用 useIsMobile 判断：那个 hook 按宽度（< 768px）算，
// 手机一横过来宽度超过 768 会被判定为「不是移动端」，遮罩刚出来就消失。
// 这里必须用「设备是不是手机」—— UA 检测，和当前宽度无关。
// iPad / 安卓平板刻意放行：屏够大，横屏不影响使用。

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

function isPhone(): boolean {
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
}

export default function LandscapeGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!isPhone()) return; // 电脑 / 平板永远不弹
    const mq = window.matchMedia('(orientation: landscape)');
    const sync = () => setBlocked(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (!blocked) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999, // 压过所有弹层（PwaUpdate 2000、antd-mobile 弹窗 ~1000）
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        // 移动端页面底色 #FAF7F2 + 毛玻璃：遮住内容但不生硬
        background: 'rgba(250, 247, 242, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: '#FFF1E8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* 手机图标从横到竖来回转，示意「转回来」。动画 keyframes 在 index.css */}
        <div className="landscape-hint-ico" style={{ display: 'flex' }}>
          <Smartphone size={40} strokeWidth={1.75} color="#E8743C" />
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#2D2A26' }}>
        请竖屏使用
      </div>
      <div style={{ fontSize: 13, color: '#9a938c' }}>
        当前页面不支持横屏，旋转手机即可继续
      </div>
    </div>
  );
}
