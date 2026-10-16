// 등록한 게임 목록. OPFS의 library.json에 두고, 게임 파일은 games/{id}/ 아래에 둔다.
import { splitConf } from "../platforms/dos/profiles";
import { getFile, listDirs, readJson, removeDir, writeFile, writeJson } from "./store";

export type Platform = "dos" | "sfc" | "gba";

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
}

const LIBRARY = "library.json";

export const gameDir = (id: string) => `games/${id}`;

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

export async function putGame(game: Game) {
  const games = (await listGames()).filter((g) => g.id !== game.id);
  await writeJson(LIBRARY, [...games, game]);
}

export async function removeGame(id: string) {
  await writeJson(LIBRARY, (await listGames()).filter((g) => g.id !== id));
  await removeDir(gameDir(id));
}

/** 라이브러리에 없는 게임 폴더(받다 만 게임, 등록 중 멈춘 게임)와 임시 폴더를 지운다. 앱 시작 때 부른다 */
export async function removeOrphans() {
  const ids = new Set((await listGames()).map((g) => g.id));
  for (const name of await listDirs("games")) if (!ids.has(name)) await removeDir(gameDir(name));
  await removeDir("_incoming");
}

export async function touchGame(id: string) {
  const g = await getGame(id);
  if (g) await putGame({ ...g, lastPlayedAt: Date.now() });
}

export function newGameId(title: string) {
  const slug = title.replace(/[^\w가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "game";
  return `${slug}-${Date.now().toString(36)}`;
}

// 썸네일: 플레이 화면을 캡처해 games/{id}/thumb.png로 둔다
export async function saveThumbnail(id: string, png: Blob) {
  await writeFile(`${gameDir(id)}/thumb.png`, png);
}

export async function thumbnailUrl(id: string): Promise<string | null> {
  const f = await getFile(`${gameDir(id)}/thumb.png`);
  return f ? URL.createObjectURL(f) : null;
}
