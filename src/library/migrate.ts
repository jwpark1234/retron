// 라이브러리 도입 전 버전은 창세기전2를 OPFS genesis2/ 아래에 바로 두었다. 새 구조로 옮긴다.
import { CD_DIR, HDD_DIR, PROFILES, buildConf } from "../platforms/dos/profiles";
import { gameDir, newGameId, putGame } from "./library";
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
