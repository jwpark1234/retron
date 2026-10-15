// 게임 추가: 파일 선택창이나 끌어다 놓기로 받은 파일을 경로와 함께 모은다.
import type { Entry } from "./import";

/** input[type=file]. 폴더를 골랐으면 webkitRelativePath에 폴더 경로가 있다 */
export const fromInput = (files: FileList | null): Entry[] => Array.from(files ?? [], (f) => ({ path: f.webkitRelativePath || f.name, file: f }));

/** 끌어다 놓은 파일·폴더. 폴더는 안쪽까지 다 읽는다 */
export async function fromDrop(dt: DataTransfer): Promise<Entry[]> {
  const roots = Array.from(dt.items, (i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!roots.length) return fromInput(dt.files);
  const out: Entry[] = [];
  const walk = async (e: FileSystemEntry, prefix: string): Promise<void> => {
    if (e.isFile) {
      const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + e.name, file });
      return;
    }
    const reader = (e as FileSystemDirectoryEntry).createReader();
    // readEntries는 한 번에 100개 정도만 주므로 빈 배열이 나올 때까지 부른다
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${prefix}${e.name}/`);
    }
  };
  for (const r of roots) await walk(r, "");
  return out;
}

/** 폴더 선택을 지원하는 곳 (PC 브라우저). 휴대폰은 파일만 고를 수 있다 */
export const canPickFolder = () => "webkitdirectory" in document.createElement("input") && !matchMedia("(pointer: coarse)").matches;
