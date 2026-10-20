// DOS 휴대폰 조작: 방향 패드(방향키) + 트랙패드(마우스, 게임마다 끌 수 있다) + 키 버튼, Save·Load(왼쪽)와 빨리가기·메뉴(오른쪽).
// 세로 화면: 조작 영역 맨 위에 Save·Load / 빨리가기·메뉴 줄, 화면 아래에 방향 패드·트랙패드 줄과 키 버튼 줄.
//   트랙패드를 끄면 방향 패드 옆(오른쪽)에 키 버튼을 놓는다.
// 가로 화면: 화면 위 양끝에 Save·Load / 빨리가기·메뉴, 화면 아래 왼쪽에 방향 패드, 오른쪽에 키 버튼·트랙패드.
// 예전에는 세로 화면 트랙패드 위치·가로 화면 순서를 고를 수 있었는데, 왼손 방향·오른손 버튼으로 하나만 남겼다 (2026-10-20 사용자 요청)
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { updateRemoteGame } from "../../cloud/games";
import { getGame, putGame, type DosInfo, type Game } from "../../library/library";
import { DirectionPad, type Direction } from "../../player/DirectionPad";
import { ON_OFF, Row, Segmented } from "../../ui/controls";
import { setPrefs, usePrefs } from "../../ui/prefs";
import { dosKeyLabel } from "./create-dos";
import { ARROWS, NUM_ARROWS, isArrow, isWide, orderKeys } from "./keyboard";
import { KeyPicker } from "./KeyPicker";
import { Trackpad } from "./Trackpad";
import { VirtualKeys } from "./VirtualKeys";

export const DEFAULT_KEYS = [256, 257, 32, ...ARROWS]; // ESC, Enter, Space + 방향 패드
const DIRS: Direction[] = ["up", "down", "left", "right"]; // ARROWS·NUM_ARROWS와 같은 순서

/** 방향 패드가 누를 키: 고른 묶음(방향키, 키패드 8·2·4·6) 모두. 둘 다 켰으면 둘 다 누른다 */
const dirKeys = (keys: number[], dir: Direction) =>
  [ARROWS, NUM_ARROWS].filter((g) => g.some((k) => keys.includes(k))).map((g) => g[DIRS.indexOf(dir)]);

/** 이 게임의 화면 키 (예전 vkeys에는 방향 패드가 없었으므로 붙여 준다) */
export const touchKeysOf = (game: Game) => game.dos!.touchKeys ?? (game.dos!.vkeys ? [...game.dos!.vkeys, ...ARROWS] : DEFAULT_KEYS);

/**
 * 화면에 보여 줄 키(방향키가 있으면 방향 패드)와 트랙패드 켜고 끄기. 게임마다 저장하고 드라이브에도 올린다
 * (마우스를 안 쓰는 게임만 끄면 되므로 모든 게임 공통 설정이 아니라 게임마다 둔다)
 */
export function useTouchLayout(game: Game) {
  const [keys, setKeys] = useState(() => touchKeysOf(game));
  const [trackpad, setTrackpadState] = useState(() => game.dos!.trackpad !== false);
  const save = async (patch: Partial<DosInfo>) => {
    const latest = await getGame(game.id);
    if (!latest?.dos) return;
    const updated = { ...latest, dos: { ...latest.dos, ...patch } };
    await putGame(updated);
    void updateRemoteGame(updated).catch(() => undefined);
  };
  const set = (next: number[]) => {
    setKeys(next);
    return save({ touchKeys: next });
  };
  return {
    keys,
    set,
    reset: () => set(DEFAULT_KEYS),
    trackpad,
    setTrackpad: (on: boolean) => {
      setTrackpadState(on);
      return save({ trackpad: on });
    },
  };
}

export function DosTouchControls({
  keys,
  trackpad,
  rotation,
  landscape,
  onKey,
  onMove,
  onButton,
  top,
}: {
  keys: number[];
  trackpad: boolean;
  rotation: number;
  landscape: boolean;
  onKey: (key: number, pressed: boolean) => void;
  onMove: (dx: number, dy: number) => void;
  onButton: (button: 0 | 1, pressed: boolean) => void;
  top: ComponentChildren; // Save·Load, 빨리가기·메뉴 줄
}) {
  const { stickStyle } = usePrefs();
  const buttons = orderKeys(keys.filter((k) => !isArrow(k)));
  const dpad = keys.some(isArrow);
  // 세로 화면에서 트랙패드를 끄면 키 버튼이 방향 패드 옆 좁은 자리로 온다
  const cols = landscape ? (buttons.length <= 4 ? 2 : 3) : !trackpad && dpad ? 3 : 6;
  return (
    <div class={`vbar ${landscape ? "land" : ""} ${dpad ? "" : "no-dpad"} ${trackpad ? "" : "no-pad"}`}>
      {top}
      {buttons.length > 0 && <VirtualKeys keys={buttons.map((key) => ({ key, label: dosKeyLabel(key), wide: isWide(key) }))} cols={cols} onKey={onKey} />}
      {dpad && (
        <div class="vbar-dpad">
          <DirectionPad key={stickStyle} style={stickStyle} rotation={rotation} press={(_, dir, pressed) => dirKeys(keys, dir).forEach((k) => onKey(k, pressed))} />
        </div>
      )}
      {trackpad && <Trackpad rotation={rotation} onMove={onMove} onButton={onButton} />}
    </div>
  );
}

/** 게임 메뉴 → 조작에 들어가는 DOS 휴대폰 설정 줄 */
export function DosTouchSettings({
  keys,
  trackpad,
  onChange,
  onReset,
  onTrackpad,
}: {
  keys: number[];
  trackpad: boolean;
  onChange: (keys: number[]) => void;
  onReset: () => void;
  onTrackpad: (on: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const count = keys.filter((k) => !isArrow(k)).length;
  return (
    <>
      <Row label="트랙패드">
        <Segmented value={trackpad ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => onTrackpad(v === "on")} label="트랙패드" />
      </Row>
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

/** 마우스 감도: 트랙패드와 게임패드 스틱으로 움직이는 커서 속도 (휴대폰만. PC는 실제 마우스를 쓴다) */
export function MouseSpeedSetting() {
  const { mouseSpeed } = usePrefs();
  return (
    <Row label="마우스 감도">
      <Segmented value={String(mouseSpeed)} options={MOUSE_SPEEDS} onChange={(v) => setPrefs({ mouseSpeed: +v })} />
    </Row>
  );
}
