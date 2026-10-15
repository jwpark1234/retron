// SFC·GBA 설정: 키보드 설정(PC, 기종마다 그 기종 게임 모두에 공통)과 가상패드 켜고 끄기(휴대폰). 키 입력도 여기서 받는다.
import { useEffect, useRef, useState } from "preact/hooks";
import { ON_OFF, Row, Segmented } from "../../ui/controls";
import { StickStyleRow } from "../../player/DirectionPad";
import { getPrefs, setPrefs, usePrefs } from "../../ui/prefs";
import { keyLabel, type Input } from "./input";
import type { RetroButton, RetroKeys, RetroSystem } from "./systems";

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

/** 이 기종의 지금 키 배치 (기본값 + 바꾼 것) */
const keysOf = (system: RetroSystem, all = getPrefs().retroKeys): RetroKeys => ({ ...system.defaultKeys, ...all[system.platform] });

function saveKeys(system: RetroSystem, changed: RetroKeys) {
  setPrefs({ retroKeys: { ...getPrefs().retroKeys, [system.platform]: changed } });
}

/** 누른 키를 버튼에 넣는다. 다른 버튼에 같은 키가 있으면 그쪽은 비운다 */
function assignKey(system: RetroSystem, button: RetroButton, code: string) {
  const changed: RetroKeys = { ...getPrefs().retroKeys[system.platform], [button]: code };
  const now = keysOf(system);
  for (const { button: b } of system.buttons) if (b !== button && now[b] === code) changed[b] = "";
  saveKeys(system, changed);
}

/**
 * 키보드 → 버튼. 키 설정 중(capturing)이면 누른 키를 그 버튼에 넣는다 (ESC는 취소).
 * 돌려주는 값으로 키 설정 대기를 시작하거나 끝낸다.
 */
export function useRetroKeyboard(system: RetroSystem, input: Input) {
  const [capturing, setCapturing] = useState<RetroButton | null>(null);
  const ref = useRef(capturing);
  ref.current = capturing;

  useEffect(() => {
    const onKey = (pressed: boolean) => (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (ref.current) {
        if (!pressed) return;
        e.preventDefault();
        if (e.code !== "Escape") assignKey(system, ref.current, e.code);
        setCapturing(null);
        return;
      }
      const keys = keysOf(system);
      const hit = system.buttons.find(({ button }) => keys[button] === e.code);
      if (!hit) return;
      e.preventDefault();
      input.set("key", hit.button, pressed);
    };
    const down = onKey(true);
    const up = onKey(false);
    const blur = () => input.releaseAll(); // 다른 창으로 가면 눌린 키가 남지 않게
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
    };
  }, []);

  return { capturing, setCapturing };
}

export function KeySettings({ system, capturing, onCapture }: { system: RetroSystem; capturing: RetroButton | null; onCapture: (b: RetroButton | null) => void }) {
  const { retroKeys } = usePrefs();
  const keys = keysOf(system, retroKeys);
  return (
    <>
      <Row label="키보드 설정" />
      <div class="key-map">
        {system.buttons.map(({ button, label }) => (
          <button key={button} class={capturing === button ? "waiting" : ""} onClick={() => onCapture(capturing === button ? null : button)}>
            <span>{label}</span>
            <kbd>{capturing === button ? "키를 누르세요" : keyLabel(keys[button])}</kbd>
          </button>
        ))}
        {Object.keys(retroKeys[system.platform] ?? {}).length > 0 && (
          <button class="reset" onClick={() => saveKeys(system, {})}>
            기본값으로
          </button>
        )}
      </div>
    </>
  );
}

/** 휴대폰: 가상패드 켜고 끄기, 방향 조작 고르기. 게임패드가 연결돼 있으면 가상패드는 저절로 숨는다 */
export function VirtualPadSetting({ gamepad }: { gamepad: boolean }) {
  const { virtualPad } = usePrefs();
  return (
    <>
      <Row label="가상패드">
        {gamepad ? <small>게임패드 사용 중</small> : <Segmented value={virtualPad ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => setPrefs({ virtualPad: v === "on" })} />}
      </Row>
      {!gamepad && virtualPad && (
        <StickStyleRow />
      )}
    </>
  );
}
