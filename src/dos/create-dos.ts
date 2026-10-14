// js-dos 8 emulators API로 DOSBox-X를 Worker에서 띄우고 화면·소리를 연결한다.
// js-dos 기본 UI는 쓰지 않는다 (가상 키패드, 터치 입력, 세이브 처리를 직접 하기 위해).
import type { CommandInterface, Emulators } from "emulators";
import { CD_DIR, DOSBOX_CONF, HDD_DIR } from "../game-config";
import type { FileMap } from "../fs/store";

declare global {
  // index.html에서 <script src="/emulators/emulators.js">로 로드된다
  const emulators: Emulators;
}

export async function createDos(hdd: FileMap, cd: FileMap): Promise<CommandInterface> {
  const init = [
    ...[...hdd].map(([p, contents]) => ({ path: `${HDD_DIR}/${p}`, contents })),
    ...[...cd].map(([p, contents]) => ({ path: `${CD_DIR}/${p}`, contents })),
    { dosboxConf: DOSBOX_CONF, jsdosConf: { version: "js-dos-v8" } },
  ];
  return emulators.dosboxXWorker(init);
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

// KeyboardEvent.code → js-dos 키 코드
const KEYS: Record<string, number> = {
  Escape: 256, Enter: 257, NumpadEnter: 335, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265, PageUp: 266, PageDown: 267, Home: 268, End: 269,
  Space: 32, Minus: 45, Equal: 61, Comma: 44, Period: 46, Slash: 47, Semicolon: 59, Quote: 39,
  BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96,
  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, ShiftRight: 344, ControlRight: 345, AltRight: 346,
};

export function toDosKey(code: string): number | undefined {
  if (code in KEYS) return KEYS[code];
  let m;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1].charCodeAt(0);
  if ((m = code.match(/^Digit(\d)$/))) return 48 + +m[1];
  if ((m = code.match(/^F(\d+)$/)) && +m[1] <= 12) return 289 + +m[1];
  return undefined;
}
