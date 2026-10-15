// 휴대폰 키 버튼 고르기에 쓰는 전체 키보드 배치 (js-dos 키 번호). 고른 키는 키보드 위치 순서대로 키 버튼 영역에 놓는다.
// 방향키 넷은 하나로 묶어 방향 패드를 켜고 끈다.

export interface KbKey {
  key: number;
  label: string;
  w?: number; // 너비 (보통 키 = 1)
}
type Cell = KbKey | { gap: number };

export const ARROWS = [265, 264, 263, 262]; // ↑ ↓ ← →
export const isArrow = (key: number) => ARROWS.includes(key);

const k = (label: string, key: number, w?: number): KbKey => ({ label, key, w });
const chars = (s: string) => [...s].map((c) => k(c, c.charCodeAt(0)));
const gap = (w: number) => ({ gap: w });

/** 본체 여섯 줄. 줄마다 너비 합이 15 */
const MAIN: Cell[][] = [
  [k("ESC", 256), gap(1), ...[1, 2, 3, 4].map((n) => k(`F${n}`, 289 + n)), gap(0.5), ...[5, 6, 7, 8].map((n) => k(`F${n}`, 289 + n)), gap(0.5), ...[9, 10, 11, 12].map((n) => k(`F${n}`, 289 + n))],
  [k("`", 96), ...chars("1234567890-="), k("Backspace", 259, 2)],
  [k("Tab", 258, 1.5), ...chars("QWERTYUIOP[]"), k("\\", 92, 1.5)],
  [k("Caps", 280, 1.75), ...chars("ASDFGHJKL;'"), k("Enter", 257, 2.25)],
  [k("Shift", 340, 2.25), ...chars("ZXCVBNM,./"), k("Shift", 340, 2.75)],
  [k("Ctrl", 341, 1.5), gap(1), k("Alt", 342, 1.5), k("Space", 32, 7), k("Alt", 342, 1.5), gap(1), k("Ctrl", 341, 1.5)],
];

/** 오른쪽 편집키·방향키 묶음 (세 칸 너비). 첫 줄은 비운다 */
const SIDE: (KbKey | null)[][] = [
  [],
  [k("Ins", 260), k("Home", 268), k("PgUp", 266)],
  [k("Del", 261), k("End", 269), k("PgDn", 267)],
  [],
  [null, k("↑", 265), null],
  [k("←", 263), k("↓", 264), k("→", 262)],
];

export interface PlacedKey extends KbKey {
  row: number;
  col: number; // 1/4 키 단위 시작 칸 (1부터)
  span: number; // 1/4 키 단위 칸 수
}

const Q = 4; // 키 하나 = 4칸
export const KB_COLUMNS = 15 * Q + 2 + 3 * Q; // 본체 + 사이 띄움 + 오른쪽 묶음

/** 화면에 그릴 모든 키와 그 자리 */
export const KEYBOARD: PlacedKey[] = (() => {
  const out: PlacedKey[] = [];
  MAIN.forEach((cells, row) => {
    let col = 1;
    for (const c of cells) {
      const span = ("gap" in c ? c.gap : c.w ?? 1) * Q;
      if (!("gap" in c)) out.push({ ...c, row: row + 1, col, span });
      col += span;
    }
  });
  SIDE.forEach((cells, row) =>
    cells.forEach((c, i) => c && out.push({ ...c, row: row + 1, col: 15 * Q + 3 + i * Q, span: Q })),
  );
  return out;
})();

/** 키 버튼 영역에 놓을 순서: 키보드에서 처음 나오는 자리 순서 (위 줄부터, 왼쪽부터) */
export function orderKeys(keys: number[]): number[] {
  const pos = (key: number) => {
    const p = KEYBOARD.find((x) => x.key === key);
    return p ? p.row * 1000 + p.col : 1e9;
  };
  return [...new Set(keys)].sort((a, b) => pos(a) - pos(b));
}

/** 넓게 그릴 키 (키 버튼 영역에서 두 칸) */
export const isWide = (key: number) => [32, 257, 259].includes(key);
