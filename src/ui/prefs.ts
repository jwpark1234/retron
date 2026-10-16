// 사용자 설정 (화면 필터, 휴대폰 조작·배치·햅틱, 키보드 설정, 업로드). 메뉴와 플레이어가 같이 구독하고 드라이브에도 저장한다.
import { useEffect, useState } from "preact/hooks";
import type { Platform } from "../library/library";
import type { RetroKeys } from "../platforms/retro/systems";

export type ScreenFilter = "sharp" | "smooth" | "crt";
export type StickStyle = "stick" | "dpad"; // 가상패드 방향 조작: 원형 패드 / 십자 패드
export type PadSide = "left" | "right"; // DOS 세로 화면: 윗줄에서 트랙패드 위치 (방향 패드는 반대쪽)
export type DosSlot = "dpad" | "keys" | "pad"; // DOS 가로 화면: 아래 줄에 왼쪽부터 놓을 순서

export interface Prefs {
  filter: ScreenFilter;
  padSide: PadSide;
  virtualPad: boolean; // SFC·GBA 가상패드 (터치 기기). 게임패드가 연결되면 저절로 숨긴다
  stickStyle: StickStyle;
  dosLandscape: DosSlot[];
  mouseSpeed: number; // DOS 트랙패드·게임패드 커서 감도 (배수)
  retroKeys: Partial<Record<Platform, RetroKeys>>; // 기종별 키보드 설정 (바꾼 버튼만). 그 기종 게임 모두에 같이 쓴다
  wifiOnlyUpload: boolean; // 게임 파일은 모바일 데이터로 올리지 않는다
  haptics: boolean; // 휴대폰: 버튼을 누를 때 짧은 진동
  controlScale: number; // 휴대폰 조작 버튼 크기 (배수)
  controlOpacity: number; // 휴대폰 조작 버튼 불투명도 (1 = 그대로)
  fastSpeed: number; // SFC·GBA 빨리가기 배속 (DOS Turbo는 배속을 정할 수 없어 최대 속도)
}

const KEY = "prefs";
const DEFAULTS: Prefs = {
  filter: "sharp",
  padSide: "right",
  dosLandscape: ["dpad", "keys", "pad"],
  virtualPad: true,
  stickStyle: "stick",
  mouseSpeed: 1,
  retroKeys: {},
  wifiOnlyUpload: true,
  haptics: true,
  controlScale: 1,
  controlOpacity: 1,
  fastSpeed: 3,
};

/** 예전 형식(sfcKeys)을 기종별 키 설정으로 옮기고, 깨진 값은 버린다. 드라이브에서 받은 설정에도 쓴다 */
function normalize(p: Partial<Prefs> & { sfcKeys?: RetroKeys }): Partial<Prefs> {
  const { sfcKeys, ...rest } = p;
  // 가로 배치는 세 자리가 하나씩 있어야 한다 (예전 버전·다른 기기에서 온 값이 깨져 있으면 기본값)
  if (rest.dosLandscape && [...rest.dosLandscape].sort().join() !== "dpad,keys,pad") delete rest.dosLandscape;
  if (!sfcKeys || rest.retroKeys?.sfc) return rest;
  return { ...rest, retroKeys: { ...rest.retroKeys, sfc: sfcKeys } };
}

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...normalize(JSON.parse(localStorage.getItem(KEY) ?? "{}")) };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<(p: Prefs) => void>();

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...normalize(patch) };
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
