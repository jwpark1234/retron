// 게임 파일을 사용자 구글 드라이브의 retron/games/{게임키}/ 에 올리고 받는다.
// 각 파일은 원래 경로를 appProperties.path에 적어 둔다. manifest.json은 모든 파일을 올린 뒤 마지막에 쓴다.
import { useEffect, useState } from "preact/hooks";
import { gameDir, getGame, listGames, newGameId, putGame, type Game } from "../library/library";
import { getFile, listFiles, openWritable, readJson, writeJson } from "../library/store";
import { keepAwake } from "../ui/wake-lock";
import { createFile, createLargeFile, download, downloadRange, ensureFolder, findChild, listAll, listChildren, rootFolder, trash, updateFile } from "./drive";
import { getPrefs } from "../ui/prefs";
import { authState } from "./google-auth";
import { onCellular } from "./network";
import { syncKey } from "./keys";

const ROOT = "retron";
const SMALL = 5 * 1024 * 1024;

/** 다른 기기에서 쓸 게임 정보 (기기마다 다른 id, 마지막 플레이 시각은 빼고) */
export interface RemoteGame {
  key: string;
  folderId: string;
  game: Omit<Game, "id" | "lastPlayedAt">;
  files: { path: string; size: number }[];
  thumb?: string; // 썸네일 (data URL) — 받기 전에도 카드에 보여 준다
}

export interface Transfer {
  label: string; // "올리는 중" / "받는 중"
  done: number;
  total: number;
}

// --- 진행 상황 (라이브러리 카드에 표시) ---
// 진행률은 1초에 몇 번만 알린다. 받은 조각마다 알리면 라이브러리 화면을 수천 번 다시 그려서 휴대폰에서는 받기 자체가 느려졌다
const NOTIFY_MS = 250;
let transfers: Record<string, Transfer> = {};
const listeners = new Set<(t: Record<string, Transfer>) => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const notify = () => {
  notifyTimer = null;
  listeners.forEach((l) => l(transfers));
};
function setTransfer(id: string, t: Transfer | null) {
  const started = t && !transfers[id];
  transfers = { ...transfers };
  if (t) transfers[id] = t;
  else delete transfers[id];
  keepAwake(Object.keys(transfers).length > 0); // 올리거나 받는 동안 화면이 꺼지지 않게
  // 시작과 끝은 바로, 중간 진행률은 모아서
  if (started || !t) {
    if (notifyTimer) clearTimeout(notifyTimer);
    notify();
  } else notifyTimer ??= setTimeout(notify, NOTIFY_MS);
}
export function useTransfers() {
  const [t, setT] = useState(transfers);
  useEffect(() => {
    listeners.add(setT);
    return () => void listeners.delete(setT);
  }, []);
  return t;
}

// --- 올리지 못한 까닭 (카드와 게임 설정에 보여 준다. 올리면 지운다) ---
let issues: Record<string, string> = {};
const issueListeners = new Set<(t: Record<string, string>) => void>();
function setIssue(id: string, msg: string | null) {
  if ((issues[id] ?? null) === msg) return;
  issues = { ...issues };
  if (msg) issues[id] = msg;
  else delete issues[id];
  issueListeners.forEach((l) => l(issues));
}
export function useUploadIssues() {
  const [t, setT] = useState(issues);
  useEffect(() => {
    issueListeners.add(setT);
    return () => void issueListeners.delete(setT);
  }, []);
  return t;
}
export const WAIT_WIFI = "모바일 데이터라 Wi-Fi에 연결되면 올립니다";

// --- 폴더 ---
// retron/games: 게임 파일, retron/saves: 게임 안 세이브, retron/states: 상태 저장 슬롯
let folders: Promise<{ root: string; games: string; saves: string; states: string }> | null = null;
export function driveFolders() {
  folders ??= (async () => {
    const root = await rootFolder(ROOT);
    const [games, saves, states] = await Promise.all([ensureFolder(root, "games"), ensureFolder(root, "saves"), ensureFolder(root, "states")]);
    return { root, games, saves, states };
  })().catch((e) => {
    folders = null;
    throw e;
  });
  return folders;
}

async function thumbDataUrl(gameId: string): Promise<string | undefined> {
  const f = await getFile(`${gameDir(gameId)}/thumb.png`);
  if (!f) return undefined;
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

const manifestOf = async (game: Game, key: string, files: { path: string; size: number }[]) => {
  const { id, lastPlayedAt, ...rest } = game;
  return { key, game: rest, files, thumb: await thumbDataUrl(id) };
};

async function writeManifest(folderId: string, body: object) {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  const existing = await findChild(folderId, "manifest.json");
  if (existing) await updateFile(existing.id, blob);
  else await createFile(folderId, "manifest.json", blob);
}

// --- 올리기 ---
const uploading = new Set<string>();

/** 기기의 게임을 드라이브에 올린다. 이미 올라간 파일(같은 크기)은 건너뛴다. force: 모바일 데이터여도 올린다 (사용자가 직접 누름) */
export async function uploadGame(gameId: string, { force = false } = {}) {
  if (uploading.has(gameId) || !authState().signedIn) return;
  uploading.add(gameId);
  try {
    const game = (await getGame(gameId))!;
    const key = await syncKey(game);
    if (!key) return;
    const { games } = await driveFolders();
    const folderId = await ensureFolder(games, key);
    const remote = new Map((await listChildren(folderId)).map((f) => [f.appProperties?.path ?? "", f]));
    // 세이브와 상태는 따로 동기화하므로 게임 파일만 올린다
    const local = [...(await listFiles(gameDir(game.id)))].filter(([p]) => !/^(saves|states)\//.test(p) && !/^(sram\.srm|conflict-backup\.zip)$/.test(p));
    // 모바일 데이터면 큰 파일은 Wi-Fi에 연결됐을 때 올린다 (uploadMissingGames)
    const big = local.some(([path, f]) => f.size > SMALL && Number(remote.get(path)?.size ?? -1) !== f.size);
    if (big && !force && getPrefs().wifiOnlyUpload && onCellular()) return setIssue(gameId, WAIT_WIFI);
    setIssue(gameId, null);
    const total = local.reduce((n, [, f]) => n + f.size, 0);
    let done = 0;
    setTransfer(gameId, { label: "드라이브에 올리는 중", done, total });
    for (const [path, file] of local) {
      const old = remote.get(path);
      if (Number(old?.size ?? -1) !== file.size) {
        const props = { path };
        const name = path.split("/").pop()!;
        if (old && file.size <= SMALL) await updateFile(old.id, file);
        else {
          if (old) await trash(old.id); // 크기가 다르면 올리다 만 파일이다
          if (file.size <= SMALL) await createFile(folderId, name, file, props);
          else
            await createLargeFile(
              folderId,
              name,
              file,
              props,
              (sent) => setTransfer(gameId, { label: "드라이브에 올리는 중", done: done + sent, total }),
              `${folderId}/${path}/${file.size}`,
            );
        }
      }
      done += file.size;
      setTransfer(gameId, { label: "드라이브에 올리는 중", done, total });
    }
    await writeManifest(folderId, await manifestOf(game, key, local.map(([path, f]) => ({ path, size: f.size }))));
  } catch (e) {
    setIssue(gameId, `올리지 못했습니다: ${(e as Error).message}`);
    throw e;
  } finally {
    uploading.delete(gameId);
    setTransfer(gameId, null);
  }
}

/** 이름이나 설정을 바꿨을 때 드라이브의 게임 정보도 고친다 */
export async function updateRemoteGame(game: Game) {
  if (!authState().signedIn || !game.syncKey) return;
  const { games } = await driveFolders();
  const folder = await findChild(games, game.syncKey);
  if (!folder) return;
  const manifest = await findChild(folder.id, "manifest.json");
  if (!manifest) return; // 아직 올리는 중이면 끝날 때 새 정보로 쓴다
  const old = (await (await download(manifest.id)).json()) as RemoteGame;
  await writeManifest(folder.id, await manifestOf(game, game.syncKey, old.files));
}

/** 드라이브에만 있는 게임 목록 */
const REMOTE_CACHE = "remote-games.json";

/**
 * 드라이브의 게임 목록. 받을 때마다 기기에도 적어 둬서, 오프라인이거나 드라이브 연결이 끊겨도
 * 라이브러리에 드라이브 게임을 계속 보여 준다 (cachedRemoteGames)
 */
export async function listRemoteGames(): Promise<RemoteGame[]> {
  const { games } = await driveFolders();
  const out: RemoteGame[] = [];
  for (const folder of await listChildren(games, "mimeType = 'application/vnd.google-apps.folder'")) {
    const manifest = await findChild(folder.id, "manifest.json");
    if (!manifest) continue; // 올리다 만 게임
    const m = (await (await download(manifest.id)).json()) as Omit<RemoteGame, "folderId">;
    out.push({ ...m, folderId: folder.id });
  }
  await writeJson(REMOTE_CACHE, out).catch(() => undefined);
  return out;
}

/** 마지막으로 받아 둔 드라이브 게임 목록 (없으면 빈 목록) */
export const cachedRemoteGames = () => readJson<RemoteGame[]>(REMOTE_CACHE, []).catch(() => [] as RemoteGame[]);

/** 드라이브에 다 올라간(manifest.json이 있는) 게임 키. 파일 내용은 받지 않아서 자주 불러도 가볍다 */
async function remoteKeys(): Promise<Set<string>> {
  const { games } = await driveFolders();
  const folders = new Map((await listChildren(games, "mimeType = 'application/vnd.google-apps.folder'")).map((f) => [f.id, f.name]));
  const params = new URLSearchParams({ q: "name = 'manifest.json' and trashed = false", fields: "nextPageToken,files(parents)", pageSize: "1000" });
  const keys = new Set<string>();
  for (const f of await listAll(params)) for (const p of f.parents ?? []) if (folders.has(p)) keys.add(folders.get(p)!);
  return keys;
}

// --- 받기 ---
// 큰 파일은 8MB씩 잘라 4개를 동시에 받고, 받은 순서대로 이어 쓴다 (한 줄로 받으면 휴대폰에서 아주 느렸다).
// 조각이 오래 안 오면(화면이 꺼지거나 다른 앱으로 가서 연결이 멈춤) 끊고 그 조각만 다시 받는다.
// 실패해도 다 받은 파일은 남겨 두고, 다시 누르면 남은 파일부터 이어 받는다.
const DL_CHUNK = 8 * 1024 * 1024;
const DL_AHEAD = 4;
const DL_TIMEOUT_MS = 60 * 1000;
const DL_TRIES = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pendingKey = (key: string) => `download:${key}`;

/** 받다 만 게임 폴더 (앱을 시작할 때 지우지 않는다) */
export function pendingDownloadIds(): Set<string> {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("download:")) ids.add(localStorage.getItem(k)!);
    }
  } catch {
    // 못 읽으면 지우는 쪽으로 (다시 받으면 된다)
  }
  return ids;
}

async function fetchChunk(fileId: string, start: number, end: number): Promise<Uint8Array> {
  for (let tries = 1; ; tries++) {
    try {
      return await downloadRange(fileId, start, end, DL_TIMEOUT_MS);
    } catch (e) {
      if (tries >= DL_TRIES) throw e;
      await sleep(1500 * tries);
      while (!navigator.onLine) await sleep(2000); // 연결이 돌아오면 이어 간다
    }
  }
}

async function downloadFile(fileId: string, size: number, path: string, onBytes: (n: number) => void) {
  const w = await openWritable(path);
  try {
    const pending: Promise<Uint8Array>[] = [];
    let next = 0;
    const fill = () => {
      for (; next < size && pending.length < DL_AHEAD; next += DL_CHUNK) {
        const p = fetchChunk(fileId, next, Math.min(size, next + DL_CHUNK) - 1);
        p.catch(() => undefined); // 앞 조각이 실패하면 뒤 조각은 기다리지 않는다 (처리 안 된 오류로 남지 않게)
        pending.push(p);
      }
    };
    fill();
    while (pending.length) {
      const data = await pending.shift()!;
      await w.write(data);
      onBytes(data.length);
      fill();
    }
    await w.close();
  } catch (e) {
    await w.abort().catch(() => undefined);
    throw e;
  }
}

/** 드라이브의 게임을 이 기기로 받는다. 받다 멈춘 적이 있으면 다 받은 파일은 건너뛰고 이어 받는다 */
export async function downloadGame(remote: RemoteGame): Promise<Game> {
  let id: string;
  try {
    id = localStorage.getItem(pendingKey(remote.key)) ?? newGameId(remote.game.title);
    localStorage.setItem(pendingKey(remote.key), id);
  } catch {
    id = newGameId(remote.game.title);
  }
  const total = remote.files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  setTransfer(remote.key, { label: "받는 중", done, total });
  try {
    // 게임 정보(manifest)에 적힌 파일만, 크기가 맞는 것으로 받는다 (올리다 만 파일이 섞여 있어도)
    const children = await listChildren(remote.folderId);
    for (const want of remote.files) {
      if (want.path.includes("..")) continue;
      const f = children.find((c) => c.appProperties?.path === want.path && Number(c.size ?? 0) === want.size);
      if (!f) throw new Error(`드라이브에 ${want.path} 파일이 없습니다`);
      const local = `${gameDir(id)}/${want.path}`;
      if ((await getFile(local))?.size === want.size) {
        done += want.size; // 지난번에 다 받은 파일
        continue;
      }
      await downloadFile(f.id, want.size, local, (n) => setTransfer(remote.key, { label: "받는 중", done: (done += n), total }));
    }
    const game: Game = { ...remote.game, id, syncKey: remote.key, addedAt: Date.now() };
    await putGame(game);
    try {
      localStorage.removeItem(pendingKey(remote.key));
    } catch {
      // 남아 있어도 다음에 같은 폴더를 쓸 뿐이다
    }
    return game;
  } catch (e) {
    throw new Error(`${(e as Error).message} (다시 누르면 받은 데까지 이어서 받습니다)`);
  } finally {
    setTransfer(remote.key, null);
  }
}

export async function deleteRemoteGame(key: string) {
  const { games } = await driveFolders();
  const folder = await findChild(games, key);
  if (folder) await trash(folder.id);
}

let missingRun: Promise<void> | null = null;

/** 아직 드라이브에 없는 기기 게임을 올린다 (하나씩). 여러 곳에서 불러도 한 번에 하나만 돈다 */
export function uploadMissingGames(): Promise<void> {
  if (!authState().driveReady || !navigator.onLine) return Promise.resolve();
  missingRun ??= (async () => {
    const onDrive = await remoteKeys();
    for (const g of await listGames()) {
      const key = await syncKey(g);
      if (key && !onDrive.has(key)) await uploadGame(g.id).catch(() => undefined);
    }
  })().finally(() => (missingRun = null));
  return missingRun;
}
