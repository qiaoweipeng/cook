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
// 跨域的 Supabase API（/rest/v1/）一律放行，否则 GET 查询结果会被缓存住，
// 用户看到的永远是旧数据。唯一例外：Storage 的图片（封面/食材图）走缓存优先，
// 因为它们是 egress 大头，且 URL 内容寻址（换图必换 URL）没有一致性问题。

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
// Supabase Storage 图片的独立缓存桶：activate 清旧缓存时要保留它
const IMG_CACHE = 'cook-img';

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
        Promise.all(
          keys.filter((k) => k !== PRECACHE && k !== IMG_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event: any) => {
  const req: Request = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /*
    Supabase Storage 的图片（菜品封面 / 食材图）：缓存优先，回源后写缓存。

    这是 Supabase egress 的绝对大头 —— 菜单卡片墙 / 详情页 / 管理表格每次渲染
    都跨境重拉同一批图，一个月能把 5GB 免费流量跑爆。封面 URL 带唯一文件名
    （内容寻址，换图必然换 URL），所以缓存永远不过期也没有一致性问题。
    只匹配 /storage/v1/object/ 路径，/rest/v1/ 等 API 依然不拦。
  */
  if (url.host.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          // 不用 fetch(req)：img 标签发的是 no-cors 请求，拿回 opaque 响应没法
          // 判断成败。Storage 对任意源开放 CORS，重新拉一次能拿到干净响应再缓存。
          fetch(req.url).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(IMG_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 其余跨域请求（Supabase API 等）不拦，只管自己域名下的静态资源
  if (url.origin !== sw.location.origin) return;

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
    sw.registration.showNotification(data.title || '我是大厨', {
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
