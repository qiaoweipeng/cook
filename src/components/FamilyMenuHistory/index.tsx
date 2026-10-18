// 家庭菜单修改历史：谁、什么时候、对家庭菜单做了什么
// 入口：今日菜单页（家庭模式下）→「历史记录」按钮

import { useEffect, useState } from 'react';
import { App as AntApp, Avatar, Empty, Modal, Spin, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useFamilyStore, type MenuAuditItem } from '@/store/useFamilyStore';

const { Text } = Typography;

const ACTION_TEXT: Record<MenuAuditItem['action'], string> = {
  add: '添加了',
  remove: '移除了',
  clear: '清空了当天菜单',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FamilyMenuHistory({ open, onClose }: Props) {
  const { message } = AntApp.useApp();
  const listMenuAudit = useFamilyStore((s) => s.listMenuAudit);
  const [items, setItems] = useState<MenuAuditItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listMenuAudit(80)
      .then(setItems)
      .catch((e) => message.error('历史记录加载失败：' + (e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal title="家庭菜单修改记录" open={open} onCancel={onClose} footer={null} width={520}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="还没有修改记录" style={{ margin: '24px 0' }} />
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {items.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 4px',
                borderBottom: '1px solid #f5f1ea',
              }}
            >
              <Avatar
                size={28}
                icon={<UserOutlined />}
                style={{ background: '#E8743C', flexShrink: 0, fontSize: 13 }}
              >
                {r.actorName.slice(0, 1)}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#2D2A26' }}>
                <Text strong>{r.actorName}</Text> {ACTION_TEXT[r.action] ?? r.action}
                {r.detail && (
                  <Text style={{ color: '#E8743C' }}>
                    {r.action === 'clear' ? `（${r.detail}）` : `「${r.detail}」`}
                  </Text>
                )}
                {r.day && (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                    {dayjs(r.day).format('M月D日')}
                  </Text>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                {dayjs(r.createdAt).format('M/D HH:mm')}
              </Text>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
