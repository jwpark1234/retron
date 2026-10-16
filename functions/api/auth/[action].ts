// 구글 드라이브 토큰 갱신 서버 (Cloudflare Pages Functions).
// 브라우저만으로 받는 구글 토큰은 1시간짜리이고, 다시 받으려면 사용자가 눌러야 하는 창을 띄워야 해서 한 시간마다 "드라이브 연결"을 눌러야 했다.
// 로그인할 때 갱신 토큰(refresh token)을 받아 두고, 앱이 필요할 때 새 접근 토큰을 조용히 받아 간다.
//
// - 로그인은 페이지째 구글로 넘어갔다 돌아온다(start → 구글 → callback → 앱). 팝업은 막히거나(아이폰) 창 사이 연결이 끊겨서 쓰지 않는다.
//   기기마다 갱신 토큰을 받도록 매번 동의 화면을 띄운다(prompt=consent). 구글은 이미 허락한 계정에는 갱신 토큰을 다시 주지 않기 때문
// - 갱신 토큰은 서버 키(TOKEN_KEY)로 암호화해 HttpOnly 쿠키에 둔다. 서버는 아무것도 저장하지 않는다 (사용자 데이터는 여전히 각자 드라이브에만)
// - 쿠키를 쓰는 요청은 같은 사이트에서 온 것만 받는다 (Origin 검사 + SameSite=Strict + 전용 헤더). 로그인 왕복은 state로 확인
// - 비밀값이 없으면 config가 enabled:false를 돌려주고, 앱은 예전 방식(1시간 토큰 + 연결 버튼)으로 동작한다
//
// GET  /api/auth/config    → { enabled }
// GET  /api/auth/start     → 구글 로그인으로 보낸다 (?hint=이메일)
// GET  /api/auth/callback  → 갱신 토큰을 쿠키에 두고 앱으로 돌려보낸다 (실패하면 /?auth_error=...)
// POST /api/auth/refresh   → { access_token, expires_in } | 401
// POST /api/auth/logout    → 204 (구글에 갱신 토큰 취소 + 쿠키 삭제)

export interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_KEY?: string; // base64로 된 32바이트 (AES-256-GCM)
}

interface Context {
  request: Request;
  env: Env;
  params: { action?: string | string[] };
}

const COOKIE = "retron_rt";
const STATE_COOKIE = "retron_state";
const PATH = "/api/auth";
const MAX_AGE = 180 * 24 * 3600; // 쿠키는 180일. 구글이 갱신 토큰을 취소하면 그 전에 끝난다
const SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile"; // 앱(src/cloud/google-auth.ts)과 같게
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

const redirect = (to: string, cookies: string[] = []) => {
  const h = new Headers({ Location: to, "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
};

const configured = (env: Env): env is Required<Env> => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_KEY);

// --- 쿠키 암호화 (AES-GCM, 12바이트 iv를 앞에 붙여 base64url) ---
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(env: Required<Env>) {
  return crypto.subtle.importKey("raw", fromB64(env.TOKEN_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(env: Required<Env>, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return b64url(out);
}

export async function unseal(env: Required<Env>, sealed: string): Promise<string | null> {
  try {
    const raw = fromB64(sealed);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await key(env), raw.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null; // 키가 바뀌었거나 변조됨
  }
}

const readCookie = (req: Request, name: string) =>
  (req.headers.get("Cookie") ?? "")
    .split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

// 갱신 토큰: 같은 사이트 요청에만 실린다(Strict). state: 구글에서 돌아오는 이동(다른 사이트에서 오는 GET)에도 실려야 해서 Lax
const rtCookie = (value: string, maxAge = MAX_AGE) => `${COOKIE}=${value}; Path=${PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
const stateCookie = (value: string, maxAge = 600) => `${STATE_COOKIE}=${value}; Path=${PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

/** 앱이 보낸 요청인지 (다른 사이트가 쿠키를 실어 보내는 것을 막는다) */
const fromApp = (req: Request) => req.headers.get("Origin") === new URL(req.url).origin && req.headers.get("X-Retron") === "1";

async function google(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export async function onRequest({ request, env, params }: Context): Promise<Response> {
  const action = Array.isArray(params.action) ? params.action[0] : params.action;
  const url = new URL(request.url);
  const callbackUrl = `${url.origin}${PATH}/callback`;
  const fail = (why: string) => redirect(`/?auth_error=${encodeURIComponent(why)}`, [stateCookie("", 0)]);

  if (action === "config" && request.method === "GET") return json({ enabled: configured(env) });
  if (!configured(env)) return json({ error: "not-configured" }, 503);

  if (action === "start" && request.method === "GET") {
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    const hint = url.searchParams.get("hint");
    if (hint) q.set("login_hint", hint);
    return redirect(`${AUTH_URL}?${q}`, [stateCookie(state)]);
  }

  if (action === "callback" && request.method === "GET") {
    const state = url.searchParams.get("state");
    if (!state || state !== readCookie(request, STATE_COOKIE)) return fail("로그인 요청이 맞지 않습니다. 다시 시도해 주세요");
    const error = url.searchParams.get("error");
    if (error) return fail(error === "access_denied" ? "로그인을 취소했습니다" : error);
    const code = url.searchParams.get("code");
    if (!code) return fail("로그인 코드가 없습니다");
    const r = await google({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUrl, grant_type: "authorization_code" });
    if (!r.ok || typeof r.body.refresh_token !== "string") return fail(String(r.body.error_description ?? r.body.error ?? "갱신 토큰을 받지 못했습니다"));
    return redirect("/", [rtCookie(await seal(env, r.body.refresh_token)), stateCookie("", 0)]);
  }

  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!fromApp(request)) return json({ error: "origin" }, 403);

  if (action === "refresh") {
    const sealed = readCookie(request, COOKIE);
    const rt = sealed ? await unseal(env, sealed) : null;
    if (!rt) return json({ error: "no-session" }, 401, sealed ? { "Set-Cookie": rtCookie("", 0) } : {});
    const r = await google({ refresh_token: rt, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" });
    // invalid_grant: 사용자가 권한을 거뒀거나 토큰이 만료됨 → 쿠키를 지우고 다시 로그인하게
    if (!r.ok) return json({ error: String(r.body.error ?? "refresh") }, 401, r.body.error === "invalid_grant" ? { "Set-Cookie": rtCookie("", 0) } : {});
    return json({ access_token: r.body.access_token, expires_in: r.body.expires_in });
  }

  if (action === "logout") {
    const sealed = readCookie(request, COOKIE);
    const rt = sealed ? await unseal(env, sealed) : null;
    if (rt) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(rt)}`, { method: "POST" }).catch(() => undefined);
    return new Response(null, { status: 204, headers: { "Set-Cookie": rtCookie("", 0) } });
  }

  return json({ error: "not-found" }, 404);
}
