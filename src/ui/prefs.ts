// 기기별 화면·소리 설정 (볼륨, 음소거, 화면 필터). 메뉴와 플레이어가 같이 구독한다.
import { useEffect, useState } from "preact/hooks";

export type ScreenFilter = "sharp" | "smooth" | "crt";
export type PadSide = "left" | "right"; // 터치 입력 막대에서 트랙패드 위치 (키는 반대쪽)

export interface Prefs {
  volume: number; // 0~1
  muted: boolean;
  filter: ScreenFilter;
  padSide: PadSide;
}

const KEY = "prefs";
const DEFAULTS: Prefs = { volume: 1, muted: false, filter: "sharp", padSide: "right" };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<(p: Prefs) => void>();

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // 이번 실행에서만 적용된다
  }
  listeners.forEach((l) => l(current));
}

export const getPrefs = () => current;

/** 설정이 바뀔 때마다 불린다 (드라이브 저장용) */
export function onPrefsChange(cb: (p: Prefs) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function usePrefs(): Prefs {
  const [p, setP] = useState(current);
  useEffect(() => {
    listeners.add(setP);
    return () => void listeners.delete(setP);
  }, []);
  return p;
}

export const effectiveVolume = (p: Prefs) => (p.muted ? 0 : p.volume);
