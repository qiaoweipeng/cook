// 「我的家庭」弹窗（N 人版）
// 三种视图：
//   1. 未加入家庭：创建家庭 + 处理收到的邀请
//   2. 管理员：成员列表（权限/移除/转让）、邀请新成员、解散家庭
//   3. 普通成员：只看「已加入 xx 的家庭」+ 退出，看不到其他成员
// 入口：右上角头像下拉菜单 → 我的家庭

import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Tag,
  Typography,
} from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useFamilyStore, type FamilyUser } from '@/store/useFamilyStore';
import { useAuthStore } from '@/store/useAuthStore';

const { Text } = Typography;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ display: 'block', fontWeight: 600, color: '#2D2A26', margin: '18px 0 10px' }}>
      {children}
    </Text>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  border: '1px solid #f0ebe4',
  borderRadius: 12,
  background: '#fff',
  marginBottom: 8,
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FamilyModal({ open, onClose }: Props) {
  const { message } = AntApp.useApp();
  const me = useAuthStore((s) => s.user);
  const family = useFamilyStore((s) => s.family);
  const myRole = useFamilyStore((s) => s.myRole);
  const myPermission = useFamilyStore((s) => s.myPermission);
  const members = useFamilyStore((s) => s.members);
  const incoming = useFamilyStore((s) => s.incoming);
  const incomingTransfers = useFamilyStore((s) => s.incomingTransfers);
  const invitedUids = useFamilyStore((s) => s.invitedUids);
  const transferOut = useFamilyStore((s) => s.transferOut);
  const tableMissing = useFamilyStore((s) => s.tableMissing);
  const load = useFamilyStore((s) => s.load);
  const createFamily = useFamilyStore((s) => s.createFamily);
  const invite = useFamilyStore((s) => s.invite);
  const accept = useFamilyStore((s) => s.accept);
  const decline = useFamilyStore((s) => s.decline);
  const kick = useFamilyStore((s) => s.kick);
  const leave = useFamilyStore((s) => s.leave);
  const transferAdmin = useFamilyStore((s) => s.transferAdmin);
  const acceptTransfer = useFamilyStore((s) => s.acceptTransfer);
  const declineTransfer = useFamilyStore((s) => s.declineTransfer);
  const cancelTransfer = useFamilyStore((s) => s.cancelTransfer);
  const deleteFamily = useFamilyStore((s) => s.deleteFamily);
  const setPermission = useFamilyStore((s) => s.setPermission);
  const searchUsers = useFamilyStore((s) => s.searchUsers);

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<FamilyUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  // 每次打开都刷新一遍（可能刚收到邀请 / 权限刚被改）
  useEffect(() => {
    if (!open) return;
    load().catch((e) => message.error('家庭信息加载失败：' + (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async (fn: () => Promise<void>) => {
    setActing(true);
    try {
      await fn();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const handleSearch = async () => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(keyword));
    } catch (e) {
      message.error('搜索失败：' + (e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (u: FamilyUser) => {
    setBusyUid(u.uid);
    try {
      await invite(u.uid, u.name);
      message.success(`已邀请「${u.name}」，等对方同意`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusyUid(null);
    }
  };

  const familyName = family ? `${family.adminName}的家庭` : '';
  const isAdmin = myRole === 'admin';
  const onlyMe = members.length <= 1;

  return (
    <Modal title="我的家庭" open={open} onCancel={onClose} footer={null} width={560}>
      {tableMissing && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="云端缺少家庭相关的表"
          description="请先在 CloudBase 控制台执行建表 SQL（families / family_members / family_invites / family_menu_audit），再使用家庭功能。"
        />
      )}

      {/* ========== 管理员转让请求（我是接收方，同意后才会生效） ========== */}
      {incomingTransfers.length > 0 && (
        <>
          <SectionTitle>管理员转让请求</SectionTitle>
          {incomingTransfers.map((r) => (
            <div key={r.id} style={{ ...rowStyle, background: '#FFF9F2', borderColor: '#F3C9AF' }}>
              <TeamOutlined style={{ color: '#E8743C', fontSize: 18, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: '#2D2A26' }}>{r.fromName}</span>
                <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                  想把「{r.fromName}的家庭」的管理员转让给你
                </span>
              </div>
              <Space>
                <Button
                  type="primary"
                  size="small"
                  loading={acting}
                  onClick={() =>
                    run(async () => {
                      await acceptTransfer(r.id);
                      message.success('你已成为家庭管理员');
                    })
                  }
                >
                  同意
                </Button>
                <Button
                  size="small"
                  loading={acting}
                  onClick={() =>
                    run(async () => {
                      await declineTransfer(r.id);
                      message.info('已拒绝，管理员不变');
                    })
                  }
                >
                  拒绝
                </Button>
              </Space>
            </div>
          ))}
        </>
      )}

      {/* ========== 视图 1：还没加入任何家庭 ========== */}
      {!family && (
        <>
          {incoming.length > 0 && (
            <>
              <SectionTitle>收到的邀请</SectionTitle>
              {incoming.map((r) => (
                <div key={r.id} style={rowStyle}>
                  <TeamOutlined style={{ color: '#E8743C', fontSize: 18, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: '#2D2A26' }}>{r.fromName}</span>
                    <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                      邀请你加入「{r.fromName}的家庭」
                    </span>
                  </div>
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      loading={acting}
                      onClick={() =>
                        run(async () => {
                          await accept(r.id);
                          message.success(`已加入「${r.fromName}的家庭」`);
                        })
                      }
                    >
                      同意
                    </Button>
                    <Button
                      size="small"
                      loading={acting}
                      onClick={() =>
                        run(async () => {
                          await decline(r.id);
                          message.info('已拒绝该邀请');
                        })
                      }
                    >
                      拒绝
                    </Button>
                  </Space>
                </div>
              ))}
            </>
          )}

          <SectionTitle>创建家庭</SectionTitle>
          <div style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>
            创建后你就是管理员，家庭自动命名为「{me?.nickName ?? '我'}
            的家庭」。只有你能邀请成员、设置权限；家人加入后可在「今日菜单」页切换到共享菜单。
          </div>
          <Button
            type="primary"
            icon={<TeamOutlined />}
            loading={acting}
            disabled={tableMissing}
            onClick={() =>
              run(async () => {
                await createFamily();
                message.success('家庭创建成功，快去邀请家人吧');
              })
            }
          >
            创建我的家庭
          </Button>
        </>
      )}

      {/* ========== 视图 2：我是管理员 ========== */}
      {family && isAdmin && (
        <>
          <SectionTitle>{familyName}</SectionTitle>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 10 }}>
            共 {members.length} 名成员 · 只有你能看到完整成员列表
          </div>

          {members.map((m) => {
            const isSelf = m.uid === me?.uid;
            return (
              <div key={m.uid} style={rowStyle}>
                <Avatar size={36} icon={<UserOutlined />} style={{ background: '#E8743C', flexShrink: 0 }}>
                  {m.name.slice(0, 1)}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: '#2D2A26' }}>{m.name}</span>
                  {isSelf && (
                    <Tag color="orange" style={{ marginLeft: 8 }}>
                      管理员（我）
                    </Tag>
                  )}
                </div>
                {!isSelf && (
                  <Space size={8}>
                    <Segmented
                      size="small"
                      value={m.permission === 'edit' ? '可修改' : '仅查看'}
                      options={['仅查看', '可修改']}
                      onChange={(v) =>
                        run(async () => {
                          await setPermission(m.uid, v === '可修改' ? 'edit' : 'view');
                          message.success(`已把「${m.name}」设为${v}`);
                        })
                      }
                    />
                    <Popconfirm
                      title={`把管理员转让给「${m.name}」？`}
                      description="对方同意后才会生效；对方同意前你仍是管理员"
                      okText="发起转让"
                      cancelText="取消"
                      onConfirm={() =>
                        run(async () => {
                          await transferAdmin(m.uid);
                          message.success(`转让请求已发送给「${m.name}」，对方同意后生效`);
                        })
                      }
                    >
                      <Button size="small" loading={acting} disabled={!!transferOut}>
                        转让
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title={`把「${m.name}」移出家庭？`}
                      okText="移除"
                      okButtonProps={{ danger: true }}
                      cancelText="取消"
                      onConfirm={() =>
                        run(async () => {
                          await kick(m.uid);
                          message.success(`已移除「${m.name}」`);
                        })
                      }
                    >
                      <Button size="small" danger loading={acting}>
                        移除
                      </Button>
                    </Popconfirm>
                  </Space>
                )}
              </div>
            );
          })}

          {transferOut && (
            <div style={{ ...rowStyle, background: '#FFF9F2', borderColor: '#F3C9AF' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#8a5a2b' }}>
                已发起管理员转让给「{transferOut.toName}」，等待对方同意
              </div>
              <Button
                size="small"
                loading={acting}
                onClick={() =>
                  run(async () => {
                    await cancelTransfer();
                    message.info('已取消转让');
                  })
                }
              >
                取消转让
              </Button>
            </div>
          )}

          <SectionTitle>邀请成员</SectionTitle>
          <Input.Search
            placeholder="输入对方的账号昵称"
            enterButton="搜索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            loading={searching}
            style={{ marginBottom: 12 }}
          />
          {results.map((u) => {
            const invited = invitedUids.includes(u.uid);
            const alreadyIn = members.some((m) => m.uid === u.uid);
            return (
              <div key={u.uid} style={rowStyle}>
                <Avatar
                  size={36}
                  src={u.avatar || undefined}
                  icon={<UserOutlined />}
                  style={{ background: '#E8743C', flexShrink: 0 }}
                >
                  {u.name.slice(0, 1)}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#2D2A26' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>ID: {u.uid}</div>
                </div>
                <Button
                  type="primary"
                  size="small"
                  ghost={invited}
                  disabled={invited || alreadyIn}
                  loading={busyUid === u.uid}
                  onClick={() => handleInvite(u)}
                >
                  {alreadyIn ? '已在家庭' : invited ? '已邀请' : '邀请'}
                </Button>
              </div>
            );
          })}
          {keyword.trim() && !searching && results.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没找到这个昵称的用户"
              style={{ margin: '12px 0' }}
            />
          )}

          <SectionTitle>解散家庭</SectionTitle>
          {onlyMe ? (
            <Popconfirm
              title="确定解散家庭？"
              description="家庭菜单和修改记录会一起删除，不可恢复"
              okText="解散"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() =>
                run(async () => {
                  await deleteFamily();
                  message.success('家庭已解散');
                  onClose();
                })
              }
            >
              <Button danger loading={acting}>
                解散家庭
              </Button>
            </Popconfirm>
          ) : (
            <div style={{ color: '#999', fontSize: 13 }}>
              家庭里还有其他成员时不能解散/退出。你可以先「转让」管理员，再以普通成员身份退出。
            </div>
          )}
        </>
      )}

      {/* ========== 视图 3：我是普通成员 ========== */}
      {family && !isAdmin && (
        <>
          <SectionTitle>我的家庭</SectionTitle>
          <div style={rowStyle}>
            <TeamOutlined style={{ color: '#E8743C', fontSize: 20, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#2D2A26' }}>已加入「{familyName}」</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                菜单权限：{myPermission === 'edit' ? '可修改（能增删家庭菜单）' : '仅查看（不能修改家庭菜单）'}
              </div>
            </div>
            <Tag color={myPermission === 'edit' ? 'orange' : 'default'}>
              {myPermission === 'edit' ? '可修改' : '仅查看'}
            </Tag>
          </div>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
            家庭成员列表只有管理员可见。如需修改权限，请联系管理员。
          </div>
          <Popconfirm
            title="退出家庭？"
            description="退出后将看不到家庭共享菜单（你的个人菜单不受影响）"
            okText="退出"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() =>
              run(async () => {
                await leave();
                message.success('已退出家庭');
                onClose();
              })
            }
          >
            <Button danger loading={acting}>
              退出家庭
            </Button>
          </Popconfirm>
        </>
      )}
    </Modal>
  );
}
