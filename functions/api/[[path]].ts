// retron 서버 API (Cloudflare Pages Functions)
// 사이트 전체가 Cloudflare Access(구글 로그인) 뒤에 있고, 여기서 Access JWT를 한 번 더 검증해 사용자를 구분한다.
// 모든 저장 경로는 서버가 users/{사용자}/ 아래로 정하므로 다른 사용자의 데이터에는 접근할 수 없다.
//
//   GET  /api/me              로그인한 사용자
//   GET  /api/saves           내 세이브 목록
//   GET  /api/saves/:key      세이브 묶음(zip) 받기
//   PUT  /api/saves/:key      세이브 묶음 올리기 (If-Match: 알고 있던 etag, 처음이면 If-None-Match: *)

interface Env {
  BUCKET: R2Bucket;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_USER?: string; // 로컬 개발(wrangler pages dev)에서만 쓰는 가짜 사용자
}

interface User {
  id: string;
  email: string;
}

const MAX_BUNDLE = 64 * 1024 * 1024;
const KEY = /^[a-z0-9-]{8,100}$/;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

// --- Access JWT 검증 ---

let certs: { keys: (JsonWebKey & { kid: string })[]; fetchedAt: number } | null = null;

async function accessKeys(teamDomain: string) {
  if (!certs || Date.now() - certs.fetchedAt > 60 * 60 * 1000) {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    certs = { keys: ((await res.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys, fetchedAt: Date.now() };
  }
  return certs.keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function verifyAccessJwt(token: string, env: Env): Promise<User | null> {
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!ok || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  return { id: payload.sub, email: payload.email };
}

async function authenticate(request: Request, env: Env): Promise<User | null> {
  if (env.DEV_USER) return { id: "dev", email: env.DEV_USER };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null; // 설정 전에는 아무도 통과시키지 않는다
  const token =
    request.headers.get("cf-access-jwt-assertion") ??
    request.headers.get("cookie")?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;
  try {
    return await verifyAccessJwt(token, env);
  } catch {
    return null;
  }
}

// 올라온 버전마다 히스토리에도 남겨서, 덮어쓴 세이브(충돌에서 진 쪽 포함)를 최근 10개까지 되살릴 수 있게 한다
const HISTORY = 10;

async function keepHistory(bucket: R2Bucket, objectKey: string, historyPrefix: string) {
  const obj = await bucket.get(objectKey);
  if (!obj) return;
  await bucket.put(`${historyPrefix}${Date.now()}.zip`, obj.body, { httpMetadata: { contentType: "application/zip" } });
  const list = await bucket.list({ prefix: historyPrefix });
  const old = list.objects.sort((a, b) => a.key.localeCompare(b.key)).slice(0, -HISTORY);
  if (old.length) await bucket.delete(old.map((o) => o.key));
}

// --- 라우팅 ---

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await authenticate(request, env);
  if (!user) return json({ error: "로그인이 필요합니다" }, 401);

  const path = (params.path as string[] | undefined) ?? [];
  const prefix = `users/${user.id}/saves/`;

  if (path[0] === "me" && request.method === "GET") return json({ email: user.email });

  if (path[0] !== "saves") return json({ error: "없는 주소입니다" }, 404);

  if (path.length === 1 && request.method === "GET") {
    const list = await env.BUCKET.list({ prefix });
    return json(
      list.objects.map((o) => ({ key: o.key.slice(prefix.length, -".zip".length), etag: o.httpEtag, size: o.size, savedAt: o.uploaded })),
    );
  }

  const key = path[1];
  if (path.length !== 2 || !KEY.test(key)) return json({ error: "잘못된 게임 키입니다" }, 400);
  const objectKey = `${prefix}${key}.zip`;

  if (request.method === "GET") {
    const obj = await env.BUCKET.get(objectKey);
    if (!obj) return json({ error: "세이브가 없습니다" }, 404);
    return new Response(obj.body, { headers: { "content-type": "application/zip", etag: obj.httpEtag } });
  }

  if (request.method === "HEAD") {
    const obj = await env.BUCKET.head(objectKey);
    return new Response(null, { status: obj ? 200 : 404, headers: obj ? { etag: obj.httpEtag } : {} });
  }

  if (request.method === "PUT") {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BUNDLE) return json({ error: "세이브 묶음이 너무 큽니다" }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BUNDLE) return json({ error: "세이브 묶음이 너무 큽니다" }, 413);

    // 다른 기기가 먼저 올렸으면 덮어쓰지 않는다 (412 → 클라이언트가 충돌 처리)
    const ifMatch = request.headers.get("if-match");
    const createOnly = request.headers.get("if-none-match") === "*";
    const current = await env.BUCKET.head(objectKey);
    if (createOnly && current) return json({ error: "conflict", etag: current.httpEtag }, 412);
    if (ifMatch && (!current || current.httpEtag !== ifMatch)) return json({ error: "conflict", etag: current?.httpEtag }, 412);

    const put = await env.BUCKET.put(objectKey, body, {
      httpMetadata: { contentType: "application/zip" },
      ...(ifMatch ? { onlyIf: { etagMatches: ifMatch.replace(/"/g, "") } } : {}),
    });
    if (!put) return json({ error: "conflict" }, 412);
    await keepHistory(env.BUCKET, objectKey, `users/${user.id}/history/${key}/`);
    return json({ etag: put.httpEtag });
  }

  return json({ error: "지원하지 않는 요청입니다" }, 405);
};
