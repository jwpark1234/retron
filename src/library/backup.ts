// 세이브 백업: 게임 안 세이브, 상태 슬롯, SRAM을 zip 하나로 내보내고 다시 넣는다.
import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { gameDir, type Game } from "./library";
import { getFile, listFiles, removeDir, writeFile } from "./store";

const MANIFEST = "retron-backup.json";
const PARTS = ["saves", "states"]; // 폴더째 백업하는 것
const SINGLE = ["sram.srm"]; // 파일 하나로 백업하는 것

export async function exportBackup(game: Game): Promise<{ name: string; blob: Blob }> {
  const dir = gameDir(game.id);
  const files: Zippable = {
    [MANIFEST]: strToU8(JSON.stringify({ title: game.title, platform: game.platform, exportedAt: new Date().toISOString() })),
  };
  for (const part of PARTS) {
    for (const [p, f] of await listFiles(`${dir}/${part}`)) files[`${part}/${p}`] = new Uint8Array(await f.arrayBuffer());
  }
  for (const name of SINGLE) {
    const f = await getFile(`${dir}/${name}`);
    if (f) files[name] = new Uint8Array(await f.arrayBuffer());
  }
  if (Object.keys(files).length === 1) throw new Error("백업할 세이브가 아직 없습니다");
  const date = new Date().toISOString().slice(0, 10);
  return { name: `${game.title}-세이브-${date}.zip`, blob: new Blob([zipSync(files)], { type: "application/zip" }) };
}

export async function importBackup(game: Game, zip: File) {
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const manifest = files[MANIFEST] && JSON.parse(new TextDecoder().decode(files[MANIFEST]));
  if (!manifest) throw new Error("retron 세이브 백업 파일이 아닙니다");
  if (manifest.platform !== game.platform) throw new Error(`${manifest.platform.toUpperCase()} 게임의 백업입니다`);
  const dir = gameDir(game.id);
  for (const part of PARTS) await removeDir(`${dir}/${part}`); // 백업 시점으로 되돌린다
  for (const [p, data] of Object.entries(files)) {
    const allowed = PARTS.some((part) => p.startsWith(`${part}/`)) || SINGLE.includes(p);
    if (allowed && !p.endsWith("/") && !p.includes("..")) await writeFile(`${dir}/${p}`, data);
  }
}

export function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
