// 个人中心（移动端）：antd-mobile 组件
// 头像、昵称、家庭入口、退出登录

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, List, Dialog, Space, Badge } from 'antd-mobile';
import {
  CameraOutline,
  TeamOutline,
  DeleteOutline,
  InformationCircleOutline,
} from 'antd-mobile-icons';
import { UserOutlined } from '@ant-design/icons';
import { versionLabel, versionDetail } from '@/lib/appVersion';
import { clearPwaCache, hasServiceWorker } from '@/lib/pwaCache';
import { App as AntApp } from 'antd';
import { useAuthStore } from '@/store/useAuthStore';
import { useFamilyStore } from '@/store/useFamilyStore';
import { resetUserScopedStores } from '@/store/userScope';
import { isCloudEnabled } from '@/lib/supabase';
import { setUserAvatar, ADMIN_UID } from '@/lib/userAdmin';
import FamilyModal from '@/components/FamilyModal';

export default function Profile() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const user = useAuthStore((s) => s.user);
  const setAvatar = useAuthStore((s) => s.setAvatar);
  const signOut = useAuthStore((s) => s.signOut);
  const resetUserScoped = resetUserScopedStores;
  const family = useFamilyStore((s) => s.family);
  const familyIncomingCount = useFamilyStore((s) => s.incoming.length + s.incomingTransfers.length);
  const [familyOpen, setFamilyOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cloud = isCloudEnabled();

  const handleSignOut = () => {
    Dialog.confirm({
      content: '确定退出登录吗？',
      confirmText: '退出',
      cancelText: '取消',
      onConfirm: async () => {
        await signOut();
        resetUserScoped();
        message.success('已退出登录');
        navigate('/login', { replace: true });
      },
    });
  };

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

  if (!user) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>请先登录</div>
    );
  }

  return (
    <div style={{ padding: '16px 12px' }}>
      {/* 头像 + 昵称 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 0 20px',
        }}
      >
        <div style={{ position: 'relative' }}>
          {user.avatar ? (
            <Avatar
              src={user.avatar}
              style={{ '--size': '76px' } as React.CSSProperties}
            />
          ) : (
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: '#E8743C',
                color: '#fff',
                fontSize: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {user.nickName?.[0] ?? <UserOutlined />}
            </div>
          )}
          <Button
            size="mini"
            shape="rounded"
            style={{
              position: 'absolute',
              bottom: -2,
              right: -6,
              '--background-color': '#fff',
              '--border-color': '#eee',
            }}
            onClick={handleAvatarPick}
          >
            <CameraOutline fontSize={14} />
          </Button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 600 }}>
          {user.uid === ADMIN_UID ? '超级管理员' : user.nickName || user.uid}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: '#999' }}>ID: {user.uid}</div>
      </div>

      {/* 功能列表 */}
      <List mode="card" style={{ borderRadius: 12 }}>
        <List.Item
          prefix={<TeamOutline fontSize={20} style={{ color: '#E8743C' }} />}
          extra={
            familyIncomingCount > 0 ? (
              <Badge content={familyIncomingCount} color="#E8743C" />
            ) : (
              <span style={{ color: '#999', fontSize: 13 }}>
                {family ? `${family.adminName} 的家庭` : '未加入'}
              </span>
            )
          }
          clickable
          onClick={() => {
            setFamilyOpen(true);
            useFamilyStore
              .getState()
              .load()
              .catch((e) => message.error('家庭信息加载失败：' + (e as Error).message));
          }}
        >
          我的家庭
        </List.Item>
      </List>

      <List style={{ marginTop: 12 }}>
        <List.Item
          prefix={<InformationCircleOutline fontSize={20} style={{ color: '#8C857E' }} />}
          extra={<span style={{ color: '#999', fontSize: 13 }}>{versionLabel()}</span>}
          clickable
          onClick={() => {
            // 反馈问题时直接复制走，省得手抄
            const text = versionDetail();
            navigator.clipboard?.writeText(text).then(
              () => message.success('版本信息已复制'),
              () => Dialog.alert({ content: text })
            );
          }}
        >
          当前版本
        </List.Item>

        {/* 没有 Service Worker（比如浏览器里直接打开）就没东西可清，不显示 */}
        {hasServiceWorker() && (
          <List.Item
            prefix={<DeleteOutline fontSize={20} style={{ color: '#8C857E' }} />}
            clickable
            onClick={() => {
              Dialog.confirm({
                content: '清除离线缓存后会自动重新加载。菜品、食材等数据不受影响。',
                confirmText: '清除',
                cancelText: '取消',
                onConfirm: async () => {
                  try {
                    const r = await clearPwaCache();
                    message.success(`已清除缓存（${r.caches} 项）`);
                    // 注销 SW 后要重新加载一次，下次才会拉到新的 SW
                    setTimeout(() => window.location.reload(), 600);
                  } catch (e) {
                    message.error('清除失败：' + (e as Error).message);
                  }
                },
              });
            }}
          >
            清除离线缓存
          </List.Item>
        )}
      </List>

      <Space block direction="vertical" style={{ marginTop: 24 }}>
        <Button block color="danger" fill="outline" onClick={handleSignOut}>
          退出登录
        </Button>
      </Space>

      <FamilyModal open={familyOpen} onClose={() => setFamilyOpen(false)} />
    </div>
  );
}
