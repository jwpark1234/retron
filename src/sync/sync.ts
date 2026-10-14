// 세이브 동기화: 기기 우선(local-first). 기기에 먼저 저장하고, 서버(R2)에는 조건부로 올린다.
// - 다른 기기가 먼저 올렸으면(412) 충돌로 표시하고, 다음에 게임을 열 때 어느 쪽을 쓸지 묻는다.
// - 오프라인이면 대기했다가 온라인이 되거나 화면으로 돌아오면 자동으로 올린다.
// 서버 API가 없는 곳(로컬 개발, 정적 호스팅)에서는 조용히 꺼진다.
import { useEffect, useState } from "preact/hooks";
import { applyBundle, buildBundle } from "../library/backup";
import { gameDir, getGame, listGames, putGame, type Game } from "../library/library";
import { getFile, writeFile } from "../library/store";
import { HDD_DIR } from "../platforms/dos/profiles";

async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SyncInfo {
  enabled: boolean;
  email?: string;
  pending: number; // 아직 못 올린 게임 수
  conflict: boolean;
  needLogin: boolean;
}

interface GameSync {
  etag?: string; // 마지막으로 맞춘 서버 버전
  dirty?: boolean; // 기기에서 바뀌고 아직 못 올림
  conflict?: boolean;
}

const API = "api";
const DEBOUNCE_MS = 5000;
const RETRY_MS = 60 * 1000;

let info: SyncInfo = { enabled: false, pending: 0, conflict: false, needLogin: false };
const listeners = new Set<(i: SyncInfo) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pushing = new Map<string, Promise<void>>();

const key = (id: string) => `sync:${id}`;
function readState(id: string): GameSync {
  try {
    return JSON.parse(localStorage.getItem(key(id)) ?? "{}");
  } catch {
    return {};
  }
}
function writeState(id: string, s: GameSync) {
  try {
    localStorage.setItem(key(id), JSON.stringify(s));
  } catch {
    // 저장 못 하면 다음 실행에서 다시 맞춘다
  }
  void refreshCounts();
}

function emit(patch: Partial<SyncInfo>) {
  info = { ...info, ...patch };
  listeners.forEach((l) => l(info));
}

async function refreshCounts() {
  const games = await listGames();
  const states = games.map((g) => readState(g.id));
  emit({ pending: states.filter((s) => s.dirty).length, conflict: states.some((s) => s.conflict) });
}

export function useSync(): SyncInfo {
  const [i, setI] = useState(info);
  useEffect(() => {
    listeners.add(setI);
    return () => void listeners.delete(setI);
  }, []);
  return i;
}

/** 기기 사이에서 같은 게임을 알아보는 키: ROM이나 실행 파일 내용의 해시 */
export async function syncKey(game: Game): Promise<string | null> {
  if (game.syncKey) return game.syncKey;
  const dir = gameDir(game.id);
  const file =
    game.platform === "sfc" ? await getFile(`${dir}/${game.sfc!.rom}`) : await getFile(`${dir}/${HDD_DIR}/${game.dos!.exe.toUpperCase()}`);
  if (!file) return null;
  const hash = (await sha256Hex(new Uint8Array(await file.arrayBuffer()))).slice(0, 40);
  const k = `${game.platform}-${hash}`;
  await putGame({ ...game, syncKey: k });
  return k;
}

export async function initSync() {
  try {
    const res = await fetch(`${API}/me`, { credentials: "same-origin" });
    if (res.status === 401) return emit({ enabled: false, needLogin: true });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return emit({ enabled: false });
    const me = (await res.json()) as { email: string };
    emit({ enabled: true, email: me.email });
  } catch {
    return emit({ enabled: false });
  }
  await refreshCounts();
  addEventListener("online", () => void retryAll());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void retryAll());
  setInterval(() => void retryAll(), RETRY_MS);
  void retryAll();
}

/** 세이브가 바뀌었다: 잠시 뒤 서버에 올린다 */
export function markDirty(gameId: string) {
  writeState(gameId, { ...readState(gameId), dirty: true });
  if (!info.enabled) return;
  clearTimeout(timers.get(gameId));
  timers.set(gameId, setTimeout(() => void push(gameId), DEBOUNCE_MS));
}

async function retryAll() {
  if (!info.enabled || !navigator.onLine) return;
  for (const g of await listGames()) {
    const s = readState(g.id);
    if (s.dirty && !s.conflict) void push(g.id);
  }
}

function push(gameId: string): Promise<void> {
  const running = pushing.get(gameId);
  if (running) return running.then(() => push(gameId));
  const p = doPush(gameId).finally(() => pushing.delete(gameId));
  pushing.set(gameId, p);
  return p;
}

async function doPush(gameId: string, force?: string) {
  const game = await getGame(gameId);
  if (!game || !info.enabled) return;
  const s = readState(gameId);
  if (s.conflict && !force) return;
  const k = await syncKey(game);
  const zip = await buildBundle(game);
  if (!k || !zip) return writeState(gameId, { ...s, dirty: false });
  const headers: Record<string, string> = { "content-type": "application/zip" };
  const match = force ?? s.etag;
  if (match) headers["if-match"] = match;
  else headers["if-none-match"] = "*";
  try {
    const res = await fetch(`${API}/saves/${k}`, { method: "PUT", body: zip, headers, credentials: "same-origin" });
    if (res.status === 412) return writeState(gameId, { ...s, conflict: true });
    if (res.status === 401) return emit({ enabled: false, needLogin: true });
    if (!res.ok) return; // 다음 재시도에서 다시
    const { etag } = (await res.json()) as { etag: string };
    writeState(gameId, { etag, dirty: false, conflict: false });
  } catch {
    // 오프라인: dirty로 남겨 두고 나중에 다시 올린다
  }
}

export type PrepareResult = { ok: true } | { conflict: true; remoteEtag: string };

/** 게임을 열기 전에 서버와 맞춘다. 양쪽 다 바뀌었으면 충돌을 돌려준다 */
export async function prepareForPlay(game: Game): Promise<PrepareResult> {
  if (!info.enabled || !navigator.onLine) return { ok: true };
  const k = await syncKey(game);
  if (!k) return { ok: true };
  const s = readState(game.id);
  try {
    const head = await fetch(`${API}/saves/${k}`, { method: "HEAD", credentials: "same-origin" });
    if (head.status === 404) {
      if (s.dirty) await push(game.id);
      return { ok: true };
    }
    if (!head.ok) return { ok: true };
    const remote = head.headers.get("etag")!;
    if (remote === s.etag) {
      if (s.dirty) await push(game.id);
      return { ok: true };
    }
    if (s.dirty || s.conflict) return { conflict: true, remoteEtag: remote };
    await pull(game, k);
    return { ok: true };
  } catch {
    return { ok: true }; // 서버에 못 닿으면 기기 세이브로 한다
  }
}

async function pull(game: Game, k: string) {
  const res = await fetch(`${API}/saves/${k}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("서버 세이브를 받지 못했습니다");
  await applyBundle(game, new Uint8Array(await res.arrayBuffer()));
  writeState(game.id, { etag: res.headers.get("etag") ?? undefined, dirty: false, conflict: false });
}

/** 충돌 해결: 서버 것(다른 기기)으로 덮거나, 이 기기 것을 서버에 올린다 */
export async function resolveConflict(game: Game, use: "server" | "device", remoteEtag: string) {
  const k = (await syncKey(game))!;
  if (use === "server") {
    // 지는 쪽(이 기기) 세이브도 버리지 않고 남겨 둔다
    const mine = await buildBundle(game);
    if (mine) await writeFile(`${gameDir(game.id)}/conflict-backup.zip`, mine);
    await pull(game, k);
  }
  else await doPush(game.id, remoteEtag);
}
