// 노트북 트랙패드처럼 쓰는 마우스: 끌면 커서가 움직이고, 탭=왼쪽 클릭, 길게 누르기=오른쪽 클릭.
import { useRef } from "preact/hooks";
import { rotateDelta } from "../../player/orientation";

const SPEED = 1 / 260; // 패드 위 260px을 움직이면 화면 끝에서 끝까지
const TAP_MS = 250;
const LONG_PRESS_MS = 500;
const SLOP = 8; // 이만큼 움직이면 클릭이 아니라 커서 이동으로 본다

export function Trackpad({
  rotation,
  onMove,
  onButton,
}: {
  rotation: number;
  onMove: (dx: number, dy: number) => void;
  onButton: (button: 0 | 1, pressed: boolean) => void;
}) {
  // 한 손가락만 쓴다. 다른 손가락은 무시한다
  const touch = useRef<{ id: number; x: number; y: number; start: number; moved: number; longPressed: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);

  const click = (b: 0 | 1) => {
    onButton(b, true);
    setTimeout(() => onButton(b, false), 80);
  };

  const down = (e: PointerEvent) => {
    e.preventDefault();
    if (touch.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const t = { id: e.pointerId, x: e.clientX, y: e.clientY, start: performance.now(), moved: 0, longPressed: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    t.timer = setTimeout(() => {
      if (t.moved >= SLOP) return;
      t.longPressed = true;
      click(1);
    }, LONG_PRESS_MS);
    touch.current = t;
  };
  const move = (e: PointerEvent) => {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    t.moved += Math.abs(dx) + Math.abs(dy);
    const d = rotateDelta(dx, dy, rotation);
    onMove(d.dx * SPEED, d.dy * SPEED);
  };
  const end = (e: PointerEvent, cancelled: boolean) => {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    clearTimeout(t.timer);
    touch.current = null;
    if (!cancelled && !t.longPressed && t.moved < SLOP && performance.now() - t.start < TAP_MS) click(0);
  };

  return (
    <div class="trackpad">
      <div
        class="pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        aria-label="트랙패드: 탭은 왼쪽 클릭, 길게 누르면 오른쪽 클릭"
      >
        <span>트랙패드</span>
      </div>
    </div>
  );
}
