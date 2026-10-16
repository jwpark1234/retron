// 화면 확대 막기 (핀치 줌, 두 번 탭 확대). 게임 조작 중 손가락이 겹치면 화면이 확대되어 버렸다.
// iOS 사파리는 viewport의 user-scalable=no를 무시하므로 제스처 이벤트를 직접 막는다.
// 두 번 탭 확대는 CSS(html의 touch-action: manipulation)가 막고, 그래도 확대되는 글자 영역은 아래에서 막는다.

const DOUBLE_TAP_MS = 300;

export function preventZoom() {
  const stop = (e: Event) => e.preventDefault();
  // 사파리 전용 핀치 이벤트
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(type, stop, { passive: false });
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
