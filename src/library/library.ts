// 등록한 게임 목록. OPFS의 library.json에 두고, 게임 파일은 games/{id}/ 아래에 둔다.
import { getFile, readJson, removeDir, writeFile, writeJson } from "./store";

export type Platform = "dos" | "sfc";

export interface DosInfo {
  conf: string; // [autoexec] 포함 전체 dosbox.conf
  /** 세이브로 감시할 파일 패턴(정규식 문자열). 비어 있으면 실행 중 바뀐 파일을 자동으로 추적한다 */
  savePattern?: string;
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
}

const LIBRARY = "library.json";

export const gameDir = (id: string) => `games/${id}`;

export async function listGames(): Promise<Game[]> {
  return readJson<Game[]>(LIBRARY, []);
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
