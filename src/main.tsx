import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import App from './App';
import { theme } from './theme';
import { clearLegacyLocalCache } from '@/lib/persistStorage';
import { disablePinchZoom } from '@/lib/noZoom';
import { disableDevtoolsShortcuts } from '@/lib/noDevtools';
import './index.css';

// 本地缓存已从 localStorage 搬到 IndexedDB，清掉旧缓存释放配额
clearLegacyLocalCache();
// 禁掉双指缩放（主要针对 iOS Safari，它不认 viewport 的 user-scalable）
disablePinchZoom();
// 触屏设备（手机 / 接了外接键盘的 iPad）拦掉 F2、F12、Ctrl+Shift+I 这类调试入口。
// PC 端不拦：那边本来就要开控制台排查问题。
if (window.matchMedia('(pointer: coarse)').matches) {
  disableDevtoolsShortcuts();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
