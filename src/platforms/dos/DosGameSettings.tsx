// DOS 게임 설정: 실행 파일, 속도, 키 재배치, 게임패드 버튼. 게임 설정 창 안에 들어간다.
import { useEffect, useState } from "preact/hooks";
import { gameDir, type DosInfo, type DosInput, type Game, type PadAction } from "../../library/library";
import { listFiles } from "../../library/store";
import { DOS_KEY_LIST, toDosKey } from "./create-dos";
import { DEFAULT_PAD, PAD_BUTTONS } from "./gamepad";
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
export type DosEdit = Pick<DosInfo, "exe" | "cycles" | "input">;

export const dosEditOf = (game: Game): DosEdit => ({ exe: game.dos!.exe, cycles: game.dos!.cycles ?? "", input: game.dos!.input ?? {} });

export function DosGameSettings({ game, value, onChange }: { game: Game; value: DosEdit; onChange: (v: DosEdit) => void }) {
  const { exe, cycles = "" } = value;
  const input: DosInput = value.input ?? {};
  const setInput = (f: (i: DosInput) => DosInput) => onChange({ ...value, input: f(input) });
  const [exes, setExes] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    listFiles(`${gameDir(game.id)}/${HDD_DIR}`).then((files) => setExes(exeCandidates([...files.keys()])));
  }, []);

  // 키 추가: 다음에 누르는 키를 잡는다
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      setCapturing(false);
      if (e.code === "Escape" && !confirm("ESC 키를 재배치할까요?")) return;
      setInput((i) => ({ ...i, keys: { ...i.keys, [e.code]: i.keys?.[e.code] ?? toDosKey(e.code) ?? 257 } }));
    };
    addEventListener("keydown", onKey, { once: true });
    return () => removeEventListener("keydown", onKey);
  }, [capturing, value]);

  const pad = { ...DEFAULT_PAD, ...input.pad };
  const keys = Object.entries(input.keys ?? {});
  const setExe = (v: string) => onChange({ ...value, exe: v });
  const setCycles = (v: string) => onChange({ ...value, cycles: v });

  return (
    <>
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

        <h3>키 재배치</h3>
        {keys.length === 0 && <p class="muted">누른 키를 다른 DOS 키로 보냅니다.</p>}
        {keys.map(([code, target]) => (
          <div class="map-row" key={code}>
            <code>{code}</code>
            <span>→</span>
            <select
              value={target}
              onChange={(e) => setInput((i) => ({ ...i, keys: { ...i.keys, [code]: +(e.target as HTMLSelectElement).value } }))}
            >
              {DOS_KEY_LIST.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              class="glass small"
              onClick={() =>
                setInput((i) => {
                  const { [code]: _, ...rest } = i.keys ?? {};
                  return { ...i, keys: rest };
                })
              }
            >
              삭제
            </button>
          </div>
        ))}
        <button class="glass" onClick={() => setCapturing(true)}>
          {capturing ? "바꿀 키를 누르세요…" : "키 추가"}
        </button>

        <h3>게임패드</h3>
        <label class="field">
          <span>왼쪽 스틱</span>
          <select
            value={input.leftStick ?? "arrows"}
            onChange={(e) => setInput((i) => ({ ...i, leftStick: (e.target as HTMLSelectElement).value as "arrows" | "mouse" }))}
          >
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
          </>
  );
}
