import { useEffect, useState } from "preact/hooks";
import { touchGame, type Game } from "./library/library";
import { migrateLegacy, migrateThumbnails } from "./library/migrate";
import { DosPlayer } from "./platforms/dos/DosPlayer";
import { SfcPlayer } from "./platforms/sfc/SfcPlayer";
import { initSync, prepareForPlay, resolveConflict } from "./sync/sync";
import { Library } from "./ui/Library";

export function App() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState<Game | null>(null);
  const [preparing, setPreparing] = useState<Game | null>(null);
  const [conflict, setConflict] = useState<{ game: Game; remoteEtag: string } | null>(null);

  useEffect(() => {
    migrateLegacy()
      .then(migrateThumbnails)
      .finally(() => {
        setReady(true);
        void initSync();
      });
  }, []);

  const start = (g: Game) => {
    void touchGame(g.id);
    setPreparing(null);
    setPlaying(g);
  };

  // 게임을 열기 전에 다른 기기에서 한 세이브를 받아 온다
  const play = async (g: Game) => {
    setPreparing(g);
    const r = await prepareForPlay(g);
    if ("conflict" in r) return setConflict({ game: g, remoteEtag: r.remoteEtag });
    start(g);
  };

  const choose = async (use: "server" | "device") => {
    const c = conflict!;
    setConflict(null);
    try {
      await resolveConflict(c.game, use, c.remoteEtag);
    } catch {
      // 실패하면 기기 세이브로 시작하고, 다음에 다시 맞춘다
    }
    start(c.game);
  };

  if (!ready) return <div class="overlay">불러오는 중…</div>;
  if (playing) {
    const exit = () => setPlaying(null);
    return playing.platform === "sfc" ? <SfcPlayer game={playing} onExit={exit} /> : <DosPlayer game={playing} onExit={exit} />;
  }
  return (
    <>
      <Library onPlay={(g) => void play(g)} />
      {preparing && !conflict && <div class="overlay">세이브 맞추는 중…</div>}
      {conflict && (
        <div class="modal">
          <div class="dialog glass">
            <h2>세이브가 두 곳에서 바뀌었습니다</h2>
            <p class="muted">
              다른 기기에서 올린 세이브와 이 기기의 세이브가 서로 다릅니다. 어느 쪽으로 이어서 할까요? 고르지 않은 쪽도 지워지지 않고 보관됩니다.
            </p>
            <button class="glass" onClick={() => choose("server")}>
              다른 기기 세이브 사용 (서버)
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
