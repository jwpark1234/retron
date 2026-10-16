// js-dos 8 emulators API로 DOSBox-X를 Worker에서 띄우고 화면·소리를 연결한다.
// js-dos 기본 UI는 쓰지 않는다 (가상 키패드, 터치 입력, 세이브 처리를 직접 하기 위해).
import type { CommandInterface, Emulators, InitFsEntry } from "emulators";
import { KEYBOARD } from "./keyboard";

declare global {
  // index.html에서 <script src="/emulators/emulators.js">로 로드된다
  const emulators: Emulators;
}

export const STATE_FILE = "STATE.SAV";

// DOSBox-X 상태 저장은 [dosbox] savefile에 쓰고 읽는다
function withStateFile(conf: string) {
  const line = `savefile=${STATE_FILE}`;
  const section = /^\[dosbox\][ \t]*$/m;
  return section.test(conf) ? conf.replace(section, `[dosbox]\n${line}`) : `[dosbox]\n${line}\n${conf}`;
}

// 큰 파일(CD 이미지 등)은 시작할 때 한꺼번에 넘기면 메모리에 두세 벌이 올라가서 브라우저가 죽는다.
// 작은 파일만 먼저 넘겨 에뮬레이터를 띄우고, 큰 파일은 조각으로 흘려보낸다.
// 그동안 DOS는 autoexec 맨 앞에서 신호 파일이 생길 때까지 기다린다.
const BIG_FILE = 8 * 1024 * 1024;
const STREAM_CHUNK = 4 * 1024 * 1024;
const SYNC_DIR = "RETRON";

function waitForFiles(conf: string) {
  const wait = ["@echo off", `mount y ${SYNC_DIR}`, ":retron_wait", "rescan y: >nul", "if not exist Y:\\READY goto retron_wait", "mount -u y >nul", "echo on"];
  return conf.replace(/^\[autoexec\][ \t]*$/m, `[autoexec]\n${wait.join("\n")}`);
}

// 게임이 끝나 DOS로 돌아오면(게임 안의 "종료", "DOS로 나가기") autoexec 마지막 줄이 신호 파일을 남긴다.
// 플레이 화면이 이 파일을 보고 세이브를 마저 저장한 뒤 라이브러리로 돌아간다 (DOS 프롬프트를 남겨 두지 않는다)
const EXITED = `${SYNC_DIR}/EXITED`;
function signalExit(conf: string) {
  const lines = ["@echo off", `mount y ${SYNC_DIR} >nul`, "echo done>Y:\\EXITED"];
  return `${conf.trimEnd()}\n${lines.join("\n")}\n`;
}

/**
 * 에뮬레이터 FS 목록. js-dos는 fsTree를 동시에 두 번 부르면 앞의 것이 영영 끝나지 않으므로(답을 받을 자리가 하나뿐)
 * 세이브 감시, 상태 저장, 게임 종료 확인이 모두 이것으로 같이 받는다
 */
export type FsNode = Awaited<ReturnType<CommandInterface["fsTree"]>>;
const trees = new WeakMap<CommandInterface, Promise<FsNode>>();
export function fsTree(ci: CommandInterface): Promise<FsNode> {
  let p = trees.get(ci);
  if (!p) {
    p = ci.fsTree().finally(() => trees.delete(ci));
    trees.set(ci, p);
  }
  return p;
}

/** 게임이 끝나 DOS로 돌아왔는지. 없는 파일을 fsReadFile로 읽으면 답이 오지 않아서 목록으로 본다 */
export async function gameExited(ci: CommandInterface): Promise<boolean> {
  const [dir, name] = EXITED.split("/");
  const tree = await fsTree(ci);
  return !!tree.nodes?.find((n) => n.name === dir)?.nodes?.some((n) => n.name === name);
}

function fileStream(file: File): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    async pull(c) {
      if (offset >= file.size) return c.close();
      const end = Math.min(file.size, offset + STREAM_CHUNK);
      c.enqueue(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
      offset = end;
    },
  });
}

/** files: 에뮬레이터 FS 경로(HDD/..., CD/...) → 파일. 나중 것이 앞의 것을 덮는다 */
export async function createDos(files: Map<string, File>, conf: string, onProgress: (msg: string) => void): Promise<CommandInterface> {
  conf = signalExit(withStateFile(conf));
  const big = [...files].filter(([, f]) => f.size > BIG_FILE);
  const small = [...files].filter(([, f]) => f.size <= BIG_FILE);
  if (big.length) conf = waitForFiles(conf);
  const init: InitFsEntry[] = [];
  for (const [path, f] of small) init.push({ path, contents: new Uint8Array(await f.arrayBuffer()) });
  init.push({ path: `${SYNC_DIR}/WAIT`, contents: new Uint8Array(1) }); // 신호 폴더(Y:)가 있어야 mount된다
  init.push({ dosboxConf: conf, jsdosConf: { version: "js-dos-v8" } });
  const ci = await emulators.dosboxXWorker(init);
  if (!big.length) return ci;
  const total = big.reduce((n, [, f]) => n + f.size, 0);
  let sent = 0;
  try {
    for (const [path, f] of big) {
      const stream = fileStream(f).pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, c) {
            sent += chunk.length;
            onProgress(`게임 파일 넘기는 중 ${Math.floor((sent / total) * 100)}%`);
            c.enqueue(chunk);
          },
        }),
      );
      await ci.fsWriteFile(path, stream);
    }
    await ci.fsWriteFile(`${SYNC_DIR}/READY`, new Uint8Array(1));
  } catch (e) {
    void ci.exit();
    throw e;
  }
  return ci;
}

export function attachVideo(ci: CommandInterface, canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d")!;
  let image = ctx.createImageData(1, 1);
  let frame: { rgb: Uint8Array | null; rgba: Uint8Array | null } | null = null;
  let raf = 0;
  const resize = (w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
    image = ctx.createImageData(w, h);
  };
  const draw = () => {
    raf = 0;
    if (!frame) return;
    const { rgb, rgba } = frame;
    frame = null;
    const out = image.data;
    if (rgba) out.set(rgba.subarray(0, out.length));
    else if (rgb)
      for (let i = 0, j = 0; j < out.length; i += 3, j += 4) {
        out[j] = rgb[i];
        out[j + 1] = rgb[i + 1];
        out[j + 2] = rgb[i + 2];
        out[j + 3] = 255;
      }
    ctx.putImageData(image, 0, 0);
  };
  resize(Math.max(1, ci.width()), Math.max(1, ci.height()));
  ci.events().onFrameSize(resize);
  ci.events().onFrame((rgb, rgba) => {
    frame = { rgb, rgba };
    if (!raf) raf = requestAnimationFrame(draw);
  });
  return () => cancelAnimationFrame(raf);
}

// onSoundPush는 모노 Float32 샘플을 준다. js-dos 기본 UI와 같은 방식(링 버퍼 + ScriptProcessor)으로 재생한다.
export function attachAudio(ci: CommandInterface): () => void {
  const SIZE = 8192;
  const BLOCK = 2048;
  const ctx = new AudioContext({ sampleRate: ci.soundFrequency(), latencyHint: "interactive" });
  const ring = new Float32Array(SIZE);
  let read = 0;
  let size = 0;
  let primed = false;
  ci.events().onSoundPush((samples) => {
    for (let i = 0; i < samples.length && size < SIZE; i++, size++) ring[(read + size) % SIZE] = samples[i];
  });
  const node = ctx.createScriptProcessor(BLOCK, 0, 1);
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    primed ||= size >= BLOCK;
    for (let i = 0; i < out.length; i++) {
      if (primed && size > 0) {
        out[i] = ring[read];
        read = (read + 1) % SIZE;
        size--;
      } else out[i] = 0;
    }
  };
  node.connect(ctx.destination);
  // iOS는 사용자 입력이 있어야 소리가 난다
  const unlock = () => void ctx.resume();
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
  void ctx.resume();
  return () => {
    node.disconnect();
    void ctx.close();
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };
}

const trigger = (ci: CommandInterface, event: string) => ci.sendBackendEvent({ type: "wc-trigger-event", event });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** DOSBox-X 상태 저장. 파일이 다 써질 때까지(크기가 그대로일 때까지) 기다린다 */
export async function saveDosState(ci: CommandInterface): Promise<Uint8Array> {
  await ci.fsDeleteFile(STATE_FILE).catch(() => false);
  trigger(ci, "hand_savestate");
  let last = -1;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    const tree = await fsTree(ci);
    const size = tree.nodes?.find((n) => n.name === STATE_FILE)?.size ?? -1;
    if (size > 0 && size === last) return ci.fsReadFile(STATE_FILE);
    last = size;
  }
  throw new Error("상태 저장 시간이 초과되었습니다");
}

/** 빨리가기. DOSBox-X Turbo(speedlock2)는 켜고 끄기를 번갈아 하므로 지금 상태를 기억해서 바뀔 때만 보낸다 */
export function dosFastForward(ci: CommandInterface): (on: boolean) => void {
  let fast = false;
  return (on) => {
    if (on !== fast) trigger(ci, "hand_speedlock2");
    fast = on;
  };
}

export async function loadDosState(ci: CommandInterface, state: Uint8Array) {
  await ci.fsWriteFile(STATE_FILE, state);
  trigger(ci, "hand_loadstate");
  await sleep(500);
}

// KeyboardEvent.code → js-dos 키 코드
const KEYS: Record<string, number> = {
  Escape: 256, Enter: 257, NumpadEnter: 335, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265, PageUp: 266, PageDown: 267, Home: 268, End: 269,
  Space: 32, Minus: 45, Equal: 61, Comma: 44, Period: 46, Slash: 47, Semicolon: 59, Quote: 39,
  BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96,
  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, ShiftRight: 344, ControlRight: 345, AltRight: 346,
};

/** 키 설정 화면에서 고를 수 있는 DOS 키 */
export const DOS_KEY_LIST: { label: string; key: number }[] = [
  ...[["ESC", 256], ["Enter", 257], ["Space", 32], ["Tab", 258], ["Backspace", 259], ["↑", 265], ["↓", 264], ["←", 263], ["→", 262],
    ["Shift", 340], ["Ctrl", 341], ["Alt", 342], ["Insert", 260], ["Delete", 261], ["Home", 268], ["End", 269], ["PageUp", 266], ["PageDown", 267]]
    .map(([label, key]) => ({ label: label as string, key: key as number })),
  ...Array.from({ length: 26 }, (_, i) => ({ label: String.fromCharCode(65 + i), key: 65 + i })),
  ...Array.from({ length: 10 }, (_, i) => ({ label: String(i), key: 48 + i })),
  ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, key: 290 + i })),
];

export const dosKeyLabel = (key: number) => DOS_KEY_LIST.find((k) => k.key === key)?.label ?? KEYBOARD.find((k) => k.key === key)?.label ?? String(key);

export function toDosKey(code: string): number | undefined {
  if (code in KEYS) return KEYS[code];
  let m;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1].charCodeAt(0);
  if ((m = code.match(/^Digit(\d)$/))) return 48 + +m[1];
  if ((m = code.match(/^F(\d+)$/)) && +m[1] <= 12) return 289 + +m[1];
  return undefined;
}
