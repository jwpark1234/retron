// 라이브러리 도입 전 버전은 창세기전2를 OPFS genesis2/ 아래에 바로 두었다. 새 구조로 옮긴다.
import { CD_DIR, HDD_DIR, PROFILES, buildConf } from "../platforms/dos/profiles";
import { gameDir, listGames, newGameId, putGame, saveThumbnail } from "./library";
import { imageFileToSquare } from "./thumbnail";
import { getFile, listFiles, removeDir, writeFile } from "./store";

export async function migrateLegacy() {
  if (!(await getFile("genesis2/ready"))) return;
  const profile = PROFILES.find((p) => p.entry === "GENE2.COM")!;
  const id = newGameId(profile.title);
  for (const [from, to] of [["GENESIS2", HDD_DIR], ["CD", CD_DIR]]) {
    for (const [p, f] of await listFiles(`genesis2/${from}`)) await writeFile(`${gameDir(id)}/${to}/${p}`, f);
  }
  await putGame({
    id,
    title: profile.title,
    platform: "dos",
    addedAt: Date.now(),
    dos: { conf: buildConf(profile.settings, profile.entry, "GENE2.CUE"), savePattern: profile.savePattern },
  });
  await removeDir("genesis2");
}

/** 예전 4:3 썸네일을 1:1로 바꾼다. 알려진 DOS 게임은 아이콘으로 교체한다 */
export async function migrateThumbnails() {
  for (const game of await listGames()) {
    if (game.thumbVersion === 2) continue;
    try {
      const exe = game.dos?.conf.trim().split("\n").pop()?.toUpperCase(); // autoexec 마지막 줄 = 실행 파일
      const profile = PROFILES.find((p) => p.entry === exe);
      const icon = profile?.icon ? await getFile(`${gameDir(game.id)}/${HDD_DIR}/${profile.icon}`) : null;
      const old = await getFile(`${gameDir(game.id)}/thumb.png`);
      if (icon) await saveThumbnail(game.id, await imageFileToSquare(icon));
      else if (old) await saveThumbnail(game.id, await imageFileToSquare(old));
    } catch {
      // 썸네일을 못 바꿔도 게임은 그대로 쓸 수 있다
    }
    await putGame({ ...game, thumbVersion: 2 });
  }
}
