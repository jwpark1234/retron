// DOS 게임 설정: 실행(실행 파일, 속도)과 조작. 조작은 기기에 맞는 것만 보인다:
// 휴대폰은 화면 키, 게임패드 버튼은 게임패드가 연결돼 있을 때만.
import { useEffect, useState } from "preact/hooks";
import { gameDir, type DosInfo, type DosInput, type Game, type PadAction } from "../../library/library";
import { listFiles } from "../../library/store";
import { useGamepad } from "../../player/gamepads";
import { touchDevice } from "../../player/orientation";
import { DOS_KEY_LIST } from "./create-dos";
import { DEFAULT_KEYS, touchKeysOf } from "./DosTouch";
import { DEFAULT_PAD, PAD_BUTTONS } from "./gamepad";
import { isArrow } from "./keyboard";
import { KeyPicker } from "./KeyPicker";
import { HDD_DIR, exeCandidates } from "./profiles";

const CYCLES = [
  { value: "", label: "게임 기본값" },
  { value: "auto", label: "자동" },
  { value: "max", label: "최대" },
  { value: "3000", label: "느리게 (3000)" },
  { value: "8000", label: "386급 (8000)" },
  { value: "20000", label: "486급 (20000)" },
  { value: "50000", label: "펜티엄급 (50000)" },
];

const encodeAction = (a: PadAction) => String(a);
const decodeAction = (v: string): PadAction => (v === "mouse-left" || v === "mouse-right" ? v : +v);

function ActionSelect({ value, onChange }: { value: PadAction; onChange: (a: PadAction) => void }) {
  return (
    <select value={encodeAction(value)} onChange={(e) => onChange(decodeAction((e.target as HTMLSelectElement).value))}>
      <option value="mouse-left">마우스 왼쪽</option>
      <option value="mouse-right">마우스 오른쪽</option>
      {DOS_KEY_LIST.map((k) => (
        <option key={k.key} value={k.key}>
          {k.label}
        </option>
      ))}
    </select>
  );
}

/** 설정 창에서 고치는 DOS 값 */
export type DosEdit = Pick<DosInfo, "exe" | "cycles" | "input" | "touchKeys">;

export const dosEditOf = (game: Game): DosEdit => ({ exe: game.dos!.exe, cycles: game.dos!.cycles ?? "", input: game.dos!.input ?? {}, touchKeys: game.dos!.touchKeys });

export function DosGameSettings({ game, value, onChange }: { game: Game; value: DosEdit; onChange: (v: DosEdit) => void }) {
  const { exe, cycles = "" } = value;
  const input: DosInput = value.input ?? {};
  const setInput = (f: (i: DosInput) => DosInput) => onChange({ ...value, input: f(input) });
  const [exes, setExes] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const gamepad = useGamepad();
  // 고른 적이 없으면 기본 키를 보여 주되 저장하지는 않는다 (기본값이 바뀌면 따라가게)
  const touchKeys = value.touchKeys ?? touchKeysOf(game);

  useEffect(() => {
    listFiles(`${gameDir(game.id)}/${HDD_DIR}`).then((files) => setExes(exeCandidates([...files.keys()])));
  }, []);

  const pad = { ...DEFAULT_PAD, ...input.pad };
  const setExe = (v: string) => onChange({ ...value, exe: v });
  const setCycles = (v: string) => onChange({ ...value, cycles: v });

  return (
    <>
      <section class="menu-group">
        <label class="field">
          <span>실행 파일</span>
          <select value={exe} onChange={(e) => setExe((e.target as HTMLSelectElement).value)}>
            {[...new Set([exe, ...exes])].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>속도 (cycles)</span>
          <select value={cycles} onChange={(e) => setCycles((e.target as HTMLSelectElement).value)}>
            {CYCLES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {touchDevice && (
        <>
          <h3>휴대폰 화면 키</h3>
          <section class="menu-group">
            <div class="field">
              <span>
                키 {touchKeys.filter((k) => !isArrow(k)).length}개{touchKeys.some(isArrow) ? " · 방향 패드" : ""}
              </span>
              <button class="glass small" onClick={() => setPicking(true)}>
                고르기
              </button>
            </div>
            <p class="muted">게임 중 메뉴에서도 고를 수 있습니다.</p>
          </section>
          {picking && (
            <KeyPicker
              keys={touchKeys}
              onChange={(k) => onChange({ ...value, touchKeys: k })}
              onReset={() => onChange({ ...value, touchKeys: DEFAULT_KEYS })}
              onClose={() => setPicking(false)}
            />
          )}
        </>
      )}

      {/* 게임패드는 꽂고 버튼을 한 번 눌러야 브라우저가 알려 준다 */}
      {gamepad && (
        <>
          <h3>게임패드</h3>
          <section class="menu-group">
            <label class="field">
              <span>왼쪽 스틱</span>
              <select value={input.leftStick ?? "arrows"} onChange={(e) => setInput((i) => ({ ...i, leftStick: (e.target as HTMLSelectElement).value as "arrows" | "mouse" }))}>
                <option value="arrows">방향키</option>
                <option value="mouse">마우스 커서</option>
              </select>
            </label>
            <p class="muted">오른쪽 스틱은 항상 마우스 커서를 움직입니다.</p>
            <div class="pad-grid">
              {PAD_BUTTONS.map((b) => (
                <label class="field" key={b.index}>
                  <span>{b.label}</span>
                  <ActionSelect value={pad[b.index]} onChange={(a) => setInput((i) => ({ ...i, pad: { ...i.pad, [b.index]: a } }))} />
                </label>
              ))}
            </div>
            <button class="glass small" onClick={() => setInput((i) => ({ ...i, pad: undefined, leftStick: undefined }))}>
              게임패드 기본값으로
            </button>
          </section>
        </>
      )}
    </>
  );
}
