// retron 서비스 워커: 데이터·와이파이가 없어도 앱이 열리고 기기에 있는 게임을 할 수 있게, 앱 파일과 에뮬레이터 파일을 기기에 둔다.
// 게임 파일·세이브·설정은 원래 기기(OPFS·localStorage)에 있으므로 여기서는 "앱 자체"만 맡는다.
// - 페이지(index.html): 네트워크 먼저(배포하면 바로 새 버전), 안 되면 기기에 둔 것
// - assets/: 이름에 해시가 붙어 바뀌지 않는다 → 기기에 둔 것 먼저. 새 페이지가 안 쓰는 옛 파일은 지운다
// - retroarch/v버전/: 폴더에 버전이 붙어 바뀌지 않는다 → 기기에 둔 것 먼저
// - emulators/(js-dos): 이름에 버전이 없다 → 기기에 둔 것을 바로 쓰고 뒤에서 새로 받아 둔다
// 에뮬레이터는 처음 한 번 온라인에서 그 기종 게임을 실행해야 기기에 남는다 (모바일 데이터로 수십 MB를 미리 받지 않으려고).
// 구글 로그인·드라이브 요청(다른 도메인)은 건드리지 않는다.

const CACHE = "retron-app-v1";
const PAGE = "./index.html";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(PAGE)).catch(() => undefined));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const put = async (req, res) => {
  if (res.ok && res.status === 200) await (await caches.open(CACHE)).put(req, res.clone());
  return res;
};

/** 새 index.html이 쓰는 assets만 남긴다 (배포할 때마다 쌓이지 않게) */
async function pruneAssets(html) {
  const used = new Set([...html.matchAll(/assets\/[^"' )]+/g)].map((m) => m[0]));
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    const i = path.indexOf("assets/");
    // 진입 파일(index-해시)만 정리한다. 코드를 나눠 나중에 불러오는 조각이 생겨도 지우지 않게
    if (i >= 0 && /^assets\/index-[^/]+\.(js|css)$/.test(path.slice(i)) && !used.has(path.slice(i))) await cache.delete(req);
  }
}

async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      await (await caches.open(CACHE)).put(PAGE, res.clone());
      void copy.text().then(pruneAssets).catch(() => undefined);
    }
    return res;
  } catch {
    return (await caches.match(PAGE)) ?? Response.error();
  }
}

async function cacheFirst(req) {
  return (await caches.match(req)) ?? put(req, await fetch(req));
}

async function staleWhileRevalidate(req, wait) {
  const cached = await caches.match(req);
  const fresh = fetch(req).then((res) => put(req, res));
  if (!cached) return fresh;
  wait(fresh.catch(() => undefined));
  return cached;
}

async function networkFirst(req) {
  try {
    return await put(req, await fetch(req));
  } catch {
    return (await caches.match(req)) ?? Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || req.headers.has("range")) return;
  if (req.mode === "navigate") return e.respondWith(page(req));
  if (url.pathname.includes("/assets/") || url.pathname.includes("/retroarch/")) return e.respondWith(cacheFirst(req));
  if (url.pathname.includes("/emulators/")) return e.respondWith(staleWhileRevalidate(req, (p) => e.waitUntil(p)));
  e.respondWith(networkFirst(req));
});
