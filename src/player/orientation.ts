// 화면 방향: 자동 / 가로 / 세로.
// 안드로이드는 전체화면 + screen.orientation.lock으로 실제로 돌리고,
// 안 되는 곳(아이폰, PC)은 게임 화면을 CSS로 90도 돌린다.
import { useEffect, useState } from "preact/hooks";

export type OrientationMode = "auto" | "landscape" | "portrait";

const KEY = "orientation";

/** 휴대폰·태블릿 (손가락이 주 입력). 화면 방향, 가상 키, 트랙패드는 여기서만 보여 준다 */
export const touchDevice = matchMedia("(pointer: coarse)").matches;

function load(): OrientationMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "landscape" || v === "portrait" ? v : "auto";
  } catch {
    return "auto";
  }
}

async function tryLock(mode: OrientationMode) {
  const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (mode === "auto") {
    so.unlock?.();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    return;
  }
  if (!so.lock || !touchDevice) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    await so.lock(mode);
  } catch {
    // 지원하지 않으면 CSS 회전으로 처리한다
  }
}

/** 게임 화면에 적용할 회전 각도(0, 90, -90) */
export function useOrientation() {
  const [mode, setModeState] = useState<OrientationMode>(load);
  const [portrait, setPortrait] = useState(() => innerHeight > innerWidth);

  useEffect(() => {
    const onResize = () => setPortrait(innerHeight > innerWidth);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  const setMode = (m: OrientationMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // 이번 실행에서만 적용된다
    }
    void tryLock(m);
  };

  const rotation = mode === "landscape" && portrait ? 90 : mode === "portrait" && !portrait ? -90 : 0;
  return { mode, setMode, rotation };
}

/** 회전된 화면에서 손가락 이동 방향(화면 기준)을 게임 기준으로 돌린다 */
export function rotateDelta(dx: number, dy: number, rotation: number) {
  if (rotation === 90) return { dx: dy, dy: -dx };
  if (rotation === -90) return { dx: -dy, dy: dx };
  return { dx, dy };
}

/** 회전된 화면에서 포인터 좌표를 게임 기준 0~1 좌표로 바꾼다 */
export function toLocal(e: { clientX: number; clientY: number }, r: DOMRect, rotation: number) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  if (rotation === 90) return { x: clamp(fy), y: clamp(1 - fx) };
  if (rotation === -90) return { x: clamp(1 - fy), y: clamp(fx) };
  return { x: clamp(fx), y: clamp(fy) };
}
/** 기기 방향과 원하는 방향이 다를 때 게임 화면 전체(메뉴 포함)를 90도 돌린다 */
export function rotatedStyle(rotation: number): Record<string, string> | undefined {
  if (!rotation) return undefined;
  return {
    inset: "auto",
    left: "50%",
    top: "50%",
    width: "100vh",
    height: "100vw",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
}
