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
import './index.css';

// 本地缓存已从 localStorage 搬到 IndexedDB，清掉旧缓存释放配额
clearLegacyLocalCache();
// 禁掉双指缩放（主要针对 iOS Safari，它不认 viewport 的 user-scalable）
disablePinchZoom();

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
