// 게임 설정 (라이브러리 카드의 ⋯): 이름, 플랫폼별 설정(DOS 실행·조작), 세이브 백업, 정보(용량, 날짜), 삭제
import { useEffect, useState } from "preact/hooks";
import { deleteRemoteGame, updateRemoteGame, uploadGame } from "../../cloud/games";
import { authState } from "../../cloud/google-auth";
import { download, exportBackup, importBackup } from "../../library/backup";
import { gameDir, putGame, removeGame, type Game } from "../../library/library";
import { listFiles } from "../../library/store";
import { DosGameSettings, dosEditOf, type DosEdit } from "../../platforms/dos/DosGameSettings";
import { markDirty } from "../../sync/sync";
import { IconClose } from "../../ui/icons";
import { Spinner } from "../../ui/Spinner";
import { PLATFORM_LABEL } from "./GameCard";

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" }) : "아직 안 함");
const fmtSize = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)}GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 기기에서 이 게임이 차지하는 공간 (게임 파일 + 세이브 + 상태 슬롯) */
function useGameSize(id: string) {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    void listFiles(gameDir(id)).then((files) => setSize([...files.values()].reduce((n, f) => n + f.size, 0)));
  }, [id]);
  return size;
}

export function GameSettings({ game, onDrive, onClose, onChanged }: { game: Game; onDrive: boolean | null; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(game.title);
  const dos = game.platform === "dos";
  const [dosEdit, setDosEdit] = useState<DosEdit | null>(dos ? dosEditOf(game) : null);
  const [message, setMessage] = useState("");
  const size = useGameSize(game.id);
  const [uploadMsg, setUploadMsg] = useState("");

  // 드라이브에 없는 게임을 지금 올린다 (다른 기기에서도 보이게). 진행률은 라이브러리 카드에 나온다
  const upload = async () => {
    setUploadMsg("올리는 중… (창을 닫으면 라이브러리 카드에서 진행률을 볼 수 있습니다)");
    try {
      await uploadGame(game.id);
      onChanged();
      setUploadMsg("올리기를 마쳤습니다");
    } catch (e) {
      setUploadMsg(`올리지 못했습니다: ${(e as Error).message}`);
    }
  };

  const save = async () => {
    const updated: Game = {
      ...game,
      title: title.trim() || game.title,
      dos:
        game.dos && dosEdit
          ? { ...game.dos, exe: dosEdit.exe || game.dos.exe, cycles: dosEdit.cycles || undefined, input: dosEdit.input, touchKeys: dosEdit.touchKeys }
          : game.dos,
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
        <div class="menu-head">
          <span class="badge">{PLATFORM_LABEL[game.platform]}</span>
          <strong>게임 설정</strong>
          <button class="icon-btn" aria-label="닫기" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div class="settings-body">
          <section class="menu-group">
            <label class="field">
              <span>이름</span>
              <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
            </label>
          </section>

          {dos && <DosGameSettings game={game} value={dosEdit!} onChange={setDosEdit} />}
          {!dos && <p class="muted">키보드 배치와 가상패드는 게임 중 메뉴(☰)에서 바꿉니다. 같은 기종 게임 모두에 적용됩니다.</p>}

          <h3>세이브 백업</h3>
          <section class="menu-group">
            <p class="muted">게임 안 세이브와 상태 슬롯을 zip 파일로 받아 두거나 되돌립니다.</p>
            <div class="row">
              <button class="glass small" onClick={backup}>
                내보내기
              </button>
              <label class="pick glass small">
                가져오기
                <input type="file" accept=".zip" onChange={restore} hidden />
              </label>
            </div>
            {message && <p class="muted">{message}</p>}
          </section>

          <h3>정보</h3>
          <section class="menu-group info">
            <div class="field">
              <span>구글 드라이브</span>
              {onDrive === null ? (
                <small>확인하지 못함</small>
              ) : onDrive ? (
                <small>올라가 있음</small>
              ) : (
                <button class="glass small" onClick={() => void upload()}>
                  이 기기에만 있음 · 올리기
                </button>
              )}
            </div>
            {uploadMsg && <p class="muted">{uploadMsg}</p>}
            <div class="field">
              <span>기기 저장 공간</span>
              <small>{size === null ? <Spinner small /> : fmtSize(size)}</small>
            </div>
            <div class="field">
              <span>추가한 날</span>
              <small>{fmtDate(game.addedAt)}</small>
            </div>
            <div class="field">
              <span>마지막 플레이</span>
              <small>{fmtDate(game.lastPlayedAt)}</small>
            </div>
          </section>
        </div>

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
