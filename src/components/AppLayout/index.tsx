import { useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Layout,
  Menu,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Avatar,
  App as AntApp,
} from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  LogoutOutlined,
  LoginOutlined,
  TeamOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useAuthStore, useIsAdmin } from '@/store/useAuthStore';
import { useFamilyStore } from '@/store/useFamilyStore';
import { resetUserScopedStores } from '@/store/userScope';
import { isCloudEnabled } from '@/lib/supabase';
import { ADMIN_UID, setUserAvatar } from '@/lib/userAdmin';
import { useIsMobile } from '@/hooks/useIsMobile';
import ShoppingListPanel from '@/components/ShoppingListPanel';
import FamilyModal from '@/components/FamilyModal';
import MobileTabBar from '@/components/MobileTabBar';
import AddToHomeScreen from '@/components/AddToHomeScreen';

const { Header, Content, Footer } = Layout;

const baseNavItems = [
  { key: '/menu', icon: <AppstoreOutlined />, label: '菜单' },
  { key: '/menu-plan', icon: <CalendarOutlined />, label: '今日菜单' },
  { key: '/ingredients', icon: <DatabaseOutlined />, label: '食材库' },
];

const adminNavItems = [
  { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/admin/system', icon: <DashboardOutlined />, label: '系统管理' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const segs = location.pathname.split('/');
  const selectedKey =
    '/' + (segs[1] || 'menu') + (segs[2] ? '/' + segs[2] : '');
  const selectedDishCount = useShoppingStore((s) => s.selectedDishIds.length);
  const user = useAuthStore((s) => s.user);
  const setAvatar = useAuthStore((s) => s.setAvatar);
  const signOut = useAuthStore((s) => s.signOut);
  const resetUserScoped = resetUserScopedStores;
  const familyIncomingCount = useFamilyStore((s) => s.incoming.length + s.incomingTransfers.length);
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  // 移动端底部导航：仅「移动端 + 非管理员」显示（管理员不做移动端适配）
  const showMobileNav = isMobile && !isAdmin && Boolean(user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const cloud = isCloudEnabled();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems;

  const handleSignOut = async () => {
    await signOut();
    resetUserScoped();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  // —— 头像上传 ——
  const handleAvatarPick = () => avatarInputRef.current?.click();
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      message.error('头像文件不能超过 1.5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        message.error('读取图片失败');
        return;
      }
      setAvatar(dataUrl);
      if (cloud && user) {
        try {
          await setUserAvatar(user.uid, dataUrl);
          message.success('头像已更新');
        } catch (err) {
          message.error('头像已保存到本地，但上传云端失败：' + (err as Error).message);
        }
      } else {
        message.success('头像已更新');
      }
    };
    reader.readAsDataURL(file);
  };

  // —— 用户菜单项 ——
  const userMenuItems = cloud
    ? user
      ? [
        {
          key: 'profile',
          label: (
            <div style={{ padding: '4px 0' }}>
              <div style={{ fontWeight: 500 }}>
                {user.uid === ADMIN_UID ? '超级管理员' : user.nickName || user.uid}
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>ID: {user.uid}</div>
            </div>
          ),
          disabled: true,
        },
        { type: 'divider' as const },
        {
          key: 'avatar',
          label: '上传头像',
          icon: <CameraOutlined />,
          onClick: handleAvatarPick,
        },
        {
          key: 'family',
          label: (
            <Badge count={familyIncomingCount} size="small" offset={[10, 0]} color="#E8743C">
              我的家庭
            </Badge>
          ),
          icon: <TeamOutlined />,
          onClick: () => {
            setFamilyOpen(true);
            useFamilyStore
              .getState()
              .load()
              .catch((e) => message.error('家庭信息加载失败：' + (e as Error).message));
          },
        },
        { type: 'divider' as const },
        {
          key: 'signout',
          label: '退出登录',
          icon: <LogoutOutlined />,
          onClick: handleSignOut,
        },
      ]
      : [
        {
          key: 'login',
          label: '登录',
          icon: <LoginOutlined />,
          onClick: () => navigate('/login'),
        },
      ]
    : [
      {
        key: 'offline',
        label: <span style={{ color: '#999' }}>本地模式（未配置云端）</span>,
        disabled: true,
      },
    ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 移动端：完全隐藏顶部导航栏（logo + 菜单 + 操作区） */}
      {!showMobileNav && (
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: '#fff',
            borderBottom: '1px solid #f3eee7',
          }}
        >
          <div
            className="brand"
            style={{ marginRight: 40, cursor: 'pointer' }}
            onClick={() => navigate('/menu')}
          >
            大厨房
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={navItems}
            onClick={(e) => navigate(e.key)}
            style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge
              count={selectedDishCount}
              offset={[-4, 6]}
              color="#E8743C"
              showZero={false}
            >
              <Button
                type="text"
                icon={<ShoppingCartOutlined style={{ fontSize: 20 }} />}
                onClick={() => setDrawerOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 10,
                  color: selectedDishCount > 0 ? '#E8743C' : '#666',
                }}
              >
                采购清单
              </Button>
            </Badge>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Button
                type="text"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 40,
                  padding: '0 8px 0 8px',
                  borderRadius: 10,
                }}
              >
                <Avatar
                  size={32}
                  src={user?.avatar || undefined}
                  style={{
                    background: user?.avatar ? 'transparent' : '#E8743C',
                    cursor: 'pointer',
                  }}
                  icon={user?.avatar ? undefined : <UserOutlined />}
                >
                  {!user?.avatar && (user?.nickName?.[0] ?? '?')}
                </Avatar>
              </Button>
            </Dropdown>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>
        </Header>
      )}

      <Content
        style={{
          padding: showMobileNav ? '16px 12px' : '24px 24px 48px',
          // iOS PWA 下状态栏是透明的，内容从屏幕最顶端开始画，
          // 这里给状态栏让出高度，否则各页面顶部会被它压住。
          // env(safe-area-inset-top) 在 Android 和普通浏览器里是 0，所以不会影响那边的布局。
          paddingTop: showMobileNav ? 'calc(16px + env(safe-area-inset-top))' : undefined,
          // 给底部导航留出空间（约 50px 导航 + 安全区）
          paddingBottom: showMobileNav ? 'calc(60px + env(safe-area-inset-bottom))' : undefined,
          maxWidth: showMobileNav ? '100%' : 1200,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Outlet />
      </Content>

      {/* 移动端隐藏页脚，桌面端保留 */}
      {!showMobileNav && (
        <Footer style={{ textAlign: 'center', background: 'transparent', color: '#aaa', padding: '24px' }}>
          <span style={{ fontSize: 13 }}>
            做饭这件小事，从今天开始认真一点
            {cloud ? ' · 数据云端同步' : ' · 数据存储在浏览器本地'}
          </span>
        </Footer>
      )}

      <Drawer
        title={null}
        placement="right"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{
          body: {
            padding: showMobileNav ? '12px' : '20px 24px 32px',
            background: '#FAF7F2',
          },
        }}
        closeIcon={null}
        extra={
          <Button type="text" onClick={() => setDrawerOpen(false)}>
            关闭
          </Button>
        }
      >
        <ShoppingListPanel />
      </Drawer>

      <FamilyModal open={familyOpen} onClose={() => setFamilyOpen(false)} />

      {/* 移动端底部导航 */}
      {showMobileNav && <MobileTabBar />}

      {/* 移动端「添加到主屏幕」引导弹窗（勾选不再提醒后永久隐藏） */}
      {showMobileNav && <AddToHomeScreen />}
    </Layout>
  );
}
