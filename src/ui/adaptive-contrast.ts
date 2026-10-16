// 리퀴드 글래스 글자색을 뒤 배경 밝기에 맞춘다. 반투명 유리에 흰 글자라서 밝은 화면(게임 화면, 밝은 썸네일) 위에서는 글자가 안 보였다.
// 뒤가 밝으면 유리를 밝게, 글자를 검게(.on-light) 바꾸고, 어두워지면 되돌린다.
//
// 브라우저는 "요소 뒤에 그려진 픽셀"을 알려 주지 않으므로, 뒤에 올 수 있는 것들이 스스로 밝기를 알려 준다(LumaSource):
// 게임 화면(useCanvasLuma), 라이브러리 썸네일(thumbLuma). 그 밖의 곳은 앱 배경(거의 검정)으로 본다.
// 게임 중에는 메인 스레드를 오래 잡으면 안 되므로(DOS 에뮬레이터가 메인 스레드와 계속 주고받는다), 작은 격자(32×24)로만 잰다.

/** rect(화면 좌표) 뒤의 평균 밝기(0~1)와, rect 중 그것이 덮는 비율(0~1). 겹치지 않으면 null */
export type LumaSource = (rect: DOMRect) => { luma: number; cover: number } | null;

const SELECTOR = "header.glass, .more, .toast, .vpad-btn, .vkeys button, .vpad-dpad, .vpad-stick, .floating-bar .quick";
const BACKGROUND = 0.03; // 앱 배경 (#07070c, 게임 바깥 검정)
const ON = 0.56; // 이보다 밝아지면 밝은 유리로
const OFF = 0.44; // 이보다 어두워지면 되돌린다 (경계에서 깜빡이지 않게)
const EVERY_MS = 400;

const sources = new Set<LumaSource>();
let timer: ReturnType<typeof setInterval> | undefined;

function update() {
  for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    let sum = 0;
    let cover = 0;
    for (const s of sources) {
      const v = s(r);
      if (!v || v.cover <= 0) continue;
      const c = Math.min(v.cover, 1 - cover); // 겹친 소스는 먼저 것부터 채운다
      sum += v.luma * c;
      cover += c;
      if (cover >= 1) break;
    }
    const luma = sum + BACKGROUND * (1 - cover);
    const wasLight = el.classList.contains("on-light");
    const light = wasLight ? luma > OFF : luma > ON;
    if (light !== wasLight) el.classList.toggle("on-light", light);
  }
}

/** 밝기를 알려 줄 것을 붙인다. 돌려주는 함수로 뗀다 */
export function addLumaSource(source: LumaSource): () => void {
  sources.add(source);
  timer ??= setInterval(update, EVERY_MS);
  addEventListener("scroll", update, { passive: true });
  return () => {
    sources.delete(source);
    if (sources.size) return;
    clearInterval(timer);
    timer = undefined;
    removeEventListener("scroll", update);
    for (const el of document.querySelectorAll(".on-light")) el.classList.remove("on-light");
  };
}

/** 사람 눈 기준 밝기 (sRGB 근사) */
export const lumaOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** 두 사각형이 겹치는 넓이 */
export function overlap(a: DOMRect, b: DOMRect) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), width: w, height: h, area: w * h } : null;
}
