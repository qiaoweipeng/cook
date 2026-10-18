import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AppLayout from './components/AppLayout';
import Menu from './pages/Menu';
import DishDetail from './pages/DishDetail';
import Ingredients from './pages/Ingredients';
import Login from './pages/Login';
import Weekly from './pages/Weekly';
import Profile from './pages/Profile';
import Shopping from './pages/Shopping';
import AdminUsers from './pages/Admin/Users';
import AdminSystem from './pages/Admin/System';
import { useAuthStore } from './store/useAuthStore';
import { useDishStore } from './store/useDishStore';
import { useIngredientStore } from './store/useIngredientStore';
import { useShoppingStore } from './store/useShoppingStore';
import { useWeeklyStore } from './store/useWeeklyStore';
import { useFamilyStore } from './store/useFamilyStore';
import { ensureAdminRow, getUser, ADMIN_UID } from './lib/userAdmin';
import { isCloudEnabled } from './lib/supabase';
import { loadSession } from './lib/userAuth';
import { logLogin } from './lib/clientInfo';

/** 路由守卫：开了 CloudBase 但没登录时跳 /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const cloud = isCloudEnabled();
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  const location = useLocation();

  if (booting) {
    return null;
  }
  if (cloud && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/**
 * 强制下线监听：已登录的普通用户，每 20 秒（+窗口重新聚焦时）查一次自己是否被停用。
 * 被停用 → 清会话强制登出，并弹窗提示「账号已被停用」。
 */
function useDisabledWatcher() {
  const { modal } = AntApp.useApp();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);

  useEffect(() => {
    if (!uid || uid === ADMIN_UID || !isCloudEnabled()) return;
    let stopped = false;

    const check = async () => {
      try {
        const row = await getUser(uid);
        if (stopped || !row?.disabled) return;
        // 清会话 + 清各 store 的用户态
        useAuthStore.getState().setUser(null);
        useShoppingStore.getState().resetForUser();
        useWeeklyStore.getState().resetForUser();
        useFamilyStore.getState().resetForUser();
        modal.warning({
          title: '账号已被停用',
          content: '你的账号已被管理员停用，无法继续使用。如有疑问请联系管理员。',
          okText: '知道了',
          onOk: () => navigate('/login', { replace: true }),
        });
      } catch {
        // 网络失败等忽略，下一轮再查
      }
    };

    void check();
    const timer = setInterval(check, 20000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [uid]);
}

export default function App() {
  const userUid = useAuthStore((s) => s.user?.uid);
  useDisabledWatcher();

  // 登录成功（含刷新恢复会话）→ 记一条登录日志；每个浏览器会话只记一次
  useEffect(() => {
    if (userUid) {
      const u = useAuthStore.getState().user;
      logLogin(userUid, u?.nickName ?? userUid).catch(() => { });
    }
  }, [userUid]);

  // 启动时：同步恢复登录态并直接进入页面（菜品等数据有 IndexedDB 缓存可先显示），
  // 云端数据在后台拉取，到达后自动刷新界面
  useEffect(() => {
    if (isCloudEnabled()) {
      // 从 localStorage 恢复登录态（自建账号体系，同步读取，无网络等待）
      useAuthStore.getState().setUser(loadSession());
    } else {
      useAuthStore.getState().setUser(null);
    }

    // 后台加载数据（各 store 的 load 内部会先等 IndexedDB 缓存恢复，避免旧缓存覆盖云端新数据）
    void (async () => {
      if (isCloudEnabled()) {
        // 确保 users 表里有超级管理员那一行（用于存头像）
        ensureAdminRow().catch(() => { });
        // 重新拉一次头像（管理员刚改过头像会反映到顶栏）
        useAuthStore.getState().refreshAvatar().catch(() => { });
      }

      // 拉云端数据（cloud 已自动判断，没配置时会直接 return）
      await Promise.all([
        useDishStore.getState().load().catch(() => { }),
        useIngredientStore.getState().load().catch(() => { }),
      ]);
      if (useAuthStore.getState().user) {
        await Promise.all([
          useShoppingStore.getState().load().catch(() => { }),
          useWeeklyStore.getState().load().catch(() => { }),
          useFamilyStore.getState().load().catch(() => { }),
        ]);
      }
    })();
  }, []);

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
        <Route path="/profile" element={<Profile />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/system" element={<AdminSystem />} />
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Route>
    </Routes>
  );
}
