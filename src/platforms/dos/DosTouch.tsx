// DOS 휴대폰 조작: 가상 키 + 트랙패드 + 빠른 버튼·메뉴 버튼, 그리고 메뉴의 "좌우 전환", "키 버튼 고르기", "마우스 감도".
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { updateRemoteGame } from "../../cloud/games";
import { getGame, putGame, type Game } from "../../library/library";
import { MenuButton } from "../../player/MenuButton";
import { Row, Segmented } from "../../ui/controls";
import { setPrefs, usePrefs } from "../../ui/prefs";
import { DOS_KEY_LIST, dosKeyLabel } from "./create-dos";
import { Trackpad } from "./Trackpad";
import { VirtualKeys } from "./VirtualKeys";

const DEFAULT_KEYS = [256, 257, 32, 89, 78]; // ESC, Enter, Space, Y, N

/** 화면에 보여 줄 키 버튼. 게임마다 저장하고 드라이브에도 올린다 */
export function useVirtualKeys(game: Game) {
  const [keys, setKeys] = useState(game.dos!.vkeys ?? DEFAULT_KEYS);
  const toggle = async (key: number) => {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    setKeys(next);
    const latest = await getGame(game.id);
    if (!latest?.dos) return;
    const updated = { ...latest, dos: { ...latest.dos, vkeys: next } };
    await putGame(updated);
    void updateRemoteGame(updated).catch(() => undefined);
  };
  return { keys, toggle };
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
  const { padSide } = usePrefs();
  return (
    <div class={`vbar pad-${padSide}`}>
      <VirtualKeys keys={keys.map((key) => ({ key, label: dosKeyLabel(key) }))} onKey={onKey} />
      <Trackpad rotation={rotation} onMove={onMove} onButton={onButton} />
      <div class="vbar-mid">
        {quick}
        <MenuButton onClick={onMenu} />
      </div>
    </div>
  );
}

/** 게임 메뉴에 들어가는 휴대폰 설정 줄 */
export function DosTouchSettings({ keys, onToggleKey }: { keys: number[]; onToggleKey: (key: number) => void }) {
  const { padSide } = usePrefs();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Row label="트랙패드 · 키 위치">
        <button class="glass small" onClick={() => setPrefs({ padSide: padSide === "left" ? "right" : "left" })}>
          좌우 전환
        </button>
      </Row>
      <Row label="키 버튼">
        <button class="glass small" onClick={() => setEditing(!editing)}>
          {editing ? "완료" : `${keys.length}개 · 고르기`}
        </button>
      </Row>
      {editing && (
        <div class="key-chips">
          {DOS_KEY_LIST.map((k) => (
            <button key={k.key} class={keys.includes(k.key) ? "on" : ""} onClick={() => onToggleKey(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
      )}
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
