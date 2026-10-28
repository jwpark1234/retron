import { useEffect, useRef, useState } from "preact/hooks";
import { cachedRemoteGames, downloadGame, pendingDownloadIds, uploadMissingGames, type RemoteGame } from "./cloud/games";
import { restoreSession, useAuth } from "./cloud/google-auth";
import { onCellular, onNetworkChange } from "./cloud/network";
import { initSettingsSync, retrySettings, syncSettings } from "./cloud/settings";
import { missingGameFile, removeOrphans, storageWiped, touchGame, type Game } from "./library/library";
import { migrateLegacy, migrateThumbnails } from "./library/migrate";
import { keepStorage } from "./library/store";
import { PLAYERS } from "./platforms/players";
import { ConflictDialog } from "./screens/ConflictDialog";
import { Library } from "./screens/games/Library";
import { InstallGate } from "./screens/InstallGate";
import { Landing } from "./screens/Landing";
import { touchDevice } from "./player/orientation";
import { standalone } from "./ui/install";
import { initSync, prepareForPlay, resolveConflict, retryAll, setPlaying as setSyncPlaying } from "./sync/sync";
import { BusyOverlay } from "./ui/Spinner";
import { onPrefsChange } from "./ui/prefs";

const RETRY_UPLOAD_MS = 5 * 60 * 1000;
const MIN_SPLASH_MS = 900; // 로그인해 둔 기기도 첫 화면(로고 + 로딩)을 잠깐 보여 주고 라이브러리로 넘어간다
// 휴대폰·태블릿 브라우저(설치한 앱이 아닌 탭)로 열면 설치 화면만 보여 준다. 개발 서버 자동 테스트(?e2e)는 건너뛴다
const MUST_INSTALL = touchDevice && !standalone() && !(import.meta.env.DEV && new URLSearchParams(location.search).has("e2e"));

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
    void keepStorage();
    storageWiped()
      .then((wiped) => {
        if (wiped) alert("브라우저가 이 앱의 저장 공간을 지워서 기기에 받아 둔 게임이 없어졌습니다. 드라이브에 올라간 게임은 다시 받을 수 있습니다.");
      })
      .catch(() => undefined)
      .then(migrateLegacy)
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

  // 게임 파일이 기기에서 사라졌으면(휴대폰 브라우저가 저장 공간을 비움) 드라이브에서 같은 자리로 다시 받는다. 세이브는 그대로 둔다
  const repair = async (g: Game): Promise<Game | null> => {
    const remote = g.syncKey ? (await cachedRemoteGames()).find((r) => r.key === g.syncKey) : undefined;
    if (!remote) {
      alert("이 게임의 파일이 기기에서 지워졌습니다. 드라이브에도 없어서 다시 받을 수 없습니다. 게임을 삭제하고 다시 추가해 주세요.");
      return null;
    }
    if (!navigator.onLine) {
      alert("이 게임의 파일이 기기에서 지워졌습니다. 인터넷에 연결되면 다시 눌러 드라이브에서 받아 주세요.");
      return null;
    }
    if (!confirm("이 게임의 파일이 기기에서 지워졌습니다 (브라우저가 저장 공간을 비웠을 수 있습니다). 드라이브에서 다시 받을까요? 세이브는 그대로 남아 있습니다.")) return null;
    try {
      return await downloadGame(remote, g);
    } catch (e) {
      alert(`게임을 받지 못했습니다: ${(e as Error).message}`);
      return null;
    }
  };

  // 게임을 열기 전에 다른 기기에서 한 세이브를 받아 온다
  const play = async (game: Game) => {
    const g = (await missingGameFile(game)) ? await repair(game) : game;
    if (!g) return;
    setPreparing("동기화 중…");
    const r = await prepareForPlay(g);
    if ("conflict" in r) {
      setPreparing("");
      return setConflict(g);
    }
    start(g);
  };

  // 드라이브에만 있는 게임: 이 기기로 받기만 한다. 다 받으면 보통 카드가 되고, 그때 누르면 실행한다
  const downloadRemote = async (r: RemoteGame) => {
    if (!navigator.onLine) return alert("오프라인이라 드라이브에서 게임을 받을 수 없습니다. 연결되면 다시 눌러 주세요.");
    try {
      await downloadGame(r);
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

  if (MUST_INSTALL) return <InstallGate />;
  if (!ready || (auth.signedIn && splash)) return <Landing loading />;
  if (!auth.signedIn) return <Landing />;
  if (playing) {
    const Player = PLAYERS[playing.platform];
    return <Player game={playing} onExit={() => setPlaying(null)} />;
  }
  return (
    <>
      <Library onPlay={(g) => void play(g)} onDownload={(r) => void downloadRemote(r)} />
      {preparing && !conflict && <BusyOverlay text={preparing} />}
      {conflict && <ConflictDialog onChoose={(use) => void choose(use)} />}
    </>
  );
}
