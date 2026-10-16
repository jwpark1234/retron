// 구글 로그인 (Google Identity Services, 토큰 방식).
// 서버 없이 브라우저에서 드라이브 접근 토큰을 받는다. 권한은 drive.file: 이 앱이 만든 파일만 보고 쓸 수 있다.
//
// 계정(signedIn)과 드라이브 연결(driveReady)을 나눈다.
// - 한 번 로그인한 기기는 계정을 기억해 두고, 오프라인이거나 토큰이 없어도 바로 라이브러리로 들어간다 (기기에 있는 게임·세이브로 한다).
// - 브라우저만으로 받는 토큰은 1시간짜리이고, 다시 받으려면 구글 창을 띄워야 하는데 사용자가 누른 순간이 아니면 브라우저가 막는다.
//   그래서 갱신 토큰 서버(functions/api/auth)를 둔다: 로그인할 때 갱신 토큰을 서버 쿠키에 두고, 만료되면 창 없이 새로 받는다.
// - 서버를 못 쓰면(개발 서버, 서버 비밀값 없음) 예전처럼 1시간짜리 토큰을 쓰고, 끊기면 driveReady만 끄고
//   "드라이브 연결" 버튼을 보여 준다(로그아웃하지 않는다). 동기화는 연결될 때까지 기기에 쌓아 둔다.
import { useEffect, useState } from "preact/hooks";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
const GIS_URL = "https://accounts.google.com/gsi/client";
const E2E = import.meta.env.DEV && new URLSearchParams(location.search).has("e2e");

export interface AuthState {
  signedIn: boolean; // 이 기기에 로그인한 계정이 있다 (오프라인이어도)
  driveReady: boolean; // 드라이브 토큰이 있어서 지금 동기화할 수 있다
  email?: string;
  busy: boolean;
  error?: string;
}

interface Token {
  access_token: string;
  expiresAt: number;
}

let state: AuthState = { signedIn: false, driveReady: false, busy: false };
const listeners = new Set<(s: AuthState) => void>();
let token: Token | null = null;
let client: any = null;
let pending: { resolve: (t: Token) => void; reject: (e: Error) => void } | null = null;

function emit(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function useAuth(): AuthState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

export const authState = () => state;

const remember = (k: string, v?: string) => {
  try {
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // 다음 로그인 때 계정을 다시 고르면 된다
  }
};
const recall = (k: string) => {
  try {
    return localStorage.getItem(k) ?? undefined;
  } catch {
    return undefined;
  }
};

function loadGis(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("구글 로그인 스크립트를 불러오지 못했습니다"));
    document.head.appendChild(s);
  });
}

async function ensureClient() {
  await loadGis();
  if (client) return;
  client = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (res: any) => {
      if (res.error) return pending?.reject(new Error(res.error_description ?? res.error));
      const t = { access_token: res.access_token, expiresAt: Date.now() + (Number(res.expires_in) - 60) * 1000 };
      remember(TOKEN_KEY, JSON.stringify(t)); // 1시간 안에 앱을 다시 열면 그대로 쓴다
      pending?.resolve(t);
    },
    error_callback: (err: any) => pending?.reject(new Error(err?.message ?? err?.type ?? "로그인이 취소되었습니다")),
  });
}

function request(prompt: "" | "consent" | "select_account"): Promise<Token> {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    client.requestAccessToken({ prompt, login_hint: recall("gemail") });
  });
}

async function loadEmail(t: Token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (!res.ok) throw new Error("계정 정보를 받지 못했습니다");
  return ((await res.json()) as { email: string }).email;
}

const TOKEN_KEY = "gtoken";

/** 사용자가 방금 화면을 눌렀다 (구글 창을 띄워도 브라우저가 막지 않는다) */
const userGesture = () => (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false;

const toToken = (access_token: string, expires_in: number): Token => {
  const t = { access_token, expiresAt: Date.now() + (Number(expires_in) - 60) * 1000 };
  remember(TOKEN_KEY, JSON.stringify(t)); // 1시간 안에 앱을 다시 열면 그대로 쓴다
  return t;
};

// --- 갱신 토큰 서버 (functions/api/auth) ---
// 있으면 로그인은 페이지째 구글로 다녀오고(갱신 토큰을 서버 쿠키에 둔다), 토큰이 만료되면 창 없이 새로 받는다.
// 없으면(개발 서버, 서버 비밀값을 아직 안 넣음) 예전 방식: 구글 창으로 1시간짜리 토큰을 받고, 끊기면 "드라이브 연결" 버튼
const api = (path: string) => new URL(`api/auth/${path}`, document.baseURI).href;
const TIMEOUT_MS = 6000;
let serverCheck: Promise<boolean> | null = null;
const server = () =>
  (serverCheck ??=
    import.meta.env.DEV || E2E
      ? Promise.resolve(false)
      : fetch(api("config"), { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
          .then((r) => (r.ok ? r.json() : { enabled: false }))
          .then((b: { enabled?: boolean }) => !!b.enabled)
          .catch(() => {
            serverCheck = null; // 오프라인이었으면 다음에 다시 물어본다
            return false;
          }));

let refreshing: Promise<Token | null> | null = null;
/** 서버 쿠키의 갱신 토큰으로 새 접근 토큰을 받는다. 서버가 없거나 로그인 기록이 없으면 null */
function serverRefresh(): Promise<Token | null> {
  if (!navigator.onLine) return Promise.resolve(null);
  refreshing ??= (async () => {
    if (!(await server())) return null;
    try {
      const res = await fetch(api("refresh"), { method: "POST", headers: { "X-Retron": "1" }, credentials: "same-origin", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const b = (await res.json()) as { access_token: string; expires_in: number };
      return toToken(b.access_token, b.expires_in);
    } catch {
      return null;
    }
  })().finally(() => (refreshing = null));
  return refreshing;
}

/** 구글 로그인으로 페이지째 넘어간다 (돌아오면 restoreSession이 토큰을 받는다) */
function goToGoogle(): Promise<never> {
  const hint = recall("gemail");
  location.assign(api(`start${hint ? `?hint=${encodeURIComponent(hint)}` : ""}`));
  return new Promise(() => undefined); // 페이지가 넘어간다
}

/** 시작할 때: 기억해 둔 계정이 있으면 로그인 상태로 둔다. 토큰이 아직 유효하거나 서버에서 새로 받으면 드라이브도 연결 */
export async function restoreSession() {
  // 개발 서버의 자동 테스트용(?e2e): 드라이브 없이 로그인한 것으로 둔다. 배포 빌드에는 들어가지 않는다
  if (E2E) return emit({ signedIn: true, email: "e2e@local" });
  // 구글 로그인에서 실패하고 돌아왔으면 첫 화면에 알린다
  const params = new URLSearchParams(location.search);
  const authError = params.get("auth_error");
  if (authError) {
    history.replaceState(null, "", location.pathname);
    emit({ error: authError });
  }
  let email = recall("gemail");
  try {
    const saved = JSON.parse(recall(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "null") as Token | null;
    if (saved && saved.expiresAt > Date.now()) token = saved;
  } catch {
    // 토큰은 서버나 "드라이브 연결"로 받는다
  }
  if (email) emit({ signedIn: true, driveReady: !!token, email });
  if (token) return;
  // 서버에 로그인 기록이 있으면 창 없이 토큰을 받는다 (구글 로그인에서 막 돌아왔을 때도 여기서 받는다)
  const t = await serverRefresh();
  if (!t) return;
  token = t;
  if (!email) {
    email = await loadEmail(t).catch(() => undefined);
    if (email) remember("gemail", email);
  }
  if (email) emit({ signedIn: true, driveReady: true, email });
}

/** 로그인 버튼(사용자 클릭)에서 부른다 */
export async function signIn() {
  emit({ busy: true, error: undefined });
  try {
    if (await server()) return await goToGoogle();
    await ensureClient();
    token = await request(recall("gemail") ? "" : "select_account");
    remember(TOKEN_KEY, JSON.stringify(token));
    const email = await loadEmail(token);
    remember("gemail", email);
    emit({ signedIn: true, driveReady: true, email, busy: false });
  } catch (e) {
    emit({ busy: false, error: (e as Error).message });
    throw e;
  }
}

export function signOut() {
  if (token) (window as any).google?.accounts?.oauth2?.revoke(token.access_token, () => {});
  void fetch(api("logout"), { method: "POST", headers: { "X-Retron": "1" }, credentials: "same-origin" }).catch(() => undefined);
  token = null;
  remember("gemail");
  remember(TOKEN_KEY);
  emit({ signedIn: false, driveReady: false, email: undefined });
}

/** "드라이브 연결" 버튼(사용자 클릭)에서 부른다. 서버가 있으면 먼저 조용히 받아 보고, 안 되면 다시 로그인 */
export async function reconnectDrive() {
  emit({ busy: true, error: undefined });
  try {
    const t = await serverRefresh();
    if (t) {
      token = t;
      return emit({ driveReady: true, busy: false });
    }
    if (await server()) return await goToGoogle();
    await ensureClient();
    token = await request("");
    emit({ driveReady: true, busy: false });
  } catch (e) {
    emit({ busy: false, error: (e as Error).message });
    throw e;
  }
}

/**
 * 드라이브 요청에 쓸 토큰. 만료됐으면 서버에서 조용히 새로 받는다.
 * 서버가 없으면 사용자가 방금 누른 동작 안에서만 구글 창으로 다시 받는다(게임 받기, 올리기 버튼 등).
 * 못 받으면 driveReady를 끄고("드라이브 연결" 버튼이 뜬다) 로그아웃은 하지 않는다
 */
export async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.access_token;
  if (!state.signedIn || E2E) throw new Error("구글 로그인이 필요합니다");
  const t = await serverRefresh();
  if (t) {
    token = t;
    if (!state.driveReady) emit({ driveReady: true });
    return t.access_token;
  }
  if (state.driveReady) emit({ driveReady: false });
  if ((await server()) || !userGesture() || !navigator.onLine) throw new Error("드라이브 연결이 끊겼습니다. 위쪽의 \"드라이브 연결\"을 눌러 주세요");
  await ensureClient();
  token = await request("");
  remember(TOKEN_KEY, JSON.stringify(token));
  emit({ driveReady: true });
  return token.access_token;
}
