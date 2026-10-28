// SFC·GBA·N64 설정: 키보드 설정(PC. 패드 그림 팝업에서 버튼마다 바꾼다. 기본 배치가 있고 기종마다 그 기종 게임 모두에 공통)과 가상패드 켜고 끄기(휴대폰). 키 입력도 여기서 받는다.
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { ON_OFF, Row, Segmented } from "../../ui/controls";
import { IconClose } from "../../ui/icons";
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

// --- 패드 모양 키 설정 ---
// 버튼마다 패드 위 자리(가로·세로 %, 버튼 가운데)와 모양. 실제 컨트롤러처럼 놓아서 어느 버튼인지 바로 알아보게 한다
type Shape = "dir" | "face" | "c" | "shoulder" | "pill";
type Spot = { button: RetroButton; x: number; y: number; shape: Shape };
const COMMON: Spot[] = [
  { button: "l", x: 15, y: 9, shape: "shoulder" },
  { button: "r", x: 85, y: 9, shape: "shoulder" },
  { button: "up", x: 21, y: 38, shape: "dir" },
  { button: "down", x: 21, y: 74, shape: "dir" },
  { button: "left", x: 12, y: 56, shape: "dir" },
  { button: "right", x: 30, y: 56, shape: "dir" },
];
const SPOTS: Record<RetroSystem["face"], Spot[]> = {
  // SFC: 가운데 SELECT·START, 오른쪽 X(위)·Y(왼쪽)·A(오른쪽)·B(아래)
  diamond: [
    ...COMMON,
    { button: "select", x: 43, y: 62, shape: "pill" },
    { button: "start", x: 57, y: 62, shape: "pill" },
    { button: "x", x: 79, y: 36, shape: "face" },
    { button: "y", x: 69, y: 56, shape: "face" },
    { button: "a", x: 89, y: 56, shape: "face" },
    { button: "b", x: 79, y: 76, shape: "face" },
  ],
  // GBA·GBC: 가운데 화면, 그 아래 SELECT·START, 오른쪽 B(왼쪽 아래)·A(오른쪽 위). 기종에 없는 버튼(GBC의 L·R)은 빼고 그린다
  pair: [
    ...COMMON,
    { button: "select", x: 42.5, y: 84, shape: "pill" },
    { button: "start", x: 57.5, y: 84, shape: "pill" },
    { button: "b", x: 74, y: 63, shape: "face" },
    { button: "a", x: 86, y: 47, shape: "face" },
  ],
  // N64: 왼쪽 스틱(방향), 어깨에 L·Z / R, 가운데 START, 오른쪽 위 C 버튼 넷, 그 아래 B(왼쪽)·A
  n64: [
    ...COMMON,
    { button: "z", x: 36, y: 9, shape: "shoulder" },
    { button: "start", x: 50, y: 56, shape: "pill" },
    { button: "cup", x: 82, y: 27, shape: "c" },
    { button: "cleft", x: 74, y: 41, shape: "c" },
    { button: "cright", x: 90, y: 41, shape: "c" },
    { button: "cdown", x: 82, y: 55, shape: "c" },
    { button: "b", x: 66, y: 70, shape: "face" },
    { button: "a", x: 79, y: 80, shape: "face" },
  ],
};

/** 패드 위에 적을 짧은 키 이름: ShiftRight → R Shift */
const shortKey = (code?: string) => {
  const side = code?.match(/(Left|Right)$/)?.[1];
  const name = keyLabel(code?.replace(/(Left|Right)$/, "") || code);
  return code && side && !code.startsWith("Arrow") ? `${side === "Left" ? "L" : "R"} ${name}` : keyLabel(code);
};

/** 패드 그림 팝업: 버튼마다 지금 키가 적혀 있고(키 안내), 버튼을 누른 뒤 쓸 키를 누르면 바뀐다 */
function PadKeyPopup({ system, capturing, onCapture, onClose }: { system: RetroSystem; capturing: RetroButton | null; onCapture: (b: RetroButton | null) => void; onClose: () => void }) {
  const { retroKeys } = usePrefs();
  const keys = keysOf(system, retroKeys);
  const label = (b: RetroButton) => system.buttons.find((x) => x.button === b)?.label ?? b;
  // 키를 기다리는 중이 아니면 ESC로 창을 닫는다 (기다리는 중의 ESC는 취소)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !capturing && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [capturing]);
  // 게임 화면과 게임 설정 창 모두 위에 뜨도록 body에 그린다
  return createPortal(
    <div class="menu-backdrop padkey-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="glass menu-sheet padkey-sheet">
        <div class="menu-head">
          <span />
          <strong>{system.label} 키보드 설정</strong>
          <button class="icon-btn" aria-label="닫기" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <p class="kb-hint">
          {capturing ? `${label(capturing)} 버튼에 쓸 키를 누르세요 (ESC는 취소)` : "바꿀 버튼을 누르고, 쓸 키를 누르세요. 같은 기종 게임 모두에 적용됩니다."}
        </p>
        <div class={`padkey ${system.face}`}>
          <div class="padkey-body" />
          {system.face === "pair" && <div class="padkey-screen" />}
          {SPOTS[system.face].filter((s) => system.buttons.some((b) => b.button === s.button)).map((s) => (
            <button
              key={s.button}
              class={`pk ${s.shape}${capturing === s.button ? " waiting" : ""}`}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              onClick={() => onCapture(capturing === s.button ? null : s.button)}
            >
              {/* 방향 버튼은 자리가 곧 이름이라 키만 적는다 */}
              {s.shape !== "dir" && <span class="pk-name">{label(s.button)}</span>}
              <kbd>{capturing === s.button ? "입력…" : shortKey(keys[s.button])}</kbd>
            </button>
          ))}
        </div>
        <div class="kb-foot">
          <span />
          {Object.keys(retroKeys[system.platform] ?? {}).length > 0 && (
            <button class="glass small" onClick={() => saveKeys(system, {})}>
              기본값
            </button>
          )}
          <button class="glass small primary" onClick={onClose}>
            완료
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 게임 중 메뉴(PC)와 게임 설정 창의 한 줄: 누르면 패드 그림 팝업에서 키를 바꾼다 */
export function KeySettings({ system, capturing, onCapture }: { system: RetroSystem; capturing: RetroButton | null; onCapture: (b: RetroButton | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row label="키보드 설정">
        <button class="glass small" onClick={() => setOpen(true)}>
          패드에서 바꾸기
        </button>
      </Row>
      {open && (
        <PadKeyPopup
          system={system}
          capturing={capturing}
          onCapture={onCapture}
          onClose={() => {
            onCapture(null);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * 게임 밖(게임 설정 창)에서 쓰는 키보드 설정: 버튼마다 지금 키를 보여 주고(키 안내), 누르면 다음에 누른 키로 바꾼다.
 * 게임 중 메뉴와 같은 설정이다 (기종마다 하나, 그 기종 게임 모두에 적용)
 */
export function RetroKeysEditor({ system }: { system: RetroSystem }) {
  const [capturing, setCapturing] = useState<RetroButton | null>(null);
  useEffect(() => {
    if (!capturing) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") assignKey(system, capturing, e.code);
      setCapturing(null);
    };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  }, [capturing]);
  return <KeySettings system={system} capturing={capturing} onCapture={setCapturing} />;
}

/** 휴대폰: 가상패드 켜고 끄기 (방향 조작 모양은 같은 조작 화면의 공통 설정에서 고른다). 게임패드가 연결돼 있으면 가상패드는 저절로 숨는다 */
export function VirtualPadSetting({ gamepad }: { gamepad: boolean }) {
  const { virtualPad } = usePrefs();
  return (
    <Row label="가상패드">
      {gamepad ? <small>게임패드 사용 중</small> : <Segmented value={virtualPad ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => setPrefs({ virtualPad: v === "on" })} />}
    </Row>
  );
}

const FAST_SPEEDS = [2, 3, 4].map((v) => ({ value: String(v), label: `${v}×` }));

/** 빨리가기 배속. 바꾸면 지금 상태를 들고 에뮬레이터를 다시 띄운다 (onChange) */
export function FastSpeedSetting({ onChange }: { onChange: (speed: number) => void }) {
  const { fastSpeed } = usePrefs();
  return (
    <Row label="빨리가기 배속">
      <Segmented value={String(fastSpeed)} options={FAST_SPEEDS} onChange={(v) => +v !== fastSpeed && onChange(+v)} />
    </Row>
  );
}
