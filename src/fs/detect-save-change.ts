// js-dos는 파일 변경 이벤트가 없어서 세이브 파일을 주기적으로 읽어 비교한다.
import type { CommandInterface } from "emulators";
import { HDD_DIR, SAVE_FILES } from "../game-config";
import type { FileMap } from "./store";

export async function readSaves(ci: CommandInterface): Promise<FileMap> {
  const tree = await ci.fsTree();
  const hdd = tree.nodes?.find((n) => n.name.toUpperCase() === HDD_DIR);
  const out: FileMap = new Map();
  for (const n of hdd?.nodes ?? []) {
    if (n.nodes === null && SAVE_FILES.test(n.name)) out.set(n.name, await ci.fsReadFile(`${hdd!.name}/${n.name}`));
  }
  return out;
}

function same(a: FileMap, b: FileMap) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || w.length !== v.length || !v.every((x, i) => x === w[i])) return false;
  }
  return true;
}

export function detectSaveChange(ci: CommandInterface, onChange: (saves: FileMap) => void): () => void {
  let last: FileMap | null = null;
  let debounce: ReturnType<typeof setTimeout>;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const now = await readSaves(ci);
      if (last && !same(last, now)) {
        clearTimeout(debounce);
        debounce = setTimeout(() => onChange(now), 1500); // 게임이 여러 파일을 나눠 쓰는 동안 기다린다
      }
      last = now;
    } finally {
      busy = false;
    }
  }, 1000);
  return () => {
    clearInterval(timer);
    clearTimeout(debounce);
  };
}
