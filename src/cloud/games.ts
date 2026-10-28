// 게임 파일을 사용자 구글 드라이브의 retron/games/ 에 올리고 받는다. 게임마다 폴더 하나, manifest.json은 모든 파일을 올린 뒤 마지막에 쓴다.
// - 지금 방식: 폴더 이름은 게임 이름, 키는 폴더의 appProperties.key. 안에는 추가할 때 고른 원본(zip, 롬)을 이름 그대로 올린다.
//   받는 기기는 원본을 받아 처음 추가할 때와 같은 방식으로 다시 푼다 (library/import.ts reimportFiles).
//   원본이 기기에 없는 게임(원본을 보관하지 않던 때 추가함)은 롬 파일 그대로, DOS는 게임 폴더를 zip 하나로 묶어 올린다 (library/pack.ts).
//   풀린 파일을 하나씩 올리는 일은 없다.
// - 예전 방식: 폴더 이름이 키이고, 기기에서 풀린 파일을 하나씩 올렸다 (원래 경로는 appProperties.path). 받기는 그대로 된다.
//   그 게임이 있는 기기가 Wi-Fi에 연결되면 지금 방식으로 다시 올리고, 다 올린 뒤 예전 폴더를 휴지통으로 보낸다.
import { useEffect, useState } from "preact/hooks";
import { gameDir, getGame, listGames, newGameId, patchGame, putGame, sourceDir, type Game, type GameSource } from "../library/library";
import { reimportFiles, type Entry } from "../library/import";
import { packGame, packedPath, packedSize } from "../library/pack";
import { getFile, openWritable, readJson, removeDir, writeFile, writeJson } from "../library/store";
import { unzipTo } from "../library/zip";
import { keepAwake } from "../ui/wake-lock";
import {
  createFile,
  createFolder,
  createLargeFile,
  download,
  downloadRange,
  ensureFolder,
  findChild,
  listAll,
  listChildren,
  renameFile,
  rootFolder,
  trash,
  updateFile,
  updateMeta,
  type DriveFile,
} from "./drive";
import { getPrefs } from "../ui/prefs";
import { authState } from "./google-auth";
import { onCellular } from "./network";
import { syncKey } from "./keys";

const ROOT = "retron";
const SMALL = 5 * 1024 * 1024;
const MANIFEST = "manifest.json";
const FOLDER_MIME = "mimeType = 'application/vnd.google-apps.folder'";

/** 다른 기기에서 쓸 게임 정보 (기기마다 다른 id, 마지막 플레이 시각은 빼고) */
export interface RemoteGame {
  key: string;
  folderId: string;
  game: Omit<Game, "id" | "lastPlayedAt" | "source">;
  /** 지금 방식: 추가할 때 고른 원본을 그대로 올렸다 */
  source?: GameSource;
  /** 예전 방식: 풀린 파일을 하나씩 올렸다 */
  files?: { path: string; size: number }[];
  thumb?: string; // 썸네일 (data URL) — 받기 전에도 카드에 보여 준다
}

export interface Transfer {
  label: string; // "드라이브에 올리는 중" / "받는 중" / "설치 중"
  done: number;
  total: number;
  /** 이 단계(label)를 시작한 뒤 걸린 시간 (ms) */
  elapsed?: number;
  /** 이 단계를 시작한 뒤 평균 속도 (바이트/초). 올리기·받기만 */
  rate?: number;
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
// 단계(받는 중 → 설치 중)마다 시작 시각과 그때까지 한 양을 적어 두고, 걸린 시간과 평균 속도를 카드에 보여 준다 (어느 단계가 느린지 보려고)
const phases: Record<string, { label: string; at: number; done: number }> = {};
const PREPARE = "올릴 준비 중";
function withSpeed(id: string, t: Transfer): Transfer {
  const now = Date.now();
  let p = phases[id];
  if (!p || p.label !== t.label) p = phases[id] = { label: t.label, at: now, done: t.done };
  const elapsed = now - p.at;
  const bytes = t.label !== "설치 중" && t.label !== PREPARE; // 이 둘은 바이트가 아니라 0~100
  return { ...t, elapsed, rate: bytes && elapsed >= 2000 ? ((t.done - p.done) * 1000) / elapsed : undefined };
}
function setTransfer(id: string, t: Transfer | null) {
  const started = t && !transfers[id];
  transfers = { ...transfers };
  if (t) transfers[id] = withSpeed(id, t);
  else {
    delete transfers[id];
    delete phases[id];
  }
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

/** 게임 폴더의 키: 지금은 appProperties.key, 예전에는 폴더 이름 */
const folderKey = (f: DriveFile) => f.appProperties?.key ?? f.name;
/** 드라이브에서 알아볼 수 있게 폴더 이름은 게임 이름으로 (윈도우에서 못 쓰는 글자는 뺀다) */
const folderName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 100) || "game";

async function gameFolders(): Promise<DriveFile[]> {
  const { games } = await driveFolders();
  return listChildren(games, FOLDER_MIME);
}

/** 이 게임 키의 폴더 (지금 방식을 먼저) */
async function findGameFolder(key: string): Promise<DriveFile | undefined> {
  const list = (await gameFolders()).filter((f) => folderKey(f) === key);
  return list.find((f) => f.appProperties?.key) ?? list[0];
}

/** 이 게임 키의 폴더들과 안의 파일. complete: 다 올라감(manifest 있음), v2: 지금 방식(원본을 그대로 올림) */
interface KeyFolder {
  folder: DriveFile;
  children: DriveFile[];
  complete: boolean;
  v2: boolean;
}
async function foldersFor(key: string): Promise<KeyFolder[]> {
  const list = (await gameFolders()).filter((f) => folderKey(f) === key);
  return Promise.all(
    list.map(async (folder) => {
      const children = await listChildren(folder.id);
      return { folder, children, complete: children.some((c) => c.name === MANIFEST), v2: !!folder.appProperties?.key };
    }),
  );
}

/** 한 번에 n개씩 돌린다. 하나가 실패하면 남은 것은 시작하지 않고 그 오류를 던진다 */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function thumbDataUrl(gameId: string): Promise<string | undefined> {
  const f = await getFile(`${gameDir(gameId)}/thumb.png`);
  if (!f) return undefined;
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

/** 드라이브에 적는 게임 정보 (기기마다 다른 id, 마지막 플레이 시각, 기기의 원본 보관 정보는 빼고) */
function remoteInfo(game: Game): RemoteGame["game"] {
  const { id, lastPlayedAt, source, ...rest } = game;
  return rest;
}

async function writeManifest(folderId: string, body: object) {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  const existing = await findChild(folderId, MANIFEST);
  if (existing) await updateFile(existing.id, blob);
  else await createFile(folderId, MANIFEST, blob);
}

// --- 올리기 ---
const uploading = new Set<string>();

interface UploadItem {
  name: string; // 드라이브 파일 이름
  file: Blob;
  props: Record<string, string>;
  old?: DriveFile; // 드라이브에 이미 있는 같은 파일 (올리다 만 것일 수 있다)
}

type SourceFile = { name: string; file: Blob };

/** 추가할 때 고른 원본이 기기에 다 남아 있으면 그 파일들 (없으면 null) */
async function sourceFiles(game: Game, onPack: (fraction: number) => void): Promise<SourceFile[] | null> {
  const src = game.source;
  if (!src) return null;
  if (src.layout === "game") {
    // 크기부터 맞춰 본다. 예전에는 묶어 본 뒤 크기가 다르면 또 묶어서, 게임 전체를 두 번 읽었다
    if ((await packedSize(game)) !== src.files[0]?.size) return null;
    return [{ name: src.files[0].name, file: await packGame(game, onPack) }];
  }
  const out: SourceFile[] = [];
  for (const s of src.files) {
    const f = src.romFile && game.rom ? await getFile(`${gameDir(game.id)}/${game.rom.rom}`) : await getFile(`${sourceDir(game.id)}/${s.name}`);
    if (!f || f.size !== s.size) return null;
    out.push({ name: s.name, file: f });
  }
  return out;
}

/**
 * 드라이브에 올릴 원본. 고른 원본이 기기에 없으면(원본을 보관하지 않던 때 추가했거나, 저장 공간이 모자라 보관하지 못했다)
 * 기기에 있는 게임으로 만든다: 롬은 롬 파일 그대로(게임 이름으로), DOS는 게임 폴더를 zip 하나로. 풀린 파일을 하나씩 올리지 않는다
 */
async function gameSource(game: Game, onPack: (fraction: number) => void): Promise<{ source: GameSource; files: SourceFile[] }> {
  const kept = await sourceFiles(game, onPack);
  if (kept) return { source: game.source!, files: kept };
  let source: GameSource;
  let file: Blob;
  if (game.rom) {
    const rom = await getFile(`${gameDir(game.id)}/${game.rom.rom}`);
    if (!rom) throw new Error("게임 파일이 기기에 없습니다");
    file = rom;
    source = { files: [{ name: `${folderName(game.title)}.${game.rom.rom.split(".").pop()}`, size: rom.size }], romFile: true };
  } else {
    file = await packGame(game, onPack);
    source = { files: [{ name: `${folderName(game.title)}.zip`, size: file.size }], layout: "game" };
  }
  await patchGame(game.id, { source });
  return { source, files: [{ name: source.files[0].name, file }] };
}

// 예전 방식 게임을 받을 때 빼는 것: 세이브·상태(따로 동기화), 원본 보관 폴더
const notGameFile = (p: string) => /^(saves|states|source)\//.test(p) || /^(sram\.srm|conflict-backup\.zip)$/.test(p);

/**
 * 기기의 게임을 드라이브에 올린다 (원본 그대로). 이미 올라간 파일(같은 크기)은 건너뛴다. force: 모바일 데이터여도 올린다 (사용자가 직접 누름).
 * 드라이브에 있는 다른 폴더(예전 방식으로 풀어서 올린 것, 올리다 만 것)는 건드리지 않는다. 지우는 것은 사용자가 한다
 */
export async function uploadGame(gameId: string, { force = false } = {}) {
  if (uploading.has(gameId) || !authState().signedIn) return;
  uploading.add(gameId);
  try {
    const game = await getGame(gameId);
    if (!game) return;
    const key = await syncKey(game);
    if (!key) return;
    const found = await foldersFor(key);
    // 이미 다 올라간 게임(manifest가 있음, 예전 방식 포함)은 파일을 다시 올리지 않고 게임 정보·썸네일만 고친다
    if (found.some((f) => f.complete)) return void (await updateRemoteGame({ ...game, syncKey: key }));
    const cellular = getPrefs().wifiOnlyUpload && onCellular();
    // 모바일 데이터면 큰 게임은 Wi-Fi에 연결됐을 때 올린다 (uploadMissingGames). 원본 크기를 모르면(예전 게임) 큰 것으로 본다.
    // 원본을 만들기(zip으로 묶기) 전에 본다: 몇 분마다 다시 시도할 때마다 게임 전체를 읽으면 배터리를 쓴다
    const size = game.source?.files.reduce((n, f) => n + f.size, 0) ?? Infinity;
    if (size > SMALL && !force && cellular) return setIssue(gameId, WAIT_WIFI);
    // DOS 게임을 zip으로 묶는 동안(파일마다 CRC를 계산한다) 0%에 멈춰 보이지 않게
    const { source, files } = await gameSource(game, (f) => setTransfer(gameId, { label: PREPARE, done: Math.round(f * 100), total: 100 }));
    // 지금 방식으로 올리다 만 폴더가 있으면 거기에 이어서 올린다. 예전 방식으로 올리다 만 폴더(풀린 파일)에는 올리지 않는다
    const partial = found.find((f) => !f.complete && f.v2);
    const remote = partial?.children ?? [];
    const items: UploadItem[] = files.map(({ name, file }) => ({ name, file, props: { source: "1" }, old: remote.find((c) => c.name === name && c.appProperties?.source === "1") }));
    const todo = items.filter((it) => Number(it.old?.size ?? -1) !== it.file.size);
    setIssue(gameId, null);
    const { games } = await driveFolders();
    const folder = partial?.folder ?? (await createFolder(games, folderName(game.title), { key }));

    const total = items.reduce((n, it) => n + it.file.size, 0);
    let done = total - todo.reduce((n, it) => n + it.file.size, 0);
    const report = () => setTransfer(gameId, { label: "드라이브에 올리는 중", done, total });
    report();
    const put = async (it: UploadItem) => {
      const { name, file, props, old } = it;
      if (old && file.size <= SMALL) await updateFile(old.id, file);
      else {
        if (old) await trash(old.id); // 크기가 다르면 올리다 만 파일이다
        if (file.size <= SMALL) await createFile(folder.id, name, file, props);
        else {
          const base = done;
          await createLargeFile(folder.id, name, file, props, (sent) => setTransfer(gameId, { label: "드라이브에 올리는 중", done: base + sent, total }), `${folder.id}/${name}/${file.size}`);
        }
      }
      done += file.size;
      report();
    };
    // 작은 파일은 여럿을 동시에, 큰 파일은 하나씩
    await pool(
      todo.filter((it) => it.file.size <= SMALL),
      4,
      put,
    );
    for (const it of todo.filter((it) => it.file.size > SMALL)) await put(it);

    await writeManifest(folder.id, { key, game: remoteInfo(game), source, thumb: await thumbDataUrl(game.id) });
    // 보관해 둔 원본은 드라이브에 올렸으니 기기에서는 지운다 (기기에는 풀어 둔 것만 있으면 된다)
    if (!source.romFile && !source.layout) await removeDir(sourceDir(game.id));
  } catch (e) {
    setIssue(gameId, `올리지 못했습니다: ${(e as Error).message}`);
    throw e;
  } finally {
    uploading.delete(gameId);
    setTransfer(gameId, null);
  }
}

/**
 * 게임 추가와 동시에 올리기: 고른 파일을 기기에서 푸는 동안 같은 파일을 드라이브에 바로 올린다.
 * 게임 키(실행 파일·롬 해시)는 다 푼 뒤에야 알아서, 처음에는 adding 표시를 단 폴더에 올리고 finish에서 키와 게임 정보를 적는다.
 * 지금 올릴 수 없으면(드라이브 연결 안 됨, 오프라인, 모바일 데이터인데 큰 파일) null — 나중에 uploadGame이 올린다
 */
export interface PickedUpload {
  state(): "running" | "ok" | "failed";
  /** 이 게임 카드에 진행률을 보여 준다 (등록이 끝난 뒤). 그동안 다른 곳에서 같은 게임을 또 올리지 않는다 */
  setCard(gameId: string): void;
  /** 다 올라가면 폴더에 게임 키·이름과 manifest를 적는다. 같은 게임이 드라이브에 이미 있으면 새로 올린 것은 버린다 */
  finish(game: Game): Promise<void>;
  /** 쓰지 않는다 (등록 실패, zip 하나에 게임이 여럿): 올린 것을 휴지통으로 */
  discard(): void;
}

export function startPickedUpload(picked: { name: string; file: File }[], title: string, onProgress: (fraction: number) => void): PickedUpload | null {
  const total = picked.reduce((n, p) => n + p.file.size, 0);
  if (!authState().driveReady || !navigator.onLine || !picked.length) return null;
  if (total > SMALL && getPrefs().wifiOnlyUpload && onCellular()) return null;
  let card: string | null = null;
  let done = 0;
  let state: "running" | "ok" | "failed" = "running";
  let folderId: string | undefined;
  const report = () => (card ? setTransfer(card, { label: "드라이브에 올리는 중", done, total }) : onProgress(total ? done / total : 1));
  const work = (async () => {
    const { games } = await driveFolders();
    folderId = (await createFolder(games, folderName(title), { adding: "1" })).id;
    for (const { name, file } of picked) {
      const base = done;
      if (file.size <= SMALL) await createFile(folderId, name, file, { source: "1" });
      else await createLargeFile(folderId, name, file, { source: "1" }, (sent) => ((done = base + sent), report()), `${folderId}/${name}/${file.size}`);
      done = base + file.size;
      report();
    }
    return folderId;
  })();
  work.then(
    () => (state = "ok"),
    () => (state = "failed"),
  );
  const release = () => {
    if (!card) return;
    uploading.delete(card);
    setTransfer(card, null);
  };
  return {
    state: () => state,
    setCard(gameId) {
      card = gameId;
      uploading.add(gameId);
      report();
    },
    async finish(game) {
      try {
        const id = await work;
        const key = await syncKey(game);
        if (!key) throw new Error("게임 키를 만들지 못했습니다");
        // 같은 게임이 지금 방식(원본 그대로)으로 다 올라가 있으면(다른 기기에서 추가함) 새로 올린 것은 버린다.
        // 예전 방식(풀린 파일) 폴더나 올리다 만 폴더만 있으면 새로 올린 원본을 쓴다. 예전에는 이때도 새것을 버리고
        // 그 폴더에 풀린 파일을 마저 올려서, 전에 드라이브에 올린 적 있는 게임만 zip으로 다시 추가해도 풀려서 올라갔다
        if ((await foldersFor(key)).some((f) => f.folder.id !== id && f.complete && f.v2)) return void (await trash(id));
        await updateMeta(id, { name: folderName(game.title), appProperties: { key, adding: null } });
        await writeManifest(id, { key, game: remoteInfo(game), source: game.source, thumb: await thumbDataUrl(game.id) });
        setIssue(game.id, null);
      } finally {
        release();
      }
    },
    discard() {
      release();
      void work.then((id) => trash(id), () => (folderId ? trash(folderId) : undefined)).catch(() => undefined);
    },
  };
}

/** 이름이나 설정을 바꿨을 때 드라이브의 게임 정보도 고친다 (폴더 이름도 게임 이름으로) */
export async function updateRemoteGame(game: Game) {
  if (!authState().signedIn || !game.syncKey) return;
  const folder = await findGameFolder(game.syncKey);
  if (!folder) return;
  const manifest = await findChild(folder.id, MANIFEST);
  if (!manifest) return; // 아직 올리는 중이면 끝날 때 새 정보로 쓴다
  const old = (await (await download(manifest.id)).json()) as RemoteGame;
  await writeManifest(folder.id, { ...old, game: remoteInfo(game), thumb: (await thumbDataUrl(game.id)) ?? old.thumb });
  if (folder.appProperties?.key && folder.name !== folderName(game.title)) await renameFile(folder.id, folderName(game.title)).catch(() => undefined);
}

/** 드라이브에만 있는 게임 목록 */
const REMOTE_CACHE = "remote-games.json";

/** 다 올라간(manifest.json이 있는) 게임 폴더와 그 manifest 파일. 목록 두 번으로 끝나서 게임이 많아도 가볍다 */
async function manifests(): Promise<{ folder: DriveFile; manifestId: string }[]> {
  const byId = new Map((await gameFolders()).map((f) => [f.id, f]));
  const params = new URLSearchParams({ q: `name = '${MANIFEST}' and trashed = false`, fields: "nextPageToken,files(id,parents)", pageSize: "1000" });
  const out: { folder: DriveFile; manifestId: string }[] = [];
  for (const m of await listAll(params)) for (const p of m.parents ?? []) if (byId.has(p)) out.push({ folder: byId.get(p)!, manifestId: m.id });
  return out;
}

/**
 * 드라이브의 게임 목록. 받을 때마다 기기에도 적어 둬서, 오프라인이거나 드라이브 연결이 끊겨도
 * 라이브러리에 드라이브 게임을 계속 보여 준다 (cachedRemoteGames)
 */
export async function listRemoteGames(): Promise<RemoteGame[]> {
  const all = await pool(await manifests(), 6, async ({ folder, manifestId }) => {
    const m = (await (await download(manifestId)).json()) as Omit<RemoteGame, "folderId">;
    return { ...m, key: m.key ?? folderKey(folder), folderId: folder.id };
  });
  // 같은 게임이 예전 방식(풀린 파일)과 지금 방식(원본)으로 둘 다 있으면 지금 방식을 쓴다 (예전 폴더는 사용자가 지운다)
  const byKey = new Map<string, RemoteGame>();
  for (const r of all) if (!byKey.get(r.key)?.source) byKey.set(r.key, r);
  const out = [...byKey.values()];
  await writeJson(REMOTE_CACHE, out).catch(() => undefined);
  return out;
}

/** 마지막으로 받아 둔 드라이브 게임 목록 (없으면 빈 목록) */
export const cachedRemoteGames = () => readJson<RemoteGame[]>(REMOTE_CACHE, []).catch(() => [] as RemoteGame[]);

/** 드라이브에 다 올라간 게임 키. 파일 내용은 받지 않아서 자주 불러도 가볍다 */
async function remoteKeys(): Promise<Set<string>> {
  return new Set((await manifests()).map(({ folder }) => folderKey(folder)));
}

// --- 받기 ---
// 큰 파일은 16MB씩 잘라 4개를 동시에 받고, 받은 순서대로 이어 쓴다 (한 줄로 받으면 휴대폰에서 아주 느렸다).
// 조각이 오래 안 오면(화면이 꺼지거나 다른 앱으로 가서 연결이 멈춤) 끊고 그 조각만 다시 받는다.
// 실패해도 다 받은 파일은 남겨 두고, 다시 누르면 남은 파일부터 이어 받는다.
const DL_CHUNK = 16 * 1024 * 1024;
const DL_AHEAD = 4;
const DL_TIMEOUT_MS = 90 * 1000;
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

type Want = { file: DriveFile; size: number; local: string };

/** 여러 파일 받기: 지난번에 다 받은 파일은 건너뛰고, 작은 파일은 여럿을 동시에, 큰 파일은 하나씩(파일 안에서 조각을 동시에) */
async function downloadAll(wants: Want[], onBytes: (n: number) => void) {
  const todo: Want[] = [];
  for (const w of wants) {
    if ((await getFile(w.local))?.size === w.size) onBytes(w.size);
    else todo.push(w);
  }
  await pool(
    todo.filter((w) => w.size <= DL_CHUNK),
    6,
    (w) => downloadFile(w.file.id, w.size, w.local, onBytes),
  );
  for (const w of todo.filter((w) => w.size > DL_CHUNK)) await downloadFile(w.file.id, w.size, w.local, onBytes);
}

const downloads = new Map<string, Promise<Game>>();

/**
 * 드라이브의 게임을 이 기기로 받는다. 받다 멈춘 적이 있으면 다 받은 파일은 건너뛰고 이어 받는다.
 * into: 이 기기에 있던 게임의 파일이 사라져서 같은 자리(id)에 다시 받는다 (세이브·상태는 그대로 둔다)
 */
export function downloadGame(remote: RemoteGame, into?: Game): Promise<Game> {
  // 카드를 연달아 눌러도 한 번만 받는다
  const running = downloads.get(remote.key);
  if (running) return running;
  const p = doDownload(remote, into).finally(() => downloads.delete(remote.key));
  downloads.set(remote.key, p);
  return p;
}

async function doDownload(remote: RemoteGame, into?: Game): Promise<Game> {
  let id = into?.id;
  if (!id) {
    try {
      id = localStorage.getItem(pendingKey(remote.key)) ?? newGameId(remote.game.title);
      localStorage.setItem(pendingKey(remote.key), id);
    } catch {
      id = newGameId(remote.game.title);
    }
  }
  const card = into ? into.id : remote.key; // 진행률을 보여 줄 카드
  const total = (remote.source?.files ?? remote.files ?? []).reduce((n, f) => n + f.size, 0);
  let done = 0;
  const onBytes = (n: number) => setTransfer(card, { label: "받는 중", done: (done += n), total });
  setTransfer(card, { label: "받는 중", done, total });
  try {
    const children = await listChildren(remote.folderId);
    let unpacked: Partial<Game> = {};
    if (remote.source) {
      // 원본(zip, 롬)을 받아서 처음 추가할 때와 같은 방식으로 푼다. 다 풀면 원본은 지운다 (드라이브에 있다)
      const dir = sourceDir(id);
      const wants = remote.source.files.map((s) => {
        const file = children.find((c) => c.name === s.name && Number(c.size ?? 0) === s.size);
        if (!file) throw new Error(`드라이브에 ${s.name} 파일이 없습니다`);
        return { file, size: s.size, local: `${dir}/${s.name}` };
      });
      await downloadAll(wants, onBytes);
      const entries: Entry[] = [];
      for (const s of remote.source.files) entries.push({ path: s.name, file: (await getFile(`${dir}/${s.name}`))! });
      setTransfer(card, { label: "설치 중", done: 0, total: 100 });
      const progress = (msg: string) => setTransfer(card, { label: "설치 중", done: percentOf(msg), total: 100 });
      if (remote.source.layout === "game") {
        // 기기의 게임 폴더를 그대로 묶은 zip (library/pack.ts): 게임 폴더에 그대로 푼다. 게임 정보는 manifest에 있다
        const skip = { write: async () => undefined, close: async () => undefined }; // HDD/·CD/ 밖의 경로는 쓰지 않는다
        await unzipTo(entries[0].file, async (name) => (packedPath(name) ? openWritable(`${gameDir(id)}/${name}`) : skip), progress);
      } else unpacked = await reimportFiles(entries, { progress, chooseExe: async (c) => c[0] ?? null }, { id, pick: remote.source.pick });
      await removeDir(dir);
    } else {
      // 예전 방식: 게임 정보(manifest)에 적힌 파일만, 크기가 맞는 것으로 받는다 (올리다 만 파일이 섞여 있어도)
      const wants: Want[] = [];
      for (const want of remote.files ?? []) {
        if (want.path.includes("..") || notGameFile(want.path)) continue;
        const file = children.find((c) => c.appProperties?.path === want.path && Number(c.size ?? 0) === want.size);
        if (!file) throw new Error(`드라이브에 ${want.path} 파일이 없습니다`);
        wants.push({ file, size: want.size, local: `${gameDir(id)}/${want.path}` });
      }
      await downloadAll(wants, onBytes);
    }
    if (remote.thumb) await writeFile(`${gameDir(id)}/thumb.png`, await (await fetch(remote.thumb)).blob());
    const game: Game = {
      ...unpacked,
      ...remote.game,
      id,
      syncKey: remote.key,
      addedAt: into?.addedAt ?? Date.now(),
      lastPlayedAt: into?.lastPlayedAt,
      source: remote.source,
    };
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
    setTransfer(card, null);
  }
}

/** 설치 진행 메시지("압축 푸는 중 45%", "게임 파일 복사 중 3/10")를 0~100으로. 압축 풀기가 대부분이라 그 단계를 90%까지로 본다 */
function percentOf(msg: string): number {
  const pct = msg.match(/(\d+)%/);
  if (pct) return Math.min(90, (+pct[1] * 9) / 10);
  const part = msg.match(/(\d+)\/(\d+)/);
  return part ? 90 + (+part[1] / +part[2]) * 10 : 90;
}

/** 드라이브에서 이 게임을 지운다 (사용자가 누름). 같은 게임의 예전 방식 폴더도 같이 */
export async function deleteRemoteGame(key: string) {
  for (const f of (await gameFolders()).filter((f) => folderKey(f) === key)) await trash(f.id);
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
