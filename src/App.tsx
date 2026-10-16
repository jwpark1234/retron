import { useEffect, useRef, useState } from "preact/hooks";
import { downloadGame, pendingDownloadIds, uploadMissingGames, type RemoteGame } from "./cloud/games";
import { restoreSession, useAuth } from "./cloud/google-auth";
import { onCellular, onNetworkChange } from "./cloud/network";
import { initSettingsSync, retrySettings, syncSettings } from "./cloud/settings";
import { removeOrphans, touchGame, type Game } from "./library/library";
import { migrateLegacy, migrateThumbnails } from "./library/migrate";
import { PLAYERS } from "./platforms/players";
import { ConflictDialog } from "./screens/ConflictDialog";
import { Library } from "./screens/games/Library";
import { Landing } from "./screens/Landing";
import { initSync, prepareForPlay, resolveConflict, retryAll, setPlaying as setSyncPlaying } from "./sync/sync";
import { BusyOverlay } from "./ui/Spinner";
import { onPrefsChange } from "./ui/prefs";

const RETRY_UPLOAD_MS = 5 * 60 * 1000;
const MIN_SPLASH_MS = 900; // 로그인해 둔 기기도 첫 화면(로고 + 로딩)을 잠깐 보여 주고 라이브러리로 넘어간다

export function App() {
  const [ready, setReady] = useState(false);
  const [splash, setSplash] = useState(true);
  const [playing, setPlaying] = useState<Game | null>(null);
  const [preparing, setPreparing] = useState("");
  const [conflict, setConflict] = useState<Game | null>(null);
  const auth = useAuth();
  const playingRef = useRef(false);
  playingRef.current = !!playing;
  useEffect(() => setSyncPlaying(!!playing), [playing]);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    migrateLegacy()
      .then(migrateThumbnails)
      .then(() => removeOrphans(pendingDownloadIds()).catch(() => undefined))
      .then(restoreSession)
      .finally(() => {
        setReady(true);
        initSync();
        initSettingsSync();
      });
  }, []);

  // 드라이브에 연결되면 맞춘다: 설정(더 최근 쪽), 밀린 세이브 올리기, 아직 안 올린 게임 올리기
  useEffect(() => {
    if (!auth.driveReady) return;
    void syncSettings().catch(() => undefined);
    void retryAll();
    void uploadMissingGames().catch(() => undefined);
  }, [auth.driveReady]);

  // 기기에만 있는 게임은 네트워크가 되면 올린다: 연결이 돌아올 때, 모바일 데이터에서 벗어날 때, 화면으로 돌아올 때, 몇 분마다.
  // 휴대폰은 화면이 꺼지거나 다른 앱으로 가면 올리기가 멈춘다(브라우저가 페이지를 멈춤). 돌아오면 끊긴 파일의 끊긴 지점부터 이어 올린다
  useEffect(() => {
    if (!auth.driveReady) return;
    const retry = () => {
      if (playingRef.current) return; // 게임 중에는 쉬었다가 나오면 올린다
      void uploadMissingGames().catch(() => undefined);
      void retrySettings().catch(() => undefined);
    };
    const offNetwork = onNetworkChange(() => !onCellular() && retry());
    const offPrefs = onPrefsChange((p) => !p.wifiOnlyUpload && retry());
    const onVisible = () => document.visibilityState === "visible" && retry();
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("online", retry);
    const timer = setInterval(retry, RETRY_UPLOAD_MS);
    return () => {
      offNetwork();
      offPrefs();
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [auth.driveReady]);

  // 게임을 마치고 나오면 미뤄 둔 게임 올리기를 이어 간다
  useEffect(() => {
    if (!playing && auth.driveReady) void uploadMissingGames().catch(() => undefined);
  }, [playing]);

  const start = (g: Game) => {
    void touchGame(g.id);
    setPreparing("");
    setPlaying(g);
  };

  // 게임을 열기 전에 다른 기기에서 한 세이브를 받아 온다
  const play = async (g: Game) => {
    setPreparing("동기화 중…");
    const r = await prepareForPlay(g);
    if ("conflict" in r) {
      setPreparing("");
      return setConflict(g);
    }
    start(g);
  };

  // 드라이브에만 있는 게임: 이 기기로 받은 뒤 실행한다
  const playRemote = async (r: RemoteGame) => {
    if (!navigator.onLine) return alert("오프라인이라 드라이브에서 게임을 받을 수 없습니다. 연결되면 다시 눌러 주세요.");
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

  if (!ready || (auth.signedIn && splash)) return <Landing loading />;
  if (!auth.signedIn) return <Landing />;
  if (playing) {
    const Player = PLAYERS[playing.platform];
    return <Player game={playing} onExit={() => setPlaying(null)} />;
  }
  return (
    <>
      <Library onPlay={(g) => void play(g)} onPlayRemote={(r) => void playRemote(r)} />
      {preparing && !conflict && <BusyOverlay text={preparing} />}
      {conflict && <ConflictDialog onChoose={(use) => void choose(use)} />}
    </>
  );
}
