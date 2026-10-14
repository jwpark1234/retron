// SFC는 EmulatorJS(snes9x 코어)를 쓴다. EmulatorJS는 전역 상태를 많이 써서 정리하기 어려우므로
// 별도 페이지(sfc.html)에서 iframe으로 띄우고, 나갈 때 iframe째로 버린다.
// EmulatorJS는 세이브(SRAM)를 메모리 FS에만 두므로 OPFS로 직접 옮겨 담는다.
import { gameDir, getGame, saveThumbnail } from "../../library/library";
import { hasThumbnail, imageFileToSquare } from "../../library/thumbnail";
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
w.EJS_defaultOptions = { "save-save-interval": "5" }; // 5초마다 SRAM을 FS에 기록 → saveSaveFiles 이벤트
// 저장/불러오기와 나가기는 retron 메뉴가 맡으므로 EmulatorJS 자체 버튼은 숨긴다
w.EJS_Buttons = {
  saveState: false, loadState: false, quickSave: false, quickLoad: false, saveSavFiles: false, loadSavFiles: false,
  exitEmulation: false, cacheManager: false, netplay: false, screenRecord: false, screenshot: false, cheat: false,
};

// 부모가 보낸 볼륨·화면 필터. 게임이 시작되기 전에 오면 시작할 때 적용한다
let prefs: { volume: number; filter: string } | null = null;
const SHADERS: Record<string, string> = { sharp: "disabled", smooth: "2xScaleHQ.glslp", crt: "crt-easymode.glslp" };
function applyPrefs() {
  const emu = w.EJS_emulator;
  if (!prefs || !emu?.started) return;
  emu.volume = prefs.volume;
  emu.setVolume(prefs.volume);
  emu.changeSettingOption("shader", SHADERS[prefs.filter] ?? "disabled");
}

let lastSave: Uint8Array | null = null;
const same = (a: Uint8Array, b: Uint8Array | null) => !!b && a.length === b.length && a.every((x, i) => x === b[i]);

w.EJS_onGameStart = async () => {
  const gm = w.EJS_emulator.gameManager;
  applyPrefs();
  // 첫 실행이면 잠시 뒤 화면을 썸네일로 쓴다
  setTimeout(async () => {
    if (await hasThumbnail(id)) return;
    const png = await screenshot();
    if (png) await saveThumbnail(id, await imageFileToSquare(png));
  }, 10000);
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

const screenshot = async (): Promise<Blob | null> => {
  try {
    const png: Uint8Array = await Promise.race([w.EJS_emulator.gameManager.screenshot(), new Promise<never>((_, j) => setTimeout(j, 2000))]);
    return new Blob([png], { type: "image/png" });
  } catch {
    return null;
  }
};

// 부모(SfcPlayer) 메뉴의 상태 저장/불러오기
window.addEventListener("message", async (e) => {
  if (e.origin !== location.origin) return;
  const { type, reqId } = e.data ?? {};
  if (type === "prefs") {
    prefs = { volume: e.data.volume, filter: e.data.filter };
    return applyPrefs();
  }
  if (type !== "save-state" && type !== "load-state" && type !== "fast-forward") return;
  try {
    const gm = w.EJS_emulator?.gameManager;
    if (!gm || !w.EJS_emulator.started) throw new Error("게임을 먼저 시작하세요");
    if (type === "save-state") {
      const state: Uint8Array = gm.getState();
      parent.postMessage({ type: "result", reqId, state, thumb: await screenshot() }, location.origin);
    } else if (type === "fast-forward") {
      w.EJS_emulator.changeSettingOption("fastForward", e.data.on ? "enabled" : "disabled");
      parent.postMessage({ type: "result", reqId }, location.origin);
    } else {
      gm.loadState(e.data.state);
      parent.postMessage({ type: "result", reqId }, location.origin);
    }
  } catch (err) {
    parent.postMessage({ type: "result", reqId, error: (err as Error).message }, location.origin);
  }
});

// 부모(SfcPlayer)가 나가기 전에 부른다: SRAM을 마저 쓴다
window.addEventListener("message", async (e) => {
  if (e.origin !== location.origin || e.data?.type !== "exit") return;
  try {
    const gm = w.EJS_emulator?.gameManager;
    if (gm && w.EJS_emulator.started) {
      gm.saveSaveFiles();
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch {
    // 아직 시작 전이면 쓸 것이 없다
  }
  parent.postMessage({ type: "exited" }, location.origin);
});

const s = document.createElement("script");
s.src = `${w.EJS_pathtodata}loader.js`;
document.body.appendChild(s);
