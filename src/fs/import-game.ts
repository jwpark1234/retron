// 사용자가 고른 폴더(게임 폴더 + bin/cue)를 OPFS로 가져온다.
// js-dos 8은 CD 오디오 트랙으로 raw BINARY만 재생하므로 bin을 DATA.ISO + TRACKnn.BIN으로 나눈다.
import { CD_DIR, ENTRY, GAME_ID, HDD_DIR } from "../game-config";
import { removeDir, writeFile } from "./store";

const SECTOR = 2352;
const CHUNK = 512; // 섹터 단위로 나눠 읽어서 메모리 사용을 제한

interface Track {
  no: number;
  audio: boolean;
  start: number;
}

function parseCue(text: string): { bin: string; tracks: Track[] } {
  let bin = "";
  const tracks: Track[] = [];
  let cur: { no: number; audio: boolean } | null = null;
  for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
    let m;
    if ((m = line.match(/^FILE\s+(?:"([^"]+)"|(\S+))/i))) bin = m[1] ?? m[2];
    else if ((m = line.match(/^TRACK\s+(\d+)\s+(\S+)/i))) cur = { no: +m[1], audio: m[2].toUpperCase() === "AUDIO" };
    else if ((m = line.match(/^INDEX\s+01\s+(\d+):(\d+):(\d+)/i)) && cur) {
      tracks.push({ ...cur, start: (+m[1] * 60 + +m[2]) * 75 + +m[3] });
      cur = null;
    }
  }
  if (!bin || !tracks.length || tracks[0].audio) throw new Error("CUE 파일 형식을 읽지 못했습니다");
  return { bin, tracks };
}

const pad = (n: number) => String(n).padStart(2, "0");
const base = (p: string) => p.split("/").pop()!;

export async function importGame(files: File[], onProgress: (msg: string) => void) {
  const path = (f: File) => f.webkitRelativePath || f.name;
  const entry = files.find((f) => base(path(f)).toUpperCase() === ENTRY);
  if (!entry) throw new Error(`게임 폴더(${ENTRY}가 있는 폴더)를 찾지 못했습니다`);
  const cueFile = files.find((f) => path(f).toLowerCase().endsWith(".cue"));
  if (!cueFile) throw new Error("CD 이미지의 .cue 파일을 찾지 못했습니다");
  const { bin: binName, tracks } = parseCue(await cueFile.text());
  const bin = files.find((f) => base(path(f)).toLowerCase() === base(binName).toLowerCase());
  if (!bin) throw new Error(`${binName} 파일을 찾지 못했습니다`);
  if (bin.size % SECTOR) throw new Error("bin 파일 크기가 올바르지 않습니다 (MODE1/2352 이미지가 아님)");

  await removeDir(GAME_ID);
  const root = path(entry).slice(0, -base(path(entry)).length);
  const gameFiles = files.filter((f) => path(f).startsWith(root) && f !== bin && f !== cueFile);
  for (const [i, f] of gameFiles.entries()) {
    onProgress(`게임 파일 복사 중 ${i + 1}/${gameFiles.length}`);
    await writeFile(`${GAME_ID}/${HDD_DIR}/${path(f).slice(root.length).toUpperCase()}`, f);
  }

  const total = bin.size / SECTOR;
  const end = (i: number) => (i + 1 < tracks.length ? tracks[i + 1].start : total);

  // 데이터 트랙: 섹터마다 헤더 16바이트를 떼고 2048바이트만 남긴다
  const iso: Blob[] = [];
  for (let s = tracks[0].start; s < end(0); s += CHUNK) {
    onProgress(`CD 데이터 트랙 변환 중 ${Math.round(((s - tracks[0].start) / (end(0) - tracks[0].start)) * 100)}%`);
    const n = Math.min(CHUNK, end(0) - s);
    const chunk = new Uint8Array(await bin.slice(s * SECTOR, (s + n) * SECTOR).arrayBuffer());
    const out = new Uint8Array(n * 2048);
    for (let k = 0; k < n; k++) out.set(chunk.subarray(k * SECTOR + 16, k * SECTOR + 16 + 2048), k * 2048);
    iso.push(new Blob([out]));
  }
  await writeFile(`${GAME_ID}/${CD_DIR}/DATA.ISO`, new Blob(iso));

  const cue = ['FILE "DATA.ISO" BINARY', "  TRACK 01 MODE1/2048", "    INDEX 01 00:00:00"];
  for (const [i, t] of tracks.entries()) {
    if (i === 0) continue;
    onProgress(`CD 음악 트랙 저장 중 ${i}/${tracks.length - 1}`);
    await writeFile(`${GAME_ID}/${CD_DIR}/TRACK${pad(t.no)}.BIN`, bin.slice(t.start * SECTOR, end(i) * SECTOR));
    cue.push(`FILE "TRACK${pad(t.no)}.BIN" BINARY`, `  TRACK ${pad(t.no)} AUDIO`, "    INDEX 01 00:00:00");
  }
  await writeFile(`${GAME_ID}/${CD_DIR}/GENE2.CUE`, new TextEncoder().encode(cue.join("\r\n") + "\r\n"));
  await writeFile(`${GAME_ID}/ready`, new Uint8Array([1]));
}
