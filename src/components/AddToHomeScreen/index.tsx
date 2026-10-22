import { useEffect, useState } from 'react';
import { Modal, Checkbox, Button } from 'antd';

const NEVER_KEY = 'a2hs_never';

/** 是否已以主屏 App（standalone）方式打开：已经在主屏就不必再提示添加 */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * 「添加到主屏幕」引导弹窗：
 * - 仅移动端渲染（由 AppLayout 的 showMobileNav 控制，PC 与管理员不弹）
 * - 勾选「不再提醒」后写入 localStorage，永久不再弹；未勾选则每次进入都弹
 */
export default function AddToHomeScreen() {
  const [open, setOpen] = useState(false);
  const [never, setNever] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    try {
      if (localStorage.getItem(NEVER_KEY) === '1') return;
    } catch {
      // localStorage 不可用时忽略，仍按未勾选处理
    }
    if (isStandalone()) return;
    // 稍等页面渲染稳定后再弹，避免和首屏抢时机
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    if (never) {
      try {
        localStorage.setItem(NEVER_KEY, '1');
      } catch {
        // 忽略写入失败
      }
    }
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      title="把「我是大厨」添加到主屏幕"
      width={320}
      centered
      footer={
        <Button type="primary" block onClick={close}>
          知道了
        </Button>
      }
      onCancel={close}
    >
      <p style={{ color: '#666', fontSize: 13 }}>
        添加到主屏幕后，像原生 App 一样全屏打开，没有地址栏，更流畅。
      </p>
      {isIOS ? (
        <p style={{ fontSize: 14, lineHeight: 1.8 }}>
          在 Safari 中点击底部工具栏的<b>「分享」</b>
          <span style={{ color: '#E8743C' }}>⬆︎</span>按钮，再选择
          <b>「添加到主屏幕」</b>即可。
        </p>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.8 }}>
          点击浏览器右上角<b>「⋮」</b>菜单，选择<b>「添加到主屏幕」</b>
          或<b>「安装应用」</b>即可。
        </p>
      )}
      <Checkbox checked={never} onChange={(e) => setNever(e.target.checked)}>
        不再提醒
      </Checkbox>
    </Modal>
  );
}
