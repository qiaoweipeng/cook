// 家庭功能（N 人版）：
// - 一个家庭一名管理员（创建者），家庭名 = 管理员当前昵称 +「的家庭」，自动跟随，不可修改
// - 只有管理员能邀请成员；普通成员只能看到「已加入 xx 的家庭」，看不到其他成员
// - 管理员可设置成员权限（edit 可改菜单 / view 仅查看）、移除成员、转让管理员
// - 管理员在有其他成员时不能直接退出，需先转让；只剩自己时可解散家庭
// 数据表（CloudBase 控制台建表 SQL 见对话记录）：
//   families / family_members / family_invites / family_menu_audit

import { create } from 'zustand';
import {
  isCloudEnabled,
  pgDeleteById,
  pgInsert,
  pgSelect,
  pgUpdateById,
} from '@/lib/cloudbase';
import { useAuthStore } from './useAuthStore';

export interface FamilyUser {
  uid: string;
  name: string;
  avatar?: string | null;
}

export interface FamilyMember {
  uid: string;
  name: string;
  role: 'admin' | 'member';
  permission: 'edit' | 'view';
}

export interface FamilyInviteItem {
  id: string;
  familyId: string;
  fromUid: string;
  fromName: string;
  createdAt: number;
}

export interface MenuAuditItem {
  id: string;
  actorUid: string;
  actorName: string;
  action: 'add' | 'remove' | 'clear';
  day: string;
  detail: string;
  createdAt: number;
}

export interface FamilyInfo {
  id: string;
  adminUid: string;
  adminName: string;
}

interface FamilyState {
  /** 我所在的家庭（null = 没加入任何家庭） */
  family: FamilyInfo | null;
  /** 我在家庭里的角色 */
  myRole: 'admin' | 'member' | null;
  /** 我的菜单权限（admin 恒视为 edit） */
  myPermission: 'edit' | 'view';
  /** 全部成员（仅管理员加载；普通成员为空数组） */
  members: FamilyMember[];
  /** 邀请我加入、待处理的邀请 */
  incoming: FamilyInviteItem[];
  /** 发给我的、待处理的「管理员转让」请求 */
  incomingTransfers: FamilyInviteItem[];
  /** 我（管理员）已发出、待处理的邀请目标 uid */
  invitedUids: string[];
  /** 我（管理员）发出的待处理转让请求（同时最多一个） */
  transferOut: { id: string; toUid: string; toName: string } | null;
  loading: boolean;
  /** 家庭相关的表还没建（降级提示用） */
  tableMissing: boolean;

  load: () => Promise<void>;
  createFamily: () => Promise<void>;
  invite: (uid: string, name: string) => Promise<void>;
  accept: (inviteId: string) => Promise<void>;
  decline: (inviteId: string) => Promise<void>;
  kick: (uid: string) => Promise<void>;
  leave: () => Promise<void>;
  /** 发起管理员转让请求（对方同意后才生效） */
  transferAdmin: (uid: string) => Promise<void>;
  /** 接受管理员转让（我是接收方） */
  acceptTransfer: (requestId: string) => Promise<void>;
  /** 拒绝管理员转让（我是接收方） */
  declineTransfer: (requestId: string) => Promise<void>;
  /** 取消我发出的转让请求（我是管理员） */
  cancelTransfer: () => Promise<void>;
  deleteFamily: () => Promise<void>;
  setPermission: (uid: string, permission: 'edit' | 'view') => Promise<void>;
  searchUsers: (kw: string) => Promise<FamilyUser[]>;
  listMenuAudit: (limit?: number) => Promise<MenuAuditItem[]>;
  resetForUser: () => void;
}

function myUid(): string | null {
  return useAuthStore.getState().user?.uid ?? null;
}

/**
 * PostgREST 过滤值。
 * 注意：这个网关不会解析双引号——eq."大王" 会被当成带引号的字面量而匹配不到，
 * 所以值一律裸写（中文/字母/数字直接拼进去即可），不要加引号。
 */
function fval(v: string): string {
  return String(v);
}

/** 家庭 id 跟随创建者：一个家庭随创建账号存在，转让管理员后 id 不变（名字自动跟随新管理员） */
function familyIdOf(creatorUid: string): string {
  return `fam_${creatorUid}`;
}

/** 成员行 id 确定性生成，防重复、方便删除 */
function memberRowId(familyId: string, uid: string): string {
  return `${familyId}__${uid}`;
}

const EMPTY = {
  family: null,
  myRole: null,
  myPermission: 'view' as const,
  members: [] as FamilyMember[],
  incoming: [] as FamilyInviteItem[],
  incomingTransfers: [] as FamilyInviteItem[],
  invitedUids: [] as string[],
  transferOut: null,
};

/** 当前用户是否能修改家庭菜单（管理员或有修改权限的成员） */
export function canEditFamilyMenu(): boolean {
  const s = useFamilyStore.getState();
  return s.myRole === 'admin' || s.myPermission === 'edit';
}

/** 记录一条家庭菜单修改历史（失败只打日志，不影响主流程） */
export async function logMenuAudit(
  familyId: string,
  action: 'add' | 'remove' | 'clear',
  day: string,
  detail: string,
): Promise<void> {
  if (!isCloudEnabled()) return;
  const user = useAuthStore.getState().user;
  try {
    await pgInsert('family_menu_audit', {
      id: crypto.randomUUID(),
      family_id: familyId,
      actor_uid: user?.uid ?? '',
      actor_name: user?.nickName ?? '',
      action,
      day,
      detail,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[family] 写历史记录失败：', e);
  }
}

export const useFamilyStore = create<FamilyState>()((set, get) => ({
  ...EMPTY,
  loading: false,
  tableMissing: false,

  load: async () => {
    const me = myUid();
    if (!isCloudEnabled() || !me) {
      set({ ...EMPTY, loading: false });
      return;
    }
    set({ loading: true });
    try {
      // 1. 我在哪个家庭
      const myRows = await pgSelect<any>('family_members', { uid: `eq.${fval(me)}`, limit: 1 });
      const myRow = myRows[0];
      let family: FamilyInfo | null = null;
      let myRole: 'admin' | 'member' | null = null;
      let myPermission: 'edit' | 'view' = 'view';
      let members: FamilyMember[] = [];

      if (myRow) {
        const famRows = await pgSelect<any>('families', {
          id: `eq.${fval(myRow.family_id)}`,
          limit: 1,
        });
        const fam = famRows[0];
        if (fam) {
          // 家庭名用管理员当前昵称实时拼，改名/转让都自动跟随；取不到就用 uid 兜底
          let adminName = fam.admin_uid as string;
          try {
            const adminRows = await pgSelect<any>('users', {
              id: `eq.${fval(fam.admin_uid)}`,
              select: 'id,nick,display_name',
              limit: 1,
            });
            adminName = adminRows[0]?.display_name || adminRows[0]?.nick || fam.admin_uid;
          } catch (e) {
            console.warn('[family] 管理员昵称获取失败，用 uid 兜底：', e);
          }
          family = { id: fam.id, adminUid: fam.admin_uid, adminName };
          myRole = myRow.role === 'admin' ? 'admin' : 'member';
          myPermission = myRow.permission === 'edit' ? 'edit' : 'view';
          // 自己昵称变了就顺手更新成员表里的快照
          const myName = useAuthStore.getState().user?.nickName ?? me;
          if (myRow.name !== myName) {
            pgUpdateById('family_members', myRow.id, { name: myName }).catch(() => { });
          }
          // 只有管理员能看到全部成员；失败不阻塞家庭本身显示
          if (myRole === 'admin') {
            try {
              const mrows = await pgSelect<any>('family_members', {
                family_id: `eq.${fval(fam.id)}`,
              });
              members = mrows
                .map((r: any) => ({
                  uid: r.uid as string,
                  name: (r.name || r.uid) as string,
                  role: (r.role === 'admin' ? 'admin' : 'member') as 'admin' | 'member',
                  permission: (r.permission === 'edit' ? 'edit' : 'view') as 'edit' | 'view',
                }))
                .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));
            } catch (e) {
              console.warn('[family] 成员列表加载失败：', e);
            }
          }
        } else {
          // 家庭已被解散，清掉孤儿成员行
          pgDeleteById('family_members', myRow.id).catch(() => { });
        }
      }

      // 2. 跟我有关的待处理请求（type=invite 加入邀请 / type=transfer 管理员转让）
      //    单独容错：family_invites 表有问题不影响家庭本身的显示
      let incoming: FamilyInviteItem[] = [];
      let incomingTransfers: FamilyInviteItem[] = [];
      let invitedUids: string[] = [];
      let transferOut: { id: string; toUid: string; toName: string } | null = null;
      try {
        const reqRows = await pgSelect<any>('family_invites', {
          status: 'eq.pending',
          or: `(from_uid.eq.${fval(me)},to_uid.eq.${fval(me)})`,
        });
        const toItem = (r: any): FamilyInviteItem => ({
          id: r.id,
          familyId: r.family_id,
          fromUid: r.from_uid,
          fromName: r.from_name || r.from_uid,
          createdAt: new Date(r.created_at).getTime() || 0,
        });
        incoming = reqRows
          .filter((r: any) => r.to_uid === me && r.type !== 'transfer')
          .map(toItem)
          .sort((a, b) => b.createdAt - a.createdAt);
        incomingTransfers = reqRows
          .filter((r: any) => r.to_uid === me && r.type === 'transfer')
          .map(toItem)
          .sort((a, b) => b.createdAt - a.createdAt);
        invitedUids = reqRows
          .filter((r: any) => r.from_uid === me && r.type !== 'transfer')
          .map((r: any) => r.to_uid as string);
        const transferRow = reqRows.find((r: any) => r.from_uid === me && r.type === 'transfer');
        transferOut = transferRow
          ? { id: transferRow.id, toUid: transferRow.to_uid, toName: transferRow.to_name || transferRow.to_uid }
          : null;
      } catch (e) {
        console.warn('[family] 邀请/转让信息加载失败（family_invites 表可能没建）：', e);
      }

      set({
        family,
        myRole,
        myPermission,
        members,
        incoming,
        incomingTransfers,
        invitedUids,
        transferOut,
        loading: false,
        tableMissing: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // 加载失败一律降级为「未加入家庭」，绝不能卡住 App 启动
      if (msg.includes('family')) {
        console.warn('[family] 家庭表不存在，请先在 CloudBase 建表：families / family_members / family_invites / family_menu_audit');
        set({ ...EMPTY, loading: false, tableMissing: true });
        return;
      }
      console.warn('[family] 家庭信息加载失败，已降级：', e);
      set({ ...EMPTY, loading: false });
    }
  },

  createFamily: async () => {
    const me = myUid();
    if (!me || !isCloudEnabled()) throw new Error('未登录或未配置云端');
    if (get().family) throw new Error('你已经在家庭里了');
    const myName = useAuthStore.getState().user?.nickName ?? me;
    const fid = familyIdOf(me);
    // 幂等：之前创建到一半（家庭行建了但成员行没建）也能补全恢复
    // 23505 = 主键冲突（行已存在），忽略即可
    const ignoreDup = (e: unknown) => {
      if (!String((e as Error)?.message ?? e).includes('23505')) throw e;
    };
    await pgInsert('families', {
      id: fid,
      admin_uid: me,
      created_at: new Date().toISOString(),
    }).catch(ignoreDup);
    await pgInsert('family_members', {
      id: memberRowId(fid, me),
      family_id: fid,
      uid: me,
      name: myName,
      role: 'admin',
      permission: 'edit',
      joined_at: new Date().toISOString(),
    }).catch(ignoreDup);
    await get().load();
  },

  /** 管理员邀请用户加入家庭 */
  invite: async (uid, name) => {
    const me = myUid();
    const { family, myRole, invitedUids, members } = get();
    if (!me || !family || myRole !== 'admin') throw new Error('只有管理员才能邀请成员');
    if (members.some((m) => m.uid === uid)) throw new Error('对方已经在家庭里了');
    if (invitedUids.includes(uid)) throw new Error('已邀请过，等对方处理');
    // 一个人只能待在一个家庭
    const targetRows = await pgSelect<any>('family_members', { uid: `eq.${fval(uid)}`, limit: 1 });
    if (targetRows.length > 0) throw new Error('对方已加入其他家庭');
    const myName = useAuthStore.getState().user?.nickName ?? me;
    await pgInsert('family_invites', {
      id: crypto.randomUUID(),
      family_id: family.id,
      from_uid: me,
      from_name: myName,
      to_uid: uid,
      to_name: name,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    await get().load();
  },

  /** 被邀请人同意：加入家庭，默认「仅查看」权限 */
  accept: async (inviteId) => {
    const me = myUid();
    if (!me || !isCloudEnabled()) throw new Error('未登录');
    if (get().family) throw new Error('你已加入一个家庭，请先退出');
    const rows = await pgSelect<any>('family_invites', { id: `eq.${inviteId}`, limit: 1 });
    const inv = rows[0];
    if (!inv || inv.status !== 'pending' || inv.to_uid !== me) throw new Error('邀请不存在或已处理');
    const famRows = await pgSelect<any>('families', {
      id: `eq.${fval(inv.family_id)}`,
      limit: 1,
    });
    if (!famRows[0]) throw new Error('这个家庭已经被解散了');
    const myName = useAuthStore.getState().user?.nickName ?? me;
    await pgInsert('family_members', {
      id: memberRowId(inv.family_id, me),
      family_id: inv.family_id,
      uid: me,
      name: myName,
      role: 'member',
      permission: 'view',
      joined_at: new Date().toISOString(),
    });
    await pgUpdateById('family_invites', inviteId, { status: 'accepted' });
    await get().load();
  },

  decline: async (inviteId) => {
    if (!isCloudEnabled()) throw new Error('未配置云端');
    await pgUpdateById('family_invites', inviteId, { status: 'rejected' });
    await get().load();
  },

  /** 管理员移除成员 */
  kick: async (uid) => {
    const me = myUid();
    const { family, myRole } = get();
    if (!family || myRole !== 'admin') throw new Error('只有管理员才能移除成员');
    if (uid === me) throw new Error('不能移除自己');
    await pgDeleteById('family_members', memberRowId(family.id, uid));
    await get().load();
  },

  /** 成员主动退出（管理员有成员时需先转让，只剩自己时走解散） */
  leave: async () => {
    const me = myUid();
    const { family, myRole, members } = get();
    if (!me || !family) return;
    if (myRole === 'admin') {
      if (members.some((m) => m.uid !== me)) {
        throw new Error('家庭里还有其他成员，请先转让管理员');
      }
      await get().deleteFamily();
      return;
    }
    await pgDeleteById('family_members', memberRowId(family.id, me));
    await get().load();
  },

  /** 发起管理员转让：只是发请求，对方（acceptTransfer）同意后才真正交接 */
  transferAdmin: async (uid) => {
    const me = myUid();
    const { family, myRole, members, transferOut } = get();
    if (!me || !family || myRole !== 'admin') throw new Error('只有管理员才能转让');
    if (uid === me) return;
    const target = members.find((m) => m.uid === uid);
    if (!target) throw new Error('对方不在家庭成员里');
    if (transferOut) throw new Error('已有一个待处理的转让，等对方处理或先取消');
    const myName = useAuthStore.getState().user?.nickName ?? me;
    await pgInsert('family_invites', {
      id: crypto.randomUUID(),
      family_id: family.id,
      from_uid: me,
      from_name: myName,
      to_uid: uid,
      to_name: target.name,
      status: 'pending',
      type: 'transfer',
      created_at: new Date().toISOString(),
    });
    await get().load();
  },

  /** 接受管理员转让：校验通过后才真正交接（我升管理员，对方降普通成员） */
  acceptTransfer: async (requestId) => {
    const me = myUid();
    if (!me || !isCloudEnabled()) throw new Error('未登录');
    const rows = await pgSelect<any>('family_invites', { id: `eq.${requestId}`, limit: 1 });
    const req = rows[0];
    if (!req || req.status !== 'pending' || req.to_uid !== me || req.type !== 'transfer') {
      throw new Error('转让请求不存在或已处理');
    }
    const famRows = await pgSelect<any>('families', {
      id: `eq.${fval(req.family_id)}`,
      limit: 1,
    });
    const fam = famRows[0];
    if (!fam) throw new Error('家庭已被解散');
    if (fam.admin_uid !== req.from_uid) throw new Error('对方已不是管理员，转让已失效');
    const myRow = await pgSelect<any>('family_members', {
      id: `eq.${fval(memberRowId(fam.id, me))}`,
      limit: 1,
    });
    if (!myRow[0]) throw new Error('你已不在这个家庭里');
    // 正式交接：家庭换管理员，我升 admin（可修改），对方降 member
    await pgUpdateById('families', fam.id, { admin_uid: me });
    await pgUpdateById('family_members', memberRowId(fam.id, me), {
      role: 'admin',
      permission: 'edit',
    });
    await pgUpdateById('family_members', memberRowId(fam.id, req.from_uid), { role: 'member' });
    await pgUpdateById('family_invites', requestId, { status: 'accepted' });
    await get().load();
  },

  declineTransfer: async (requestId) => {
    if (!isCloudEnabled()) throw new Error('未配置云端');
    await pgUpdateById('family_invites', requestId, { status: 'rejected' });
    await get().load();
  },

  cancelTransfer: async () => {
    const { transferOut, myRole } = get();
    if (!transferOut) return;
    if (myRole !== 'admin') throw new Error('只有管理员才能取消转让');
    await pgUpdateById('family_invites', transferOut.id, { status: 'cancelled' });
    await get().load();
  },

  /** 解散家庭（仅当只剩管理员自己）：连邀请、菜单、历史记录一起清掉 */
  deleteFamily: async () => {
    const me = myUid();
    const { family, myRole, members } = get();
    if (!me || !family || myRole !== 'admin') throw new Error('只有管理员才能解散家庭');
    if (members.some((m) => m.uid !== me)) {
      throw new Error('家庭里还有其他成员，请先移除成员或转让管理员');
    }
    const fid = family.id;
    const inviteRows = await pgSelect<any>('family_invites', {
      family_id: `eq.${fval(fid)}`,
      select: 'id',
    }).catch(() => [] as any[]);
    await Promise.all(inviteRows.map((r: any) => pgDeleteById('family_invites', r.id).catch(() => { })));
    const auditRows = await pgSelect<any>('family_menu_audit', {
      family_id: `eq.${fval(fid)}`,
      select: 'id',
    }).catch(() => [] as any[]);
    await Promise.all(auditRows.map((r: any) => pgDeleteById('family_menu_audit', r.id).catch(() => { })));
    await pgDeleteById('weekly_menus', fid).catch(() => { });
    await pgDeleteById('family_members', memberRowId(fid, me)).catch(() => { });
    await pgDeleteById('families', fid);
    await get().load();
  },

  /** 管理员设置成员菜单权限 */
  setPermission: async (uid, permission) => {
    const { family, myRole } = get();
    if (!family || myRole !== 'admin') throw new Error('只有管理员才能设置权限');
    await pgUpdateById('family_members', memberRowId(family.id, uid), { permission });
    await get().load();
  },

  /** 按昵称/账号搜索用户（不会返回密码等敏感列） */
  searchUsers: async (kw) => {
    const me = myUid();
    if (!isCloudEnabled() || !me) return [];
    // 去掉过滤表达式的特殊字符，避免拼接出错
    const q = kw.trim().replace(/[()*,"]/g, '');
    if (!q) return [];
    const rows = await pgSelect<any>('users', {
      select: 'id,nick,display_name,avatar,disabled',
      // 模糊匹配用 % 通配符；值不要加引号（网关会把引号当成值的一部分）
      or: `(display_name.ilike.%${q}%,nick.ilike.%${q}%)`,
      limit: 20,
    });
    return rows
      .filter((r: any) => r.id !== me && !r.disabled)
      .map((r: any) => ({
        uid: r.id as string,
        name: (r.display_name || r.nick || r.id) as string,
        avatar: (r.avatar ?? null) as string | null,
      }));
  },

  /** 家庭菜单修改历史（最新在前） */
  listMenuAudit: async (limit = 80) => {
    const { family } = get();
    if (!family || !isCloudEnabled()) return [];
    const rows = await pgSelect<any>('family_menu_audit', {
      family_id: `eq.${fval(family.id)}`,
      order: 'created_at.desc',
      limit,
    });
    return rows.map((r: any) => ({
      id: r.id,
      actorUid: r.actor_uid,
      actorName: r.actor_name || r.actor_uid,
      action: r.action as 'add' | 'remove' | 'clear',
      day: r.day ?? '',
      detail: r.detail ?? '',
      createdAt: new Date(r.created_at).getTime() || 0,
    }));
  },

  resetForUser: () => set({ ...EMPTY, loading: false, tableMissing: false }),
}));
