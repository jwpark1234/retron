// retron 서비스 워커: 데이터·와이파이가 없어도 앱이 열리고 기기에 있는 게임을 할 수 있게, 앱 파일과 에뮬레이터 파일을 기기에 둔다.
// 게임 파일·세이브·설정은 원래 기기(OPFS·localStorage)에 있으므로 여기서는 "앱 자체"만 맡는다.
// - 페이지(index.html): 네트워크 먼저(배포하면 바로 새 버전), 안 되면 기기에 둔 것
// - assets/: 이름에 해시가 붙어 바뀌지 않는다 → 기기에 둔 것 먼저. 새 페이지가 안 쓰는 옛 파일은 지운다
// - retroarch/v버전/, ejs/v버전/: 폴더에 버전이 붙어 바뀌지 않는다 → 기기에 둔 것 먼저
// - emulators/(js-dos): 이름에 버전이 없다 → 기기에 둔 것을 바로 쓰고 뒤에서 새로 받아 둔다
// 에뮬레이터는 처음 한 번 온라인에서 그 기종 게임을 실행해야 기기에 남는다 (모바일 데이터로 수십 MB를 미리 받지 않으려고).
// 구글 로그인·드라이브 요청(다른 도메인)은 건드리지 않는다.
// 다른 앱에서 "공유"로 보낸 롬(manifest의 share_target)도 여기서 받는다: 기기에 두고 앱을 열면 라이브러리가 가져가 추가한다 (src/library/share.ts).

const CACHE = "retron-app-v3";
const SHARE = "retron-share"; // 공유로 받은 파일 (앱 캐시와 따로 둬서, 앱 캐시 이름이 바뀌어도 지우지 않는다)
const PAGE = "./index.html";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(PAGE)).catch(() => undefined));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key !== SHARE) await caches.delete(key);
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

/** 공유로 받은 파일을 기기에 두고 앱 첫 화면으로 보낸다. 같이 온 파일만 남긴다 (먼저 받아 두고 아직 추가하지 않은 것은 버린다) */
async function receiveShare(req) {
  const files = (await req.formData()).getAll("files").filter((f) => f instanceof File);
  await caches.delete(SHARE);
  const cache = await caches.open(SHARE);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await cache.put(`./__share/${i}?name=${encodeURIComponent(f.name)}`, new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream" } }));
  }
  return Response.redirect("./?shared", 303);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share-target")) return e.respondWith(receiveShare(req));
  // 새 버전 확인(src/ui/update.ts)은 늘 서버에 묻는다. 기기에 두면 오프라인일 때 옛 답이 나온다
  if (url.search === "?version") return;
  // 로그인 왕복(/api/auth)은 서버로 그대로 보낸다 (페이지 이동이라 index.html로 저장되면 안 된다)
  if (req.method !== "GET" || url.origin !== location.origin || req.headers.has("range") || url.pathname.includes("/api/")) return;
  // 앱 페이지(/, index.html)만 앱으로 저장한다. 다른 페이지(개인정보처리방침 등)를 앱으로 저장하면 오프라인에서 그 페이지가 떴다
  const appPage = /\/(index\.html)?$/.test(url.pathname);
  if (req.mode === "navigate") return e.respondWith(appPage ? page(req) : networkFirst(req));
  if (url.pathname.includes("/assets/") || url.pathname.includes("/retroarch/") || url.pathname.includes("/ejs/")) return e.respondWith(cacheFirst(req));
  if (url.pathname.includes("/emulators/")) return e.respondWith(staleWhileRevalidate(req, (p) => e.waitUntil(p)));
  e.respondWith(networkFirst(req));
});
