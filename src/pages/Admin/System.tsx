// 超级管理员专属：系统管理
// 系统运行状态概览 + 云端各表行数统计 + 登录日志

import { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Typography,
  Space,
  Button,
  Tooltip,
} from 'antd';
import {
  DashboardOutlined,
  ReloadOutlined,
  MobileOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import { getEnvId, pgCount } from '@/lib/cloudbase';
import { listLoginLogs, type LoginLogRow } from '@/lib/clientInfo';
import { listOpLogs, type OpLogRow } from '@/lib/opLog';

const { Title, Text } = Typography;

/** 云端数据表清单（系统管理页统计用） */
const TABLES: Array<{ name: string; label: string }> = [
  { name: 'users', label: '用户' },
  { name: 'dishes', label: '菜品' },
  { name: 'dish_ingredients', label: '菜品-食材关联' },
  { name: 'ingredients', label: '食材库' },
  { name: 'weekly_menus', label: '每周菜单' },
  { name: 'shopping_lists', label: '采购清单' },
  { name: 'families', label: '家庭' },
  { name: 'family_members', label: '家庭成员' },
  { name: 'family_invites', label: '家庭邀请/转让' },
  { name: 'family_menu_audit', label: '家庭菜单历史' },
  { name: 'login_logs', label: '登录日志' },
  { name: 'op_logs', label: '操作日志' },
];

const fmtTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '—';

export default function AdminSystem() {
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Record<string, number | 'err'>>({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [logs, setLogs] = useState<LoginLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [opLogs, setOpLogs] = useState<OpLogRow[]>([]);
  const [opLogsLoading, setOpLogsLoading] = useState(false);
  const [cacheUsage, setCacheUsage] = useState<string>('—');
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = async () => {
    setCountsLoading(true);
    // 云端连通性探测：数一下 users 表
    try {
      await pgCount('users');
      setCloudOk(true);
    } catch {
      setCloudOk(false);
    }
    // 各表行数（单表失败不影响其他表）
    const entries = await Promise.all(
      TABLES.map(async (t) => {
        try {
          return [t.name, await pgCount(t.name)] as const;
        } catch {
          return [t.name, 'err'] as const;
        }
      })
    );
    setCounts(Object.fromEntries(entries));
    setCountsLoading(false);
    // 浏览器本地缓存占用（IndexedDB）
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage != null) {
        const used = (est.usage / 1024 / 1024).toFixed(2);
        const quota = est.quota ? (est.quota / 1024 / 1024 / 1024).toFixed(1) + ' GB' : '—';
        setCacheUsage(`${used} MB / ${quota}`);
      }
    } catch {
      // 忽略
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      setLogs(await listLoginLogs(100));
    } catch {
      // login_logs 表可能没建
    } finally {
      setLogsLoading(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadStatus(), loadLogs(), loadOpLogs()]);
    setRefreshing(false);
  };

  const loadOpLogs = async () => {
    setOpLogsLoading(true);
    try {
      setOpLogs(await listOpLogs(100));
    } catch {
      // op_logs 表可能没建
    } finally {
      setOpLogsLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <DashboardOutlined style={{ color: '#E8743C', marginRight: 8 }} />
            系统管理
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            系统运行状态、云端数据统计和登录日志。只有超级管理员能看到此页。
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={refreshAll}>
          刷新
        </Button>
      </div>

      {/* 运行状态概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="云端连接"
              valueRender={() =>
                cloudOk === null ? (
                  <Tag>检测中…</Tag>
                ) : cloudOk ? (
                  <Tag color="green">正常</Tag>
                ) : (
                  <Tag color="red">异常</Tag>
                )
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="云环境" valueRender={() => <span style={{ fontSize: 14 }}>{getEnvId()}</span>} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="运行模式"
              valueRender={() => (
                <span style={{ fontSize: 14 }}>
                  {import.meta.env.MODE === 'production' ? '生产环境' : '开发环境'}
                </span>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="本机浏览器缓存"
              valueRender={() => <span style={{ fontSize: 14 }}>{cacheUsage}</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* 数据表统计 */}
      <Card title="云端数据统计" style={{ marginBottom: 16 }}>
        <Table
          rowKey="name"
          size="small"
          loading={countsLoading}
          dataSource={TABLES}
          pagination={false}
          columns={[
            { title: '数据表', dataIndex: 'name', width: 220, render: (v: string) => <code>{v}</code> },
            { title: '内容', dataIndex: 'label' },
            {
              title: '行数',
              width: 120,
              render: (_, row) => {
                const v = counts[row.name];
                if (v === undefined) return <Text type="secondary">…</Text>;
                if (v === 'err') return <Tag color="red">表不存在或无权限</Tag>;
                return <Text strong>{v}</Text>;
              },
            },
          ]}
        />
      </Card>

      {/* 操作日志 */}
      <Card
        title="操作日志（最近 100 条）"
        style={{ marginBottom: 16 }}
        extra={
          <Button size="small" icon={<ReloadOutlined />} loading={opLogsLoading} onClick={loadOpLogs}>
            刷新
          </Button>
        }
      >
        <Table<OpLogRow>
          rowKey="id"
          size="small"
          loading={opLogsLoading}
          dataSource={opLogs}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无操作日志（需先建 op_logs 表）' }}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 165, render: fmtTime },
            {
              title: '操作人',
              width: 140,
              render: (_, l) => (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <div>{l.actor_name || l.actor_uid}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>ID: {l.actor_uid}</Text>
                </div>
              ),
            },
            {
              title: '动作',
              dataIndex: 'action',
              width: 160,
              render: (v: string) => <Tag color="blue">{v}</Tag>,
            },
            { title: '对象', dataIndex: 'target', width: 180, ellipsis: true },
            { title: '详情', dataIndex: 'detail', ellipsis: true },
          ]}
        />
      </Card>

      {/* 登录日志 */}
      <Card
        title="登录日志（最近 100 条）"
        extra={
          <Button size="small" icon={<ReloadOutlined />} loading={logsLoading} onClick={loadLogs}>
            刷新
          </Button>
        }
      >
        <Table<LoginLogRow>
          rowKey="id"
          size="small"
          loading={logsLoading}
          dataSource={logs}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无登录日志（需先建 login_logs 表）' }}
          columns={[
            { title: '时间', dataIndex: 'login_at', width: 165, render: fmtTime },
            {
              title: '用户',
              width: 140,
              render: (_, l) => (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <div>{l.nick || l.uid}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>ID: {l.uid}</Text>
                </div>
              ),
            },
            {
              title: '设备',
              width: 190,
              render: (_, l) => (
                <Tooltip title={l.ua}>
                  <Space size={6}>
                    {l.device === '移动端' ? <MobileOutlined /> : <DesktopOutlined />}
                    <span style={{ fontSize: 13 }}>
                      {l.device} · {l.os} · {l.browser}
                    </span>
                  </Space>
                </Tooltip>
              ),
            },
            {
              title: 'IP / 地区',
              width: 200,
              render: (_, l) =>
                l.ip ? (
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <div>{l.ip}</div>
                    {l.region && <Text type="secondary" style={{ fontSize: 12 }}>{l.region}</Text>}
                  </div>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            { title: '屏幕', dataIndex: 'screen', width: 110 },
            { title: '语言', dataIndex: 'language', width: 100 },
          ]}
        />
      </Card>
    </div>
  );
}
