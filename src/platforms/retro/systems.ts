// RetroArch 코어(Nostalgist, EmulatorJS 빌드)로 도는 기종 정의. 새 기종은 여기에 하나 더하고 players.ts에 등록하면 된다.
import type { Platform } from "../../library/library";

export type RetroButton = "up" | "down" | "left" | "right" | "a" | "b" | "x" | "y" | "l" | "r" | "select" | "start" | "z" | "cup" | "cdown" | "cleft" | "cright";

/** 버튼 → KeyboardEvent.code */
export type RetroKeys = Partial<Record<RetroButton, string>>;

export interface RetroSystem {
  platform: Platform;
  label: string; // 카드 배지 (SFC, GBA, N64)
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
  /** 가상패드 오른쪽 버튼 배치: diamond = X/Y/A/B 네 개, pair = B/A 두 개, n64 = A·B + C 버튼 넷 */
  face: "diamond" | "pair" | "n64";
  /** 아날로그 스틱 기종(N64): 방향(키보드 방향키·가상패드·게임패드 왼쪽 스틱)을 십자키가 아니라 아날로그 스틱으로 넘긴다 */
  analog?: boolean;
  /** EmulatorJS 코어: 버튼 → RetroPad 번호 (코어마다 RetroPad를 기종 버튼에 대응시키는 방식이 다르다) */
  retropad?: Partial<Record<RetroButton, number>>;
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

// N64: RetroArch 웹 빌드에 N64 코어가 없어서 EmulatorJS가 빌드한 parallel_n64를 쓴다 (mupen64plus_next보다 빠르고 메모리를 덜 썼다)
export const N64: RetroSystem = {
  platform: "n64",
  label: "N64",
  core: "parallel_n64",
  backend: "ejs",
  saveExt: "srm",
  rom: /\.(z64|n64|v64)$/i,
  width: 640, // 내부 해상도. 320×240과 속도가 같고 훨씬 선명했다 (960×720부터 느려짐)
  height: 480,
  aspect: "4 / 3",
  // 독립 C 버튼(alt-map): N64 버튼마다 RetroPad 버튼 하나 (기본 배치는 R2를 누른 채 다른 버튼으로 C 버튼을 낸다)
  coreConfig: { "parallel-n64-screensize": "640x480", "parallel-n64-alt-map": "enabled" },
  analog: true,
  // alt-map 대응: RetroPad B=A, Y=B, L2=Z, R2=R, SELECT=L, X·A·L·R = C 위·아래·왼쪽·오른쪽
  retropad: { a: 0, b: 1, start: 3, up: 4, down: 5, left: 6, right: 7, cdown: 8, cup: 9, cleft: 10, cright: 11, z: 12, r: 13, l: 2 },
  buttons: [
    ...DPAD,
    { button: "a", label: "A" },
    { button: "b", label: "B" },
    { button: "z", label: "Z" },
    { button: "cup", label: "C↑" },
    { button: "cdown", label: "C↓" },
    { button: "cleft", label: "C←" },
    { button: "cright", label: "C→" },
    { button: "l", label: "L" },
    { button: "r", label: "R" },
    { button: "start", label: "START" },
  ],
  defaultKeys: { ...ARROWS, a: "KeyX", b: "KeyZ", z: "KeyA", l: "KeyQ", r: "KeyW", cup: "KeyI", cdown: "KeyK", cleft: "KeyJ", cright: "KeyL" },
  face: "n64",
  // 아래=A, 왼쪽=B, 오른쪽·위=C↓·C← (오른쪽 스틱도 C 버튼), 왼쪽 트리거=Z
  pad: [[0, "a"], [2, "b"], [1, "cdown"], [3, "cleft"], [4, "l"], [5, "r"], [6, "z"], [7, "r"], [9, "start"], [12, "up"], [13, "down"], [14, "left"], [15, "right"]],
};

export const RETRO_SYSTEMS = [SFC, GBA, N64];

/** 파일 이름으로 기종을 찾는다 (롬이 아니면 undefined) */
export const systemForRom = (path: string) => RETRO_SYSTEMS.find((s) => s.rom.test(path));
