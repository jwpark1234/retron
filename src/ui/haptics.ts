// 버튼을 누를 때 짧은 진동 (휴대폰, 게임 메뉴의 조작에서 켜고 끈다).
// 안드로이드는 navigator.vibrate를 쓴다. 아이폰 사파리에는 vibrate가 없어서, iOS 18부터 스위치 모양 체크박스(<input switch>)를
// 누르면 나는 시스템 햅틱을 빌려 쓴다 (보이지 않는 스위치의 label을 대신 누른다). 그보다 옛 iOS에서는 아무 일도 없다.
import { touchDevice } from "../player/orientation";
import { getPrefs } from "./prefs";

// 12ms는 진동 모터가 다 돌기 전에 끝나 많은 안드로이드 폰에서 느껴지지 않았다
const TICK_MS = 25;
// 한 번 누름에 pointerdown·touchstart가 둘 다 와도 한 번만 떨리게
const DEDUPE_MS = 40;

// 손가락이 닿는 순간 떨어야 하는 게임 조작 (포인터 이벤트로만 움직여서 no-zoom.ts가 touchstart 기본 동작을 끈다)
const CONTROLS = ".trackpad, .vpad-dpad, .vpad-stick, .vkeys button, .vpad-btn";

// 아이폰 사파리에는 vibrate가 없다 → 스위치 햅틱을 쓴다
const IOS = typeof navigator.vibrate !== "function";

function iosTick() {
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

let last = 0;

/** 지금 한 번 진동. force: 설정이 꺼져 있어도 (설정을 켜는 순간 시험으로) */
export function haptic(force = false) {
  if (!touchDevice || (!force && !getPrefs().haptics)) return;
  const now = performance.now();
  if (now - last < DEDUPE_MS) return;
  last = now;
  try {
    if (IOS) iosTick();
    else navigator.vibrate(TICK_MS);
  } catch {
    // 진동을 못 내도 조작에는 지장이 없다
  }
}

/**
 * 모든 버튼과 게임 조작: 손가락이 닿는 순간 진동한다 (떼는 순간보다 실제 버튼 느낌에 가깝다).
 * pointerdown과 touchstart 둘 다에서 부른다. 게임 조작 위에서는 touchstart 기본 동작을 꺼 두는데(확대 막기),
 * 브라우저에 따라 어느 쪽을 사용자 조작으로 쳐 주는지 달라서 게임 안에서만 진동이 안 났다. 겹치면 한 번만 떤다.
 * 방향 패드는 방향이 바뀔 때도 스스로 부른다.
 * 아이폰은 손가락을 뗄 때(touchend) 떤다. 웹킷은 touchstart·pointerdown을 사용자 조작으로 쳐 주지 않아서 그때 누른 스위치는
 * 햅틱 없이 바뀌기만 하는 것으로 보인다 (아이폰에서 햅틱이 전혀 안 났다. 2026-10-20 기기에서 아직 확인 못 함). 누르는 순간의 느낌은 포기했다. 같은 까닭으로 아이폰에서는
 * 방향 패드의 방향 바뀜·트랙패드 길게 누르기 진동도 나지 않는다
 */
export function installHaptics() {
  if (!touchDevice) return;
  const onTouch = (e: Event) => {
    if ((e as PointerEvent).pointerType === "mouse") return;
    const target = (e.target as Element | null)?.closest?.(`button, label.pick, ${CONTROLS}`);
    if (target && !(target as HTMLButtonElement).disabled) haptic();
  };
  const opts = { capture: true, passive: true };
  if (IOS) return document.addEventListener("touchend", onTouch, opts);
  document.addEventListener("pointerdown", onTouch, opts);
  document.addEventListener("touchstart", onTouch, opts);
}
