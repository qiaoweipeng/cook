// 客户端环境信息采集 + 登录日志
//   - parseUA：从 navigator.userAgent 解析设备类型 / 系统 / 浏览器
//   - fetchIP：调公网 IP 接口拿出口 IP 和地区（失败静默，不阻塞登录）
//   - logLogin：每个浏览器会话只记一次（sessionStorage 标记防重复）
//   - listLoginLogs / latestLoginMap：系统管理页、用户管理页展示用

import { isCloudEnabled, pgInsert, pgSelect } from './supabase';

export interface LoginLogRow {
  id: string;
  uid: string;
  nick: string;
  login_at: string;
  ip: string;
  region: string;
  device: string;
  os: string;
  browser: string;
  ua: string;
  screen: string;
  language: string;
}

/** 解析 UA → 设备/系统/浏览器 */
export function parseUA() {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(ua);

  let os = '其他';
  if (/HarmonyOS/i.test(ua)) os = 'HarmonyOS';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '其他';
  if (/MicroMessenger/i.test(ua)) browser = '微信';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return {
    device: mobile ? '移动端' : 'PC',
    os,
    browser,
    ua,
    screen: `${window.screen.width}×${window.screen.height}`,
    language: navigator.language,
  };
}

/** 拿出口 IP：主用 ipapi.co（带地区），备用 ipify（只有 IP）。都失败返回空串。 */
async function fetchIP(): Promise<{ ip: string; region: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      if (j?.ip) {
        return {
          ip: String(j.ip),
          region: [j.country_name, j.region, j.city].filter(Boolean).join(' '),
        };
      }
    }
  } catch {
    // 忽略，走备用
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      return { ip: String(j?.ip ?? ''), region: '' };
    }
  } catch {
    // 忽略
  }
  return { ip: '', region: '' };
}

/**
 * 记录一次登录日志。每个浏览器会话每个账号只记一次，失败静默。
 * 触发时机：App 里监测到 user 从空变为有（含刷新恢复会话、刚登录成功）。
 */
export async function logLogin(uid: string, nick: string): Promise<void> {
  if (!isCloudEnabled()) return;
  const flag = `login_logged_${uid}`;
  if (sessionStorage.getItem(flag)) return;
  // 先打标记：就算写日志失败也不反复重试刷屏
  sessionStorage.setItem(flag, '1');
  try {
    const info = parseUA();
    const { ip, region } = await fetchIP();
    await pgInsert('login_logs', {
      id: `log_${uid}_${Date.now()}`,
      uid,
      nick,
      login_at: new Date().toISOString(),
      ip,
      region,
      ...info,
    });
  } catch (e) {
    console.warn('[loginLog] 写入失败（login_logs 表可能没建）：', e);
  }
}

/** 最近 N 条登录日志（系统管理页用） */
export async function listLoginLogs(limit = 100): Promise<LoginLogRow[]> {
  if (!isCloudEnabled()) return [];
  return pgSelect<LoginLogRow>('login_logs', { order: 'login_at.desc', limit });
}

/** 每个用户最近一次登录（uid → 日志），用户管理页用 */
export async function latestLoginMap(): Promise<Map<string, LoginLogRow>> {
  const map = new Map<string, LoginLogRow>();
  if (!isCloudEnabled()) return map;
  const rows = await pgSelect<LoginLogRow>('login_logs', {
    order: 'login_at.desc',
    limit: 500,
  });
  for (const r of rows) {
    if (!map.has(r.uid)) map.set(r.uid, r);
  }
  return map;
}
