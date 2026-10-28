// 超级管理员专属：系统管理
// 系统运行状态概览 + 云端各表行数统计 + 登录日志

import { useEffect, useState } from "react";
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
  Modal,
  Select,
  Alert,
  Tabs,
  message,
} from "antd";
import {
  ReloadOutlined,
  MobileOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import { getCloudHost, pgCount } from "@/lib/supabase";
import { listLoginLogs, type LoginLogRow } from "@/lib/clientInfo";
import { listOpLogs, type OpLogRow } from "@/lib/opLog";
import { cloudList } from "@/lib/cloudSync";
import { seedDishes } from "@/data/seedDishes";
import { missingSeedDishes, useDishStore } from "@/store/useDishStore";
import type { Dish } from "@/types";

const { Text } = Typography;

/** 云端数据表清单（系统管理页统计用） */
const TABLES: Array<{ name: string; label: string }> = [
  { name: "users", label: "用户" },
  { name: "dishes", label: "菜品" },
  { name: "dish_ingredients", label: "菜品-食材关联" },
  { name: "ingredients", label: "食材库" },
  { name: "weekly_menus", label: "菜单（按日期）" },
  { name: "shopping_lists", label: "采购清单" },
  { name: "families", label: "家庭" },
  { name: "family_members", label: "家庭成员" },
  { name: "family_invites", label: "家庭邀请/转让" },
  { name: "family_menu_audit", label: "家庭菜单历史" },
  { name: "login_logs", label: "登录日志" },
  { name: "op_logs", label: "操作日志" },
];

const fmtTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—";

export default function AdminSystem() {
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Record<string, number | "err">>({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [logs, setLogs] = useState<LoginLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [opLogs, setOpLogs] = useState<OpLogRow[]>([]);
  const [opLogsLoading, setOpLogsLoading] = useState(false);
  const [cacheUsage, setCacheUsage] = useState<string>("—");
  const [refreshing, setRefreshing] = useState(false);

  /* ===== 种子数据播种（人工控制） ===== */
  const [seedChecking, setSeedChecking] = useState(false);
  const [seedMissing, setSeedMissing] = useState<Dish[] | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [overwriteIds, setOverwriteIds] = useState<string[]>([]);
  const [overwriting, setOverwriting] = useState(false);
  const seedMissingToCloud = useDishStore((s) => s.seedMissingToCloud);
  const overwriteDishFromSeed = useDishStore((s) => s.overwriteDishFromSeed);

  const loadStatus = async () => {
    setCountsLoading(true);
    // 连通性探测并入 12 表并发统计：users 表数得出来 = 云端正常，
    // 不再先单独跑一轮探测（省掉一个串行的跨境往返）
    // 各表行数（单表失败不影响其他表）
    const entries = await Promise.all(
      TABLES.map(async (t) => {
        try {
          return [t.name, await pgCount(t.name)] as const;
        } catch {
          return [t.name, "err"] as const;
        }
      }),
    );
    const map = Object.fromEntries(entries);
    setCounts(map);
    setCloudOk(map["users"] !== "err");
    setCountsLoading(false);
    // 浏览器本地缓存占用（IndexedDB）
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage != null) {
        const used = (est.usage / 1024 / 1024).toFixed(2);
        const quota = est.quota
          ? (est.quota / 1024 / 1024 / 1024).toFixed(1) + " GB"
          : "—";
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

  /* ===== 种子数据播种（人工控制） ===== */

  // 检查缺失：种子里有、云端没有的菜。必须 throwOnError——
  // 读失败时得到的「缺失」可能是假的（整表没读到），绝不能拿去触发写入
  const checkMissing = async () => {
    setSeedChecking(true);
    try {
      const remote = await cloudList<Dish>("dishes", { throwOnError: true });
      setSeedMissing(missingSeedDishes(new Set(remote.map((r) => r.data.id))));
    } catch (e) {
      setSeedMissing(null);
      message.error("读取云端菜品失败，无法判断缺失，请检查网络后重试");
      console.error("[seed] 检查缺失失败：", e);
    } finally {
      setSeedChecking(false);
    }
  };

  const showSeedConfirm = () => {
    if (!seedMissing?.length) return;
    const names = seedMissing.map((d) => d.name).join("、");
    Modal.confirm({
      title: `补入 ${seedMissing.length} 道缺失的种子菜？`,
      content: (
        <div style={{ maxHeight: 200, overflow: "auto" }}>
          {names}（只新增，不覆盖云端已有的任何菜）
        </div>
      ),
      okText: "播种",
      onOk: async () => {
        setSeeding(true);
        try {
          const { written } = await seedMissingToCloud();
          message.success(`已补入 ${written} 道种子菜`);
          setSeedMissing([]);
          loadStatus();
        } catch (e) {
          message.error(`播种失败：${(e as Error).message ?? "请重试"}`);
        } finally {
          setSeeding(false);
        }
      },
    });
  };

  const doOverwrite = async () => {
    if (!overwriteIds.length) return;
    setOverwriting(true);
    let ok = 0;
    const failed: string[] = [];
    for (const id of overwriteIds) {
      try {
        await overwriteDishFromSeed(id);
        ok += 1;
      } catch {
        failed.push(seedDishes.find((d) => d.id === id)?.name ?? id);
      }
    }
    setOverwriting(false);
    if (failed.length) {
      message.warning(
        `已覆盖 ${ok} 道，失败 ${failed.length} 道：${failed.join("、")}`,
      );
    } else {
      message.success(`已用种子覆盖 ${ok} 道菜`);
    }
    setOverwriteOpen(false);
    setOverwriteIds([]);
    loadStatus();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <div style={{ paddingTop: 12 }}>
      {/*
        主体拆成四个 Tab，免得一整条长页往下滚：
        概览（运行状态 + 数据统计）/ 种子播种 / 操作日志 / 登录日志。
        数据仍然挂载时一次全拉（refreshAll），切 Tab 只切视图不重新请求。
        全局刷新按钮放在 Tab 栏右端（tabBarExtraContent），不单独占一行。
      */}
      <Tabs
        defaultActiveKey="overview"
        tabBarExtraContent={{
          right: (
            <Button icon={<ReloadOutlined />} loading={refreshing} onClick={refreshAll}>
              刷新
            </Button>
          ),
        }}
        items={[
          {
            key: "overview",
            label: "概览",
            children: (
              <>
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
                      <Statistic
                        title="云环境"
                        valueRender={() => (
                          <span style={{ fontSize: 14 }}>{getCloudHost()}</span>
                        )}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={6}>
                    <Card>
                      <Statistic
                        title="运行模式"
                        valueRender={() => (
                          <span style={{ fontSize: 14 }}>
                            {import.meta.env.MODE === "production"
                              ? "生产环境"
                              : "开发环境"}
                          </span>
                        )}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={6}>
                    <Card>
                      <Statistic
                        title="本机浏览器缓存"
                        valueRender={() => (
                          <span style={{ fontSize: 14 }}>{cacheUsage}</span>
                        )}
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
                      {
                        title: "数据表",
                        dataIndex: "name",
                        width: 220,
                        render: (v: string) => <code>{v}</code>,
                      },
                      { title: "内容", dataIndex: "label" },
                      {
                        title: "行数",
                        width: 120,
                        render: (_, row) => {
                          const v = counts[row.name];
                          if (v === undefined)
                            return <Text type="secondary">…</Text>;
                          if (v === "err")
                            return <Tag color="red">表不存在或无权限</Tag>;
                          return <Text strong>{v}</Text>;
                        },
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: "seed",
            label: "种子播种",
            children: (
              <>
                {/* 种子数据播种（人工控制） */}
                <Card
                  title="种子数据播种（人工控制）"
                  style={{ marginBottom: 16 }}
                >
                  <Text type="secondary">
                    启动加载只读云端，<Text strong>绝不自动播种</Text>
                    （防止网络失败被误判成空表 → 种子覆盖云端数据，见
                    README「图片消失第二回」）。
                    缺什么、什么时候补，由你在这里手动决定。
                  </Text>
                  <div style={{ marginTop: 12 }}>
                    <Space wrap>
                      <Button loading={seedChecking} onClick={checkMissing}>
                        检查缺失
                      </Button>
                      <Button
                        type="primary"
                        loading={seeding}
                        disabled={!seedMissing?.length}
                        onClick={showSeedConfirm}
                      >
                        补缺失种子
                        {seedMissing ? `（${seedMissing.length} 道）` : ""}
                      </Button>
                      <Button danger onClick={() => setOverwriteOpen(true)}>
                        种子覆盖…
                      </Button>
                    </Space>
                    {seedMissing !== null && seedMissing.length === 0 && (
                      <Text type="secondary" style={{ marginLeft: 12 }}>
                        种子与云端一致，无缺失
                      </Text>
                    )}
                  </div>
                </Card>

                {/* 种子覆盖弹窗（危险操作） */}
                <Modal
                  title="用种子版本覆盖云端菜品"
                  open={overwriteOpen}
                  onCancel={() => !overwriting && setOverwriteOpen(false)}
                  onOk={doOverwrite}
                  okText={`覆盖 ${overwriteIds.length} 道`}
                  okButtonProps={{
                    danger: true,
                    disabled: !overwriteIds.length,
                  }}
                  confirmLoading={overwriting}
                  width={520}
                >
                  <Alert
                    type="warning"
                    showIcon
                    message="危险操作"
                    description="将用代码里的种子版本整体替换所选菜品（名称、食材、步骤、图地址全部替换）。这些菜在 App 里做过的修改会丢失。适用于：种子配方更新后的同步、恢复被覆盖的图地址。"
                    style={{ marginBottom: 12 }}
                  />
                  <Select
                    mode="multiple"
                    showSearch
                    allowClear
                    placeholder="选择要覆盖的菜品（可搜索）"
                    style={{ width: "100%" }}
                    value={overwriteIds}
                    onChange={setOverwriteIds}
                    options={seedDishes.map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))}
                    filterOption={(input, option) =>
                      ((option?.label as string) ?? "")
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                  />
                </Modal>
              </>
            ),
          },
          {
            key: "opLogs",
            label: "操作日志",
            children: (
              <>
                {/* 操作日志 */}
                <Card
                  title="操作日志（最近 100 条）"
                  style={{ marginBottom: 16 }}
                  extra={
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={opLogsLoading}
                      onClick={loadOpLogs}
                    >
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
                    locale={{ emptyText: "暂无操作日志（需先建 op_logs 表）" }}
                    columns={[
                      {
                        title: "时间",
                        dataIndex: "created_at",
                        width: 165,
                        render: fmtTime,
                      },
                      {
                        title: "操作人",
                        width: 140,
                        render: (_, l) => (
                          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                            <div>{l.actor_name || l.actor_uid}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              ID: {l.actor_uid}
                            </Text>
                          </div>
                        ),
                      },
                      {
                        title: "动作",
                        dataIndex: "action",
                        width: 160,
                        render: (v: string) => <Tag color="blue">{v}</Tag>,
                      },
                      {
                        title: "对象",
                        dataIndex: "target",
                        width: 180,
                        ellipsis: true,
                      },
                      { title: "详情", dataIndex: "detail", ellipsis: true },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: "loginLogs",
            label: "登录日志",
            children: (
              <>
                {/* 登录日志 */}
                <Card
                  title="登录日志（最近 100 条）"
                  extra={
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={logsLoading}
                      onClick={loadLogs}
                    >
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
                    locale={{
                      emptyText: "暂无登录日志（需先建 login_logs 表）",
                    }}
                    columns={[
                      {
                        title: "时间",
                        dataIndex: "login_at",
                        width: 165,
                        render: fmtTime,
                      },
                      {
                        title: "用户",
                        width: 140,
                        render: (_, l) => (
                          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                            <div>{l.nick || l.uid}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              ID: {l.uid}
                            </Text>
                          </div>
                        ),
                      },
                      {
                        title: "设备",
                        width: 190,
                        render: (_, l) => (
                          <Tooltip title={l.ua}>
                            <Space size={6}>
                              {l.device === "移动端" ? (
                                <MobileOutlined />
                              ) : (
                                <DesktopOutlined />
                              )}
                              <span style={{ fontSize: 13 }}>
                                {l.device} · {l.os} · {l.browser}
                              </span>
                            </Space>
                          </Tooltip>
                        ),
                      },
                      {
                        title: "IP / 地区",
                        width: 200,
                        render: (_, l) =>
                          l.ip ? (
                            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                              <div>{l.ip}</div>
                              {l.region && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {l.region}
                                </Text>
                              )}
                            </div>
                          ) : (
                            <Text type="secondary">—</Text>
                          ),
                      },
                      { title: "屏幕", dataIndex: "screen", width: 110 },
                      { title: "语言", dataIndex: "language", width: 100 },
                    ]}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
