import { useEffect, useRef, useState } from "preact/hooks";
import type { CommandInterface } from "emulators";
import { CD_DIR, GAME_ID, HDD_DIR, SAVE_FILES } from "./game-config";
import { attachAudio, attachVideo, createDos, toDosKey } from "./dos/create-dos";
import { detectSaveChange } from "./fs/detect-save-change";
import { readDir, removeFile, writeFile, type FileMap } from "./fs/store";
import { VirtualKeyboard } from "./VirtualKeyboard";

const LONG_PRESS_MS = 500;
const isUi = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest(".vkeys, .toolbar");

async function storeSaves(saves: FileMap) {
  const hdd = (await readDir(`${GAME_ID}/${HDD_DIR}`)) ?? new Map();
  for (const name of hdd.keys()) {
    if (SAVE_FILES.test(name) && !saves.has(name)) await removeFile(`${GAME_ID}/${HDD_DIR}/${name}`);
  }
  for (const [name, data] of saves) await writeFile(`${GAME_ID}/${HDD_DIR}/${name}`, data);
}

export function Game({ onExit }: { onExit: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ci = useRef<CommandInterface | null>(null);
  const [status, setStatus] = useState("불러오는 중…");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      const hdd = await readDir(`${GAME_ID}/${HDD_DIR}`);
      const cd = await readDir(`${GAME_ID}/${CD_DIR}`);
      if (!hdd || !cd) throw new Error("게임 파일이 없습니다. 처음 화면에서 다시 가져와 주세요.");
      setStatus("에뮬레이터 시작 중…");
      const dos = await createDos(hdd, cd);
      if (disposed) return void dos.exit();
      ci.current = dos;
      cleanups.push(
        attachVideo(dos, canvas.current!),
        attachAudio(dos),
        detectSaveChange(dos, async (saves) => {
          await storeSaves(saves);
          setToast("저장되었습니다");
          setTimeout(() => setToast(""), 2000);
        }),
      );
      setStatus("");
    })().catch((e) => setStatus((e as Error).message));
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      void ci.current?.exit();
      ci.current = null;
    };
  }, []);

  // 입력: 마우스는 절대 좌표, 터치는 탭=좌클릭 / 길게 누르기=우클릭
  useEffect(() => {
    const el = wrap.current!;
    const move = (e: PointerEvent) => {
      const r = canvas.current!.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      ci.current?.sendMouseMotion(x, y);
    };
    const click = (button: number) => {
      ci.current?.sendMouseButton(button, true);
      setTimeout(() => ci.current?.sendMouseButton(button, false), 100);
    };
    let longPress: ReturnType<typeof setTimeout> | undefined;
    let longPressed = false;
    const down = (e: PointerEvent) => {
      if (isUi(e.target)) return;
      move(e);
      if (e.pointerType === "mouse") return ci.current?.sendMouseButton(e.button === 2 ? 1 : 0, true);
      longPressed = false;
      longPress = setTimeout(() => {
        longPressed = true;
        click(1);
      }, LONG_PRESS_MS);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return ci.current?.sendMouseButton(e.button === 2 ? 1 : 0, false);
      clearTimeout(longPress);
      if (!longPressed && !isUi(e.target)) click(0);
    };
    const key = (pressed: boolean) => (e: KeyboardEvent) => {
      const k = toDosKey(e.code);
      if (k === undefined) return;
      e.preventDefault();
      ci.current?.sendKeyEvent(k, pressed);
    };
    const kd = key(true);
    const ku = key(false);
    const noMenu = (e: Event) => e.preventDefault();
    const leave = (e: BeforeUnloadEvent) => e.preventDefault();
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("beforeunload", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);

  const isTouch = matchMedia("(pointer: coarse)").matches;
  return (
    <div class="game" ref={wrap}>
      <canvas ref={canvas} />
      <div class="toolbar">
        <button onClick={onExit}>나가기</button>
      </div>
      {isTouch && <VirtualKeyboard onKey={(k, p) => ci.current?.sendKeyEvent(k, p)} />}
      {status && <div class="overlay">{status}</div>}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}
