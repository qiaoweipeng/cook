// Supabase Edge Function：发送 Web Push 通知
//
// 为什么必须有服务端这一层：
//   Web Push 要求每个请求都用 VAPID 私钥签名，私钥绝不能放进前端；
//   PostgREST 又只是数据库的 HTTP 接口，发不了带签名的推送。所以只能由 Edge Function 做。
//
// 部署：
//   supabase functions deploy send-push
// 需要的 Secrets（控制台 → Edge Functions → Secrets）：
//   VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY / VAPID_SUBJECT
//
// 请求体：
//   { familyId?, uids?, excludeUid?, title, body, url?, ttl? }
//   familyId 和 uids 至少给一个；excludeUid 用来跳过触发者自己

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// base64 / base64url
// ---------------------------------------------------------------------------

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

function bytesToB64url(b: Uint8Array): string {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** 长度写成 2 字节大端 —— RFC 8291 的 context 里要求这个格式 */
function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

// ---------------------------------------------------------------------------
// VAPID：Authorization: vapid t=<JWT>, k=<公钥>
// ---------------------------------------------------------------------------

async function vapidHeaders(endpoint: string, ttl: number, dhPublic?: string) {
  // aud **必须**是推送服务的 origin（比如 https://web.push.apple.com）。
  // 写成自己的域名会 401，这是最容易踩的坑。
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp, sub: VAPID_SUBJECT };
  const unsigned =
    `${bytesToB64url(enc.encode(JSON.stringify(header)))}.` +
    bytesToB64url(enc.encode(JSON.stringify(payload)));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    b64ToBytes(VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  // WebCrypto 的 ECDSA 直接输出 raw r||s（64 字节），正是 JWT 要的格式，不用再转 DER
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned))
  );

  const headers: Record<string, string> = {
    Authorization: `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${VAPID_PUBLIC_KEY}`,
    TTL: String(ttl),
    Urgency: 'normal',
  };
  if (dhPublic) headers['Crypto-Key'] = `dh=${dhPublic}`;
  return headers;
}

// ---------------------------------------------------------------------------
// 加密 payload：RFC 8291 (aes128gcm)
// ---------------------------------------------------------------------------

async function encrypt(payload: string, p256dh: string, auth: string) {
  const uaPublic = b64urlToBytes(p256dh); // 订阅方的公钥
  const authSecret = b64urlToBytes(auth); // 订阅方的 auth secret

  // 每次推送都新生成一对临时密钥，用完即弃（forward secrecy）
  const asKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK = HKDF(salt = auth_secret, ikm = ecdh_secret)
  const prk = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits']);

  const context = concat(
    enc.encode('P-256'),
    new Uint8Array([0x00]),
    u16(uaPublic.length),
    uaPublic,
    u16(asPublic.length),
    asPublic
  );

  const cekInfo = concat(
    enc.encode('Content-Encoding: aes128gcm'),
    new Uint8Array([0x00]),
    context
  );
  const nonceInfo = concat(
    enc.encode('Content-Encoding: nonce'),
    new Uint8Array([0x00]),
    context
  );

  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: cekInfo },
      prk,
      128 // 16 字节
    )
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: nonceInfo },
      prk,
      96 // 12 字节
    )
  );

  // 明文末尾补一个 0x02，表示「这是最后一个 record」—— RFC 8188 的规定，
  // 少了这个字节浏览器会解出乱码
  const plaintext = concat(enc.encode(payload), new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  );

  /*
    aes128gcm 的 body 布局：salt(16) | rs(4) | idlen(1) | keyid | ciphertext

    ⚠️ rs 必须用规范推荐的 4096，不能图省事写成 ciphertext.length。
    那样 rs 会跟着 payload 长度浮动，Safari 解不开就**静默丢弃整条推送** ——
    服务端看到 201、手机端毫无反应，而且连个报错都没有，极难排查。
    （这个坑是拿 web-push 库生成的结果逐项比对才定位到的）

    临时公钥放进 keyid（65 字节），跟 web-push 库的做法一致，
    这样就不用再依赖 Crypto-Key: dh= 头。
  */
  const RS = 4096;
  const body = new Uint8Array(16 + 4 + 1 + asPublic.length + ciphertext.length);
  body.set(salt, 0);
  new DataView(body.buffer).setUint32(16, RS, false); // 大端
  body[20] = asPublic.length; // idlen = 65
  body.set(asPublic, 21);
  body.set(ciphertext, 21 + asPublic.length);

  return { body };
}

// ---------------------------------------------------------------------------
// 订阅表读写
// ---------------------------------------------------------------------------

interface SubRow {
  id: string;
  uid: string;
  family_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function fetchSubs(uids?: string[], familyId?: string): Promise<SubRow[]> {
  let url = `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`;
  if (familyId) url += `&family_id=eq.${encodeURIComponent(familyId)}`;
  else if (uids && uids.length) url += `&uid=in.(${uids.map(encodeURIComponent).join(',')})`;
  else return [];

  const res = await fetch(url, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`读取订阅失败 ${res.status}: ${await res.text()}`);
  return res.json();
}

/** 订阅失效就删掉，不然每次推送都要白跑一趟 */
async function deleteSub(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
      return json({ error: '缺少 VAPID 环境变量' }, 500);
    }

    const input = (await req.json()) as {
      uids?: string[];
      familyId?: string;
      excludeUid?: string;
      title?: string;
      body?: string;
      url?: string;
      ttl?: number;
    };

    if (!input.title || !input.body) return json({ error: '缺少 title / body' }, 400);

    let subs = await fetchSubs(input.uids, input.familyId);
    // 谁触发的不推给谁 —— 自己改的菜单自己心里有数
    if (input.excludeUid) subs = subs.filter((s) => s.uid !== input.excludeUid);

    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      url: input.url ?? '/',
    });
    const ttl = input.ttl ?? 24 * 3600;

    let sent = 0;
    const dead: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          // 公钥已经放在 body 的 keyid 里，不用再走 Crypto-Key 头
          const { body } = await encrypt(payload, s.p256dh, s.auth);
          const headers = await vapidHeaders(s.endpoint, ttl);
          const res = await fetch(s.endpoint, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
            },
            body,
          });

          if (res.ok) {
            sent++;
          } else {
            const text = await res.text();
            // 404 / 410 = 订阅已失效（卸载了 PWA、清了数据、换设备），删掉
            if (res.status === 404 || res.status === 410) dead.push(s.id);
            else console.error('推送失败', s.endpoint, res.status, text);
          }
        } catch (e) {
          console.error('推送异常', s.endpoint, String(e));
        }
      })
    );

    await Promise.all(dead.map(deleteSub));

    return json({ total: subs.length, sent, removed: dead.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
