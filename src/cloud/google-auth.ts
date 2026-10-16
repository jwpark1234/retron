// 구글 로그인 (Google Identity Services, 토큰 방식).
// 서버 없이 브라우저에서 드라이브 접근 토큰을 받는다. 권한은 drive.file: 이 앱이 만든 파일만 보고 쓸 수 있다.
//
// 계정(signedIn)과 드라이브 연결(driveReady)을 나눈다.
// - 한 번 로그인한 기기는 계정을 기억해 두고, 오프라인이거나 토큰이 없어도 바로 라이브러리로 들어간다 (기기에 있는 게임·세이브로 한다).
// - 토큰은 1시간짜리다. 다시 받으려면 구글 창을 띄워야 하는데, 사용자가 누른 순간이 아니면 브라우저가 창을 막는다.
//   예전에는 그때 로그아웃시켜 버려서, 휴대폰을 한참 뒤에 다시 열면 올리기·동기화가 조용히 멈췄다.
//   이제는 driveReady만 끄고 "드라이브 다시 연결" 버튼을 보여 준다. 동기화는 연결될 때까지 기기에 쌓아 둔다.
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

/** 시작할 때: 기억해 둔 계정이 있으면 로그인 상태로 둔다. 아직 유효한 토큰이 있으면 드라이브도 바로 연결 */
export async function restoreSession() {
  // 개발 서버의 자동 테스트용(?e2e): 드라이브 없이 로그인한 것으로 둔다. 배포 빌드에는 들어가지 않는다
  if (E2E) return emit({ signedIn: true, email: "e2e@local" });
  const email = recall("gemail");
  try {
    const saved = JSON.parse(recall(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "null") as Token | null;
    if (saved && saved.expiresAt > Date.now()) token = saved;
  } catch {
    // 토큰은 "드라이브 다시 연결"로 받는다
  }
  if (email) emit({ signedIn: true, driveReady: !!token, email });
}

/** 로그인 버튼(사용자 클릭)에서 부른다. 이미 허락한 계정이면 팝업이 바로 닫힌다 */
export async function signIn() {
  emit({ busy: true, error: undefined });
  try {
    await ensureClient();
    token = await request(recall("gemail") ? "" : "select_account");
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
  token = null;
  remember("gemail");
  remember(TOKEN_KEY);
  emit({ signedIn: false, driveReady: false, email: undefined });
}

/** "드라이브 다시 연결" 버튼(사용자 클릭)에서 부른다. 이미 허락한 계정이면 창이 잠깐 떴다 닫힌다 */
export async function reconnectDrive() {
  emit({ busy: true, error: undefined });
  try {
    await ensureClient();
    token = await request("");
    emit({ driveReady: true, busy: false });
  } catch (e) {
    emit({ busy: false, error: (e as Error).message });
    throw e;
  }
}

/**
 * 드라이브 요청에 쓸 토큰. 만료됐으면, 사용자가 방금 누른 동작 안에서만 다시 받는다(게임 받기, 올리기 버튼 등).
 * 백그라운드(동기화 재시도)에서는 창이 막히므로 받지 않고 driveReady를 끈다. 로그아웃은 하지 않는다
 */
export async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.access_token;
  if (!state.signedIn || E2E) throw new Error("구글 로그인이 필요합니다");
  if (state.driveReady) emit({ driveReady: false });
  if (!userGesture() || !navigator.onLine) throw new Error("드라이브 연결이 끊겼습니다. 위쪽의 \"드라이브 연결\"을 눌러 주세요");
  await ensureClient();
  token = await request("");
  emit({ driveReady: true });
  return token.access_token;
}
