import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, App as AntApp, Divider, Tabs } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { isCloudEnabled, getEnvId } from '@/lib/cloudbase';
import {
  registerUser,
  loginUser,
  saveSession,
  type SessionUser,
} from '@/lib/userAuth';
import { useAuthStore } from '@/store/useAuthStore';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';

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
    return <Navigate to="/menu" replace />;
  }

  const validNick = nickname.trim().length >= 2 && nickname.trim().length <= 20;
  const validPwd = password.length >= 6;

  const afterLogin = async (u: SessionUser) => {
    saveSession(u);
    setUser({ uid: u.uid, nickName: u.nickName });
    await Promise.all([
      useDishStore.getState().load(),
      useIngredientStore.getState().load(),
      useShoppingStore.getState().load(),
      useWeeklyStore.getState().load(),
    ]);
    navigate('/menu', { replace: true });
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
        background: 'linear-gradient(135deg, #FFF6EC 0%, #FFE5DC 100%)',
        padding: 24,
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
          <div style={{ fontSize: 40, marginBottom: 8 }}>🍳</div>
          <Title level={3} style={{ margin: 0 }}>
            Cook · 厨房笔记
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            昵称 + 密码，登录后开启家庭共享
          </Text>
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
          登录后菜单和食材库会与家人共享；购物清单各自独立。
          <br />
          环境 ID：<code style={{ background: '#f5f0e8', padding: '0 4px', borderRadius: 3 }}>{getEnvId() || '未配置'}</code>
        </Text>
      </Card>
    </div>
  );
}
