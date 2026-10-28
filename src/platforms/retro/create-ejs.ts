// EmulatorJS가 빌드한 RetroArch 코어(지금은 NDS melonDS)를 우리 캔버스에 띄운다.
// RetroArch 웹 빌드(Nostalgist)에 없는 기종용. 코어가 RetroArch 명령 대신 자체 함수(simulate_input, save_state_info…)를 내보내서 직접 부른다.
// 자체 UI(EmulatorJS emulator.js)는 쓰지 않는다. 입력·세이브·메뉴는 retron이 맡는다.
import type { RetroEmulator } from "./create-retro";
import type { RetroButton, RetroSystem } from "./systems";

const CORE_DIR = `${import.meta.env.BASE_URL}ejs/v4.2.3/`; // scripts/copy-emulators.mjs가 받아 둔다
const SAVE_DIR = "/data/saves";
const SRAM_INTERVAL_S = 5; // RetroArch가 세이브를 파일에 쓰는 주기

/** RetroPad 버튼 번호 (libretro RETRO_DEVICE_ID_JOYPAD_*) */
const PAD_ID: Record<RetroButton, number> = { b: 0, y: 1, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, a: 8, x: 9, l: 10, r: 11 };

// 실제 키는 retron이 받아서 simulate_input으로 넘긴다. RetroArch 기본 키(조작, F1 메뉴, ESC 종료, 스페이스 빨리가기…)는 모두 끈다
const NO_KEYS = [
  ...["up", "down", "left", "right", "a", "b", "x", "y", "l", "r", "l2", "r2", "l3", "r3", "select", "start"].map((b) => `input_player1_${b}`),
  ..."menu_toggle exit_emulator toggle_fast_forward hold_fast_forward toggle_slowmotion hold_slowmotion rewind pause_toggle frame_advance reset save_state load_state state_slot_increase state_slot_decrease screenshot toggle_fullscreen audio_mute volume_up volume_down shader_next shader_prev cheat_toggle cheat_index_plus cheat_index_minus fps_toggle netplay_game_watch grab_mouse_toggle game_focus_toggle ai_service".split(" ").map((h) => `input_${h}`),
];

interface EjsModule {
  FS: {
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string): Uint8Array;
    mkdir(path: string): void;
    unlink(path: string): void;
    analyzePath(path: string): { exists: boolean };
  };
  HEAPU8: Uint8Array;
  AL?: { contexts: Record<number, { audioCtx: AudioContext; interval: number } | undefined> };
  cwrap(name: string, ret: string | null, args: string[]): (...a: unknown[]) => unknown;
  callMain(args: string[]): void;
  resumeMainLoop(): void;
  abort(): void;
}
type Runtime = (m: Record<string, unknown>) => Promise<EjsModule>;

const scriptUrl = (core: string) => `${CORE_DIR}${core}_libretro.js`;

// 코어 스크립트는 전역 EJS_Runtime을 만든다. 코어마다 한 번만 불러 두고 그 함수를 계속 쓴다
const runtimes = new Map<string, Promise<Runtime>>();
function loadRuntime(core: string) {
  let p = runtimes.get(core);
  if (!p) {
    p = new Promise<Runtime>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = scriptUrl(core);
      s.onload = () => {
        const w = window as unknown as { EJS_Runtime?: Runtime };
        if (w.EJS_Runtime) resolve(w.EJS_Runtime);
        else reject(new Error("에뮬레이터를 불러오지 못했습니다"));
      };
      s.onerror = () => reject(new Error("에뮬레이터를 받지 못했습니다"));
      document.head.append(s);
    });
    p.catch(() => runtimes.delete(core)); // 오프라인 등으로 실패했으면 다음에 다시 받는다
    runtimes.set(core, p);
  }
  return p;
}

/**
 * 코어(emscripten)가 문서·창·캔버스에 다는 이벤트 리스너와 캔버스 크기 감시(ResizeObserver)를 적어 둔다. 끝낼 때 떼지 않으면 나간 뒤에도
 * 키를 누를 때마다 죽은 코어를 부르고, 코어 메모리(수백 MB)가 풀리지 않는다. 코어 스크립트에서 단 것만 고른다 (호출 스택에 코어 파일 이름이 있는 것)
 */
function trackListeners(core: string) {
  const added: [EventTarget, string, EventListenerOrEventListenerObject | null, boolean | AddEventListenerOptions | undefined][] = [];
  const observers: ResizeObserver[] = [];
  const file = `${core}_libretro.js`;
  const fromCore = () => !!new Error().stack?.includes(file);
  const proto = EventTarget.prototype;
  const original = proto.addEventListener;
  proto.addEventListener = function (this: EventTarget, type, listener, options) {
    if (fromCore()) added.push([this, type, listener, options]);
    return original.call(this, type, listener, options);
  };
  const RO = window.ResizeObserver;
  window.ResizeObserver = class extends RO {
    constructor(cb: ResizeObserverCallback) {
      super(cb);
      if (fromCore()) observers.push(this);
    }
  };
  return {
    stop() {
      proto.addEventListener = original;
      window.ResizeObserver = RO;
    },
    removeAll() {
      added.splice(0).forEach(([t, type, l, o]) => t.removeEventListener(type, l, o));
      observers.splice(0).forEach((o) => o.disconnect());
    },
  };
}

/**
 * 캔버스 크기: 코어는 캔버스의 CSS 크기로 다시 그린다 (화면 칸에 맞춰 키우면 키운 크기로 그려서 화면 필터(선명·부드럽게)가 듣지 않고,
 * 휴대폰에서는 오히려 흐려진다). CSS 크기를 코어 해상도로 두고(→ 그리는 크기 = 코어 해상도) transform으로 화면 칸(.screen)만큼 키운다.
 * 다른 기종처럼 코어 해상도 그대로 그리고 크기와 필터는 CSS가 맡는 셈
 */
function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const box = canvas.parentElement!;
  const fit = () =>
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${width}px`,
      height: `${height}px`,
      transformOrigin: "0 0",
      transform: `scale(${box.clientWidth / width})`,
      touchAction: "none",
    });
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(box);
  return () => {
    ro.disconnect();
    for (const p of ["position", "left", "top", "width", "height", "transform-origin", "transform", "touch-action"]) canvas.style.removeProperty(p);
  };
}

const MIN_TOUCH_MS = 50;
const POINTER_EVENTS = ["mousedown", "mousemove", "mouseup", "wheel", "touchstart", "touchmove", "touchend", "touchcancel"];

/**
 * 터치스크린(NDS 아래 화면). 코어는 이벤트 좌표를 캔버스의 getBoundingClientRect 기준으로 재서, 게임 화면을 CSS로 돌리거나(아이폰 가로)
 * 키우면(fitCanvas) 어긋난다. 실제 마우스·터치 이벤트는 코어에 닿지 않게 막고, 캔버스 안 좌표(offsetX: 회전·확대를 푼 좌표)로 바꾼
 * 마우스 이벤트를 다시 보낸다. 손가락은 하나만 쓴다 (DS 터치스크린은 한 점)
 */
function bridgePointer(canvas: HTMLCanvasElement) {
  const box = canvas.parentElement!;
  const block = (e: Event) => e.isTrusted && e.target === canvas && e.stopPropagation();
  for (const t of POINTER_EVENTS) box.addEventListener(t, block, true);

  let active: number | null = null;
  let downAt = 0;
  let pendingUp = 0;
  /** 마우스는 마우스 이벤트로, 손가락은 터치 이벤트로 보낸다 (터치 기기에서 코어는 터치만 읽는다) */
  const send = (phase: "down" | "move" | "up", e: PointerEvent) => {
    // 코어는 받은 좌표에 devicePixelRatio를 곱해 캔버스 픽셀로 본다. 캔버스는 CSS 크기 = 픽셀 크기(fitCanvas)라서 미리 나눠 둔다
    const x = Math.min(Math.max(e.offsetX, 0), canvas.offsetWidth - 1) / devicePixelRatio;
    const y = Math.min(Math.max(e.offsetY, 0), canvas.offsetHeight - 1) / devicePixelRatio;
    let ev: Event;
    if (e.pointerType === "mouse") {
      ev = new MouseEvent(phase === "down" ? "mousedown" : phase === "up" ? "mouseup" : "mousemove", { clientX: x, clientY: y, button: 0, buttons: phase === "up" ? 0 : 1 });
    } else {
      // Touch 생성자는 사파리에 없어서, 코어가 읽는 필드(touches 등)만 붙인 이벤트를 만든다
      ev = new Event(phase === "down" ? "touchstart" : phase === "up" ? "touchend" : "touchmove", { cancelable: true });
      const t = { identifier: 0, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y, target: canvas };
      const now = phase === "up" ? [] : [t];
      Object.defineProperties(ev, { touches: { value: now }, targetTouches: { value: now }, changedTouches: { value: [t] } });
    }
    // 코어가 재는 캔버스 위치를 (0, 0)으로 두고 캔버스 안 좌표를 그대로 넘긴다
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    try {
      canvas.dispatchEvent(ev);
    } finally {
      delete (canvas as Partial<HTMLCanvasElement>).getBoundingClientRect;
    }
  };
  const down = (e: PointerEvent) => {
    if (active !== null || e.button !== 0) return;
    e.preventDefault();
    clearTimeout(pendingUp);
    active = e.pointerId;
    downAt = performance.now();
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === "mouse") send("move", e);
    send("down", e);
  };
  const move = (e: PointerEvent) => e.pointerId === active && send("move", e);
  const up = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    // 코어는 프레임마다 눌림을 읽어서, 한 프레임 안에 눌렀다 떼면 터치를 놓친다. 짧게 톡 쳐도 몇 프레임은 누른 채로 둔다
    const wait = MIN_TOUCH_MS - (performance.now() - downAt);
    if (wait <= 0) send("up", e);
    else pendingUp = window.setTimeout(() => send("up", e), wait);
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  return () => {
    clearTimeout(pendingUp);
    for (const t of POINTER_EVENTS) box.removeEventListener(t, block, true);
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
  };
}

const cfg = (o: Record<string, string | number | boolean>) => Object.entries(o).map(([k, v]) => `${k} = "${v}"`).join("\n") + "\n";
const mkdirs = (FS: EjsModule["FS"], path: string) => {
  let cur = "";
  for (const part of path.split("/").filter(Boolean)) {
    cur += `/${part}`;
    if (!FS.analyzePath(cur).exists) FS.mkdir(cur);
  }
};

export async function createEjs(system: RetroSystem, canvas: HTMLCanvasElement, rom: File, sram: Blob | null, fastRatio: number): Promise<RetroEmulator> {
  const runtime = await loadRuntime(system.core);
  const saveExt = system.saveExt ?? "srm";
  const romData = new Uint8Array(await rom.arrayBuffer());
  const sramData = sram && new Uint8Array(await sram.arrayBuffer());
  const unfit = fitCanvas(canvas, system.width, system.height);
  const listeners = trackListeners(system.core);
  let M: EjsModule;
  try {
    M = await runtime({
      noInitialRun: true,
      canvas,
      parent: canvas.parentElement,
      arguments: [],
      preRun: [],
      postRun: [],
      print: () => undefined,
      printErr: () => undefined,
      // 코어가 옵션 파일 경로를 정하면 거기에 기종 설정을 써 둔다
      callbacks: {
        setupCoreSettingFile: (path: string) => {
          mkdirs(M.FS, path.replace(/\/[^/]*$/, ""));
          M.FS.writeFile(path, cfg(system.coreConfig ?? {}));
        },
      },
      locateFile: (name: string) => `${CORE_DIR}${name}`,
      getSavExt: () => `.${saveExt}`,
    });
    const { FS } = M;
    mkdirs(FS, "/home/web_user/.config/retroarch");
    FS.writeFile(
      "/home/web_user/.config/retroarch/retroarch.cfg",
      cfg({
        savefile_directory: SAVE_DIR,
        sort_savefiles_enable: false, // 코어 이름 폴더 없이 바로 SAVE_DIR에
        sort_savefiles_by_content_enable: false,
        autosave_interval: SRAM_INTERVAL_S,
        block_sram_overwrite: false,
        screenshot_directory: "/",
        video_gpu_screenshot: false,
        video_smooth: false,
        video_vsync: true,
        audio_latency: 64,
        fastforward_ratio: fastRatio,
        savestate_thumbnail_enable: false,
        video_font_enable: false, // 화면 위 RetroArch 알림 글자를 끈다
        suspend_screensaver_enable: false, // 코어가 화면 켜짐 유지(Wake Lock)를 잡으면 나간 뒤에도 풀 수 없다
        input_joypad_driver: "null", // 게임패드도 retron이 읽는다 (두 번 눌리지 않게)
        ...Object.fromEntries(NO_KEYS.map((k) => [k, "nul"])),
      }),
    );
    const romPath = `/${rom.name}`;
    FS.writeFile(romPath, romData);
    mkdirs(FS, SAVE_DIR);
    if (sramData) FS.writeFile(`${SAVE_DIR}/${rom.name.replace(/\.\w+$/, "")}.${saveExt}`, sramData);
    M.callMain([romPath]);
    M.resumeMainLoop();
  } catch (err) {
    listeners.removeAll();
    unfit();
    throw err;
  } finally {
    listeners.stop();
  }
  const unbridge = system.touch ? bridgePointer(canvas) : () => undefined;

  const { FS } = M;
  const fn = <T>(name: string, ret: string | null = null, args: string[] = []) => M.cwrap(name, ret, args) as (...a: unknown[]) => T;
  const f = {
    restart: fn<void>("system_restart"),
    saveStateInfo: fn<string>("save_state_info", "string"),
    loadState: fn<number>("load_state", "number", ["string", "number"]),
    screenshot: fn<void>("cmd_take_screenshot"),
    simulateInput: fn<void>("simulate_input", null, ["number", "number", "number"]),
    toggleMainLoop: fn<void>("toggleMainLoop", null, ["number"]),
    saveFilePath: fn<string>("save_file_path", "string"),
    saveFiles: fn<void>("cmd_savefiles"),
    toggleFastForward: fn<void>("toggle_fastforward", null, ["number"]),
    setFastRatio: fn<void>("set_ff_ratio", null, ["number"]),
  };

  let fast = false;
  let running = true;
  const run = (on: boolean) => {
    if (on !== running) f.toggleMainLoop(on ? 1 : 0);
    running = on;
  };

  return {
    press: (button, pressed) => f.simulateInput(0, PAD_ID[button], pressed ? 1 : 0),
    async saveState() {
      const [size, start, ok] = f.saveStateInfo().split("|");
      if (ok !== "1") throw new Error(size);
      return M.HEAPU8.slice(Number(start), Number(start) + Number(size));
    },
    async loadState(state) {
      FS.writeFile("/game.state", state);
      f.loadState("game.state", 0);
    },
    async screenshot() {
      // 코어가 다음 프레임에 /screenshot.png를 쓴다
      if (FS.analyzePath("/screenshot.png").exists) FS.unlink("/screenshot.png");
      f.screenshot();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (FS.analyzePath("/screenshot.png").exists) return new Blob([FS.readFile("/screenshot.png")], { type: "image/png" });
      }
      throw new Error("스크린샷을 찍지 못했습니다");
    },
    async readSram(flush = false) {
      if (flush) f.saveFiles();
      const path = f.saveFilePath();
      return path && FS.analyzePath(path).exists ? FS.readFile(path) : null;
    },
    setFastForward(on) {
      if (on !== fast) f.toggleFastForward(on ? 1 : 0);
      fast = on;
    },
    setFastRatio: (ratio) => f.setFastRatio(ratio),
    pause: () => run(false),
    resume: () => run(true),
    reset: () => f.restart(),
    exit() {
      run(false);
      unbridge();
      listeners.removeAll();
      unfit();
      for (const c of Object.values(M.AL?.contexts ?? {})) {
        if (!c) continue;
        clearInterval(c.interval);
        void c.audioCtx.close().catch(() => undefined);
      }
      try {
        M.abort();
      } catch {
        // abort는 늘 예외를 던진다
      }
    },
  };
}
