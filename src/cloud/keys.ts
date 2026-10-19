// 기기 사이에서 같은 게임을 알아보는 키: ROM이나 실행 파일 내용의 해시
import { gameDir, patchGame, type Game } from "../library/library";
import { getFile } from "../library/store";
import { HDD_DIR } from "../platforms/dos/profiles";

async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function syncKey(game: Game): Promise<string | null> {
  if (game.syncKey) return game.syncKey;
  const dir = gameDir(game.id);
  const file = game.rom ? await getFile(`${dir}/${game.rom.rom}`) : await getFile(`${dir}/${HDD_DIR}/${game.dos!.exe.toUpperCase()}`);
  if (!file) return null;
  const hash = (await sha256Hex(new Uint8Array(await file.arrayBuffer()))).slice(0, 40);
  const key = `${game.platform}-${hash}`;
  await patchGame(game.id, { syncKey: key }); // 다른 칸은 그 사이 바뀌었을 수 있어서 키만 적는다
  return key;
}
