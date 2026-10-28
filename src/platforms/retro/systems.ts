// RetroArch(Nostalgist)로 도는 기종 정의. 새 기종은 여기에 하나 더하고 players.ts에 등록하면 된다.
import type { Platform } from "../../library/library";

export type RetroButton = "up" | "down" | "left" | "right" | "a" | "b" | "x" | "y" | "l" | "r" | "select" | "start";

/** 버튼 → KeyboardEvent.code */
export type RetroKeys = Partial<Record<RetroButton, string>>;

export interface RetroSystem {
  platform: Platform;
  label: string; // 카드 배지 (SFC, GBA)
  core: string; // RetroArch 코어 이름 (public/retroarch/, EmulatorJS 코어는 public/ejs/에 받아 둔다)
  /** nostalgist = RetroArch 웹 빌드(기본), ejs = EmulatorJS가 빌드한 코어 (RetroArch 웹 빌드에 없는 기종) */
  backend?: "nostalgist" | "ejs";
  saveExt?: string; // 게임 세이브 확장자 (EmulatorJS 코어. 기본 srm)
  rom: RegExp; // 이 기종 롬 확장자
  width: number; // 코어 해상도. 캔버스를 이 크기로 그리고 화면 크기와 필터는 CSS가 맡는다
  height: number;
  aspect: string; // 화면 비율 (CSS aspect-ratio)
  coreConfig?: Record<string, string>;
  buttons: { button: RetroButton; label: string }[]; // 키보드 설정에 보이는 순서
  defaultKeys: RetroKeys;
  /** 가상패드 오른쪽 버튼 배치: diamond = X/Y/A/B 네 개, pair = B/A 두 개 */
  face: "diamond" | "pair";
  /** 터치스크린: 화면 아래쪽 이만큼(비율)을 누르면 코어에 터치로 넘긴다 (NDS 아래 화면) */
  touch?: { top: number };
  /** 표준 게임패드 버튼 번호 → 버튼 (위치 기준) */
  pad: [number, RetroButton][];
}

const DPAD: RetroSystem["buttons"] = [
  { button: "up", label: "↑" },
  { button: "down", label: "↓" },
  { button: "left", label: "←" },
  { button: "right", label: "→" },
];
const SYSTEM_BUTTONS: RetroSystem["buttons"] = [
  { button: "l", label: "L" },
  { button: "r", label: "R" },
  { button: "select", label: "SELECT" },
  { button: "start", label: "START" },
];
const ARROWS: RetroKeys = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", select: "ShiftRight", start: "Enter" };
const PAD_COMMON: [number, RetroButton][] = [[4, "l"], [5, "r"], [6, "l"], [7, "r"], [8, "select"], [9, "start"], [12, "up"], [13, "down"], [14, "left"], [15, "right"]];

export const SFC: RetroSystem = {
  platform: "sfc",
  label: "SFC",
  core: "snes9x",
  rom: /\.(sfc|smc|fig|swc)$/i,
  width: 256,
  height: 224,
  aspect: "4 / 3",
  coreConfig: { snes9x_aspect: "uncorrected" }, // 캔버스를 꽉 채우고 비율은 CSS가 맞춘다
  buttons: [...DPAD, { button: "a", label: "A" }, { button: "b", label: "B" }, { button: "x", label: "X" }, { button: "y", label: "Y" }, ...SYSTEM_BUTTONS],
  defaultKeys: { ...ARROWS, a: "KeyX", b: "KeyZ", x: "KeyS", y: "KeyA", l: "KeyQ", r: "KeyW" },
  face: "diamond",
  // 닌텐도 배치처럼 위치 기준: 아래=B, 오른쪽=A, 왼쪽=Y, 위=X
  pad: [[0, "b"], [1, "a"], [2, "y"], [3, "x"], ...PAD_COMMON],
};

export const GBA: RetroSystem = {
  platform: "gba",
  label: "GBA",
  core: "mgba", // BIOS 없이도 돈다 (내장 BIOS 흉내)
  rom: /\.gba$/i,
  width: 240,
  height: 160,
  aspect: "3 / 2",
  buttons: [...DPAD, { button: "a", label: "A" }, { button: "b", label: "B" }, ...SYSTEM_BUTTONS],
  defaultKeys: { ...ARROWS, a: "KeyX", b: "KeyZ", l: "KeyA", r: "KeyS" },
  face: "pair",
  // 아래·왼쪽 = B, 오른쪽·위 = A
  pad: [[0, "b"], [1, "a"], [2, "b"], [3, "a"], ...PAD_COMMON],
};

export const NDS: RetroSystem = {
  platform: "nds",
  label: "NDS",
  core: "melonds", // 펌웨어·BIOS 없이 내장 BIOS로 바로 게임을 띄운다
  backend: "ejs",
  saveExt: "sav",
  rom: /.nds$/i,
  width: 256,
  height: 384, // 위아래 화면 256×192 두 장
  aspect: "2 / 3",
  coreConfig: { melonds_screen_layout: "Top/Bottom", melonds_screen_gap: "0", melonds_touch_mode: "Touch", melonds_boot_directly: "enabled", melonds_console_mode: "DS" },
  buttons: [...DPAD, { button: "a", label: "A" }, { button: "b", label: "B" }, { button: "x", label: "X" }, { button: "y", label: "Y" }, ...SYSTEM_BUTTONS],
  defaultKeys: { ...ARROWS, a: "KeyX", b: "KeyZ", x: "KeyS", y: "KeyA", l: "KeyQ", r: "KeyW" },
  face: "diamond",
  touch: { top: 0.5 },
  pad: [[0, "b"], [1, "a"], [2, "y"], [3, "x"], ...PAD_COMMON],
};

export const RETRO_SYSTEMS = [SFC, GBA, NDS];

/** 파일 이름으로 기종을 찾는다 (롬이 아니면 undefined) */
export const systemForRom = (path: string) => RETRO_SYSTEMS.find((s) => s.rom.test(path));
