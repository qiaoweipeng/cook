// Service Worker
//
// 之前用 vite-plugin-pwa 默认的 generateSW（自动生成的 SW），
// 现在换成 injectManifest —— 因为要加 push / notificationclick 监听，
// 自动生成的 SW 没法往里插自定义代码。
//
// 职责：
//   1. 预缓存静态资源，保证离线能打开
//   2. 收到 push 事件 → 弹系统通知（通知中心里那条）
//   3. 点通知 → 打开 / 聚焦到对应页面
//
// 刻意只拦同源请求：跨域的 Supabase API 一律放行。
// 否则 GET 查询结果会被缓存住，用户看到的永远是旧数据。

// 没有引 webworker lib —— 它跟项目 tsconfig 里的 DOM lib 会重复声明冲突。
// 这里只按需声明实际用到的那几个 API。
const sw = self as unknown as {
  location: Location;
  registration: ServiceWorkerRegistration;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clients: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener: (type: string, cb: (e: any) => void) => void;
  skipWaiting: () => Promise<void>;
  __WB_MANIFEST?: { url: string; revision: string | null }[];
};

/**
 * vite-plugin-pwa 构建时把预缓存清单注入到这里。
 *
 * 注意 `self.__WB_MANIFEST` 这个写法**不能改成变量别名** ——
 * workbox 是在源码文本里搜这个字面量来定位注入点的，
 * 写成 sw.__WB_MANIFEST 就会报 "Unable to find a place to inject the manifest"。
 */
const manifest =
  (self as unknown as { __WB_MANIFEST?: { url: string; revision: string | null }[] })
    .__WB_MANIFEST ?? [];
const PRECACHE = 'cook-precache';

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PRECACHE);
        /*
          必须**逐个** add，不能用 cache.addAll。

          addAll 是「一个 404 就整体 reject」，一旦 reject，install 就失败、
          SW 永远停在 installing，永远不 activate ——
          后果是 navigator.serviceWorker.ready 永不返回，前端的订阅按钮就一直转圈。

          逐个 add 并 catch 掉单项失败，预缓存少一两个文件顶多是那张图离线时没有，
          不至于把整个 PWA 的离线能力和推送订阅一起搞挂。
        */
        await Promise.all(
          manifest.map((e) => cache.add(e.url).catch(() => undefined))
        );
      } catch (e) {
        console.error('[sw] 预缓存失败', e);
      }
      // 无论缓存成没成功都要 skipWaiting，否则新 SW 永远不接管，下次进来还是老的
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== PRECACHE).map((k) => caches.delete(k)))
      )
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event: any) => {
  const req: Request = event.request;
  if (req.method !== 'GET') return;

  // 跨域（Supabase / CDN）不拦，只管自己域名下的静态资源
  if (new URL(req.url).origin !== sw.location.origin) return;

  // 导航请求：网络优先，断网时回退 index.html，这样离线也能进 App
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r ?? Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          // 顺手把新资源塞进缓存，下次离线也能用
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(PRECACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

// ---------------------------------------------------------------------------
// 推送
// ---------------------------------------------------------------------------

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

sw.addEventListener('push', (event: any) => {
  let data: PushPayload = {};
  try {
    if (event.data) data = event.data.json() as PushPayload;
  } catch {
    // 不是 JSON（比如不带 payload 的裸推送）就当纯文本
    data = { body: event.data?.text?.() ?? '' };
  }

  event.waitUntil(
    sw.registration.showNotification(data.title || '大厨房', {
      body: data.body || '',
      icon: '/icon/192*192.png',
      badge: '/icon/192*192.png',
      // 点了通知要跳去哪，塞进 data 带到 notificationclick
      data: { url: data.url || '/' },
    } as NotificationOptions)
  );
});

sw.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const target: string = event.notification.data?.url || '/';

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list: any[]) => {
      // App 已经开着就聚焦过去并跳转，没开才新开一个窗口
      for (const c of list) {
        if ('focus' in c) {
          void c.navigate(target);
          return c.focus();
        }
      }
      return sw.clients.openWindow(target);
    })
  );
});
