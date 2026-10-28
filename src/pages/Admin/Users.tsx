// 超级管理员专属：用户管理
// 列出所有用户，对普通用户可启用/禁用；管理员账号不可操作

import { useEffect, useState } from 'react';
import { Table, Switch, Avatar, Tag, Typography, Space, App as AntApp, Card, Statistic, Row, Col, Tooltip } from 'antd';
import { UserOutlined, MobileOutlined, DesktopOutlined } from '@ant-design/icons';
import { ADMIN_UID, ensureAdminRow, listUsers, setUserDisabled, type UserRow } from '@/lib/userAdmin';
import { latestLoginMap, type LoginLogRow } from '@/lib/clientInfo';
import { logOp } from '@/lib/opLog';

const { Text } = Typography;

export default function AdminUsers() {
  const { message, modal } = AntApp.useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [logins, setLogins] = useState<Map<string, LoginLogRow>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // 三个请求互不依赖，并行发出：原来串行要等 3 个跨境往返的时间相加
    const adminPromise = ensureAdminRow().catch((e) => {
      // 只是确保管理员行存在，失败不该挡住用户列表
      console.warn('[users] ensureAdminRow 失败：', e);
    });
    const usersPromise = listUsers();
    // 登录日志单独加载：login_logs 表没建也不影响用户列表
    const loginsPromise = latestLoginMap();
    try {
      setUsers(await usersPromise);
    } catch (e) {
      message.error('加载用户失败：' + (e as Error).message);
    } finally {
      setLoading(false);
    }
    try {
      setLogins(await loginsPromise);
    } catch {
      // 忽略
    }
    await adminPromise;
  };

  useEffect(() => {
    load();
  }, []);

  const doToggle = async (uid: string, disabled: boolean) => {
    setPendingUid(uid);
    try {
      await setUserDisabled(uid, !disabled);
      message.success(!disabled ? '已停用' : '已启用');
      // 记操作日志（目标用昵称+账号，方便追溯）
      const target = users.find((u) => u.id === uid);
      logOp(!disabled ? '停用用户' : '启用用户', target?.display_name ?? uid, `账号: ${uid}`);
      setUsers((arr) =>
        arr.map((u) => (u.id === uid ? { ...u, disabled: !disabled } : u))
      );
    } catch (e) {
      message.error('操作失败：' + (e as Error).message);
    } finally {
      setPendingUid(null);
    }
  };

  const handleToggle = (uid: string, disabled: boolean) => {
    if (uid === ADMIN_UID) {
      message.warning('超级管理员账号不可停用');
      return;
    }
    // 停用需要二次确认；启用直接执行
    if (!disabled) {
      const target = users.find((u) => u.id === uid);
      modal.confirm({
        title: '确认停用该账号？',
        content: (
          <div>
            <p>
              账号 <Text strong>{target?.display_name ?? uid}</Text>（ID: {uid}）停用后将无法登录。
            </p>
            <p style={{ marginBottom: 0, color: '#888' }}>
              若该账号当前正在使用，系统会在 20 秒内将其强制下线。
            </p>
          </div>
        ),
        okText: '确认停用',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => doToggle(uid, disabled),
      });
      return;
    }
    void doToggle(uid, disabled);
  };

  const total = users.length;
  const disabledCount = users.filter((u) => u.disabled).length;
  const adminPresent = users.some((u) => u.id === ADMIN_UID);

  return (
    <div style={{ paddingTop: 12 }}>
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
            title: '最近登录',
            width: 165,
            render: (_, row) => {
              const l = logins.get(row.id);
              if (!l) return <Text type="secondary">—</Text>;
              return (
                <Text style={{ fontSize: 13 }}>
                  {new Date(l.login_at).toLocaleString('zh-CN', { hour12: false })}
                </Text>
              );
            },
          },
          {
            title: '设备',
            width: 190,
            render: (_, row) => {
              const l = logins.get(row.id);
              if (!l) return <Text type="secondary">—</Text>;
              const isMobile = l.device === '移动端';
              return (
                <Tooltip
                  title={
                    <div style={{ fontSize: 12 }}>
                      <div>UA：{l.ua || '—'}</div>
                      <div>屏幕：{l.screen || '—'} ｜ 语言：{l.language || '—'}</div>
                    </div>
                  }
                >
                  <Space size={6}>
                    {isMobile ? <MobileOutlined /> : <DesktopOutlined />}
                    <Text style={{ fontSize: 13 }}>
                      {l.device} · {l.os} · {l.browser}
                    </Text>
                  </Space>
                </Tooltip>
              );
            },
          },
          {
            title: 'IP / 地区',
            width: 200,
            render: (_, row) => {
              const l = logins.get(row.id);
              if (!l || !l.ip) return <Text type="secondary">—</Text>;
              return (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <div>{l.ip}</div>
                  {l.region && <Text type="secondary" style={{ fontSize: 12 }}>{l.region}</Text>}
                </div>
              );
            },
          },
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
