// 등록한 게임 목록. OPFS의 library.json에 두고, 게임 파일은 games/{id}/ 아래에 둔다.
import { splitConf } from "../platforms/dos/profiles";
import { getFile, readJson, removeDir, writeFile, writeJson } from "./store";

export type Platform = "dos" | "sfc";

/** 게임패드 버튼에 연결할 동작: DOS 키 코드 또는 마우스 버튼 */
export type PadAction = number | "mouse-left" | "mouse-right";

export interface DosInput {
  keys?: Record<string, number>; // KeyboardEvent.code → DOS 키 (키 재배치)
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
  conf?: string; // 예전 형식 (normalize에서 위 필드로 옮긴다)
}

export interface SfcInfo {
  rom: string; // games/{id}/ 아래 ROM 파일 이름
}

export interface Game {
  id: string;
  title: string;
  platform: Platform;
  addedAt: number;
  lastPlayedAt?: number;
  dos?: DosInfo;
  sfc?: SfcInfo;
  thumbVersion?: number; // 2 = 1:1 썸네일
  syncKey?: string; // 기기 사이에서 같은 게임을 알아보는 키 (ROM/실행 파일 해시)
}

const LIBRARY = "library.json";

export const gameDir = (id: string) => `games/${id}`;

export async function listGames(): Promise<Game[]> {
  return (await readJson<Game[]>(LIBRARY, [])).map(normalize);
}

// 예전 형식(conf 한 덩어리)을 나눠 담는다
function normalize(g: Game): Game {
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
