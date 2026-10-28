// 등록한 게임 목록. OPFS의 library.json에 두고, 게임 파일은 games/{id}/ 아래에 둔다.
import { HDD_DIR, splitConf } from "../platforms/dos/profiles";
import { getFile, listDirs, readJson, removeDir, writeFile, writeJson } from "./store";

export type Platform = "dos" | "sfc" | "gba" | "n64";

/** 게임패드 버튼에 연결할 동작: DOS 키 코드 또는 마우스 버튼 */
export type PadAction = number | "mouse-left" | "mouse-right";

export interface DosInput {
  pad?: Record<string, PadAction>; // 게임패드 버튼 번호 → 동작
  leftStick?: "arrows" | "mouse";
}

export interface DosInfo {
  settings: string; // dosbox.conf의 [autoexec] 앞부분
  exe: string; // C: 기준 실행 파일 경로 (예: GENE2.COM, GAME/START.BAT)
  cd?: string; // CD 폴더 안의 이미지 (CD.CUE / CD.ISO)
  cycles?: string; // 비우면 settings 그대로. auto / max / 숫자
  /** 세이브로 감시할 파일 패턴(정규식 문자열). 비어 있으면 실행 중 바뀐 파일을 자동으로 추적한다 */
  savePattern?: string;
  input?: DosInput;
  vkeys?: number[]; // (예전) 휴대폰 키 버튼. touchKeys가 없을 때만 읽는다
  touchKeys?: number[]; // 휴대폰 화면에 보여 줄 키 (DOS 키 번호). 방향키가 있으면 방향 패드로 나온다. 없으면 기본 키
  trackpad?: boolean; // 휴대폰 트랙패드. false일 때만 숨긴다 (없으면 켜짐)
  conf?: string; // 예전 형식 (normalize에서 위 필드로 옮긴다)
}

/** 롬 하나로 도는 기종(SFC, GBA) */
export interface RomInfo {
  rom: string; // games/{id}/ 아래 ROM 파일 이름
}

export interface Game {
  id: string;
  title: string;
  platform: Platform;
  addedAt: number;
  lastPlayedAt?: number;
  dos?: DosInfo;
  rom?: RomInfo;
  sfc?: RomInfo; // 예전 형식 (normalize에서 rom으로 옮긴다)
  thumbVersion?: number; // 2 = 1:1 썸네일
  syncKey?: string; // 기기 사이에서 같은 게임을 알아보는 키 (ROM/실행 파일 해시)
  source?: GameSource; // 없으면 예전에 추가한 게임 (드라이브에 올릴 때 기기의 게임 파일로 원본을 만든다)
}

/**
 * 추가할 때 고른 원본. 드라이브에는 이 파일들을 이름 그대로 올린다 (기기에서는 풀어서 쓴다).
 * files: 고른 파일 이름·크기. pick: 원본 안에서 고른 실행 파일·롬 경로 (다시 풀 때 같은 것을 고른다).
 * romFile: 원본이 롬 파일 하나라서 따로 보관하지 않고 games/{id}/{rom.rom}을 원래 이름으로 올린다.
 * layout "game": 원본이 기기에 없어서(원본을 보관하지 않던 때 추가한 DOS 게임 등) 기기의 게임 폴더(HDD/, CD/)를 zip 하나로 묶어 올렸다.
 * 받는 기기는 다시 고르지 않고 게임 폴더에 그대로 푼다 (library/pack.ts)
 * 그 밖의 원본은 올리기 전까지 games/{id}/source/에 보관하고, 다 올리면 지운다
 */
export interface GameSource {
  files: { name: string; size: number }[];
  pick?: string;
  romFile?: boolean;
  layout?: "game";
}

const LIBRARY = "library.json";

export const gameDir = (id: string) => `games/${id}`;
export const sourceDir = (id: string) => `${gameDir(id)}/source`;

export async function listGames(): Promise<Game[]> {
  return (await readJson<Game[]>(LIBRARY, [])).map(normalize);
}

// 예전 형식을 지금 형식으로: DOS conf 한 덩어리를 나눠 담고, SFC 롬 정보(sfc)는 rom으로 옮긴다
function normalize(g: Game): Game {
  if (g.sfc) {
    const { sfc, ...rest } = g;
    g = { ...rest, rom: rest.rom ?? sfc };
  }
  if (!g.dos?.conf || g.dos.exe) return g;
  const { conf, ...rest } = g.dos;
  return { ...g, dos: { ...rest, ...splitConf(conf) } };
}

export async function getGame(id: string): Promise<Game | undefined> {
  return (await listGames()).find((g) => g.id === id);
}

// library.json은 읽고-고치고-쓰기를 한 번에 하나씩 한다. 두 곳에서 동시에 고치면(플레이 시각 적기와 받기 끝 등)
// 늦게 쓴 쪽이 먼저 쓴 쪽의 게임을 목록에서 빼 버리고, 다음 시작 때 그 게임 폴더가 "목록에 없는 폴더"로 지워졌다
// 같은 기기에서 창 여러 개(설치한 앱과 브라우저 탭)가 같이 고칠 수도 있어서, 창 사이에서도 잠금(Web Locks)으로 하나씩 한다
let queue: Promise<unknown> = Promise.resolve();
function editLibrary(fn: (games: Game[]) => Game[]): Promise<void> {
  const edit = async () => {
    const games = fn(await listGames());
    await writeJson(LIBRARY, games);
    rememberCount(games.length);
  };
  const run = queue.then(() => (navigator.locks ? navigator.locks.request(LIBRARY, edit) : edit()));
  queue = run.catch(() => undefined);
  return run;
}

// 게임 수를 localStorage에도 적어 둔다. 다음 시작 때 library.json은 없는데 게임이 있었다고 적혀 있으면,
// 브라우저가 OPFS(게임 파일)만 지운 것이다 (로그인 정보가 있는 localStorage는 남겨 둔다)
const COUNT_KEY = "library-count";
function rememberCount(n: number) {
  try {
    localStorage.setItem(COUNT_KEY, String(n));
  } catch {
    // 못 적으면 지워졌는지 알려 주지 못할 뿐이다
  }
}

/** 지난번에는 게임이 있었는데 브라우저가 기기 저장 공간을 지웠다. 앱 시작 때 한 번 부른다 */
export async function storageWiped(): Promise<boolean> {
  if (await getFile(LIBRARY)) {
    rememberCount((await listGames()).length);
    return false;
  }
  try {
    const had = Number(localStorage.getItem(COUNT_KEY) ?? 0);
    localStorage.setItem(COUNT_KEY, "0");
    return had > 0;
  } catch {
    return false;
  }
}

// 창마다 이 잠금을 나눠 잡고 닫힐 때까지 놓지 않는다. 그래서 다른 창이 열려 있는지 알 수 있다
const WINDOW_LOCK = "retron-window";
async function joinWindows(): Promise<{ alone: boolean }> {
  if (!navigator.locks) return { alone: true };
  const { held = [] } = await navigator.locks.query();
  void navigator.locks.request(WINDOW_LOCK, { mode: "shared" }, () => new Promise(() => undefined));
  return { alone: !held.some((l) => l.name === WINDOW_LOCK) };
}

export function putGame(game: Game) {
  return editLibrary((games) => [...games.filter((g) => g.id !== game.id), game]);
}

/** 바뀐 칸만 고친다 (그 사이 다른 곳에서 고친 칸을 덮지 않게) */
export function patchGame(id: string, patch: Partial<Game>) {
  return editLibrary((games) => games.map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export async function removeGame(id: string) {
  await editLibrary((games) => games.filter((g) => g.id !== id));
  await removeDir(gameDir(id));
}

/**
 * 라이브러리에 없는 게임 폴더(등록 중 멈춘 게임)와 임시 폴더를 지운다. 앱 시작 때 부른다. keep: 이어 받을 폴더.
 * library.json을 못 읽었거나 비어 있으면 아무것도 지우지 않는다 (목록을 잘못 읽은 탓에 멀쩡한 게임을 지우지 않게).
 * 다른 창이 열려 있으면 지우지 않는다: 그 창이 추가하거나 받는 중인 게임은 아직 목록에 없어서 같이 지워졌다
 */
export async function removeOrphans(keep: Set<string> = new Set()) {
  if (!(await joinWindows()).alone) return;
  if (!(await getFile(LIBRARY))) return;
  const games = await listGames();
  if (!games.length) return;
  // 아이폰 사파리는 폴더 이름을 한글 자모로 풀어서(NFD) 돌려준다. 그대로 비교하면 한글 제목 게임(id에 한글이 들어감)이
  // 목록에 없는 폴더로 보여서 시작할 때마다 지워졌다 (목록에는 남아 있어 누르면 "파일이 지워졌습니다"가 떴다)
  const nfc = (s: string) => s.normalize("NFC");
  const ids = new Set([...games.map((g) => g.id), ...keep].map(nfc));
  for (const name of await listDirs("games")) if (!ids.has(nfc(name))) await removeDir(gameDir(name));
  await removeDir("_incoming");
}

export function touchGame(id: string) {
  return patchGame(id, { lastPlayedAt: Date.now() });
}

/**
 * 실행에 꼭 필요한 파일(롬, DOS 실행 파일)이 기기에 있는지. 없으면 그 경로.
 * 휴대폰 브라우저가 저장 공간을 비우면 게임 파일이 사라질 수 있다 (목록과 세이브만 남고 실행이 안 됐다)
 */
export async function missingGameFile(game: Game): Promise<string | null> {
  const dir = gameDir(game.id);
  const path = game.rom ? `${dir}/${game.rom.rom}` : `${dir}/${HDD_DIR}/${game.dos!.exe.toUpperCase()}`;
  const f = await getFile(path).catch(() => null);
  return f && f.size > 0 ? null : path;
}

export function newGameId(title: string) {
  const slug = title.replace(/[^\w가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "game";
  return `${slug}-${Date.now().toString(36)}`;
}

// 썸네일: 플레이 화면을 캡처해 games/{id}/thumb.png로 둔다
export async function saveThumbnail(id: string, png: Blob) {
  await writeFile(`${gameDir(id)}/thumb.png`, png);
}

export const thumbnailFile = (id: string) => getFile(`${gameDir(id)}/thumb.png`);
