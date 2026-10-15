// 입력: 키보드·게임패드·가상패드를 모두 우리가 받아서 Nostalgist(RetroArch)에 버튼으로 넘긴다.
// RetroArch는 실제 키 이벤트를 직접 받지 않는다 (키 설정을 우리 UI에서 바꾸기 위해).
import { onGamepadFrame } from "../../player/gamepads";
import type { RetroButton, RetroSystem } from "./systems";

/** RetroArch 쪽 키 배치. pressDown/pressUp이 이 키로 바꿔서 코어에 넣는다 (사용자 키 설정과는 무관) */
export const RETROARCH_KEYS: Record<string, string> = {
  input_player1_up: "up",
  input_player1_down: "down",
  input_player1_left: "left",
  input_player1_right: "right",
  input_player1_a: "x",
  input_player1_b: "z",
  input_player1_x: "s",
  input_player1_y: "a",
  input_player1_l: "q",
  input_player1_r: "w",
  input_player1_select: "rshift",
  input_player1_start: "enter",
};

export const keyLabel = (code?: string) =>
  !code
    ? "없음"
    : code
        .replace(/^Key/, "")
        .replace(/^Digit/, "")
        .replace(/^Arrow(\w+)$/, (_, d: string) => ({ Up: "↑", Down: "↓", Left: "←", Right: "→" })[d] ?? d)
        .replace(/(Left|Right)$/, (s) => (s === "Left" ? " (왼쪽)" : " (오른쪽)"));

export type Input = ReturnType<typeof createInput>;

/** 여러 입력(키보드, 게임패드, 가상패드)이 같은 버튼을 눌러도 하나라도 누르고 있으면 눌린 상태로 둔다 */
export function createInput(send: (button: RetroButton, pressed: boolean) => void) {
  const held = new Map<RetroButton, Set<string>>();
  const set = (source: string, button: RetroButton, pressed: boolean) => {
    const s = held.get(button) ?? new Set<string>();
    held.set(button, s);
    const before = s.size > 0;
    if (pressed) s.add(source);
    else s.delete(source);
    if (before !== s.size > 0) send(button, s.size > 0);
  };
  const releaseAll = () => held.forEach((s, b) => s.size && (s.clear(), send(b, false)));
  return { set, releaseAll };
}

const STICK = 0.5;

/** 연결된 게임패드 입력을 버튼으로 넘긴다. 패드를 꽂고 아무 버튼이나 누르면 바로 된다 */
export function watchRetroGamepad(system: RetroSystem, input: Input): () => void {
  let last = new Set<string>(); // "pad0:a" 처럼 눌려 있던 것
  const send = (k: string, pressed: boolean) => {
    const [src, b] = k.split(":");
    input.set(src, b as RetroButton, pressed);
  };
  const stop = onGamepadFrame((pads) => {
    const now = new Set<string>();
    for (const pad of pads) {
      const [x = 0, y = 0] = pad.axes;
      const add = (b: RetroButton) => now.add(`pad${pad.index}:${b}`);
      for (const [i, b] of system.pad) if (pad.buttons[i]?.pressed) add(b);
      if (x < -STICK) add("left");
      if (x > STICK) add("right");
      if (y < -STICK) add("up");
      if (y > STICK) add("down");
    }
    // 바뀐 것만 보낸다. 패드가 빠지면 눌려 있던 버튼을 뗀다
    for (const k of last) if (!now.has(k)) send(k, false);
    for (const k of now) if (!last.has(k)) send(k, true);
    last = now;
  });
  return () => {
    stop();
    for (const k of last) send(k, false);
  };
}
