// DOS 게임용 게임패드. 버튼은 DOS 키나 마우스 버튼으로, 스틱은 방향키나 마우스 커서로 보낸다.
import type { DosInput, PadAction } from "../../library/library";

// 표준 게임패드 배치(Standard Gamepad) 버튼 번호
export const PAD_BUTTONS: { index: number; label: string }[] = [
  { index: 0, label: "A" },
  { index: 1, label: "B" },
  { index: 2, label: "X" },
  { index: 3, label: "Y" },
  { index: 4, label: "LB" },
  { index: 5, label: "RB" },
  { index: 6, label: "LT" },
  { index: 7, label: "RT" },
  { index: 8, label: "Select" },
  { index: 9, label: "Start" },
  { index: 12, label: "십자 ↑" },
  { index: 13, label: "십자 ↓" },
  { index: 14, label: "십자 ←" },
  { index: 15, label: "십자 →" },
];

export const DEFAULT_PAD: Record<string, PadAction> = {
  0: 257, // A → Enter
  1: 256, // B → ESC
  2: 32, // X → Space
  3: 89, // Y → Y
  4: "mouse-right",
  5: "mouse-left",
  6: "mouse-right",
  7: "mouse-left",
  8: 256,
  9: 257,
  12: 265,
  13: 264,
  14: 263,
  15: 262,
};

const DEAD = 0.25;
const CURSOR_SPEED = 0.012; // 스틱을 끝까지 밀었을 때 프레임당 이동량 (화면 비율)

export interface PadTarget {
  key(key: number, pressed: boolean): void;
  mouseButton(button: 0 | 1, pressed: boolean): void;
  /** 커서를 (dx, dy)만큼 움직인다 (화면 비율) */
  moveCursor(dx: number, dy: number): void;
}

export function watchGamepad(input: DosInput | undefined, target: PadTarget): () => void {
  const pad = { ...DEFAULT_PAD, ...input?.pad };
  const leftStick = input?.leftStick ?? "arrows";
  const held = new Map<string, PadAction | null>(); // 누르고 있는 입력 → 보낸 동작
  let raf = 0;

  const fire = (id: string, action: PadAction, pressed: boolean) => {
    if (!!held.get(id) === pressed) return;
    held.set(id, pressed ? action : null);
    if (action === "mouse-left") target.mouseButton(0, pressed);
    else if (action === "mouse-right") target.mouseButton(1, pressed);
    else target.key(action, pressed);
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const gp = navigator.getGamepads?.().find((g) => g?.connected);
    if (!gp) return;
    for (const [index, action] of Object.entries(pad)) {
      fire(`b${index}`, action, !!gp.buttons[+index]?.pressed);
    }
    const [lx = 0, ly = 0, rx = 0, ry = 0] = gp.axes;
    if (leftStick === "arrows") {
      fire("l-left", 263, lx < -0.5);
      fire("l-right", 262, lx > 0.5);
      fire("l-up", 265, ly < -0.5);
      fire("l-down", 264, ly > 0.5);
    }
    let dx = 0;
    let dy = 0;
    for (const [x, y] of leftStick === "mouse" ? [[lx, ly], [rx, ry]] : [[rx, ry]]) {
      if (Math.hypot(x, y) > DEAD) {
        dx += x * CURSOR_SPEED;
        dy += y * CURSOR_SPEED;
      }
    }
    if (dx || dy) target.moveCursor(dx, dy);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    // 누르고 있던 것을 놓는다
    for (const [id, action] of held) if (action !== null) fire(id, action, false);
  };
}
