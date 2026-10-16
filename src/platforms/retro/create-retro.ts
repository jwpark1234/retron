// RetroArch 기종 에뮬레이터: Nostalgist.js(RetroArch 웹 빌드 + 기종별 코어)를 우리 캔버스에 띄운다.
// 자체 UI는 쓰지 않는다. 입력·세이브·메뉴는 retron이 맡는다.
import { Nostalgist } from "nostalgist";
import { RETROARCH_KEYS } from "./input";
import type { RetroButton, RetroSystem } from "./systems";

const CORE_DIR = `${import.meta.env.BASE_URL}retroarch/v1.22.2/`; // scripts/copy-emulators.mjs가 받아 둔다
const SRAM_INTERVAL_S = 5; // RetroArch가 세이브(SRAM)를 파일에 쓰는 주기

export interface RetroEmulator {
  press(button: RetroButton, pressed: boolean): void;
  saveState(): Promise<Uint8Array>;
  loadState(state: Uint8Array): Promise<void>;
  screenshot(): Promise<Blob>;
  /** 게임 세이브(SRAM). 배터리 세이브가 없는 게임이면 null */
  readSram(flush?: boolean): Promise<Uint8Array | null>;
  setFastForward(on: boolean): void;
  pause(): void;
  resume(): void;
  reset(): void;
  exit(): void;
}

/** fastRatio: 빨리가기 배속. RetroArch는 실행 중에 배속을 바꿀 수 없어서, 바꾸면 다시 띄운다(RetroPlayer) */
export async function createRetro(system: RetroSystem, canvas: HTMLCanvasElement, rom: File, sram: Blob | null, fastRatio: number): Promise<RetroEmulator> {
  const n = await Nostalgist.launch({
    element: canvas,
    core: system.core,
    rom,
    sram: sram ? new File([sram], rom.name.replace(/\.\w+$/, ".srm")) : undefined,
    sramType: "srm",
    size: { width: system.width, height: system.height }, // 코어 해상도 그대로 그리고, 화면 크기와 필터는 CSS가 맡는다
    respondToGlobalEvents: false, // 실제 키는 retron이 받아서 press로 넘긴다
    resolveCoreJs: () => `${CORE_DIR}${system.core}_libretro.js`,
    resolveCoreWasm: () => `${CORE_DIR}${system.core}_libretro.wasm`,
    retroarchConfig: {
      ...RETROARCH_KEYS,
      input_joypad_driver: "null", // 게임패드도 retron이 읽는다 (두 번 눌리지 않게)
      autosave_interval: String(SRAM_INTERVAL_S),
      fastforward_ratio: fastRatio,
      video_smooth: false,
      savestate_thumbnail_enable: false,
      video_font_enable: false, // 화면 위 RetroArch 알림 글자를 끈다
    },
    retroarchCoreConfig: system.coreConfig ?? {},
  });
  const emu = n.getEmulator() as unknown as { callCommand(c: string): void; sramFilePath: string };
  const FS = n.getEmscriptenFS();
  let fast = false;

  return {
    press: (button, pressed) => (pressed ? n.pressDown(button) : n.pressUp(button)),
    saveState: async () => new Uint8Array(await (await n.saveState()).state.arrayBuffer()),
    loadState: (state) => n.loadState(new Blob([state])),
    screenshot: () => n.screenshot(),
    async readSram(flush = false) {
      if (flush) {
        emu.callCommand("_cmd_savefiles");
        await new Promise((r) => setTimeout(r, 300));
      }
      return FS.analyzePath(emu.sramFilePath).exists ? (FS.readFile(emu.sramFilePath) as Uint8Array) : null;
    },
    setFastForward(on) {
      if (on !== fast) n.sendCommand("FAST_FORWARD"); // RetroArch 명령은 켜고 끄기를 번갈아 한다
      fast = on;
    },
    pause: () => n.pause(),
    resume: () => n.resume(),
    reset: () => n.restart(),
    exit: () => n.exit({ removeCanvas: false }),
  };
}
