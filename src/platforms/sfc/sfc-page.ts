// SFC는 EmulatorJS(snes9x 코어)를 쓴다. EmulatorJS는 전역 상태를 많이 써서 정리하기 어려우므로
// 별도 페이지(sfc.html)에서 iframe으로 띄우고, 나갈 때 iframe째로 버린다.
// EmulatorJS는 세이브(SRAM)를 메모리 FS에만 두므로 OPFS로 직접 옮겨 담는다.
import { gameDir, getGame, saveThumbnail } from "../../library/library";
import { getFile, writeFile } from "../../library/store";

const EJS_VERSION = "4.2.3";

const w = window as any;
const id = new URLSearchParams(location.search).get("id")!;
const game = (await getGame(id))!;
const dir = gameDir(id);
const rom = (await getFile(`${dir}/${game.sfc!.rom}`))!;
const savePath = `${dir}/sram.srm`;

w.EJS_player = "#game";
w.EJS_core = "snes";
w.EJS_gameName = game.title;
w.EJS_gameUrl = URL.createObjectURL(new File([rom], game.sfc!.rom));
w.EJS_pathtodata = `https://cdn.emulatorjs.org/${EJS_VERSION}/data/`;
w.EJS_language = "ko-KR";
w.EJS_defaultOptions = { "save-save-interval": "5" }; // 5초마다 SRAM을 FS에 기록 → saveSaveFiles 이벤트

let lastSave: Uint8Array | null = null;
const same = (a: Uint8Array, b: Uint8Array | null) => !!b && a.length === b.length && a.every((x, i) => x === b[i]);

w.EJS_onGameStart = async () => {
  const gm = w.EJS_emulator.gameManager;
  const saved = await getFile(savePath);
  if (saved) {
    lastSave = new Uint8Array(await saved.arrayBuffer());
    const path: string = gm.getSaveFilePath();
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent && !gm.FS.analyzePath(parent).exists) gm.FS.mkdirTree(parent);
    gm.FS.writeFile(path, lastSave);
    gm.loadSaveFiles();
  }
  w.EJS_emulator.on("saveSaveFiles", async (data: Uint8Array | null) => {
    if (!data || same(data, lastSave)) return;
    lastSave = data.slice();
    await writeFile(savePath, lastSave);
    parent.postMessage({ type: "saved" }, location.origin);
  });
};

// 부모(SfcPlayer)가 나가기 전에 부른다: 세이브를 마저 쓰고 썸네일을 남긴다
window.addEventListener("message", async (e) => {
  if (e.origin !== location.origin || e.data?.type !== "exit") return;
  try {
    const gm = w.EJS_emulator?.gameManager;
    if (gm && w.EJS_emulator.started) {
      gm.saveSaveFiles();
      await new Promise((r) => setTimeout(r, 300));
      const png: Uint8Array = await Promise.race([gm.screenshot(), new Promise<never>((_, j) => setTimeout(j, 2000))]);
      await saveThumbnail(id, new Blob([png], { type: "image/png" }));
    }
  } catch {
    // 썸네일은 없어도 된다
  }
  parent.postMessage({ type: "exited" }, location.origin);
});

const s = document.createElement("script");
s.src = `${w.EJS_pathtodata}loader.js`;
document.body.appendChild(s);
