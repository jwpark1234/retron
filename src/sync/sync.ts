// 세이브 동기화: 기기 우선(local-first). 기기에 먼저 저장하고, 사용자 구글 드라이브에 따로 올린다.
//   게임 안 세이브  → retron/saves/{게임키}.zip   양쪽에서 바뀌었으면 충돌로 표시하고 게임을 열 때 묻는다.
//   상태 저장 슬롯 → retron/states/{게임키}.zip  양쪽에서 바뀌었으면 슬롯마다 더 최근 것을 남긴다 (묻지 않는다).
// - 드라이브 파일의 version으로 다른 기기가 먼저 올렸는지 확인한다.
// - 오프라인이면 대기했다가 온라인이 되거나 화면으로 돌아오면 자동으로 올린다.
// - 게임을 하는 동안(화면에 보이는 동안)은 올리지 않는다. 묶기·올리기가 메인 스레드를 잡으면 DOS 에뮬레이터
//   (워커가 메인 스레드와 초당 만 번 가까이 주고받는다)와 소리가 같이 끊겼다. 나가거나 다른 앱으로 가면 올린다.
// 로그인하지 않았으면 이 기기에만 저장한다.
import { useEffect, useState } from "preact/hooks";
import { createFile, download, findChild, getMeta, updateFile } from "../cloud/drive";
import { driveFolders } from "../cloud/games";
import { authState } from "../cloud/google-auth";
import { syncKey } from "../cloud/keys";
import { SAVE_KINDS, applyBundle, buildBundle, mergeStates, type SaveKind } from "../library/backup";
import { gameDir, getGame, listGames, type Game } from "../library/library";
import { writeFile } from "../library/store";

export interface SyncInfo {
  pending: number; // 아직 못 올린 게임 수
  conflict: boolean;
}

interface KindSync {
  version?: string; // 마지막으로 맞춘 드라이브 파일 버전
  dirty?: boolean; // 기기에서 바뀌고 아직 못 올림
  conflict?: boolean; // 게임 안 세이브만
}

const DEBOUNCE_MS = 5000;
const RETRY_MS = 60 * 1000;

let info: SyncInfo = { pending: 0, conflict: false };
const listeners = new Set<(i: SyncInfo) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pushing = new Map<string, Promise<void>>();

// --- 기기에 두는 동기화 상태 (localStorage) ---
const stateKey = (id: string, kind: SaveKind) => `sync:${id}:${kind}`;
function readState(id: string, kind: SaveKind): KindSync {
  try {
    const v = localStorage.getItem(stateKey(id, kind));
    // 예전에는 한 묶음(sync:{id})이었다. 그 상태는 게임 안 세이브 쪽으로 이어 쓴다
    return JSON.parse(v ?? (kind === "saves" ? localStorage.getItem(`sync:${id}`) : null) ?? "{}");
  } catch {
    return {};
  }
}
function writeState(id: string, kind: SaveKind, s: KindSync) {
  try {
    localStorage.setItem(stateKey(id, kind), JSON.stringify(s));
    if (kind === "saves") localStorage.removeItem(`sync:${id}`);
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
  emit({
    pending: games.filter((g) => SAVE_KINDS.some((k) => readState(g.id, k).dirty)).length,
    conflict: games.some((g) => readState(g.id, "saves").conflict),
  });
}

export function useSync(): SyncInfo {
  const [i, setI] = useState(info);
  useEffect(() => {
    listeners.add(setI);
    return () => void listeners.delete(setI);
  }, []);
  return i;
}

const online = () => authState().driveReady && navigator.onLine;

let playing = false;
const holding = () => playing && document.visibilityState === "visible";

/** 게임 화면이 열리고 닫힐 때 부른다. 닫히면 밀린 것을 올린다 */
export function setPlaying(on: boolean) {
  playing = on;
  if (!on) void retryAll();
}

let started = false;
export function initSync() {
  void refreshCounts();
  if (started) return;
  started = true;
  addEventListener("online", () => void retryAll());
  // 화면으로 돌아오면 밀린 것을, 게임 중 다른 앱으로 가면 그동안 쌓인 것을 올린다
  document.addEventListener("visibilitychange", () => void retryAll());
  setInterval(() => void retryAll(), RETRY_MS);
}

/** 세이브(saves) 또는 상태 저장(states)이 바뀌었다: 잠시 뒤 드라이브에 올린다 */
export function markDirty(gameId: string, kind: SaveKind) {
  writeState(gameId, kind, { ...readState(gameId, kind), dirty: true });
  const key = `${gameId}:${kind}`;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => void push(gameId, kind), DEBOUNCE_MS));
}

export async function retryAll() {
  if (!online()) return;
  for (const g of await listGames()) {
    for (const kind of SAVE_KINDS) {
      const s = readState(g.id, kind);
      if (s.dirty && !s.conflict) void push(g.id, kind);
    }
  }
}

function push(gameId: string, kind: SaveKind): Promise<void> {
  const key = `${gameId}:${kind}`;
  const running = pushing.get(key);
  if (running) return running.then(() => push(gameId, kind));
  const p = doPush(gameId, kind).finally(() => pushing.delete(key));
  pushing.set(key, p);
  return p;
}

async function remoteFile(game: Game, kind: SaveKind) {
  const key = await syncKey(game);
  if (!key) return null;
  const folder = (await driveFolders())[kind];
  return { key, folder, file: await findChild(folder, `${key}.zip`) };
}

async function doPush(gameId: string, kind: SaveKind, force = false) {
  if (!online() || (holding() && !force)) return; // 게임 중이면 dirty로 두고 나중에 올린다
  const game = await getGame(gameId);
  if (!game) return;
  const s = readState(gameId, kind);
  if (s.conflict && !force) return;
  try {
    const remote = await remoteFile(game, kind);
    if (!remote) return writeState(gameId, kind, { ...s, dirty: false });
    // 다른 기기가 먼저 올렸다: 세이브는 덮어쓰지 않고 충돌로 두고, 상태 저장은 합친 뒤 올린다
    if (remote.file && remote.file.version !== s.version && !force) {
      if (kind === "saves") return writeState(gameId, kind, { ...s, conflict: true });
      await mergeStates(game, new Uint8Array(await (await download(remote.file.id)).arrayBuffer()));
    }
    const zip = await buildBundle(game, [kind]);
    if (!zip) return writeState(gameId, kind, { ...s, dirty: false });
    const blob = new Blob([zip], { type: "application/zip" });
    const saved = remote.file ? await updateFile(remote.file.id, blob) : await createFile(remote.folder, `${remote.key}.zip`, blob);
    writeState(gameId, kind, { version: saved.version, dirty: false, conflict: false });
  } catch {
    // 오프라인이거나 토큰이 만료됨: dirty로 남겨 두고 나중에 다시 올린다
  }
}

/** 드라이브 것을 받아 기기에 넣는다. 상태 저장은 합치고, 기기 쪽이 더 최근인 슬롯이 있으면 다시 올린다 */
async function pull(game: Game, kind: SaveKind, fileId: string) {
  const zip = new Uint8Array(await (await download(fileId)).arrayBuffer());
  const meta = await getMeta(fileId);
  if (kind === "saves") {
    await applyBundle(game, zip, ["saves"]);
    return writeState(game.id, kind, { version: meta.version, dirty: false, conflict: false });
  }
  const localNewer = await mergeStates(game, zip);
  writeState(game.id, kind, { version: meta.version, dirty: localNewer || readState(game.id, kind).dirty });
  if (localNewer) await push(game.id, kind);
}

/** 한 종류를 드라이브와 맞춘다. 게임 안 세이브가 양쪽 다 바뀌었으면 false */
async function prepareKind(game: Game, kind: SaveKind): Promise<boolean> {
  const s = readState(game.id, kind);
  const remote = await remoteFile(game, kind);
  if (!remote?.file || remote.file.version === s.version) {
    // 드라이브에 아직 없으면(처음 맞추거나, 예전에 한 묶음으로 올리던 게임) 기기 것을 올린다
    if (s.dirty || (remote && !remote.file)) await push(game.id, kind);
    return true;
  }
  if (kind === "saves" && (s.dirty || s.conflict)) return false;
  await pull(game, kind, remote.file.id);
  return true;
}

export type PrepareResult = { ok: true } | { conflict: true };

/** 게임을 열기 전에 드라이브와 맞춘다. 게임 안 세이브가 양쪽 다 바뀌었으면 충돌을 돌려준다 */
export async function prepareForPlay(game: Game): Promise<PrepareResult> {
  if (!online()) return { ok: true };
  try {
    const [saves] = await Promise.all([prepareKind(game, "saves"), prepareKind(game, "states")]);
    return saves ? { ok: true } : { conflict: true };
  } catch {
    return { ok: true }; // 드라이브에 못 닿으면 기기 세이브로 한다
  }
}

/** 게임 안 세이브 충돌 해결: 드라이브 것(다른 기기)으로 덮거나, 이 기기 것을 드라이브에 올린다 */
export async function resolveConflict(game: Game, use: "server" | "device") {
  if (use === "device") return doPush(game.id, "saves", true);
  // 지는 쪽(이 기기) 세이브도 버리지 않고 남겨 둔다
  const mine = await buildBundle(game, ["saves"]);
  if (mine) await writeFile(`${gameDir(game.id)}/conflict-backup.zip`, mine);
  const remote = await remoteFile(game, "saves");
  if (remote?.file) await pull(game, "saves", remote.file.id);
}
