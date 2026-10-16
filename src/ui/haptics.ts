// 버튼을 누를 때 짧은 진동 (휴대폰, 계정 메뉴에서 켜고 끈다).
// 안드로이드는 navigator.vibrate를 쓴다. 아이폰 사파리에는 vibrate가 없어서, iOS 18부터 스위치 모양 체크박스(<input switch>)를
// 누르면 나는 시스템 햅틱을 빌려 쓴다 (보이지 않는 스위치의 label을 대신 누른다). 그보다 옛 iOS에서는 아무 일도 없다.
import { touchDevice } from "../player/orientation";
import { getPrefs } from "./prefs";

const TICK_MS = 12;

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

/** 지금 한 번 진동 (설정이 꺼져 있으면 아무것도 안 한다) */
export function haptic() {
  if (!touchDevice || !getPrefs().haptics) return;
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(TICK_MS);
    else iosTick();
  } catch {
    // 진동을 못 내도 조작에는 지장이 없다
  }
}

/**
 * 모든 버튼: 손가락이 닿는 순간 진동한다 (떼는 순간보다 실제 버튼 느낌에 가깝다).
 * 방향 패드와 트랙패드는 버튼이 아니라서 스스로 부른다 (방향이 바뀔 때, 클릭할 때)
 */
export function installHaptics() {
  if (!touchDevice) return;
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse") return;
      const target = e.target as Element | null;
      const button = target?.closest?.("button, label.pick");
      if (button && !(button as HTMLButtonElement).disabled) haptic();
    },
    { capture: true, passive: true },
  );
}
