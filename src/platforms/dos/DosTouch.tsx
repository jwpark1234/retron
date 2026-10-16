// DOS 휴대폰 조작: 방향 패드(방향키) + 트랙패드(마우스) + 키 버튼, 맨 윗줄에 Save·Load(왼쪽)와 빨리가기·메뉴(오른쪽).
// 세로 화면: 윗줄 방향 패드·트랙패드(좌우를 바꿀 수 있다), 아랫줄 키 버튼.
// 가로 화면: 화면 아래에 방향 패드, 키 버튼, 트랙패드를 한 줄로 놓고 세 자리의 순서를 바꿀 수 있다.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { updateRemoteGame } from "../../cloud/games";
import { getGame, putGame, type Game } from "../../library/library";
import { DirectionPad, type Direction } from "../../player/DirectionPad";
import { Row, Segmented } from "../../ui/controls";
import { setPrefs, usePrefs, type DosSlot, type PadSide } from "../../ui/prefs";
import { dosKeyLabel } from "./create-dos";
import { ARROWS, isArrow, isWide, orderKeys } from "./keyboard";
import { KeyPicker } from "./KeyPicker";
import { Trackpad } from "./Trackpad";
import { VirtualKeys } from "./VirtualKeys";

export const DEFAULT_KEYS = [256, 257, 32, 89, 78, ...ARROWS]; // ESC, Enter, Space, Y, N + 방향 패드
const DIR_KEY: Record<Direction, number> = { up: 265, down: 264, left: 263, right: 262 };

/** 이 게임의 화면 키 (예전 vkeys에는 방향 패드가 없었으므로 붙여 준다) */
export const touchKeysOf = (game: Game) => game.dos!.touchKeys ?? (game.dos!.vkeys ? [...game.dos!.vkeys, ...ARROWS] : DEFAULT_KEYS);

/** 화면에 보여 줄 키(방향키가 있으면 방향 패드). 게임마다 저장하고 드라이브에도 올린다 */
export function useVirtualKeys(game: Game) {
  const [keys, setKeys] = useState(() => touchKeysOf(game));
  const set = async (next: number[]) => {
    setKeys(next);
    const latest = await getGame(game.id);
    if (!latest?.dos) return;
    const updated = { ...latest, dos: { ...latest.dos, touchKeys: next } };
    await putGame(updated);
    void updateRemoteGame(updated).catch(() => undefined);
  };
  return { keys, set, reset: () => set(DEFAULT_KEYS) };
}

/**
 * 가로 화면 아래 줄의 자리(s0 왼쪽, s1 가운데, s2 오른쪽). 없는 것(방향키를 안 고름, 키 버튼 0개)은 빼고,
 * 둘만 있으면 양끝, 하나만 있으면 오른쪽에 둔다
 */
function landscapeAreas(order: DosSlot[], present: Record<DosSlot, boolean>): Partial<Record<DosSlot, number>> {
  const shown = order.filter((s) => present[s]);
  const pos = (i: number) => (shown.length === 3 ? i : shown.length === 2 ? i * 2 : 2);
  return Object.fromEntries(shown.map((s, i) => [s, pos(i)]));
}

export function DosTouchControls({
  keys,
  rotation,
  landscape,
  onKey,
  onMove,
  onButton,
  top,
}: {
  keys: number[];
  rotation: number;
  landscape: boolean;
  onKey: (key: number, pressed: boolean) => void;
  onMove: (dx: number, dy: number) => void;
  onButton: (button: 0 | 1, pressed: boolean) => void;
  top: ComponentChildren; // Save·Load, 빨리가기·메뉴 줄
}) {
  const { padSide, stickStyle, dosLandscape } = usePrefs();
  const buttons = orderKeys(keys.filter((k) => !isArrow(k)));
  const dpad = keys.some(isArrow);
  const at = landscape ? landscapeAreas(dosLandscape, { dpad, keys: buttons.length > 0, pad: true }) : {};
  const place = (slot: DosSlot) => (landscape ? { gridArea: `s${at[slot]}` } : undefined);
  const mid = (slot: DosSlot) => (at[slot] === 1 ? "mid" : "");
  return (
    <div class={`vbar ${landscape ? "land" : `pad-${padSide}`} ${dpad ? "" : "no-dpad"}`}>
      {top}
      {buttons.length > 0 && (
        <VirtualKeys
          class={mid("keys")}
          style={place("keys")}
          keys={buttons.map((key) => ({ key, label: dosKeyLabel(key), wide: isWide(key) }))}
          cols={landscape ? (buttons.length <= 4 ? 2 : 3) : 6}
          onKey={onKey}
        />
      )}
      {dpad && (
        <div class={`vbar-dpad ${mid("dpad")}`} style={place("dpad")}>
          <DirectionPad key={stickStyle} style={stickStyle} rotation={rotation} press={(_, dir, pressed) => onKey(DIR_KEY[dir], pressed)} />
        </div>
      )}
      <Trackpad class={mid("pad")} style={place("pad")} rotation={rotation} onMove={onMove} onButton={onButton} />
    </div>
  );
}

const PAD_SIDES: { value: PadSide; label: string }[] = [
  { value: "left", label: "왼쪽" },
  { value: "right", label: "오른쪽" },
];

const SLOT_LABEL: Record<DosSlot, string> = { dpad: "방향", keys: "키", pad: "트랙패드" };
/** "방향과", "키와": 받침이 있으면 과 */
const withGwa = (word: string) => word + ((word.charCodeAt(word.length - 1) - 0xac00) % 28 ? "과" : "와");

/** 가로 화면 배치: 하나를 누르고 다른 하나를 누르면 두 자리를 바꾼다 */
function LandscapeOrder() {
  const { dosLandscape } = usePrefs();
  const [picked, setPicked] = useState<number | null>(null);
  const tap = (i: number) => {
    if (picked === null) return setPicked(i);
    if (picked !== i) {
      const next = [...dosLandscape];
      [next[picked], next[i]] = [next[i], next[picked]];
      setPrefs({ dosLandscape: next });
    }
    setPicked(null);
  };
  return (
    <>
      <Row label="가로 배치">
        <div class="seg glass order" role="group" aria-label="가로 배치 (왼쪽부터)">
          {dosLandscape.map((slot, i) => (
            <button key={slot} class={picked === i ? "on" : ""} onClick={() => tap(i)}>
              {SLOT_LABEL[slot]}
            </button>
          ))}
        </div>
      </Row>
      <p class="row-hint">{picked === null ? "왼쪽부터 순서입니다. 두 개를 차례로 누르면 자리를 바꿉니다." : `${withGwa(SLOT_LABEL[dosLandscape[picked]])} 바꿀 자리를 누르세요.`}</p>
    </>
  );
}

/** 게임 메뉴에 들어가는 휴대폰 설정 줄. 지금 화면 방향의 배치만 보여 준다 */
export function DosTouchSettings({ keys, landscape, onChange, onReset }: { keys: number[]; landscape: boolean; onChange: (keys: number[]) => void; onReset: () => void }) {
  const { padSide } = usePrefs();
  const [picking, setPicking] = useState(false);
  const count = keys.filter((k) => !isArrow(k)).length;
  const dpad = keys.some(isArrow);
  return (
    <>
      {landscape ? (
        <LandscapeOrder />
      ) : (
        dpad && (
          <Row label="트랙패드 위치">
            <Segmented value={padSide} options={PAD_SIDES} onChange={(v) => setPrefs({ padSide: v })} />
          </Row>
        )
      )}
      <Row label="키 버튼">
        <button class="glass small" onClick={() => setPicking(true)}>
          {count}개 · 고르기
        </button>
      </Row>
      {picking && <KeyPicker keys={keys} onChange={onChange} onReset={onReset} onClose={() => setPicking(false)} />}
    </>
  );
}

const MOUSE_SPEEDS = [0.5, 0.75, 1, 1.5, 2].map((v) => ({ value: String(v), label: `${v}×` }));

/** 마우스 감도: 트랙패드와 게임패드 스틱으로 움직이는 커서 속도 (실제 마우스는 그대로) */
export function MouseSpeedSetting() {
  const { mouseSpeed } = usePrefs();
  return (
    <Row label="마우스 감도">
      <Segmented value={String(mouseSpeed)} options={MOUSE_SPEEDS} onChange={(v) => setPrefs({ mouseSpeed: +v })} />
    </Row>
  );
}
