import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Badge, Button, Drawer } from 'antd';
import {
  AppstoreOutlined,
  DatabaseOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { useShoppingStore } from '@/store/useShoppingStore';
import ShoppingListPanel from '@/components/ShoppingListPanel';

const { Header, Content, Footer } = Layout;

const navItems = [
  { key: '/menu', icon: <AppstoreOutlined />, label: '菜单' },
  { key: '/ingredients', icon: <DatabaseOutlined />, label: '食材库' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = '/' + (location.pathname.split('/')[1] || 'menu');
  const selectedDishCount = useShoppingStore((s) => s.selectedDishIds.length);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      </Header>

      <Content style={{ padding: '24px 24px 48px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center', background: 'transparent', color: '#aaa', padding: '24px' }}>
        <span style={{ fontSize: 13 }}>
          做饭这件小事，从今天开始认真一点 · 数据存储在浏览器本地
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
