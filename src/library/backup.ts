// 세이브 묶음: 게임 안 세이브(saves/, sram.srm)와 게임 밖 상태 저장(states/)을 zip으로 만든다.
// 드라이브 동기화는 둘을 따로 묶어 올리고, 파일로 내보내고 가져오는 백업은 둘을 한 파일에 담는다.
import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { gameDir, type Game } from "./library";
import { getFile, listFiles, readJson, removeDir, removeFile, writeFile } from "./store";

export type SaveKind = "saves" | "states";
export const SAVE_KINDS: SaveKind[] = ["saves", "states"];

const MANIFEST = "retron-backup.json";
const PARTS: Record<SaveKind, { dirs: string[]; files: string[] }> = {
  saves: { dirs: ["saves"], files: ["sram.srm"] }, // 게임이 직접 쓰는 세이브
  states: { dirs: ["states"], files: [] }, // retron 상태 저장 슬롯 (자동 저장 포함)
};

const belongs = (path: string, kinds: SaveKind[]) =>
  kinds.some((k) => PARTS[k].dirs.some((d) => path.startsWith(`${d}/`)) || PARTS[k].files.includes(path));

/** 세이브가 하나도 없으면 null */
export async function buildBundle(game: Game, kinds: SaveKind[] = SAVE_KINDS): Promise<Uint8Array | null> {
  const dir = gameDir(game.id);
  const files: Zippable = {};
  for (const kind of kinds) {
    for (const d of PARTS[kind].dirs) {
      for (const [p, f] of await listFiles(`${dir}/${d}`)) files[`${d}/${p}`] = new Uint8Array(await f.arrayBuffer());
    }
    for (const name of PARTS[kind].files) {
      const f = await getFile(`${dir}/${name}`);
      if (f) files[name] = new Uint8Array(await f.arrayBuffer());
    }
  }
  if (!Object.keys(files).length) return null;
  files[MANIFEST] = strToU8(JSON.stringify({ title: game.title, platform: game.platform, exportedAt: new Date().toISOString() }));
  // 상태 저장은 이미 압축돼 있어서(DOSBox-X 상태 2MB → 다시 압축해도 2MB) 다시 압축하지 않고 담기만 한다.
  // 창세기전2 슬롯 6개를 level 6으로 묶으면 0.7초 넘게 화면이 멈췄다 (그대로 담으면 40ms)
  return zipSync(files, { level: kinds.includes("states") ? 0 : 6 });
}

function open(game: Game, zip: Uint8Array) {
  const files = unzipSync(zip);
  const manifest = files[MANIFEST] && JSON.parse(new TextDecoder().decode(files[MANIFEST]));
  if (!manifest) throw new Error("retron 세이브 백업 파일이 아닙니다");
  if (manifest.platform !== game.platform) throw new Error(`${manifest.platform.toUpperCase()} 게임의 백업입니다`);
  const safe = Object.entries(files).filter(([p]) => !p.endsWith("/") && !p.includes(".."));
  return safe;
}

/** 묶음 내용으로 이 기기의 세이브를 바꾼다 (kinds에 든 것만) */
export async function applyBundle(game: Game, zip: Uint8Array, kinds: SaveKind[] = SAVE_KINDS) {
  const files = open(game, zip);
  const dir = gameDir(game.id);
  for (const kind of kinds) {
    for (const d of PARTS[kind].dirs) await removeDir(`${dir}/${d}`);
    for (const f of PARTS[kind].files) await removeFile(`${dir}/${f}`);
  }
  for (const [p, data] of files) if (belongs(p, kinds)) await writeFile(`${dir}/${p}`, data);
}

/**
 * 상태 저장 합치기: 슬롯마다 저장 시각이 더 최근인 쪽을 남긴다 (묻지 않는다).
 * 이 기기 쪽이 더 최근인 슬롯이 있으면 true (드라이브에 다시 올려야 한다).
 */
export async function mergeStates(game: Game, zip: Uint8Array): Promise<boolean> {
  const files = new Map(open(game, zip));
  const dir = `${gameDir(game.id)}/states`;
  const slots = new Set<string>();
  for (const p of files.keys()) if (p.startsWith("states/") && p.endsWith(".json")) slots.add(p.slice(7, -5));
  for (const p of (await listFiles(dir)).keys()) if (p.endsWith(".json")) slots.add(p.slice(0, -5));
  let localNewer = false;
  for (const slot of slots) {
    const remote = files.get(`states/${slot}.json`);
    const remoteAt = remote ? (JSON.parse(new TextDecoder().decode(remote)) as { savedAt: number }).savedAt : -1;
    const localAt = (await readJson<{ savedAt: number } | null>(`${dir}/${slot}.json`, null))?.savedAt ?? -1;
    if (localAt > remoteAt) localNewer = true;
    if (remoteAt <= localAt) continue;
    await removeFile(`${dir}/${slot}.png`);
    for (const ext of ["state", "png", "json"]) {
      const data = files.get(`states/${slot}.${ext}`);
      if (data) await writeFile(`${dir}/${slot}.${ext}`, data);
    }
  }
  return localNewer;
}

export async function exportBackup(game: Game): Promise<{ name: string; blob: Blob }> {
  const zip = await buildBundle(game);
  if (!zip) throw new Error("백업할 세이브가 아직 없습니다");
  const date = new Date().toISOString().slice(0, 10);
  return { name: `${game.title}-세이브-${date}.zip`, blob: new Blob([zip], { type: "application/zip" }) };
}

export async function importBackup(game: Game, zip: File) {
  await applyBundle(game, new Uint8Array(await zip.arrayBuffer()));
}

export function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
