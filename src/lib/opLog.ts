// 操作日志：记录「谁、什么时候、对什么数据、做了什么操作」
// 用于系统管理页审计——有人恶意增删改数据时可以追溯

import { isCloudEnabled, pgInsert, pgSelect } from './supabase';
import { useAuthStore } from '@/store/useAuthStore';

export interface OpLogRow {
  id: string;
  actor_uid: string;
  actor_name: string;
  action: string;
  target: string;
  detail: string;
  created_at: string;
}

/**
 * 记一条操作日志。fire-and-forget：失败静默（op_logs 表没建也不打断业务）。
 * @param action 操作类型，如「新增菜品」「删除食材」「停用用户」
 * @param target 操作对象，如菜名、食材名、账号
 * @param detail 补充详情
 */
export function logOp(action: string, target = '', detail = ''): void {
  if (!isCloudEnabled()) return;
  const u = useAuthStore.getState().user;
  if (!u) return;
  pgInsert('op_logs', {
    id: `op_${u.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actor_uid: u.uid,
    actor_name: u.nickName ?? u.uid,
    action,
    target,
    detail,
    created_at: new Date().toISOString(),
  }).catch((e) => console.warn('[opLog] 写入失败（op_logs 表可能没建）：', e));
}

/** 最近 N 条操作日志（系统管理页用） */
export async function listOpLogs(limit = 100): Promise<OpLogRow[]> {
  if (!isCloudEnabled()) return [];
  return pgSelect<OpLogRow>('op_logs', { order: 'created_at.desc', limit });
}
