// 检测到新版本时，顶部弹一条「有新版本，点此更新」
//
// 为什么要手动做：PWA 虽然配了 registerType: 'autoUpdate'，但加到主屏幕后是 standalone 模式，
// 用户可能一直不退出重进，新版就一直不生效。这里拿到「已装好新版」的回调后主动提示一下，
// 用户点了才 reload —— 避免在他正在填表单时页面突然自己刷新。
//
// 注：vite.config.ts 里 injectRegister 已关掉（设为 null），注册在这里手动做。

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button, Toast } from 'antd-mobile';
import { ReloadOutlined, CloseOutlined } from '@ant-design/icons';

type UpdateFn = (reloadPage?: boolean) => Promise<void>;

export default function PwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState<UpdateFn | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // registerSW 在开发环境是空操作（没生成 SW），所以这里不用区分环境
    const updater = registerSW({
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setOfflineReady(true),
    });
    // 注意：setState 直接传函数会被当成 updater，要再包一层
    setUpdateSW(() => updater);
  }, []);

  // 离线可用后提示一次（仅提示，不打断操作）
  useEffect(() => {
    if (offlineReady) Toast.show({ content: '已可离线使用', position: 'bottom' });
  }, [offlineReady]);

  const handleUpdate = async () => {
    if (!updateSW) return;
    setUpdating(true);
    try {
      await updateSW(true); // true = 更新完自动 reload
    } catch {
      Toast.show({ content: '更新失败，请稍后手动刷新' });
      setUpdating(false);
    }
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
