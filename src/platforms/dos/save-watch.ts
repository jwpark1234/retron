// js-dos는 파일 변경 이벤트가 없어서 세이브 후보 파일을 주기적으로 읽어 비교한다.
// 후보: 게임별 세이브 패턴 + 흔한 세이브 확장자 + 실행 중 새로 생기거나 크기가 바뀐 파일 + 이전에 저장한 파일
import type { CommandInterface } from "emulators";
import type { FileMap } from "../../library/store";
import { fsTree, type FsNode } from "./create-dos";
import { HDD_DIR } from "./profiles";

const COMMON_SAVE = /(\.(sav|save|sv\d?|sg\d?|gam|qsv)|^save.*)$/i;

function sizes(node: FsNode, prefix = "", out = new Map<string, number>()) {
  for (const n of node.nodes ?? []) {
    if (n.nodes) sizes(n, `${prefix}${n.name}/`, out);
    else out.set(prefix + n.name, n.size ?? 0);
  }
  return out;
}

async function hddSizes(ci: CommandInterface) {
  const tree = await fsTree(ci);
  const hdd = tree.nodes?.find((n) => n.name === HDD_DIR);
  return hdd ? sizes(hdd) : new Map<string, number>();
}

function same(a?: Uint8Array, b?: Uint8Array) {
  if (!a || !b || a.length !== b.length) return a === b;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface SaveWatch {
  /** 감시를 멈춘다. 기다리던 변경(게임이 파일을 나눠 쓰는 동안 미뤄 둔 것)은 버리지 않고 바로 넘긴다 */
  stop(): void;
  /** 지금 한 번 더 읽어 보고, 바뀐 것이 있으면 기다리지 않고 바로 넘긴다 (게임이 끝나 에뮬레이터를 끄기 전에) */
  flush(): Promise<void>;
}

/** onChange는 지금까지 바뀐 세이브 파일 전체(HDD 기준 경로)를 받는다 */
export async function watchSaves(
  ci: CommandInterface,
  opts: { pattern?: string; previous: string[]; onChange: (saves: FileMap) => void | Promise<void> },
): Promise<SaveWatch> {
  const pattern = opts.pattern ? new RegExp(opts.pattern, "i") : null;
  const initial = await hddSizes(ci);
  const tracked = new Set(opts.previous);
  for (const p of initial.keys()) {
    const name = p.split("/").pop()!;
    if (pattern?.test(name) || COMMON_SAVE.test(name)) tracked.add(p);
  }
  const last: FileMap = new Map();
  const read = async (p: string) => ci.fsReadFile(`${HDD_DIR}/${p}`).catch(() => undefined);
  for (const p of tracked) {
    const d = await read(p);
    if (d) last.set(p, d);
  }

  let busy: Promise<boolean> | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const emit = () => {
    clearTimeout(debounce);
    debounce = undefined;
    return opts.onChange(new Map(last));
  };
  /** 한 번 읽어 비교한다. 바뀐 것이 있으면 true */
  const poll = () =>
    (busy ??= (async () => {
      const now = await hddSizes(ci);
      for (const [p, size] of now) if (initial.get(p) !== size) tracked.add(p);
      let changed = false;
      for (const p of tracked) {
        const d = now.has(p) ? await read(p) : undefined;
        if (!same(d, last.get(p))) {
          changed = true;
          if (d) last.set(p, d);
          else last.delete(p);
        }
      }
      return changed;
    })().finally(() => (busy = null)));
  const timer = setInterval(async () => {
    if (busy || !(await poll().catch(() => false))) return;
    clearTimeout(debounce);
    // 게임이 여러 파일을 나눠 쓰는 동안 기다린다
    debounce = setTimeout(() => void emit(), 1500);
  }, 1500);
  return {
    stop() {
      clearInterval(timer);
      if (debounce) void emit();
    },
    async flush() {
      if ((await poll().catch(() => false)) || debounce) await emit();
    },
  };
}
