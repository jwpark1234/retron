// js-dos는 파일 변경 이벤트가 없어서 세이브 후보 파일을 주기적으로 읽어 비교한다.
// 후보: 게임별 세이브 패턴 + 흔한 세이브 확장자 + 실행 중 새로 생기거나 고친(크기·고친 시각이 바뀐) 파일 + 이전에 저장한 파일.
// 고친 시각(mtime)은 워커를 패치해서 받는다 (scripts/copy-emulators.mjs). 예전에는 크기만 봐서, 이름이 세이브 같지 않고
// 크기 그대로 덮어쓰는 세이브(대항해시대2)를 끝까지 못 알아채 세이브를 잃었다. 시각을 알면 고친 파일만 읽는다
import type { CommandInterface } from "emulators";
import type { FileMap } from "../../library/store";
import { fsTree, type FsNode } from "./create-dos";
import { HDD_DIR } from "./profiles";

const MAX_PENDING_MS = 5000;
const COMMON_SAVE = /(\.(sav|save|sv\d?|sg\d?|gam|qsv)|^save.*)$/i;

/** 파일 크기와 고친 시각. 시각은 패치하지 않은 워커(기기에 남은 예전 파일)면 없다 */
type Stat = { size: number; mtime?: number };
const statKey = (s?: Stat) => (s ? `${s.size}:${s.mtime ?? ""}` : "");

function stats(node: FsNode, prefix = "", out = new Map<string, Stat>()) {
  for (const n of node.nodes ?? []) {
    if (n.nodes) stats(n, `${prefix}${n.name}/`, out);
    else out.set(prefix + n.name, { size: n.size ?? 0, mtime: (n as FsNode & { mtime?: number }).mtime });
  }
  return out;
}

async function hddStats(ci: CommandInterface) {
  const tree = await fsTree(ci);
  const hdd = tree.nodes?.find((n) => n.name === HDD_DIR);
  return hdd ? stats(hdd) : new Map<string, Stat>();
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

/**
 * onChange는 지금까지 바뀐 세이브 파일 전체(HDD 기준 경로)를 받는다.
 * notice: 알릴 만한 변경인지. 지난번에도 바뀌었던 파일(쉬지 않고 바뀌는 진행 데이터 등)만 바뀌었으면 false (몇 초마다 알리지 않게)
 */
export async function watchSaves(
  ci: CommandInterface,
  opts: { pattern?: string; previous: string[]; onChange: (saves: FileMap, notice: boolean) => void | Promise<void> },
): Promise<SaveWatch> {
  const pattern = opts.pattern ? new RegExp(opts.pattern, "i") : null;
  const initial = await hddStats(ci);
  const tracked = new Set(opts.previous);
  for (const p of initial.keys()) {
    const name = p.split("/").pop()!;
    if (pattern?.test(name) || COMMON_SAVE.test(name)) tracked.add(p);
  }
  const last: FileMap = new Map();
  const read = async (p: string) => ci.fsReadFile(`${HDD_DIR}/${p}`).catch(() => undefined);
  const seen = new Map<string, string>(); // 마지막으로 읽었을 때의 statKey
  for (const p of tracked) {
    const d = await read(p);
    if (d) last.set(p, d);
    seen.set(p, statKey(initial.get(p)));
  }

  let busy: Promise<boolean> | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let pendingSince = 0; // 넘기지 못한 변경이 처음 생긴 때
  let pending = new Set<string>(); // 넘기지 못한 바뀐 파일
  let previous = new Set<string>(); // 지난번에 넘긴 바뀐 파일
  const emit = () => {
    clearTimeout(debounce);
    debounce = undefined;
    pendingSince = 0;
    const notice = [...pending].some((p) => !previous.has(p));
    previous = pending;
    pending = new Set();
    return opts.onChange(new Map(last), notice);
  };
  /** 한 번 읽어 비교한다. 바뀐 것이 있으면 true */
  const poll = () =>
    (busy ??= (async () => {
      const now = await hddStats(ci);
      for (const [p, s] of now) if (statKey(initial.get(p)) !== statKey(s)) tracked.add(p);
      let changed = false;
      for (const p of tracked) {
        const s = now.get(p);
        if (s?.mtime !== undefined && seen.get(p) === statKey(s)) continue; // 시각을 알면 고친 파일만 읽는다
        seen.set(p, statKey(s));
        const d = s ? await read(p) : undefined;
        if (!same(d, last.get(p))) {
          changed = true;
          pending.add(p);
          if (d) last.set(p, d);
          else last.delete(p);
        }
      }
      return changed;
    })().finally(() => (busy = null)));
  const timer = setInterval(async () => {
    if (busy || !(await poll().catch(() => false))) return;
    clearTimeout(debounce);
    pendingSince ||= Date.now();
    // 게임이 여러 파일을 나눠 쓰는 동안 기다린다. 다만 쉬지 않고 바뀌는 파일(진행 데이터 등)이 있으면 기다림이 끝나지 않아
    // 세이브까지 나갈 때까지 기기에 저장되지 않았다 (그사이 휴대폰이 꺼지면 세이브를 잃는다). 5초 넘게 밀렸으면 바로 넘긴다
    if (Date.now() - pendingSince >= MAX_PENDING_MS) return void emit();
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
