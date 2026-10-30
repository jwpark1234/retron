// 버튼을 누를 때 짧은 진동 (휴대폰, 게임 메뉴의 조작에서 켜고 끈다).
// 안드로이드는 navigator.vibrate를 쓴다. 아이폰 사파리에는 vibrate가 없어서 스위치 모양 체크박스(<input switch>)가
// 켜지고 꺼질 때 나는 시스템 햅틱을 빌려 쓴다 (iOS 17.4부터). iOS 26.5부터는 스크립트로 누른 스위치는 떨지 않고
// 손가락이 직접 누른 스위치만 떤다: 게임 화면의 버튼마다 보이지 않는 스위치를 덮어서 손가락이 그것을 누르게 한다.
import { touchDevice } from "../player/orientation";
import { getPrefs, onPrefsChange } from "./prefs";

// 12ms는 진동 모터가 다 돌기 전에 끝나 많은 안드로이드 폰에서 느껴지지 않았다
const TICK_MS = 25;
// 한 번 누름에 pointerdown·touchstart가 둘 다 와도 한 번만 떨리게
const DEDUPE_MS = 40;

// 손가락이 닿는 순간 떨어야 하는 게임 조작 (포인터 이벤트로만 움직여서 no-zoom.ts가 touchstart 기본 동작을 끈다)
const CONTROLS = ".trackpad, .vpad-dpad, .vpad-stick, .vkeys button, .vpad-btn";

// 아이폰 사파리에는 vibrate가 없다 → 스위치 햅틱을 쓴다
const IOS = typeof navigator.vibrate !== "function";

/** 스크립트로 스위치를 누른다. iOS 26.4까지만 떤다 (방향 패드의 방향 바뀜처럼 탭이 아닌 때에 쓴다) */
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
 * 아이폰은 installSwitches: 손가락이 버튼 위의 스위치를 직접 눌러야 떨어서, 스위치가 켜지고 꺼지는 손을 뗄 때(탭) 떤다
 */
export function installHaptics() {
  if (!touchDevice) return;
  if (IOS) return installSwitches();
  const onTouch = (e: Event) => {
    if ((e as PointerEvent).pointerType === "mouse") return;
    const target = (e.target as Element | null)?.closest?.(`button, label.pick, ${CONTROLS}`);
    if (target && !(target as HTMLButtonElement).disabled) haptic();
  };
  const opts = { capture: true, passive: true };
  document.addEventListener("pointerdown", onTouch, opts);
  document.addEventListener("touchstart", onTouch, opts);
}

// 보이지 않는 스위치를 덮을 곳: 게임 화면의 버튼 (가상패드·키 버튼·윗줄·게임 메뉴).
// 방향 패드·스틱·트랙패드는 끌면서 쓰는데 스위치는 끌면 손잡이를 옮기는 동작을 해서 덮지 않는다 (아이폰에서는 그 셋은 떨지 않는다)
const SWITCH_TARGETS = ".game button";

function addSwitch(el: HTMLElement) {
  if (el.lastElementChild?.classList.contains("haptic-switch")) return;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // 스위치 모양이어야 햅틱이 난다 (모양을 지우면 안 난다: 투명하게만 한다)
  input.className = "haptic-switch";
  input.tabIndex = -1;
  input.ariaHidden = "true";
  input.addEventListener("focus", () => input.blur()); // 블루투스 키보드의 스페이스가 스위치를 바꾸지 않게 (게임 키로 가야 한다)
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.append(input);
}

/**
 * 아이폰: 게임 화면의 버튼마다 맨 위에 투명한 스위치를 깐다 (style.css .haptic-switch). 손가락이 스위치를 누르면 iOS가 떨고,
 * 누름은 그대로 버튼으로 올라간다 (pointerdown·click). no-zoom.ts는 스위치 위의 touchstart를 막지 않는다 (막으면 스위치가 안 바뀐다).
 * 버튼이 새로 생길 때마다 붙인다. 햅틱을 끄면 스위치를 숨긴다 (html.no-haptics)
 */
function installSwitches() {
  const sync = () => document.documentElement.classList.toggle("no-haptics", !getPrefs().haptics);
  sync();
  onPrefsChange(sync);
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll<HTMLElement>(SWITCH_TARGETS).forEach(addSwitch);
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
}
