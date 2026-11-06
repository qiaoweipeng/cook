// 检测到新版本时，顶部弹一条「有新版本，点此更新」
//
// 为什么要手动做：PWA 虽然配了 registerType: 'autoUpdate'，但加到主屏幕后是 standalone 模式，
// 用户可能一直不退出重进，新版就一直不生效。这里拿到「已装好新版」的回调后主动提示一下，
// 用户点了才 reload —— 避免在他正在填表单时页面突然自己刷新。
//
// 注：vite.config.ts 里 injectRegister 已关掉（设为 null），注册在这里手动做。

import { useEffect, useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import { ReloadOutlined, CloseOutlined } from '@ant-design/icons';

export default function PwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // 开发环境没有生成 sw.js，直接跳过（否则每次热更新都会多一条 404）
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

    // 进页面时已经有 SW 在接管 → 这次属于「更新」；没有 → 首次安装
    let hadController = !!navigator.serviceWorker.controller;

    /*
      新 SW 装上后会 skipWaiting 立刻接管，此时页面里跑的仍是旧 JS，
      所以这里监听 controllerchange 来提示用户 reload。
      首次安装不提示更新，只提示一次「已可离线使用」。
    */
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        setOfflineReady(true);
        return;
      }
      setNeedRefresh(true);
    };

    /*
      关键：iOS 独立 PWA 只在启动时检查 SW 更新，切后台再回来不检查。
      所以每次回到前台/恢复显示都主动 update() 一次，
      让「关掉重开」就能拿到新版本，而不是要删掉图标重新添加。
    */
    const checkUpdate = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // updateViaCache: 'none' 让 sw.js 绕过 iOS / 浏览器 HTTP 缓存，避免一直读旧 SW
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((e) => console.error('[pwa] Service Worker 注册失败', e));

    document.addEventListener('visibilitychange', checkUpdate);
    window.addEventListener('pageshow', checkUpdate);
    window.addEventListener('focus', checkUpdate);
    checkUpdate();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkUpdate);
      window.removeEventListener('pageshow', checkUpdate);
      window.removeEventListener('focus', checkUpdate);
    };
  }, []);

  // 离线可用后提示一次（仅提示，不打断操作）
  useEffect(() => {
    if (offlineReady) Toast.show({ content: '已可离线使用', position: 'bottom' });
  }, [offlineReady]);

  const handleUpdate = () => {
    setUpdating(true);
    // 新 SW 已经接管，reload 后拿到的就是最新资源
    window.location.reload();
  };

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(8px + env(safe-area-inset-top))',
        left: 12,
        right: 12,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#2D2A26',
        color: '#fff',
        borderRadius: 12,
        padding: '10px 12px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      }}
    >
      <ReloadOutlined style={{ fontSize: 16, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
        有新版本，更新后生效
      </span>
      <Button
        size="mini"
        color="primary"
        loading={updating}
        onClick={handleUpdate}
        style={{ flexShrink: 0 }}
      >
        更新
      </Button>
      <CloseOutlined
        style={{ fontSize: 14, opacity: 0.6, flexShrink: 0 }}
        onClick={() => setNeedRefresh(false)}
      />
    </div>
  );
}
