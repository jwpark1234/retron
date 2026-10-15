// 게임 설정: 이름, 플랫폼별 설정(DOS), 세이브 백업, 삭제
import { useState } from "preact/hooks";
import { download, exportBackup, importBackup } from "../../library/backup";
import { putGame, removeGame, type Game } from "../../library/library";
import { DosGameSettings, dosEditOf, type DosEdit } from "../../platforms/dos/DosGameSettings";
import { markDirty } from "../../sync/sync";
import { deleteRemoteGame, updateRemoteGame } from "../../cloud/games";
import { authState } from "../../cloud/google-auth";

export function GameSettings({ game, onClose, onChanged }: { game: Game; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(game.title);
  const dos = game.platform === "dos";
  const [dosEdit, setDosEdit] = useState<DosEdit | null>(dos ? dosEditOf(game) : null);
  const [message, setMessage] = useState("");

  const save = async () => {
    const updated: Game = {
      ...game,
      title: title.trim() || game.title,
      dos: game.dos && dosEdit ? { ...game.dos, exe: dosEdit.exe || game.dos.exe, cycles: dosEdit.cycles || undefined, input: dosEdit.input } : game.dos,
    };
    await putGame(updated);
    void updateRemoteGame(updated).catch(() => undefined);
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
      markDirty(game.id, "saves");
      markDirty(game.id, "states");
      setMessage("세이브를 가져왔습니다");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`${game.title}을(를) 이 기기에서 삭제할까요? 이 기기의 세이브와 상태 슬롯도 함께 지워집니다.`)) return;
    if (authState().signedIn && game.syncKey && confirm("구글 드라이브에 올린 게임 파일도 지울까요? (세이브는 드라이브에 남깁니다. 지운 파일은 드라이브 휴지통에서 30일 안에 되살릴 수 있습니다)")) {
      await deleteRemoteGame(game.syncKey).catch(() => undefined);
    }
    await removeGame(game.id);
    onChanged();
    onClose();
  };

  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog glass settings">
        <h2>게임 설정</h2>

        <label class="field">
          <span>이름</span>
          <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </label>

        {dos && <DosGameSettings game={game} value={dosEdit!} onChange={setDosEdit} />}

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

