import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/AppLayout';
import Menu from './pages/Menu';
import DishDetail from './pages/DishDetail';
import Ingredients from './pages/Ingredients';
import Login from './pages/Login';
import Weekly from './pages/Weekly';
import { useAuthStore } from './store/useAuthStore';
import { useDishStore } from './store/useDishStore';
import { useIngredientStore } from './store/useIngredientStore';
import { useShoppingStore } from './store/useShoppingStore';
import { useWeeklyStore } from './store/useWeeklyStore';
import { isCloudEnabled } from './lib/cloudbase';
import { loadSession } from './lib/userAuth';

/** 路由守卫：开了 CloudBase 但没登录时跳 /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const cloud = isCloudEnabled();
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  const location = useLocation();

  if (booting) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="正在启动..." />
      </div>
    );
  }
  if (cloud && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const [ready, setReady] = useState(false);

  // 启动时：拉登录态 → 拉数据
  useEffect(() => {
    async function bootstrap() {
      if (isCloudEnabled()) {
        // 从 localStorage 恢复登录态（自建账号体系）
        useAuthStore.getState().setUser(loadSession());
      } else {
        useAuthStore.getState().setUser(null);
      }

      // 拉云端数据（cloud 已自动判断，没配置时会直接 return）
      await Promise.all([
        useDishStore.getState().load(),
        useIngredientStore.getState().load(),
      ]);
      if (useAuthStore.getState().user) {
        await Promise.all([
          useShoppingStore.getState().load(),
          useWeeklyStore.getState().load(),
        ]);
      }
      setReady(true);
    }
    bootstrap();
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF7F2' }}>
        <Spin size="large" tip="正在准备你的厨房..." />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/menu" replace />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:id" element={<DishDetail />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/weekly" element={<Weekly />} />
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Route>
    </Routes>
  );
}
