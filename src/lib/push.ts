// Web Push：订阅与发送
//
// 链路：浏览器向推送服务（Apple APNs / Google FCM）订阅一次，拿到 endpoint 和一对密钥，
// 存进 Supabase 的 push_subscriptions 表；要发通知时，Edge Function 用 VAPID 私钥签名后
// 把消息交给推送服务，由它下发到手机通知中心。
//
// 浏览器只负责「订阅」和「收」，**发**必须走服务端 —— VAPID 私钥不能下放到前端。

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

/** 跟 supabase.ts 里一样的判断：新版 publishable key 不是 JWT，不能放 Bearer */
function authHeaders(): Record<string, string> {
  const isLegacyJwt = ANON_KEY.startsWith('eyJ');
  return {
    apikey: ANON_KEY,
    ...(isLegacyJwt ? { Authorization: `Bearer ${ANON_KEY}` } : {}),
  };
}

/** 环境变量齐了才能订阅 */
export function pushEnvReady(): boolean {
  return Boolean(SUPABASE_URL) && Boolean(ANON_KEY) && Boolean(VAPID_PUBLIC_KEY);
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * 是不是「添加到主屏幕」后启动的（standalone）。
 *
 * iOS 的硬限制：**只有从桌面图标打开**才能订阅推送。在 Safari 里直接访问网页时，
 * PushManager 存在、但 subscribe() 会被直接拒绝 —— 所以先判断这个，给用户说清楚原因。
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/**
 * applicationServerKey 要的是 Uint8Array，公钥给的是 base64url。
 *
 * 刻意不写返回类型：TS 5.7 起 Uint8Array 带了个泛型参数，
 * 手写 `Uint8Array` 等于 `Uint8Array<ArrayBufferLike>`，赋给 BufferSource 会报错；
 * 让 TS 自己推断成 `Uint8Array<ArrayBuffer>` 才对得上。
 */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function deleteByEndpoint(endpoint: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE', headers: authHeaders() }
  );
}

async function insertSubscription(row: {
  uid: string;
  family_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`保存订阅失败 ${res.status}: ${await res.text()}`);
}

/** 开启推送：申请权限 → 订阅 → 把 endpoint 存库 */
export async function subscribePush(uid: string, familyId?: string | null): Promise<void> {
  if (!pushSupported()) throw new Error('当前浏览器不支持推送');
  if (!pushEnvReady()) throw new Error('推送未配置完整（缺少 VAPID 公钥）');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('通知权限被拒绝，请在系统设置 → 大厨房 → 通知里打开');
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    // 必须为 true：向浏览器承诺「每条推送都会显示出来」，
    // 这是规范要求的，否则不允许订阅
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON();
  const keys = json.keys as { p256dh: string; auth: string } | undefined;
  if (!keys) throw new Error('订阅结果缺少密钥');

  // 同一台设备重复订阅时先清旧的，避免堆一堆失效记录
  await deleteByEndpoint(sub.endpoint);
  await insertSubscription({
    uid,
    family_id: familyId ?? null,
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

/** 关闭推送：库里的记录和浏览器的订阅一起清掉 */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await deleteByEndpoint(sub.endpoint);
  await sub.unsubscribe();
}

/** 当前这台设备的订阅状态（用来决定开关是开还是关） */
export async function getSubscriptionState(): Promise<{
  subscribed: boolean;
  permission: NotificationPermission | 'unsupported';
}> {
  if (!pushSupported()) return { subscribed: false, permission: 'unsupported' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { subscribed: Boolean(sub), permission: Notification.permission };
}

/** 调 Edge Function 发一条推送（谁调用谁负责拼文案） */
export async function sendPush(payload: {
  uids?: string[];
  familyId?: string;
  excludeUid?: string;
  title: string;
  body: string;
  url?: string;
}): Promise<{ total: number; sent: number; removed: number }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`推送失败 ${res.status}: ${await res.text()}`);
  return res.json();
}
