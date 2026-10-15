// DOS 휴대폰 조작: 키 버튼 영역 + 방향 패드(방향키) + 트랙패드(마우스), 가운데 아래 빠른 버튼·메뉴 버튼.
// 메뉴에는 트랙패드 위치, 방향 조작 모양, 키 버튼 고르기(전체 키보드 팝업), 마우스 감도가 들어간다.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { updateRemoteGame } from "../../cloud/games";
import { getGame, putGame, type Game } from "../../library/library";
import { DirectionPad, StickStyleRow, type Direction } from "../../player/DirectionPad";
import { MenuButton } from "../../player/MenuButton";
import { Row, Segmented } from "../../ui/controls";
import { setPrefs, usePrefs, type PadSide } from "../../ui/prefs";
import { dosKeyLabel } from "./create-dos";
import { ARROWS, isArrow, isWide, orderKeys } from "./keyboard";
import { KeyPicker } from "./KeyPicker";
import { Trackpad } from "./Trackpad";
import { VirtualKeys } from "./VirtualKeys";

const DEFAULT_KEYS = [256, 257, 32, 89, 78, ...ARROWS]; // ESC, Enter, Space, Y, N + 방향 패드
const DIR_KEY: Record<Direction, number> = { up: 265, down: 264, left: 263, right: 262 };

/** 화면에 보여 줄 키(방향키가 있으면 방향 패드). 게임마다 저장하고 드라이브에도 올린다 */
export function useVirtualKeys(game: Game) {
  const info = game.dos!;
  // 예전 vkeys에는 방향 패드가 없었으므로 붙여 준다
  const [keys, setKeys] = useState(info.touchKeys ?? (info.vkeys ? [...info.vkeys, ...ARROWS] : DEFAULT_KEYS));
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

export function DosTouchControls({
  keys,
  rotation,
  onKey,
  onMove,
  onButton,
  onMenu,
  quick,
}: {
  keys: number[];
  rotation: number;
  onKey: (key: number, pressed: boolean) => void;
  onMove: (dx: number, dy: number) => void;
  onButton: (button: 0 | 1, pressed: boolean) => void;
  onMenu: () => void;
  quick: ComponentChildren;
}) {
  const { padSide, stickStyle } = usePrefs();
  const buttons = orderKeys(keys.filter((k) => !isArrow(k)));
  const dpad = keys.some(isArrow);
  return (
    <div class={`vbar pad-${padSide} ${dpad ? "" : "no-dpad"}`}>
      {buttons.length > 0 && (
        <VirtualKeys keys={buttons.map((key) => ({ key, label: dosKeyLabel(key), wide: isWide(key) }))} cols={buttons.length <= 4 ? 2 : 3} onKey={onKey} />
      )}
      {dpad && <DirectionPad key={stickStyle} style={stickStyle} rotation={rotation} press={(_, dir, pressed) => onKey(DIR_KEY[dir], pressed)} />}
      <Trackpad rotation={rotation} onMove={onMove} onButton={onButton} />
      <div class="vbar-mid">
        {quick}
        <MenuButton onClick={onMenu} />
      </div>
    </div>
  );
}

const PAD_SIDES: { value: PadSide; label: string }[] = [
  { value: "left", label: "왼쪽" },
  { value: "right", label: "오른쪽" },
];

/** 게임 메뉴에 들어가는 휴대폰 설정 줄 */
export function DosTouchSettings({ keys, onChange, onReset }: { keys: number[]; onChange: (keys: number[]) => void; onReset: () => void }) {
  const { padSide } = usePrefs();
  const [picking, setPicking] = useState(false);
  const count = keys.filter((k) => !isArrow(k)).length;
  return (
    <>
      <Row label="트랙패드 위치">
        <Segmented value={padSide} options={PAD_SIDES} onChange={(v) => setPrefs({ padSide: v })} />
      </Row>
      {keys.some(isArrow) && <StickStyleRow />}
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
