// zip을 풀어서 OPFS 임시 폴더에 쓴다. 수백 MB짜리 zip도 메모리에 통째로 올리지 않는다.
// zip 끝의 목록(중앙 디렉터리)에서 파일마다 위치와 크기를 읽고, 그 부분만 잘라 스트리밍으로 풀어 바로 파일에 쓴다.
// 예전에는 앞에서부터 서명을 찾아 읽는 fflate Unzip을 썼는데, 크기를 데이터 뒤에 적는 zip(macOS·iOS의 "압축",
// 스트리밍으로 만든 zip)에서는 압축 데이터 안에 우연히 든 서명 바이트를 파일 경계로 착각해 "unexpected EOF"로 깨졌다.
// 큰 파일일수록 그런 바이트가 들어 있을 확률이 높아서 큰 게임만 실패했다.
import { Inflate } from "fflate";
import { openWritable } from "./store";

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;

export interface ZipEntry {
  name: string;
  method: number; // 0 = 그대로, 8 = deflate
  compressed: number;
  size: number;
  offset: number; // 로컬 헤더 위치
  encrypted: boolean;
}

/** 이 파일이 쓰는 최소한의 쓰기 대상 (OPFS FileSystemWritableFileStream과 같은 모양) */
export interface ZipWriter {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

const read = async (zip: Blob, start: number, end: number) => new Uint8Array(await zip.slice(start, end).arrayBuffer());
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u64 = (v: DataView, at: number) => Number(v.getBigUint64(at, true));

// 한국어 Windows에서 만든 zip은 파일명이 CP949인데 UTF-8 플래그가 없다. 플래그가 없어도 UTF-8로 읽히면 UTF-8로 본다
function decodeName(bytes: Uint8Array, utf8: boolean) {
  if (utf8) return new TextDecoder().decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

/** zip 끝의 목록을 읽는다. 4GB가 넘거나 파일이 아주 많은 zip(zip64)도 읽는다 */
export async function listZip(zip: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, zip.size - (22 + 0xffff)); // 끝 레코드 + 최대 주석 길이
  const tail = await read(zip, tailStart, zip.size);
  const t = view(tail);
  let e = tail.length - 22;
  while (e >= 0 && t.getUint32(e, true) !== EOCD) e--;
  if (e < 0) throw new Error("zip 파일이 아니거나 파일 끝이 잘렸습니다");
  let count = t.getUint16(e + 10, true);
  let dirSize = t.getUint32(e + 12, true);
  let dirOffset = t.getUint32(e + 16, true);
  const locator = tailStart + e - 20;
  if (locator >= 0 && (count === 0xffff || dirSize === MAX32 || dirOffset === MAX32)) {
    const l = view(await read(zip, locator, locator + 20));
    if (l.getUint32(0, true) === EOCD64_LOCATOR) {
      const at = u64(l, 8);
      const z = view(await read(zip, at, at + 56));
      if (z.getUint32(0, true) !== EOCD64) throw new Error("zip 목록을 찾지 못했습니다");
      count = u64(z, 32);
      dirSize = u64(z, 40);
      dirOffset = u64(z, 48);
    }
  }

  const dir = await read(zip, dirOffset, dirOffset + dirSize);
  const d = view(dir);
  const out: ZipEntry[] = [];
  for (let p = 0, n = 0; n < count; n++) {
    if (p + 46 > dir.length || d.getUint32(p, true) !== CENTRAL) throw new Error("zip 목록이 깨졌습니다");
    const flags = d.getUint16(p + 8, true);
    const nameLen = d.getUint16(p + 28, true);
    const extraLen = d.getUint16(p + 30, true);
    const commentLen = d.getUint16(p + 32, true);
    let compressed = d.getUint32(p + 20, true);
    let size = d.getUint32(p + 24, true);
    let offset = d.getUint32(p + 42, true);
    // zip64: 4GB를 넘는 값은 추가 필드(0x0001)에 정해진 순서로 들어 있다
    for (let x = p + 46 + nameLen, end = x + extraLen; x + 4 <= end; x += 4 + d.getUint16(x + 2, true)) {
      if (d.getUint16(x, true) !== 1) continue;
      let q = x + 4;
      if (size === MAX32) (size = u64(d, q)), (q += 8);
      if (compressed === MAX32) (compressed = u64(d, q)), (q += 8);
      if (offset === MAX32) offset = u64(d, q);
    }
    out.push({
      name: decodeName(dir.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0),
      method: d.getUint16(p + 10, true),
      compressed,
      size,
      offset,
      encrypted: (flags & 1) !== 0,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** deflate 풀기: 브라우저 내장(빠름)이 있으면 쓰고, 없으면 fflate */
function inflater(): TransformStream<Uint8Array, Uint8Array> {
  try {
    return new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>;
  } catch {
    let inflate: Inflate;
    return new TransformStream({
      start(c) {
        inflate = new Inflate((data) => c.enqueue(data));
      },
      transform(chunk) {
        inflate.push(chunk, false);
      },
      flush() {
        inflate.push(new Uint8Array(0), true);
      },
    });
  }
}

/** 파일 하나를 풀어서 writer에 쓴다. onRead: 읽은 압축 바이트 수 */
async function extractEntry(zip: Blob, entry: ZipEntry, writer: ZipWriter, onRead: (n: number) => void) {
  const head = view(await read(zip, entry.offset, entry.offset + 30));
  if (head.getUint32(0, true) !== LOCAL) throw new Error(`${entry.name}: zip 안의 파일 위치가 맞지 않습니다`);
  const start = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  let stream = zip.slice(start, start + entry.compressed).stream() as ReadableStream<Uint8Array>;
  stream = stream.pipeThrough(new TransformStream({ transform: (chunk, c) => (onRead(chunk.length), c.enqueue(chunk)) }));
  if (entry.method === 8) stream = stream.pipeThrough(inflater());
  const reader = stream.getReader();
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.length;
      await writer.write(value);
    }
  } finally {
    await writer.close();
  }
  if (written !== entry.size) throw new Error(`${entry.name}: 풀린 크기가 맞지 않습니다 (${written} / ${entry.size})`);
}

/** zip을 풀어 open(경로)이 주는 writer에 하나씩 쓴다 */
export async function unzipTo(zip: Blob, open: (name: string) => Promise<ZipWriter>, onProgress: (msg: string) => void) {
  const entries = (await listZip(zip)).filter((e) => !e.name.endsWith("/"));
  const bad = entries.find((e) => e.encrypted || (e.method !== 0 && e.method !== 8));
  if (bad) throw new Error(`zip을 풀지 못했습니다: ${bad.name}은(는) ${bad.encrypted ? "암호가 걸려" : "지원하지 않는 방식으로 압축되어"} 있습니다`);
  const total = entries.reduce((n, e) => n + e.compressed, 0) || 1;
  let done = 0;
  let shown = -1;
  for (const entry of entries) {
    await extractEntry(zip, entry, await open(entry.name), (n) => {
      done += n;
      const pct = Math.floor((done / total) * 100);
      if (pct !== shown) onProgress(`압축 푸는 중 ${(shown = pct)}%`);
    });
  }
}

export async function extractZip(zip: File, outDir: string, onProgress: (msg: string) => void) {
  await unzipTo(zip, (name) => openWritable(`${outDir}/${name}`), onProgress);
}
