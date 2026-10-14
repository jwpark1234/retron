import { useEffect, useState } from "preact/hooks";
import { touchGame, type Game } from "./library/library";
import { migrateLegacy } from "./library/migrate";
import { DosPlayer } from "./platforms/dos/DosPlayer";
import { SfcPlayer } from "./platforms/sfc/SfcPlayer";
import { Library } from "./ui/Library";

export function App() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState<Game | null>(null);

  useEffect(() => {
    migrateLegacy().finally(() => setReady(true));
  }, []);

  if (!ready) return <div class="overlay">불러오는 중…</div>;
  if (!playing) {
    return (
      <Library
        onPlay={(g) => {
          void touchGame(g.id);
          setPlaying(g);
        }}
      />
    );
  }
  const exit = () => setPlaying(null);
  return playing.platform === "sfc" ? <SfcPlayer game={playing} onExit={exit} /> : <DosPlayer game={playing} onExit={exit} />;
}
