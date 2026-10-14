// zip을 스트리밍으로 풀어서 OPFS 임시 폴더에 쓴다. 수백 MB짜리 zip도 메모리에 통째로 올리지 않는다.
import { Unzip, UnzipInflate } from "fflate";
import { writeFile } from "./store";

// 한국어 Windows에서 만든 zip은 파일명이 CP949인데 UTF-8 플래그가 없어서 latin1로 읽힌다
function fixName(name: string) {
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

export async function extractZip(zip: File, outDir: string, onProgress: (msg: string) => void) {
  let pending: Promise<unknown> = Promise.resolve();
  let error: unknown = null;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (file.name.endsWith("/")) return;
    const path = `${outDir}/${fixName(file.name)}`;
    const chunks: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) return void (error = err);
      chunks.push(data);
      if (final) pending = pending.then(() => writeFile(path, new Blob(chunks)));
    };
    try {
      file.start();
    } catch (e) {
      error = e; // 지원하지 않는 압축 방식 (deflate64 등)
    }
  };

  const reader = zip.stream().getReader();
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    unzip.push(value ?? new Uint8Array(), done);
    if (error) throw new Error(`zip을 풀지 못했습니다: ${(error as Error).message ?? error}`);
    if (done) break;
    read += value.length;
    onProgress(`압축 푸는 중 ${Math.round((read / zip.size) * 100)}%`);
    await pending; // 쓰기가 밀리지 않게 기다린다
  }
  await pending;
}
