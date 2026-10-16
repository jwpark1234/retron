// 게임 파일을 사용자 구글 드라이브의 retron/games/{게임키}/ 에 올리고 받는다.
// 각 파일은 원래 경로를 appProperties.path에 적어 둔다. manifest.json은 모든 파일을 올린 뒤 마지막에 쓴다.
import { useEffect, useState } from "preact/hooks";
import { gameDir, getGame, listGames, newGameId, putGame, type Game } from "../library/library";
import { getFile, listFiles, readJson, removeDir, writeJson, writeStream } from "../library/store";
import { keepAwake } from "../ui/wake-lock";
import { createFile, createLargeFile, download, ensureFolder, findChild, listAll, listChildren, rootFolder, trash, updateFile } from "./drive";
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
let transfers: Record<string, Transfer> = {};
const listeners = new Set<(t: Record<string, Transfer>) => void>();
function setTransfer(id: string, t: Transfer | null) {
  transfers = { ...transfers };
  if (t) transfers[id] = t;
  else delete transfers[id];
  keepAwake(Object.keys(transfers).length > 0); // 올리거나 받는 동안 화면이 꺼지지 않게
  listeners.forEach((l) => l(transfers));
}
export function useTransfers() {
  const [t, setT] = useState(transfers);
  useEffect(() => {
    listeners.add(setT);
    return () => void listeners.delete(setT);
  }, []);
  return t;
}

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

/** 기기의 게임을 드라이브에 올린다. 이미 올라간 파일(같은 크기)은 건너뛴다 */
export async function uploadGame(gameId: string) {
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
    if (big && getPrefs().wifiOnlyUpload && onCellular()) return;
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

/** 드라이브의 게임을 이 기기로 받는다 */
export async function downloadGame(remote: RemoteGame): Promise<Game> {
  const id = newGameId(remote.game.title);
  const total = remote.files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  setTransfer(remote.key, { label: "받는 중", done, total });
  try {
    for (const f of await listChildren(remote.folderId)) {
      const path = f.appProperties?.path;
      if (!path || path.includes("..")) continue;
      const res = await download(f.id);
      const counted = res.body!.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, ctl) {
            done += chunk.length;
            setTransfer(remote.key, { label: "받는 중", done, total });
            ctl.enqueue(chunk);
          },
        }),
      );
      await writeStream(`${gameDir(id)}/${path}`, counted);
    }
    const game: Game = { ...remote.game, id, syncKey: remote.key, addedAt: Date.now() };
    await putGame(game);
    return game;
  } catch (e) {
    await removeDir(gameDir(id)); // 받다 만 파일이 공간을 차지하지 않게
    throw e;
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
