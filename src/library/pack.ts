// 원본이 기기에 없는 DOS 게임(원본을 보관하지 않던 때 추가했거나, 드라이브 예전 방식에서 받은 게임)을 드라이브에 올릴 때
// 풀린 파일을 하나씩 올리지 않고 zip 하나로 묶는다. 안에는 기기의 게임 폴더 모양(HDD/…, CD/…) 그대로 담고,
// 받는 기기는 이 zip을 게임 폴더에 그대로 푼다 (GameSource.layout = "game").
// zip을 기기에 따로 쓰지 않는다: 파일마다 CRC만 계산하고, zip 머리말과 기기에 있는 파일을 이어 붙인 Blob을 만든다
// (Blob은 파일 내용을 메모리에 올리지 않고 가리키기만 한다). 큰 게임을 두 벌 둘 저장 공간이 없는 휴대폰에서도 올릴 수 있다.
// 압축하지 않고(store) 담기만 해서 휴대폰 배터리·시간이 덜 든다.
// 같은 파일이면 언제 만들어도 같은 바이트가 나온다(날짜 고정, 경로 순 정렬). 그래서 끊긴 올리기를 이어서 할 수 있다.
import { CD_DIR, HDD_DIR } from "../platforms/dos/profiles";
import { gameDir, type Game } from "./library";
import { listFiles } from "./store";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const READ_CHUNK = 4 * 1024 * 1024;

async function crc32(file: Blob): Promise<number> {
  let c = -1;
  for (let at = 0; at < file.size; at += READ_CHUNK) {
    const b = new Uint8Array(await file.slice(at, at + READ_CHUNK).arrayBuffer());
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

// 2000-01-01 00:00 (DOS 날짜·시각). 파일 날짜를 쓰면 기기마다, 다시 쓸 때마다 바이트가 달라져 이어 올리기가 안 된다
const DOS_TIME = 0;
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;
const MAX32 = 0xffffffff;

/** 파일들(zip 안 경로 → 파일)을 압축하지 않은 zip 하나로. 4GB·65535개를 넘으면 오류 (zip64는 쓰지 않는다) */
export async function packZip(files: Map<string, Blob>, onProgress?: (fraction: number) => void): Promise<Blob> {
  const list = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (list.length > 0xffff) throw new Error("파일이 너무 많아 zip으로 묶지 못했습니다");
  const total = list.reduce((n, [, f]) => n + f.size, 0) || 1;
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let read = 0;
  for (const [path, file] of list) {
    const name = new TextEncoder().encode(path);
    const crc = await crc32(file);
    read += file.size;
    onProgress?.(read / total);
    if (file.size > MAX32 || offset + 30 + name.length + file.size > MAX32) throw new Error("4GB가 넘는 게임은 zip으로 묶지 못했습니다");
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, UTF8_FLAG, true);
    l.setUint16(8, 0, true); // store
    l.setUint16(10, DOS_TIME, true);
    l.setUint16(12, DOS_DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, file.size, true);
    l.setUint32(22, file.size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, UTF8_FLAG, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, file.size, true);
    c.setUint32(24, file.size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, file);
    central.push(entry);
    offset += local.length + file.size;
  }
  const dirSize = central.reduce((n, e) => n + e.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, list.length, true);
  e.setUint16(10, list.length, true);
  e.setUint32(12, dirSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

/** DOS 게임 폴더(HDD/, CD/)를 zip으로. 세이브·상태·썸네일은 넣지 않는다 (따로 동기화한다) */
export async function packGame(game: Game, onProgress?: (fraction: number) => void): Promise<Blob> {
  const files = new Map<string, Blob>();
  for (const dir of [HDD_DIR, CD_DIR]) for (const [p, f] of await listFiles(`${gameDir(game.id)}/${dir}`)) files.set(`${dir}/${p}`, f);
  if (!files.size) throw new Error("게임 파일이 기기에 없습니다");
  return packZip(files, onProgress);
}

/** packGame으로 만든 zip 안의 경로 중 게임 폴더에 풀어도 되는 것 */
export const packedPath = (p: string) => !p.includes("..") && (p.startsWith(`${HDD_DIR}/`) || p.startsWith(`${CD_DIR}/`));
