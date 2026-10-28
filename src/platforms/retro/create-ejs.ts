// EmulatorJS가 빌드한 RetroArch 코어(지금은 N64 parallel_n64)를 우리 캔버스에 띄운다.
// RetroArch 웹 빌드(Nostalgist)에 없는 기종용. 코어가 RetroArch 명령 대신 자체 함수(simulate_input, save_state_info…)를 내보내서 직접 부른다.
// 자체 UI(EmulatorJS emulator.js)는 쓰지 않는다. 입력·세이브·메뉴는 retron이 맡는다.
import type { RetroEmulator } from "./create-retro";
import type { RetroButton, RetroSystem } from "./systems";

const CORE_DIR = `${import.meta.env.BASE_URL}ejs/v4.2.3/`; // scripts/copy-emulators.mjs가 받아 둔다
const SAVE_DIR = "/data/saves";
const SRAM_INTERVAL_S = 5; // RetroArch가 세이브를 파일에 쓰는 주기

/** RetroPad 버튼 번호 (libretro RETRO_DEVICE_ID_JOYPAD_*). 기종이 따로 정하지 않으면 이름 그대로 */
const PAD_ID: Partial<Record<RetroButton, number>> = { b: 0, y: 1, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, a: 8, x: 9, l: 10, r: 11 };
/** simulate_input의 왼쪽 아날로그 스틱 번호: X+, X-, Y+(아래), Y-(위). 값은 0~0x7fff */
const STICK = { right: 16, left: 17, down: 18, up: 19 } as const;
const STICK_MAX = 0x7fff;

// 실제 키는 retron이 받아서 simulate_input으로 넘긴다. 코어의 키보드 입력은 EmulatorJS 빌드에서 기본으로 꺼져 있어서
// (ejs_set_keyboard_enabled) RetroArch 기본 키(F1 메뉴, ESC 종료…)도 듣지 않는다. 조작 키 바인딩은 지우면 안 된다:
// 버튼을 하나씩 묻는 코어(parallel_n64)에는 바인딩이 있는 버튼만 simulate_input 눌림이 들어간다

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
    });
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(box);
  return () => {
    ro.disconnect();
    for (const p of ["position", "left", "top", "width", "height", "transform-origin", "transform"]) canvas.style.removeProperty(p);
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

  const padId = { ...PAD_ID, ...system.retropad };
  // 아날로그 스틱 기종: 방향 버튼(키보드 방향키 등)은 스틱을 끝까지 민 것으로, axis(가상패드 스틱·게임패드)는 그 값대로. 둘을 더해서 넘긴다
  const dirs = new Set<RetroButton>();
  let axis = { x: 0, y: 0 };
  const sendStick = () => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    let dx = +dirs.has("right") - +dirs.has("left");
    let dy = +dirs.has("down") - +dirs.has("up");
    if (dx && dy) [dx, dy] = [dx * Math.SQRT1_2, dy * Math.SQRT1_2]; // 대각선도 원 안에서 끝까지
    const x = clamp(dx + axis.x);
    const y = clamp(dy + axis.y);
    f.simulateInput(0, STICK.right, x > 0 ? Math.round(x * STICK_MAX) : 0);
    f.simulateInput(0, STICK.left, x < 0 ? Math.round(-x * STICK_MAX) : 0);
    f.simulateInput(0, STICK.down, y > 0 ? Math.round(y * STICK_MAX) : 0);
    f.simulateInput(0, STICK.up, y < 0 ? Math.round(-y * STICK_MAX) : 0);
  };

  let fast = false;
  let running = true;
  const run = (on: boolean) => {
    if (on !== running) f.toggleMainLoop(on ? 1 : 0);
    running = on;
  };

  return {
    press(button, pressed) {
      if (system.analog && button in STICK) {
        if (pressed) dirs.add(button);
        else dirs.delete(button);
        return sendStick();
      }
      const id = padId[button];
      if (id !== undefined) f.simulateInput(0, id, pressed ? 1 : 0);
    },
    axis(x, y) {
      axis = { x, y };
      sendStick();
    },
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
