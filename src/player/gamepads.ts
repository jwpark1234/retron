// 게임패드: 브라우저는 패드 버튼을 한 번 눌러야 패드를 보여 주므로,
// 따로 "연결" 단계 없이 꽂고 아무 버튼이나 누르면 바로 쓸 수 있다.
import { useEffect, useState } from "preact/hooks";

/** 연결된 게임패드를 매 프레임 읽는다 */
export function onGamepadFrame(read: (pads: Gamepad[]) => void): () => void {
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    read(Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p?.connected));
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// 연결된 게임패드 이름 (메뉴에 보여 준다)
const first = () => Array.from(navigator.getGamepads?.() ?? []).find((p) => p)?.id ?? null;

export function useGamepad(): string | null {
  const [pad, setPad] = useState(first);
  useEffect(() => {
    const update = () => setPad(first());
    addEventListener("gamepadconnected", update);
    addEventListener("gamepaddisconnected", update);
    return () => {
      removeEventListener("gamepadconnected", update);
      removeEventListener("gamepaddisconnected", update);
    };
  }, []);
  return pad;
}

/** "Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)" → "Xbox 360 Controller" */
export const padName = (id: string) => id.replace(/\s*\(.*\)\s*$/, "").trim() || "게임패드";
