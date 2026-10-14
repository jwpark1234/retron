// 세이브 동기화: 기기 우선(local-first). 기기에 먼저 저장하고, 사용자 구글 드라이브(retron/saves/{게임키}.zip)에 올린다.
// - 드라이브 파일의 version으로 다른 기기가 먼저 올렸는지 확인한다. 그랬으면 충돌로 표시하고 게임을 열 때 묻는다.
// - 오프라인이면 대기했다가 온라인이 되거나 화면으로 돌아오면 자동으로 올린다.
// 로그인하지 않았으면 이 기기에만 저장한다.
import { useEffect, useState } from "preact/hooks";
import { createFile, download, findChild, getMeta, updateFile } from "../cloud/drive";
import { driveFolders } from "../cloud/games";
import { authState } from "../cloud/google-auth";
import { syncKey } from "../cloud/keys";
import { applyBundle, buildBundle } from "../library/backup";
import { gameDir, getGame, listGames, type Game } from "../library/library";
import { writeFile } from "../library/store";

export interface SyncInfo {
  pending: number; // 아직 못 올린 게임 수
  conflict: boolean;
}

interface GameSync {
  version?: string; // 마지막으로 맞춘 드라이브 파일 버전
  fileId?: string;
  dirty?: boolean; // 기기에서 바뀌고 아직 못 올림
  conflict?: boolean;
}

const DEBOUNCE_MS = 5000;
const RETRY_MS = 60 * 1000;

let info: SyncInfo = { pending: 0, conflict: false };
const listeners = new Set<(i: SyncInfo) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pushing = new Map<string, Promise<void>>();

const stateKey = (id: string) => `sync:${id}`;
function readState(id: string): GameSync {
  try {
    return JSON.parse(localStorage.getItem(stateKey(id)) ?? "{}");
  } catch {
    return {};
  }
}
function writeState(id: string, s: GameSync) {
  try {
    localStorage.setItem(stateKey(id), JSON.stringify(s));
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
  const states = (await listGames()).map((g) => readState(g.id));
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

const online = () => authState().signedIn && navigator.onLine;

let started = false;
export function initSync() {
  void refreshCounts();
  if (started) return;
  started = true;
  addEventListener("online", () => void retryAll());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void retryAll());
  setInterval(() => void retryAll(), RETRY_MS);
}

/** 세이브가 바뀌었다: 잠시 뒤 드라이브에 올린다 */
export function markDirty(gameId: string) {
  writeState(gameId, { ...readState(gameId), dirty: true });
  clearTimeout(timers.get(gameId));
  timers.set(gameId, setTimeout(() => void push(gameId), DEBOUNCE_MS));
}

export async function retryAll() {
  if (!online()) return;
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

async function remoteFile(game: Game) {
  const key = await syncKey(game);
  if (!key) return null;
  const { saves } = await driveFolders();
  return { key, saves, file: await findChild(saves, `${key}.zip`) };
}

async function doPush(gameId: string, force = false) {
  if (!online()) return;
  const game = await getGame(gameId);
  if (!game) return;
  const s = readState(gameId);
  if (s.conflict && !force) return;
  try {
    const remote = await remoteFile(game);
    const zip = await buildBundle(game);
    if (!remote || !zip) return writeState(gameId, { ...s, dirty: false });
    // 다른 기기가 먼저 올렸으면 덮어쓰지 않는다
    if (remote.file && remote.file.version !== s.version && !force) return writeState(gameId, { ...s, conflict: true });
    const blob = new Blob([zip], { type: "application/zip" });
    const saved = remote.file ? await updateFile(remote.file.id, blob) : await createFile(remote.saves, `${remote.key}.zip`, blob);
    writeState(gameId, { version: saved.version, fileId: saved.id, dirty: false, conflict: false });
  } catch {
    // 오프라인이거나 토큰이 만료됨: dirty로 남겨 두고 나중에 다시 올린다
  }
}

export type PrepareResult = { ok: true } | { conflict: true };

/** 게임을 열기 전에 드라이브와 맞춘다. 양쪽 다 바뀌었으면 충돌을 돌려준다 */
export async function prepareForPlay(game: Game): Promise<PrepareResult> {
  if (!online()) return { ok: true };
  const s = readState(game.id);
  try {
    const remote = await remoteFile(game);
    if (!remote?.file) {
      if (s.dirty) await push(game.id);
      return { ok: true };
    }
    if (remote.file.version === s.version) {
      if (s.dirty) await push(game.id);
      return { ok: true };
    }
    if (s.dirty || s.conflict) return { conflict: true };
    await pull(game, remote.file.id);
    return { ok: true };
  } catch {
    return { ok: true }; // 드라이브에 못 닿으면 기기 세이브로 한다
  }
}

async function pull(game: Game, fileId: string) {
  const res = await download(fileId);
  await applyBundle(game, new Uint8Array(await res.arrayBuffer()));
  const meta = await getMeta(fileId);
  writeState(game.id, { version: meta.version, fileId, dirty: false, conflict: false });
}

/** 충돌 해결: 드라이브 것(다른 기기)으로 덮거나, 이 기기 것을 드라이브에 올린다 */
export async function resolveConflict(game: Game, use: "server" | "device") {
  if (use === "device") return doPush(game.id, true);
  // 지는 쪽(이 기기) 세이브도 버리지 않고 남겨 둔다
  const mine = await buildBundle(game);
  if (mine) await writeFile(`${gameDir(game.id)}/conflict-backup.zip`, mine);
  const remote = await remoteFile(game);
  if (remote?.file) await pull(game, remote.file.id);
}
