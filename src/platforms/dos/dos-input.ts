// DOS 마우스·키보드: 실제 마우스는 화면 위 절대 좌표로, 키는 DOS 키로 바꿔서 보낸다.
// 터치는 여기서 받지 않는다 (트랙패드와 가상 키가 맡는다).
import type { CommandInterface } from "emulators";
import { useEffect, type MutableRef } from "preact/hooks";
import { toLocal } from "../../player/orientation";
import { getPrefs } from "../../ui/prefs";
import { toDosKey } from "./create-dos";

const MIN_PRESS_MS = 80; // 아주 빠른 클릭은 게임이 버튼 상태를 읽기 전에 끝나버리므로 최소한 누른 상태를 유지한다
const isUi = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest(".vbar, .floating-bar, .menu-backdrop");

export type Cursor = { x: number; y: number }; // 0~1 화면 비율. 마우스·트랙패드·게임패드가 같이 쓴다

/**
 * 커서를 (dx, dy)만큼 옮긴다 (화면 비율). 트랙패드·게임패드가 쓰므로 마우스 감도를 여기서 곱한다.
 * 절대 좌표(sendMouseMotion)가 아니라 이동량(sendMouseRelativeMotion)으로 보낸다: 창세기전2처럼 마우스 드라이버의
 * 이동량(mickey)만 읽는 게임은 절대 좌표로 옮기면 클릭은 되는데 커서가 움직이지 않았다. 이동량은 모든 게임이 받는다.
 * 대신 게임 안 커서와 cursor(0~1)가 어긋날 수 있다 (cursor는 실제 마우스가 다시 덮어쓴다)
 */
export function nudgeCursor(cursor: Cursor, ci: CommandInterface | null, dx: number, dy: number) {
  const k = getPrefs().mouseSpeed;
  dx *= k;
  dy *= k;
  cursor.x = Math.min(1, Math.max(0, cursor.x + dx));
  cursor.y = Math.min(1, Math.max(0, cursor.y + dy));
  if (ci) ci.sendMouseRelativeMotion(dx * ci.width(), dy * ci.height());
}

export function useDosMouseKeyboard({
  stage,
  canvas,
  ci,
  cursor,
  rotation,
}: {
  stage: MutableRef<HTMLElement | null>;
  canvas: MutableRef<HTMLCanvasElement | null>;
  ci: MutableRef<CommandInterface | null>;
  cursor: MutableRef<Cursor>;
  rotation: MutableRef<number>;
}) {
  useEffect(() => {
    const el = stage.current!;
    const isMouse = (e: PointerEvent) => e.pointerType === "mouse" && !isUi(e.target);
    const move = (e: PointerEvent) => {
      if (!isMouse(e)) return;
      cursor.current = toLocal(e, canvas.current!.getBoundingClientRect(), rotation.current);
      ci.current?.sendMouseMotion(cursor.current.x, cursor.current.y);
    };
    let pressedAt = 0;
    const down = (e: PointerEvent) => {
      if (!isMouse(e)) return;
      move(e);
      pressedAt = performance.now();
      ci.current?.sendMouseButton(e.button === 2 ? 1 : 0, true);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const button = e.button === 2 ? 1 : 0;
      const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - pressedAt));
      setTimeout(() => ci.current?.sendMouseButton(button, false), wait);
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
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("contextmenu", noMenu);
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("contextmenu", noMenu);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
    };
  }, []);
}
