import { useEffect, useState } from "preact/hooks";
import { downloadGame, uploadMissingGames, type RemoteGame } from "./cloud/games";
import { restoreSession, signIn, useAuth } from "./cloud/google-auth";
import { syncSettings } from "./cloud/settings";
import { touchGame, type Game } from "./library/library";
import { migrateLegacy, migrateThumbnails } from "./library/migrate";
import { DosPlayer } from "./platforms/dos/DosPlayer";
import { SfcPlayer } from "./platforms/sfc/SfcPlayer";
import { initSync, prepareForPlay, resolveConflict, retryAll } from "./sync/sync";
import { Library } from "./ui/Library";
import { Logo } from "./ui/Logo";

// 첫 화면: 로고와 구글 로그인. 로그인해야 라이브러리로 들어간다
function Landing() {
  const auth = useAuth();
  return (
    <div class="landing">
      <Logo />
      <button class="google-signin" disabled={auth.busy} onClick={() => void signIn().catch(() => undefined)}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
          <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {auth.busy ? "로그인 중…" : "Google 계정으로 로그인"}
      </button>
      {auth.error && <p class="error">로그인하지 못했습니다: {auth.error}</p>}
      <p class="fineprint">게임과 세이브는 내 구글 드라이브의 retron 폴더에 저장됩니다.</p>
    </div>
  );
}

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

  if (!ready)
    return (
      <div class="landing">
        <Logo />
      </div>
    );
  if (!auth.signedIn) return <Landing />;
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
