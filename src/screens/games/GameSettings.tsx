// 게임 설정 (라이브러리 카드의 ⋯): 이름, 썸네일, 플랫폼별 설정(DOS 실행·조작, SFC·GBA 키보드), 세이브 백업, 정보(드라이브, 용량, 날짜), 삭제(이 기기 / 드라이브까지)
import { useEffect, useState } from "preact/hooks";
import { deleteRemoteGame, updateRemoteGame, uploadGame } from "../../cloud/games";
import { authState } from "../../cloud/google-auth";
import { download, exportBackup, importBackup } from "../../library/backup";
import { gameDir, putGame, removeGame, saveThumbnail, thumbnailFile, type Game } from "../../library/library";
import { listFiles } from "../../library/store";
import { imageFileToSquare } from "../../library/thumbnail";
import { DosGameSettings, dosEditOf, type DosEdit } from "../../platforms/dos/DosGameSettings";
import { markDirty } from "../../sync/sync";
import { IconClose } from "../../ui/icons";
import { Spinner } from "../../ui/Spinner";
import { PLATFORM_LABEL } from "./GameCard";
import { touchDevice } from "../../player/orientation";
import { RetroKeysEditor } from "../../platforms/retro/RetroSettings";
import { RETRO_SYSTEMS } from "../../platforms/retro/systems";

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

/** 썸네일: 지금 그림을 보여 주고, 고른 그림 파일로 바꾼다 (가운데를 1:1로 잘라 쓴다) */
function ThumbnailField({ game, onChanged }: { game: Game; onChanged: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const f = await thumbnailFile(game.id);
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  };
  useEffect(() => {
    void load();
  }, [game.id]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const pick = async (e: Event) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    try {
      await saveThumbnail(game.id, await imageFileToSquare(file));
      await load();
      void updateRemoteGame(game).catch(() => undefined); // 다른 기기 라이브러리의 카드 그림도 바꾼다
      onChanged();
      setMsg("");
    } catch {
      setMsg("이 그림 파일은 읽을 수 없습니다. PNG나 JPG로 골라 주세요");
    }
  };

  return (
    <section class="menu-group thumb-field">
      <div class="thumb-preview">{url ? <img src={url} alt="" /> : <span>없음</span>}</div>
      <div>
        <label class="pick glass small">
          그림 바꾸기
          <input type="file" accept="image/*" onChange={(e) => void pick(e)} hidden />
        </label>
        <p class="muted">가운데를 정사각형으로 잘라 씁니다</p>
        {msg && <p class="muted">{msg}</p>}
      </div>
    </section>
  );
}

export function GameSettings({
  game,
  onDrive,
  uploadIssue,
  onClose,
  onChanged,
}: {
  game: Game;
  onDrive: boolean | null;
  uploadIssue?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(game.title);
  const dos = game.platform === "dos";
  const retro = RETRO_SYSTEMS.find((r) => r.platform === game.platform);
  const [dosEdit, setDosEdit] = useState<DosEdit | null>(dos ? dosEditOf(game) : null);
  const [message, setMessage] = useState("");
  const size = useGameSize(game.id);
  const [uploadMsg, setUploadMsg] = useState("");

  // 드라이브에 없는 게임을 지금 올린다 (다른 기기에서도 보이게). 직접 누른 것이라 모바일 데이터여도 올린다. 진행률은 라이브러리 카드에 나온다
  const upload = async () => {
    setUploadMsg("올리는 중… (창을 닫으면 라이브러리 카드에서 진행률을 볼 수 있습니다)");
    try {
      await uploadGame(game.id, { force: true });
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

  // 삭제: 이 기기에서만(드라이브에 남아 있으면 카드가 "받기" 카드로 바뀐다) 또는 드라이브에서도
  const onDriveNow = authState().signedIn && !!game.syncKey && onDrive === true;
  const removeHere = async () => {
    const note = onDriveNow ? " 드라이브에는 그대로 남아서, 라이브러리에서 다시 받을 수 있습니다." : " 드라이브에 올라가 있지 않아 되살릴 수 없습니다.";
    if (!confirm(`${game.title}을(를) 이 기기에서 삭제할까요? 이 기기의 게임 파일과 세이브가 지워집니다.${note}`)) return;
    await removeGame(game.id);
    onChanged();
    onClose();
  };
  const removeEverywhere = async () => {
    if (!confirm(`${game.title}을(를) 이 기기와 구글 드라이브에서 모두 삭제할까요? 다른 기기 라이브러리에서도 사라집니다. (드라이브의 세이브는 남기고, 지운 게임 파일은 드라이브 휴지통에서 30일 안에 되살릴 수 있습니다)`)) return;
    try {
      await deleteRemoteGame(game.syncKey!);
    } catch (e) {
      return setMessage(`드라이브에서 지우지 못했습니다: ${(e as Error).message}`);
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

          <h3>썸네일</h3>
          <ThumbnailField game={game} onChanged={onChanged} />

          {dos && <DosGameSettings game={game} value={dosEdit!} onChange={setDosEdit} />}
          {retro && !touchDevice && (
            <>
              <h3>키보드 ({retro.label} 게임 모두)</h3>
              <section class="menu-group">
                <RetroKeysEditor system={retro} />
              </section>
            </>
          )}
          {retro && touchDevice && <p class="muted">가상패드는 게임 중 메뉴(☰)에서 켜고 끕니다.</p>}

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
                  이 기기에만 있음 · 지금 올리기
                </button>
              )}
            </div>
            {onDrive === false && !uploadMsg && uploadIssue && <p class="muted">{uploadIssue}</p>}
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

          <h3>삭제</h3>
          <section class="menu-group">
            <p class="muted">
              {onDriveNow
                ? "이 기기에서만 지우면 드라이브에는 남아서 다시 받을 수 있습니다. 드라이브에서도 지우면 다른 기기 라이브러리에서도 사라집니다."
                : onDrive === false
                  ? "드라이브에 올라가 있지 않아서 지우면 되살릴 수 없습니다."
                  : "드라이브에 연결되지 않아 이 기기에서만 지울 수 있습니다."}
            </p>
            <div class="row">
              <button class="danger small" onClick={() => void removeHere()}>
                이 기기에서 삭제
              </button>
              {onDriveNow && (
                <button class="danger small" onClick={() => void removeEverywhere()}>
                  드라이브에서도 삭제
                </button>
              )}
            </div>
          </section>
        </div>

        <div class="row end">
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
