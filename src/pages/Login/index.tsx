import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, App as AntApp, Divider, Tabs } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { isCloudEnabled, getCloudHost } from '@/lib/supabase';
import {
  registerUser,
  loginUser,
  tryAdminLogin,
  type SessionUser,
} from '@/lib/userAuth';
import { useAuthStore } from '@/store/useAuthStore';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { resetUserScopedStores, reloadUserScopedStores } from '@/store/userScope';

const { Title, Text } = Typography;

export default function Login() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isCloudEnabled()) {
    return <Navigate to="/menu" replace />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }

  const validNick = nickname.trim().length >= 2 && nickname.trim().length <= 20;
  const validPwd = password.length >= 6;

  const afterLogin = async (u: SessionUser) => {
    setUser({
      uid: u.uid,
      nickName: u.nickName,
      role: u.role,
      avatar: u.avatar,
    });
    // 先清掉上一个用户留在内存里的采购清单/菜单/家庭数据，再按新用户拉取，
    // 避免某个 store 加载慢或失败时，新用户看到上一个人的内容
    resetUserScopedStores();
    // allSettled：单个 store 拉失败也要让用户进得去（数据空着，下次进页面还会再拉），
    // 不像 Promise.all 那样一个失败就卡在登录页
    await Promise.allSettled([
      useDishStore.getState().load(),
      useIngredientStore.getState().load(),
      reloadUserScopedStores(),
    ]);
    // 走 "/"，由 App 里的 IndexRedirect 按角色分流：管理员进起始页，普通用户进菜单
    navigate('/', { replace: true });
  };

  const onFinish = async () => {
    if (!validNick) {
      message.warning('昵称 2-20 个字符');
      return;
    }
    if (!validPwd) {
      message.warning('密码至少 6 位');
      return;
    }
    setSubmitting(true);
    try {
      // 优先尝试硬编码的超级管理员登录
      const admin = await tryAdminLogin(nickname, password);
      if (admin) {
        message.success('已登录超级管理员');
        await afterLogin(admin);
        setSubmitting(false);
        return;
      }
      if (tab === 'signup') {
        const u = await registerUser(nickname, password);
        message.success('注册成功，已自动登录');
        await afterLogin(u);
      } else {
        const u = await loginUser(nickname, password);
        message.success('登录成功');
        await afterLogin(u);
      }
    } catch (e: any) {
      const code = e?.message || String(e);
      if (code === 'NICK_TAKEN') {
        message.error('这个昵称已经被用了，换一个或直接登录');
      } else if (code === 'USER_NOT_FOUND') {
        message.error('昵称不存在，请先注册');
      } else if (code === 'USER_DISABLED') {
        message.error('该账号已被停用，请联系管理员');
      } else if (code === 'BAD_PASSWORD') {
        message.error('密码不对');
      } else {
        // 不再吞掉真实错误，直接透传给用户/控制台
        console.error('[login/register] raw error:', e);
        message.error((tab === 'signup' ? '注册' : '登录') + '失败：' + code);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        // 顶部额外让出状态栏高度（iOS PWA 下是透明的，内容从 (0,0) 开始画）。
        // 登录卡片是垂直居中的，内容多时才顶到上面，加上这行保证任何机型都压不住。
        padding: 'calc(24px + env(safe-area-inset-top)) 24px 24px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(232, 116, 60, 0.12)',
        }}
        styles={{ body: { padding: '32px 36px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {/* <div style={{ fontSize: 40, marginBottom: 8 }}>🍳</div> */}
          <Title level={3} style={{ margin: 0, color: '#e8743c' }}>
            我是大厨
          </Title>
          {/* <Text type="secondary" style={{ fontSize: 13 }}>
            昵称 + 密码，登录后开启家庭共享
          </Text> */}
        </div>

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'login' | 'signup')}
          centered
          items={[
            { key: 'login', label: '登录' },
            { key: 'signup', label: '注册' },
          ]}
        />

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item>
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="昵称（2-20 个字符，家人之间辨识用）"
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </Form.Item>
          <Form.Item>
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Item>
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            block
            loading={submitting}
          >
            {tab === 'login' ? '登录' : '注册并登录'}
          </Button>
        </Form>

        <Divider plain style={{ margin: '20px 0 12px', color: '#bbb', fontSize: 12 }}>
          数据安全
        </Divider>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6, display: 'block' }}>
          登录后菜单和食材库会与家人共享；采购清单各自独立。
          <br />
          云端地址：<code style={{ background: '#f5f0e8', padding: '0 4px', borderRadius: 3 }}>{getCloudHost() || '未配置'}</code>
        </Text>
      </Card>
    </div>
  );
}
