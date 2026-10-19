// 화면 확대 막기 (핀치 줌, 두 번 탭 확대). 게임 조작 중 손가락이 겹치면 화면이 확대되어 버렸다.
// iOS 사파리는 viewport의 user-scalable=no를 무시하므로 제스처 이벤트를 직접 막는다.
// 두 번 탭 확대는 CSS(html의 touch-action: manipulation)가 막고, 그래도 확대되는 글자 영역은 아래에서 막는다.

const DOUBLE_TAP_MS = 500; // iOS는 300ms보다 느린 두 번 탭도 확대로 본다

// 포인터 이벤트로만 움직이는 게임 조작 (트랙패드, 방향 패드, 키 버튼, 가상패드 버튼).
// 이 위에서 시작한 터치는 브라우저 기본 동작(확대, 두 번 탭 확대, 스크롤)을 처음부터 끈다.
// 트랙패드를 빠르게 연달아 탭하면(더블 클릭) 사파리가 확대해 버렸다. click을 쓰는 버튼(Save·Load·메뉴)은 넣지 않는다
const CONTROLS = ".trackpad, .vpad-dpad, .vpad-stick, .vkeys, .vpad-face, .vpad-shoulders, .vpad-sys";

export function preventZoom() {
  const stop = (e: Event) => e.preventDefault();
  // 사파리 전용 핀치 이벤트
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(type, stop, { passive: false });
  document.addEventListener(
    "touchstart",
    (e) => {
      // 두 번째 손가락이 닿는 순간 막아야 핀치가 시작되지 않는다 (움직일 때 막으면 늦을 때가 있다)
      if (e.touches.length > 1 || (e.target as Element | null)?.closest?.(CONTROLS)) e.preventDefault();
    },
    { passive: false },
  );
  // 두 손가락 이상 움직임 (안드로이드·사파리 공통). 한 손가락 스크롤은 그대로 둔다
  document.addEventListener("touchmove", (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
  // 버튼·입력칸이 아닌 곳을 빠르게 두 번 탭하면 확대되는 것을 막는다 (버튼은 연타가 되어야 하므로 건드리지 않는다)
  let lastEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = e.timeStamp;
      const interactive = (e.target as Element | null)?.closest?.("button, input, select, textarea, label, a");
      if (!interactive && now - lastEnd < DOUBLE_TAP_MS) e.preventDefault();
      lastEnd = now;
    },
    { passive: false },
  );
}
