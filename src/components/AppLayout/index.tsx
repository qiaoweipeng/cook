import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Badge, Button, Drawer, Dropdown, Avatar, App as AntApp } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  LogoutOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';
import { isCloudEnabled } from '@/lib/cloudbase';
import ShoppingListPanel from '@/components/ShoppingListPanel';

const { Header, Content, Footer } = Layout;

const navItems = [
  { key: '/menu', icon: <AppstoreOutlined />, label: '菜单' },
  { key: '/weekly', icon: <CalendarOutlined />, label: '每周菜单' },
  { key: '/ingredients', icon: <DatabaseOutlined />, label: '食材库' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const selectedKey = '/' + (location.pathname.split('/')[1] || 'menu');
  const selectedDishCount = useShoppingStore((s) => s.selectedDishIds.length);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const resetForUser = useShoppingStore((s) => s.resetForUser);
  const resetWeekly = useWeeklyStore((s) => s.resetForUser);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cloud = isCloudEnabled();

  const handleSignOut = async () => {
    await signOut();
    resetForUser();
    resetWeekly();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  // 用户菜单项
  const userMenuItems = cloud
    ? user
      ? [
          {
            key: 'profile',
            label: (
              <div style={{ padding: '4px 0' }}>
                <div style={{ fontWeight: 500 }}>已登录</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {user.nickName || user.uid}
                </div>
              </div>
            ),
            disabled: true,
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
          🍳 Cook · 厨房笔记
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
              购物清单
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
                padding: '0 8px 0 12px',
                borderRadius: 10,
              }}
            >
              <Avatar
                size={28}
                style={{
                  background: user ? '#E8743C' : '#ccc',
                }}
                icon={<UserOutlined />}
              />
              {cloud && user?.nickName ? (
                <span style={{ fontSize: 13 }}>{user.nickName}</span>
              ) : null}
            </Button>
          </Dropdown>
        </div>
      </Header>

      <Content style={{ padding: '24px 24px 48px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center', background: 'transparent', color: '#aaa', padding: '24px' }}>
        <span style={{ fontSize: 13 }}>
          做饭这件小事，从今天开始认真一点
          {cloud ? ' · 数据云端同步' : ' · 数据存储在浏览器本地'}
        </span>
      </Footer>

      <Drawer
        title={null}
        placement="right"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{
          body: { padding: '20px 24px 32px', background: '#FAF7F2' },
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
    </Layout>
  );
}
