import { useState } from "preact/hooks";
import { Game } from "./Game";
import { Splash } from "./Splash";

export function App() {
  const [playing, setPlaying] = useState(false);
  return playing ? <Game onExit={() => setPlaying(false)} /> : <Splash onStart={() => setPlaying(true)} />;
}
