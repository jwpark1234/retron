// 휴대폰 조작 버튼 크기·투명도(계정 메뉴)를 CSS 변수로 넘긴다. 가상패드·DOS 조작 CSS가 --ctl-scale, --ctl-opacity를 쓴다.
// 버튼 자리 계산(방향 패드 각도, 트랙패드)은 실제 그려진 크기를 읽으므로 따로 맞출 것이 없다.
import { getPrefs, onPrefsChange, type Prefs } from "./prefs";

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1);

function apply(p: Prefs) {
  const root = document.documentElement.style;
  root.setProperty("--ctl-scale", String(clamp(p.controlScale, 0.7, 1.4)));
  root.setProperty("--ctl-opacity", String(clamp(p.controlOpacity, 0.2, 1)));
}

export function applyControlStyle() {
  apply(getPrefs());
  onPrefsChange(apply);
}

export const CONTROL_SIZES = [
  { value: "0.85", label: "작게" },
  { value: "1", label: "보통" },
  { value: "1.15", label: "크게" },
];

export const CONTROL_OPACITIES = [
  { value: "1", label: "진하게" },
  { value: "0.7", label: "보통" },
  { value: "0.4", label: "흐리게" },
];
