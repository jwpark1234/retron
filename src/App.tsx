import { useEffect, useState } from "preact/hooks";
import { downloadGame, uploadMissingGames, type RemoteGame } from "./cloud/games";
import { restoreSession, useAuth } from "./cloud/google-auth";
import { onCellular, onNetworkChange } from "./cloud/network";
import { syncSettings } from "./cloud/settings";
import { removeOrphans, touchGame, type Game } from "./library/library";
import { migrateLegacy, migrateThumbnails } from "./library/migrate";
import { PLAYERS } from "./platforms/players";
import { ConflictDialog } from "./screens/ConflictDialog";
import { Library } from "./screens/games/Library";
import { Landing } from "./screens/Landing";
import { initSync, prepareForPlay, resolveConflict, retryAll } from "./sync/sync";
import { Logo } from "./ui/Logo";
import { onPrefsChange } from "./ui/prefs";

export function App() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState<Game | null>(null);
  const [preparing, setPreparing] = useState("");
  const [conflict, setConflict] = useState<Game | null>(null);
  const auth = useAuth();

  useEffect(() => {
    migrateLegacy()
      .then(migrateThumbnails)
      .then(() => removeOrphans().catch(() => undefined))
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

  // Wi-Fi로 바뀌거나 "Wi-Fi에서만"을 끄면 미뤄 둔 게임을 올린다
  useEffect(() => {
    if (!auth.signedIn) return;
    const retry = () => void uploadMissingGames().catch(() => undefined);
    const offNetwork = onNetworkChange(() => !onCellular() && retry());
    const offPrefs = onPrefsChange((p) => !p.wifiOnlyUpload && retry());
    return () => (offNetwork(), offPrefs());
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
    const Player = PLAYERS[playing.platform];
    return <Player game={playing} onExit={() => setPlaying(null)} />;
  }
  return (
    <>
      <Library onPlay={(g) => void play(g)} onPlayRemote={(r) => void playRemote(r)} />
      {preparing && !conflict && <div class="overlay">{preparing}</div>}
      {conflict && <ConflictDialog onChoose={(use) => void choose(use)} />}
    </>
  );
}
