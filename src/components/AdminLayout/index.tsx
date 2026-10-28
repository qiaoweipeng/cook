import { useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import { App as AntApp, Badge, Dropdown } from 'antd';
import {
  AppstoreOutlined,
  CameraOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  HomeOutlined,
  LogoutOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/useAuthStore';
import { useFamilyStore } from '@/store/useFamilyStore';
import { resetUserScopedStores } from '@/store/userScope';
import { isCloudEnabled } from '@/lib/supabase';
import { compressToDataUrl } from '@/lib/imageUpload';
import { ADMIN_UID, setUserAvatar, AVATAR_MAX_W } from '@/lib/userAdmin';
import FamilyModal from '@/components/FamilyModal';

/*
  PC 端管理后台布局（仅管理员）。

  和 AppLayout 的分工：
  - 普通用户继续走 AppLayout（顶部横菜单 + 移动端 TabBar），完全不受影响；
  - 管理员走这里，用 Ant Design Pro 的 ProLayout 换成经典后台形态（左侧菜单 + 顶部栏）。

  头部元素（头像下拉、上传头像、我的家庭、退出登录）与 AppLayout 保持一致，
  改其中一处时记得同步另一处 —— 两个布局都是管理员会看到的。
*/

// 管理员菜单。和 AppLayout 里的 adminNavItems 是同一批路由，
// 区别只是这里交给 ProLayout 渲染成左侧竖排菜单。
const adminMenuRoutes = [
  { path: '/admin/home', name: '起始页', icon: <HomeOutlined /> },
  { path: '/menu', name: '菜单管理', icon: <AppstoreOutlined /> },
  { path: '/ingredients', name: '食材库管理', icon: <DatabaseOutlined /> },
  { path: '/admin/users', name: '用户管理', icon: <TeamOutlined /> },
  { path: '/admin/system', name: '系统管理', icon: <DashboardOutlined /> },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const user = useAuthStore((s) => s.user);
  const setAvatar = useAuthStore((s) => s.setAvatar);
  const signOut = useAuthStore((s) => s.signOut);
  const familyIncomingCount = useFamilyStore(
    (s) => s.incoming.length + s.incomingTransfers.length
  );
  const [familyOpen, setFamilyOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cloud = isCloudEnabled();

  const handleSignOut = async () => {
    await signOut();
    resetUserScopedStores();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }
    // 压缩成 192px WebP 再存库：头像存的是数据库 text 列，
    // 原图一张能上 MB，会把用户列表的加载拖慢好几秒
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

  const userMenuItems = [
    {
      key: 'profile',
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 500 }}>
            {user?.uid === ADMIN_UID ? '超级管理员' : user?.nickName || user?.uid}
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>ID: {user?.uid}</div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'avatar',
      label: '上传头像',
      icon: <CameraOutlined />,
      onClick: () => avatarInputRef.current?.click(),
    },
    {
      key: 'family',
      label: (
        <Badge count={familyIncomingCount} size="small" offset={[10, 0]} color="#E8743C">
          我的家庭
        </Badge>
      ),
      icon: <TeamOutlined />,
      onClick: () => setFamilyOpen(true),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      onClick: handleSignOut,
    },
  ];

  return (
    <>
      <ProLayout
        title="我是大厨"
        logo={
          <img
            src="/icon/192*192.png"
            alt="我是大厨"
            style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }}
          />
        }
        layout="side"
        siderWidth={208}
        fixSiderbar
        fixedHeader
        // 背景保持纯白，和 README 里「PC 端固定纯白」的约定一致
        token={{
          bgLayout: '#ffffff',
          sider: { colorMenuBackground: '#ffffff' },
        }}
        contentStyle={{ padding: 24 }}
        location={{ pathname: location.pathname }}
        route={{ path: '/', routes: adminMenuRoutes }}
        menuItemRender={(item, dom) => (
          <div onClick={() => item.path && navigate(item.path)}>{dom}</div>
        )}
        avatarProps={{
          src: user?.avatar || undefined,
          title: user?.nickName || '管理员',
          render: (_props, dom) => (
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <span>{dom}</span>
            </Dropdown>
          ),
        }}
        // 去掉 Pro 默认的版权页脚
        footerRender={false}
      >
        <Outlet />
      </ProLayout>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAvatarChange}
      />

      <FamilyModal open={familyOpen} onClose={() => setFamilyOpen(false)} />
    </>
  );
}
