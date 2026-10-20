// 화면 방향: 가로 / 세로 (휴대폰만).
// 안드로이드는 전체화면 + screen.orientation.lock으로 실제로 돌리고,
// 안 되는 곳(아이폰)은 게임 화면을 CSS로 90도 돌린다.
// "자동"은 없앴다: 기기를 돌릴 때마다 조작 배치가 바뀌어 손이 헤맸다. 처음엔 지금 기기 방향으로 시작한다.
import { useEffect, useState } from "preact/hooks";

export type OrientationMode = "landscape" | "portrait";

const KEY = "orientation";

/**
 * 휴대폰·태블릿 (손가락이 주 입력이고 마우스 커서가 없다). 화면 방향, 가상패드, 트랙패드, 키 버튼은 여기서만 보여 준다.
 * 터치스크린 노트북은 마우스·키보드가 있으므로 PC로 본다 (pointer: coarse만 보면 휴대폰 조작이 떴다)
 */
export const touchDevice = matchMedia("(hover: none) and (pointer: coarse)").matches;

const deviceMode = (): OrientationMode => (innerHeight > innerWidth ? "portrait" : "landscape");

function load(): OrientationMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "landscape" || v === "portrait" ? v : deviceMode();
  } catch {
    return deviceMode();
  }
}

async function tryLock(mode: OrientationMode) {
  const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (!so?.lock || !touchDevice) return;
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

  // PC는 창 모양 그대로 쓴다 (세로로 긴 창이어도 돌리지 않는다)
  const rotation = !touchDevice ? 0 : mode === "landscape" && portrait ? 90 : mode === "portrait" && !portrait ? -90 : 0;
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
// 돌린 화면의 위·오른쪽·아래·왼쪽이 기기의 어느 변인지. env(safe-area-inset-*)는 늘 기기 기준이라
// 그대로 쓰면 가로로 돌린 화면에서 노치·홈 막대(기기의 위아래)를 피하지 못하고 엉뚱한 변에 여백이 생겼다
const SIDES = ["top", "right", "bottom", "left"] as const;
const safeVars = (rotation: number) =>
  Object.fromEntries(SIDES.map((side, i) => [`--safe-${side}`, `env(safe-area-inset-${SIDES[(i + (rotation === 90 ? 1 : 3)) % 4]})`]));

/**
 * 기기 방향과 원하는 방향이 다를 때 게임 화면 전체(메뉴 포함)를 90도 돌린다.
 * 돌리지 않을 때도 빈 style이 아니라 undefined를 돌려주지만, 한 번 돌렸다 풀면 Preact가 style=""를 남기므로
 * CSS에서 [style]로 회전 여부를 가리면 안 된다 (세로로 돌아왔을 때 위 노치 여백이 사라졌다)
 */
export function rotatedStyle(rotation: number): Record<string, string> | undefined {
  if (!rotation) return undefined;
  return {
    inset: "auto",
    left: "50%",
    top: "50%",
    width: "100vh",
    height: "100vw",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    // 90: 세로로 든 기기에서 가로 화면 → 게임은 가운데. -90: 가로로 든 기기에서 세로 화면 → 게임은 위
    justifyContent: rotation === 90 ? "center" : "flex-start",
    ...safeVars(rotation),
  };
}
