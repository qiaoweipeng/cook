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
import { compressToDataUrl } from '@/lib/imageUpload';
import { ADMIN_UID, setUserAvatar, AVATAR_MAX_W } from '@/lib/userAdmin';
import { useIsMobile } from '@/hooks/useIsMobile';
import ShoppingListPanel from '@/components/ShoppingListPanel';
import FamilyModal from '@/components/FamilyModal';
import MobileTabBar from '@/components/MobileTabBar';
import AddToHomeScreen from '@/components/AddToHomeScreen';

const { Header, Content, Footer } = Layout;

/*
  PC 端顶部导航栏 —— 管理员和非管理员是**两套不同的菜单**。

  管理员看到的是「管理台」视角：/menu 和 /ingredients 在他这里是表格/配置页，
  用来维护数据，所以叫「菜单管理」「食材库管理」；「今日菜单」是给家人日常
  看的排菜单页，管理端用不上，直接从 PC 端去掉（家人走移动端底部 TabBar，不受影响）。

  非管理员看到的保持原样：菜单 / 今日菜单 / 食材库，因为他是在「用」这个应用，
  不是在「管」它 —— 管理台那一套对他没有意义。
*/
const baseNavItems = [
  { key: '/menu', icon: <AppstoreOutlined />, label: '菜单' },
  { key: '/menu-plan', icon: <CalendarOutlined />, label: '今日菜单' },
  { key: '/ingredients', icon: <DatabaseOutlined />, label: '食材库' },
];

const adminNavItems = [
  { key: '/menu', icon: <AppstoreOutlined />, label: '菜单管理' },
  { key: '/ingredients', icon: <DatabaseOutlined />, label: '食材库管理' },
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

  // 管理员和非管理员是两套互斥的菜单，不能合并 —— 合并会让 /menu、/ingredients
  // 出现重复 key，Menu 的高亮就会随机落在其中一个上
  const navItems = isAdmin ? adminNavItems : baseNavItems;

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
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }
    // 压缩成 192px WebP 再存库（头像存的是数据库 text 列，原图一张能上 MB，
    // 会把用户列表的加载拖慢好几秒）
    try {
      const dataUrl = await compressToDataUrl(file, AVATAR_MAX_W);
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
    } catch (err) {
      message.error('图片处理失败：' + (err as Error).message);
    }
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
    <Layout
      style={{
        minHeight: '100vh',
        // 背景按端区分（见 README「视觉与交互基调」）：
        // PC 纯白——后台表格多，表格原生白底，米白要逐个组件适配；
        // 移动端燕麦米白——用户端全是卡片流，白卡片浮在米白上层次更好。
        background: showMobileNav ? '#FAF7F2' : '#ffffff',
      }}
    >
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
            我是大厨
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={navItems}
            onClick={(e) => navigate(e.key)}
            style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/*
              采购清单入口：管理员隐藏。
              采购清单是「买了什么」的记录，是家人的日常功能；
              管理员这边是来维护数据（菜品、食材价格、用户）的，不参与采购，所以不给入口。
            */}
            {!isAdmin && (
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
            )}
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
            每个人都可以是大厨
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
            background: '#ffffff',
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
