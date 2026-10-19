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
/**
 * 给 promise 套个超时。
 *
 * 没有它，只要某一步卡住（iOS 上权限弹窗没弹出来、Service Worker 一直没 activate），
 * 界面就会永远停在 loading —— 用户除了「一直在转圈」得不到任何线索。
 */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

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

/*
  按 uid 删：处理 iOS 上"重新订阅 endpoint 变了"的场景。

  pushManager.subscribe() 在 unsubscribe 之后会生成新的 endpoint，
  所以单纯按 endpoint 删会留下旧订阅的空壳 —— 之后所有推送都会发给两个 endpoint，
  旧的那个因 keys 失效静默丢失，多发一倍无用请求，还会让调试时分不清是哪条在起作用。

  前提是同一时间一个用户只在一台设备上订阅（家庭场景里实际就是这样用的）。
  真要做多设备了可以按 uid + ua 一起筛。
*/
async function deleteByUid(uid: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?uid=eq.${encodeURIComponent(uid)}`,
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

  /*
    iOS 要求权限申请必须在用户手势的同步调用栈里发起，
    所以这一步放在最前面，不能先 await 别的（比如 serviceWorker.ready）再去申请。
  */
  const perm = await withTimeout(
    Notification.requestPermission(),
    15000,
    '通知权限弹窗一直没有响应，请到系统设置 → 大厨房 → 通知里确认开关状态'
  );
  if (perm !== 'granted') {
    throw new Error('通知权限被拒绝，请在系统设置 → 大厨房 → 通知里打开');
  }

  const reg = await withTimeout(
    navigator.serviceWorker.ready,
    8000,
    '离线模块一直没就绪，请退出重进一次再试'
  );
  /*
    iOS PWA 的一个经典坑：首次打开时 Service Worker 还在 installing，
    `ready` 只能保证 SW 激活完成，**不**保证已经 claim() 客户端 ——
    在这个窗口期调 subscribe() 会"成功"返回 PushSubscription，
    但 iOS 实际上没有建立可用的订阅，后续 push 全部静默丢失。
    （Discourse Meta 上的事故复盘：https://meta.discourse.org/t/-/402645）

    必须显式等 controller 出现，不然就让用户把 PWA 完全划掉重开。
  */
  if (!navigator.serviceWorker.controller) {
    throw new Error(
      '推送模块还没接管当前页面，请把 PWA 从后台完全划掉、再从桌面图标打开一次，然后再开这个开关'
    );
  }
  const sub = await withTimeout(
    reg.pushManager.subscribe({
      // 必须为 true：向浏览器承诺「每条推送都会显示出来」，
      // 这是规范要求的，否则不允许订阅
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }),
    15000,
    '订阅超时。iPhone 必须「添加到主屏幕」后从桌面图标打开（Safari 里不行），且需 iOS 16.4 以上'
  );

  const json = sub.toJSON();
  const keys = json.keys as { p256dh: string; auth: string } | undefined;
  if (!keys) throw new Error('订阅结果缺少密钥');

  // 同一台设备重新订阅时先清旧的。
  // iOS 上 unsubscribe 之后再次 subscribe，endpoint 通常会变（新一对 p256dh/auth），
  // 按 endpoint 删会漏掉旧订阅；按 uid 整批删更稳。
  // 前提：同一时间一个用户只在一台设备上订阅。
  await deleteByUid(uid);
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
  let subscribed = false;
  try {
    // 查不通也不能让界面卡住：SW 没就绪时就当未订阅，开关照常显示
    const reg = await withTimeout(navigator.serviceWorker.ready, 5000, '');
    subscribed = Boolean(await reg.pushManager.getSubscription());
  } catch {
    subscribed = false;
  }
  return { subscribed, permission: Notification.permission };
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
