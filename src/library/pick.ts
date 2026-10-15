// 게임 추가: 파일 선택창이나 끌어다 놓기로 받은 파일을 모은다. 폴더는 받지 않는다.
import type { Entry } from "./import";

/** input[type=file]로 고른 파일 */
export const fromInput = (files: FileList | null): Entry[] => Array.from(files ?? [], (f) => ({ path: f.name, file: f }));

/** 끌어다 놓은 파일. 폴더가 섞여 있으면 null (폴더째 넣지 않는다. zip으로 묶어서 넣는다) */
export function fromDrop(dt: DataTransfer): Entry[] | null {
  if (Array.from(dt.items, (i) => i.webkitGetAsEntry?.()).some((e) => e?.isDirectory)) return null;
  return fromInput(dt.files);
}
