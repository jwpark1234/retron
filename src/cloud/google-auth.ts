// 구글 로그인 (Google Identity Services, 토큰 방식).
// 서버 없이 브라우저에서 드라이브 접근 토큰을 받는다. 토큰은 1시간짜리라 만료되면 다시 받는다.
// 권한은 drive.file: 이 앱이 만든 파일만 보고 쓸 수 있다.
import { useEffect, useState } from "preact/hooks";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
const GIS_URL = "https://accounts.google.com/gsi/client";

export interface AuthState {
  signedIn: boolean;
  email?: string;
  busy: boolean;
  error?: string;
}

interface Token {
  access_token: string;
  expiresAt: number;
}

let state: AuthState = { signedIn: false, busy: false };
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
      try {
        sessionStorage.setItem("gtoken", JSON.stringify(t));
      } catch {
        // 새로 고침하면 다시 받는다
      }
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

/** 시작할 때: 이 탭에 아직 유효한 토큰이 있으면 그대로 로그인 상태로 둔다 */
export async function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("gtoken") ?? "null") as Token | null;
    if (saved && saved.expiresAt > Date.now()) {
      token = saved;
      emit({ signedIn: true, email: recall("gemail") ?? (await loadEmail(saved)) });
    }
  } catch {
    // 로그인 버튼으로 다시 받는다
  }
}

/** 로그인 버튼(사용자 클릭)에서 부른다. 이미 허락한 계정이면 팝업이 바로 닫힌다 */
export async function signIn() {
  emit({ busy: true, error: undefined });
  try {
    await ensureClient();
    token = await request(recall("gemail") ? "" : "select_account");
    const email = await loadEmail(token);
    remember("gemail", email);
    emit({ signedIn: true, email, busy: false });
  } catch (e) {
    emit({ busy: false, error: (e as Error).message });
    throw e;
  }
}

export function signOut() {
  if (token) (window as any).google?.accounts?.oauth2?.revoke(token.access_token, () => {});
  token = null;
  remember("gemail");
  try {
    sessionStorage.removeItem("gtoken");
  } catch {
    // 이미 지워졌다
  }
  emit({ signedIn: false, email: undefined });
}

/** 드라이브 요청에 쓸 토큰. 만료됐으면 다시 받는다(이미 허락한 계정이면 창이 잠깐 떴다 닫힌다) */
export async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.access_token;
  if (!state.signedIn) throw new Error("구글 로그인이 필요합니다");
  await ensureClient();
  try {
    token = await request("");
    return token.access_token;
  } catch (e) {
    emit({ signedIn: false });
    throw e;
  }
}
