// 本地推送诊断工具：绕开 Edge Function，直接向推送服务发一条。
//
// 用来定位「Edge Function 返回 sent:1，但手机一点反应没有」到底卡在哪一环。
//
// 用法（.env 里要有 SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY）：
//   node --env-file=.env scripts/push-test.mjs          # 带 payload（走 aes128gcm 加密）
//   node --env-file=.env scripts/push-test.mjs --raw    # 裸推送（不加密，只做 VAPID 签名）
//
// 两组对比：
//   --raw 收到、加密收不到  → 加密格式有问题，浏览器解不开直接把 push 事件丢了
//   两种都收不到            → 订阅或系统设置层面的问题，跟发送代码无关

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
).replace(/\/$/, '');
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';

const raw = process.argv.includes('--raw');
const enc = new TextEncoder();

// ---------- base64 / base64url ----------

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

function bytesToB64url(b) {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u16(n) {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

// ---------- VAPID ----------

async function vapidHeaders(endpoint, dhPublic) {
  // aud 必须是推送服务的 origin，写错会 401
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp, sub: SUBJECT };
  const unsigned =
    `${bytesToB64url(enc.encode(JSON.stringify(header)))}.` +
    bytesToB64url(enc.encode(JSON.stringify(payload)));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    b64ToBytes(PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      enc.encode(unsigned)
    )
  );

  const headers = {
    Authorization: `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${PUBLIC_KEY}`,
    TTL: '86400',
    Urgency: 'high', // 诊断时用 high，尽量快到
  };
  if (dhPublic) headers['Crypto-Key'] = `dh=${dhPublic}`;
  return headers;
}

// ---------- 加密（RFC 8291 aes128gcm）----------

async function encrypt(payload, p256dh, auth) {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(auth);

  const asKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', asKeys.publicKey)
  );

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey },
      asKeys.privateKey,
      256
    )
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, [
    'deriveBits',
  ]);

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
      128
    )
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: nonceInfo },
      prk,
      96
    )
  );

  const plaintext = concat(enc.encode(payload), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  );

  // aes128gcm body 布局：salt(16) | rs(4) | idlen(1) | keyid | ciphertext
  //
  // rs 必须用规范推荐的 4096。之前图省事写成 ciphertext.length，
  // rs 会跟着 payload 长度浮动，Safari 解不开就直接把 push 事件丢了
  // （没有报错，表现就是「发出去 201，手机毫无反应」）。
  // 临时公钥放进 keyid，跟 web-push 库的做法一致。
  const RS = 4096;
  const body = new Uint8Array(16 + 4 + 1 + asPublic.length + ciphertext.length);
  body.set(salt, 0);
  new DataView(body.buffer).setUint32(16, RS, false);
  body[20] = asPublic.length;
  body.set(asPublic, 21);
  body.set(ciphertext, 21 + asPublic.length);

  return { body, dhPublic: bytesToB64url(asPublic) };
}

// ---------- 主流程 ----------

function supabaseHeaders() {
  const h = { apikey: ANON_KEY };
  // 新版 publishable key 不是 JWT，放 Bearer 会因 JWT 校验失败
  if (ANON_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${ANON_KEY}`;
  return h;
}

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('缺 SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }
  if (!PRIVATE_KEY || !PUBLIC_KEY) {
    console.error('缺 VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY');
    process.exit(1);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
    headers: supabaseHeaders(),
  });
  if (!res.ok) {
    console.error('读订阅失败', res.status, await res.text());
    process.exit(1);
  }
  const subs = await res.json();

  if (subs.length === 0) {
    console.log('表里没有订阅记录 —— 先去 App 里把「菜单通知」开关打开');
    return;
  }

  console.log(`共 ${subs.length} 条订阅：\n`);
  for (const s of subs) {
    const origin = new URL(s.endpoint).origin;
    const kind = origin.includes('apple')
      ? 'iPhone (APNs)'
      : origin.includes('fcm') || origin.includes('google')
        ? 'Android (FCM)'
        : origin;
    console.log(`  uid=${s.uid}  ${kind}`);
    console.log(`  endpoint=${s.endpoint.slice(0, 72)}...`);
  }

  const payload = JSON.stringify({
    title: '大厨房',
    body: raw ? '' : '本地脚本的测试推送',
    url: '/',
  });

  console.log(`\n模式：${raw ? '裸推送（不加密）' : '加密推送'}\n`);

  for (const s of subs) {
    try {
      let resp;
      if (raw) {
        resp = await fetch(s.endpoint, {
          method: 'POST',
          headers: await vapidHeaders(s.endpoint),
        });
      } else {
        // 公钥已经放在 body 的 keyid 里，不用再走 Crypto-Key 头
        const { body } = await encrypt(payload, s.p256dh, s.auth);
        resp = await fetch(s.endpoint, {
          method: 'POST',
          headers: {
            ...(await vapidHeaders(s.endpoint)),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
          },
          body,
        });
      }
      const text = await resp.text();
      console.log(
        `${resp.ok ? '✅' : '❌'} ${s.uid} → ${resp.status} ${resp.statusText}` +
          (text ? `  ${text.slice(0, 200)}` : '')
      );
    } catch (e) {
      console.error(`❌ ${s.uid} → ${String(e)}`);
    }
  }

  console.log('\n现在看手机（记得锁屏或切到别的 App，前台不会弹）');
}

void main();
