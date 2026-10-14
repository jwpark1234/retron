// 세이브 묶음: 게임 안 세이브, 상태 슬롯, SRAM을 zip 하나로 만든다.
// 파일로 내보내고 가져오는 백업과, 서버 동기화가 같은 형식을 쓴다.
import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { gameDir, type Game } from "./library";
import { getFile, listFiles, removeDir, writeFile } from "./store";

const MANIFEST = "retron-backup.json";
const PARTS = ["saves", "states"]; // 폴더째 묶는 것
const SINGLE = ["sram.srm"]; // 파일 하나로 묶는 것

/** 세이브가 하나도 없으면 null */
export async function buildBundle(game: Game): Promise<Uint8Array | null> {
  const dir = gameDir(game.id);
  const files: Zippable = {};
  for (const part of PARTS) {
    for (const [p, f] of await listFiles(`${dir}/${part}`)) files[`${part}/${p}`] = new Uint8Array(await f.arrayBuffer());
  }
  for (const name of SINGLE) {
    const f = await getFile(`${dir}/${name}`);
    if (f) files[name] = new Uint8Array(await f.arrayBuffer());
  }
  if (!Object.keys(files).length) return null;
  files[MANIFEST] = strToU8(JSON.stringify({ title: game.title, platform: game.platform, exportedAt: new Date().toISOString() }));
  return zipSync(files, { level: 6 });
}

/** 묶음 내용으로 이 기기의 세이브를 바꾼다 */
export async function applyBundle(game: Game, zip: Uint8Array) {
  const files = unzipSync(zip);
  const manifest = files[MANIFEST] && JSON.parse(new TextDecoder().decode(files[MANIFEST]));
  if (!manifest) throw new Error("retron 세이브 백업 파일이 아닙니다");
  if (manifest.platform !== game.platform) throw new Error(`${manifest.platform.toUpperCase()} 게임의 백업입니다`);
  const dir = gameDir(game.id);
  for (const part of PARTS) await removeDir(`${dir}/${part}`);
  for (const [p, data] of Object.entries(files)) {
    const allowed = PARTS.some((part) => p.startsWith(`${part}/`)) || SINGLE.includes(p);
    if (allowed && !p.endsWith("/") && !p.includes("..")) await writeFile(`${dir}/${p}`, data);
  }
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
