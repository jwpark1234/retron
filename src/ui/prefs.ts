// 사용자 설정 (화면 필터, 휴대폰 조작·햅틱, 키보드 설정, 업로드). 메뉴와 플레이어가 같이 구독하고 드라이브에도 저장한다.
import { useEffect, useState } from "preact/hooks";
import type { Platform } from "../library/library";
import type { RetroKeys } from "../platforms/retro/systems";

export type ScreenFilter = "sharp" | "smooth" | "crt";
export type StickStyle = "stick" | "dpad"; // 가상패드 방향 조작: 원형 패드 / 십자 패드
export type LibrarySort = "recent" | "name" | "added" | "platform"; // 라이브러리 정렬: 최근 플레이 / 이름 / 추가한 순 / 기종
export interface Prefs {
  filter: ScreenFilter;
  virtualPad: boolean; // SFC·GBA 가상패드 (터치 기기). 게임패드가 연결되면 저절로 숨긴다
  stickStyle: StickStyle;
  mouseSpeed: number; // DOS 트랙패드·게임패드 커서 감도 (배수)
  retroKeys: Partial<Record<Platform, RetroKeys>>; // 기종별 키보드 설정 (바꾼 버튼만). 그 기종 게임 모두에 같이 쓴다
  wifiOnlyUpload: boolean; // 게임 파일은 모바일 데이터로 올리지 않는다
  haptics: boolean; // 휴대폰: 버튼을 누를 때 짧은 진동
  controlScale: number; // 휴대폰 조작 버튼 크기 (배수)
  controlOpacity: number; // 휴대폰 조작 버튼 불투명도 (1 = 그대로)
  fastSpeed: number; // SFC·GBA 빨리가기 배속 (DOS Turbo는 배속을 정할 수 없어 최대 속도)
  librarySort: LibrarySort;
}

const KEY = "prefs";
const DEFAULTS: Prefs = {
  filter: "sharp",
  virtualPad: true,
  stickStyle: "stick",
  mouseSpeed: 1,
  retroKeys: {},
  wifiOnlyUpload: true,
  haptics: true,
  controlScale: 1,
  controlOpacity: 1,
  fastSpeed: 3,
  librarySort: "recent",
};

/** 예전 형식(sfcKeys)을 기종별 키 설정으로 옮기고, 깨진 값은 버린다. 드라이브에서 받은 설정에도 쓴다 */
function normalize(p: Partial<Prefs> & { sfcKeys?: RetroKeys; padSide?: unknown; dosLandscape?: unknown }): Partial<Prefs> {
  // padSide(트랙패드 위치)·dosLandscape(가로 배치)는 2026-10-20에 없앴다. 배치가 하나로 정해져 남은 값은 버린다
  const { sfcKeys, padSide: _side, dosLandscape: _order, ...rest } = p;
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

// 설정을 마지막으로 바꾼 시각. 기기와 드라이브 중 더 최근 것을 남기는 데 쓴다 (cloud/settings.ts)
const AT_KEY = "prefs-at";
export function prefsUpdatedAt(): number {
  try {
    return Number(localStorage.getItem(AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** remoteAt: 드라이브에서 받은 설정을 넣을 때 그 시각 (이 기기에서 바꾼 것으로 치지 않는다) */
export function setPrefs(patch: Partial<Prefs>, remoteAt?: number) {
  current = { ...current, ...normalize(patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
    localStorage.setItem(AT_KEY, String(remoteAt ?? Date.now()));
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
