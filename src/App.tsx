import { useEffect, useState } from "preact/hooks";
import { downloadGame, uploadMissingGames, type RemoteGame } from "./cloud/games";
import { restoreSession, useAuth } from "./cloud/google-auth";
import { syncSettings } from "./cloud/settings";
import { touchGame, type Game } from "./library/library";
import { migrateLegacy, migrateThumbnails } from "./library/migrate";
import { DosPlayer } from "./platforms/dos/DosPlayer";
import { SfcPlayer } from "./platforms/sfc/SfcPlayer";
import { initSync, prepareForPlay, resolveConflict, retryAll } from "./sync/sync";
import { Library } from "./ui/Library";

export function App() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState<Game | null>(null);
  const [preparing, setPreparing] = useState("");
  const [conflict, setConflict] = useState<Game | null>(null);
  const auth = useAuth();

  useEffect(() => {
    migrateLegacy()
      .then(migrateThumbnails)
      .then(restoreSession)
      .finally(() => {
        setReady(true);
        initSync();
      });
  }, []);

  // 로그인되면 드라이브와 맞춘다: 설정 불러오기, 밀린 세이브 올리기, 아직 안 올린 게임 올리기
  useEffect(() => {
    if (!auth.signedIn) return;
    void syncSettings().catch(() => undefined);
    void retryAll();
    void uploadMissingGames().catch(() => undefined);
  }, [auth.signedIn]);

  const start = (g: Game) => {
    void touchGame(g.id);
    setPreparing("");
    setPlaying(g);
  };

  // 게임을 열기 전에 다른 기기에서 한 세이브를 받아 온다
  const play = async (g: Game) => {
    setPreparing("세이브 맞추는 중…");
    const r = await prepareForPlay(g);
    if ("conflict" in r) {
      setPreparing("");
      return setConflict(g);
    }
    start(g);
  };

  // 드라이브에만 있는 게임: 이 기기로 받은 뒤 실행한다
  const playRemote = async (r: RemoteGame) => {
    try {
      const g = await downloadGame(r);
      await play(g);
    } catch (e) {
      alert(`게임을 받지 못했습니다: ${(e as Error).message}`);
    }
  };

  const choose = async (use: "server" | "device") => {
    const g = conflict!;
    setConflict(null);
    try {
      await resolveConflict(g, use);
    } catch {
      // 실패하면 기기 세이브로 시작하고, 다음에 다시 맞춘다
    }
    start(g);
  };

  if (!ready) return <div class="overlay">불러오는 중…</div>;
  if (playing) {
    const exit = () => setPlaying(null);
    return playing.platform === "sfc" ? <SfcPlayer game={playing} onExit={exit} /> : <DosPlayer game={playing} onExit={exit} />;
  }
  return (
    <>
      <Library onPlay={(g) => void play(g)} onPlayRemote={(r) => void playRemote(r)} />
      {preparing && !conflict && <div class="overlay">{preparing}</div>}
      {conflict && (
        <div class="modal">
          <div class="dialog glass">
            <h2>세이브가 두 곳에서 바뀌었습니다</h2>
            <p class="muted">
              다른 기기에서 올린 세이브와 이 기기의 세이브가 서로 다릅니다. 어느 쪽으로 이어서 할까요? 이 기기 세이브를 버리는 쪽을 골라도 기기에 따로 보관하고, 드라이브 쪽은 구글 드라이브의 버전 기록에 남습니다.
            </p>
            <button class="glass" onClick={() => choose("server")}>
              다른 기기 세이브 사용 (드라이브)
            </button>
            <button class="glass" onClick={() => choose("device")}>
              이 기기 세이브 사용
            </button>
          </div>
        </div>
      )}
    </>
  );
}
