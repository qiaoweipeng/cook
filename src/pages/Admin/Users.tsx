// 超级管理员专属：用户管理
// 列出所有用户，对普通用户可启用/禁用；管理员账号不可操作

import { useEffect, useState } from 'react';
import { ProCard, StatisticCard, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Avatar, Tag, Typography, Space, App as AntApp, Tooltip } from 'antd';
import { UserOutlined, MobileOutlined, DesktopOutlined, ReloadOutlined } from '@ant-design/icons';
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
    const adminPromise = ensureAdminRow().catch((e) => {
      console.warn('[users] ensureAdminRow 失败：', e);
    });
    const usersPromise = listUsers();
    const loginsPromise = latestLoginMap();
    try {
      setUsers(await usersPromise);
    } catch (e) {
      message.error('加载用户失败：' + (e as Error).message);
    } finally {
      setLoading(false);
    }
    try { setLogins(await loginsPromise); } catch { /* ignore */ }
    await adminPromise;
  };

  useEffect(() => { load(); }, []);

  const doToggle = async (uid: string, disabled: boolean) => {
    setPendingUid(uid);
    try {
      await setUserDisabled(uid, !disabled);
      message.success(!disabled ? '已停用' : '已启用');
      const target = users.find((u) => u.id === uid);
      logOp(!disabled ? '停用用户' : '启用用户', target?.display_name ?? uid, `账号: ${uid}`);
      setUsers((arr) => arr.map((u) => (u.id === uid ? { ...u, disabled: !disabled } : u)));
    } catch (e) {
      message.error('操作失败：' + (e as Error).message);
    } finally {
      setPendingUid(null);
    }
  };

  const handleToggle = (uid: string, disabled: boolean) => {
    if (uid === ADMIN_UID) { message.warning('超级管理员账号不可停用'); return; }
    if (!disabled) {
      const target = users.find((u) => u.id === uid);
      modal.confirm({
        title: '确认停用该账号？',
        content: (
          <div>
            <p>账号 <Text strong>{target?.display_name ?? uid}</Text>（ID: {uid}）停用后将无法登录。</p>
            <p style={{ marginBottom: 0, color: '#888' }}>若该账号当前正在使用，系统会在 20 秒内将其强制下线。</p>
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

  const columns: ProColumns<UserRow>[] = [
    {
      title: '头像',
      dataIndex: 'avatar',
      width: 72,
      search: false,
      render: (_, row) => (
        <Avatar
          size={36}
          src={row.avatar || undefined}
          style={{ background: row.id === ADMIN_UID ? '#E8743C' : '#aaa' }}
          icon={!row.avatar ? <UserOutlined /> : undefined}
        >
          {!row.avatar && (row.display_name?.[0] ?? '?')}
        </Avatar>
      ),
    },
    {
      title: '昵称',
      dataIndex: 'display_name',
      width: 160,
      fieldProps: { style: { width: 225 } },
      render: (_, row) => (
        <Space size={6}>
          <Text strong>{row.display_name}</Text>
          {row.id === ADMIN_UID && <Tag color="orange" style={{ margin: 0 }}>超级管理员</Tag>}
        </Space>
      ),
    },
    {
      title: '账号',
      dataIndex: 'id',
      ellipsis: true,
      search: false,
    },
    {
      title: '状态',
      dataIndex: 'disabled',
      width: 100,
      valueType: 'select',
      fieldProps: { style: { width: 225 } },
      valueEnum: { true: { text: '已停用', status: 'Error' }, false: { text: '正常', status: 'Success' } },
      render: (_, row) => {
        if (row.id === ADMIN_UID) return <Tag color="green">始终启用</Tag>;
        return row.disabled ? <Tag color="red">已停用</Tag> : <Tag color="green">正常</Tag>;
      },
    },
    {
      title: '最近登录',
      width: 165,
      search: false,
      sorter: (a, b) => {
        const la = logins.get(a.id)?.login_at ? new Date(logins.get(a.id)!.login_at).getTime() : 0;
        const lb = logins.get(b.id)?.login_at ? new Date(logins.get(b.id)!.login_at).getTime() : 0;
        return la - lb;
      },
      render: (_, row) => {
        const l = logins.get(row.id);
        if (!l) return <Text type="secondary">—</Text>;
        return <Text style={{ fontSize: 13 }}>{new Date(l.login_at).toLocaleString('zh-CN', { hour12: false })}</Text>;
      },
    },
    {
      title: '设备',
      width: 190,
      search: false,
      render: (_, row) => {
        const l = logins.get(row.id);
        if (!l) return <Text type="secondary">—</Text>;
        const isMobile = l.device === '移动端';
        return (
          <Tooltip
            title={<div style={{ fontSize: 12 }}>
              <div>UA：{l.ua || '—'}</div>
              <div>屏幕：{l.screen || '—'} ｜ 语言：{l.language || '—'}</div>
            </div>}
          >
            <Space size={6}>
              {isMobile ? <MobileOutlined /> : <DesktopOutlined />}
              <Text style={{ fontSize: 13 }}>{l.device} · {l.os} · {l.browser}</Text>
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: 'IP / 地区',
      width: 200,
      search: false,
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
      title: '操作',
      width: 140,
      search: false,
      render: (_, row) => {
        if (row.id === ADMIN_UID) return <Text type="secondary" style={{ fontSize: 12 }}>不可操作</Text>;
        return (
          <a
            onClick={() => handleToggle(row.id, !!row.disabled)}
            style={{ color: row.disabled ? '#52c41a' : '#ff4d4f' }}
          >
            {pendingUid === row.id ? '处理中…' : row.disabled ? '启用' : '停用'}
          </a>
        );
      },
    },
  ];

  return (
    <>
      <StatisticCard.Group direction="row" style={{ marginBottom: 16 }}>
        <StatisticCard statistic={{ title: '用户总数', value: total, suffix: '人' }} />
        <StatisticCard statistic={{ title: '已停用', value: disabledCount, suffix: '人', valueStyle: { color: '#cf1322' } }} />
        <StatisticCard statistic={{ title: '超级管理员', value: adminPresent ? 1 : 0, suffix: '人', valueStyle: { color: '#E8743C' } }} />
      </StatisticCard.Group>

      <ProTable<UserRow>
        rowKey="id"
        loading={loading}
        bordered
        size="small"
        search={{ labelWidth: 'auto', defaultCollapsed: false, span: 6 }}
        columns={columns}
        params={{ reloadKey: total }}
        request={async (params) => {
          const { current = 1, pageSize = 10, display_name, id, disabled } = params;
          let list = [...users];
          if (display_name) list = list.filter((u) => u.display_name.toLowerCase().includes(String(display_name).toLowerCase()));
          if (id) list = list.filter((u) => u.id.toLowerCase().includes(String(id).toLowerCase()));
          if (disabled !== undefined && disabled !== null) {
            // ProTable 对 valueEnum 的 bool 值传过来是 string 'true' / 'false'
            const v = String(disabled) === 'true';
            list = list.filter((u) => u.disabled === v);
          }
          const total = list.length;
          const paged = list.slice((current - 1) * pageSize, current * pageSize);
          return { data: paged, total, success: true };
        }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        toolBarRender={() => [
          <a key="reload" onClick={() => load()}><ReloadOutlined /> 刷新</a>,
        ]}
      />
    </>
  );
}
