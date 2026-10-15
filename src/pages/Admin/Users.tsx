// 超级管理员专属：用户管理
// 列出所有用户，对普通用户可启用/禁用；管理员账号不可操作

import { useEffect, useState } from 'react';
import { Table, Switch, Avatar, Tag, Typography, Space, App as AntApp, Card, Statistic, Row, Col } from 'antd';
import { UserOutlined, CrownOutlined } from '@ant-design/icons';
import { ADMIN_UID, ensureAdminRow, listUsers, setUserDisabled, type UserRow } from '@/lib/userAdmin';

const { Title, Text } = Typography;

export default function AdminUsers() {
  const { message } = AntApp.useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      await ensureAdminRow();
      const list = await listUsers();
      setUsers(list);
    } catch (e) {
      message.error('加载用户失败：' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (uid: string, disabled: boolean) => {
    if (uid === ADMIN_UID) {
      message.warning('超级管理员账号不可停用');
      return;
    }
    setPendingUid(uid);
    try {
      await setUserDisabled(uid, !disabled);
      message.success(!disabled ? '已停用' : '已启用');
      setUsers((arr) =>
        arr.map((u) => (u.id === uid ? { ...u, disabled: !disabled } : u))
      );
    } catch (e) {
      message.error('操作失败：' + (e as Error).message);
    } finally {
      setPendingUid(null);
    }
  };

  const total = users.length;
  const disabledCount = users.filter((u) => u.disabled).length;
  const adminPresent = users.some((u) => u.id === ADMIN_UID);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <CrownOutlined style={{ color: '#E8743C', marginRight: 8 }} />
          用户管理
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          只有超级管理员能看到此页。普通账号可被启用/停用，管理员账号不可操作。
        </Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="用户总数" value={total} suffix="人" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="已停用" value={disabledCount} suffix="人" valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="超级管理员" value={adminPresent ? 1 : 0} suffix="人" valueStyle={{ color: '#E8743C' }} />
          </Card>
        </Col>
      </Row>

      <Table<UserRow>
        rowKey="id"
        loading={loading}
        dataSource={users}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          {
            title: '头像',
            dataIndex: 'avatar',
            width: 72,
            render: (src: string | null | undefined, row) => (
              <Avatar
                size={36}
                src={src || undefined}
                style={{ background: row.id === ADMIN_UID ? '#E8743C' : '#aaa' }}
                icon={src ? undefined : <UserOutlined />}
              >
                {!src && (row.display_name?.[0] ?? '?')}
              </Avatar>
            ),
          },
          {
            title: '昵称',
            dataIndex: 'display_name',
            render: (v: string, row) => (
              <Space size={6}>
                <Text strong>{v}</Text>
                {row.id === ADMIN_UID && (
                  <Tag color="orange" style={{ margin: 0 }}>
                    超级管理员
                  </Tag>
                )}
              </Space>
            ),
          },
          { title: '账号', dataIndex: 'id', ellipsis: true },
          {
            title: '状态',
            dataIndex: 'disabled',
            width: 100,
            render: (d: boolean | undefined, row) => {
              if (row.id === ADMIN_UID) {
                return <Tag color="green">始终启用</Tag>;
              }
              return d ? <Tag color="red">已停用</Tag> : <Tag color="green">正常</Tag>;
            },
          },
          {
            title: '操作',
            width: 140,
            render: (_, row) => {
              if (row.id === ADMIN_UID) {
                return <Text type="secondary" style={{ fontSize: 12 }}>不可操作</Text>;
              }
              return (
                <Space>
                  <Switch
                    checked={!row.disabled}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                    loading={pendingUid === row.id}
                    onChange={() => handleToggle(row.id, !!row.disabled)}
                  />
                </Space>
              );
            },
          },
        ]}
      />
    </div>
  );
}
