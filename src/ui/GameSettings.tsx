// 게임 설정: 이름, (DOS) 실행 파일·속도·키 재배치·게임패드, 세이브 백업, 삭제
import { useEffect, useState } from "preact/hooks";
import { download, exportBackup, importBackup } from "../library/backup";
import { gameDir, putGame, removeGame, type DosInput, type Game, type PadAction } from "../library/library";
import { listFiles } from "../library/store";
import { DOS_KEY_LIST, toDosKey } from "../platforms/dos/create-dos";
import { DEFAULT_PAD, PAD_BUTTONS } from "../platforms/dos/gamepad";
import { HDD_DIR, exeCandidates } from "../platforms/dos/profiles";
import { markDirty } from "../sync/sync";

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

export function GameSettings({ game, onClose, onChanged }: { game: Game; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(game.title);
  const [exe, setExe] = useState(game.dos?.exe ?? "");
  const [cycles, setCycles] = useState(game.dos?.cycles ?? "");
  const [input, setInput] = useState<DosInput>(game.dos?.input ?? {});
  const [exes, setExes] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState("");
  const dos = game.platform === "dos";

  useEffect(() => {
    if (dos) listFiles(`${gameDir(game.id)}/${HDD_DIR}`).then((files) => setExes(exeCandidates([...files.keys()])));
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
  }, [capturing]);

  const save = async () => {
    await putGame({
      ...game,
      title: title.trim() || game.title,
      dos: game.dos && { ...game.dos, exe: exe || game.dos.exe, cycles: cycles || undefined, input },
    });
    onChanged();
    onClose();
  };

  const backup = async () => {
    try {
      const { name, blob } = await exportBackup(game);
      download(name, blob);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const restore = async (e: Event) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file || !confirm("지금 세이브와 상태 슬롯을 백업 파일 내용으로 바꿀까요?")) return;
    try {
      await importBackup(game, file);
      markDirty(game.id);
      setMessage("세이브를 가져왔습니다");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`${game.title}을(를) 삭제할까요? 세이브와 상태 슬롯도 함께 지워집니다.`)) return;
    await removeGame(game.id);
    onChanged();
    onClose();
  };

  const pad = { ...DEFAULT_PAD, ...input.pad };
  const keys = Object.entries(input.keys ?? {});

  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog glass settings">
        <h2>게임 설정</h2>

        <label class="field">
          <span>이름</span>
          <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </label>

        {dos && (
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
        )}

        <h3>세이브 백업</h3>
        <p class="muted">게임 안 세이브와 상태 슬롯을 zip 파일로 받아 두거나 되돌립니다.</p>
        <div class="row">
          <button class="glass" onClick={backup}>
            내보내기
          </button>
          <label class="pick glass">
            가져오기
            <input type="file" accept=".zip" onChange={restore} hidden />
          </label>
        </div>
        {message && <p class="muted">{message}</p>}

        <div class="row end">
          <button class="danger" onClick={remove}>
            게임 삭제
          </button>
          <span class="spacer" />
          <button class="glass" onClick={onClose}>
            취소
          </button>
          <button class="glass primary" onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

