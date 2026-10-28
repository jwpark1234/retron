// 기종별 플레이 화면. 새 기종은 여기에 하나 더하면 된다 (RetroArch 기종은 retro/systems.ts에 정의를 더하고 여기에 등록).
import type { ComponentType } from "preact";
import type { Game, Platform } from "../library/library";
import { DosPlayer } from "./dos/DosPlayer";
import { RetroPlayer } from "./retro/RetroPlayer";
import { GBA, N64, SFC, type RetroSystem } from "./retro/systems";

type Player = ComponentType<{ game: Game; onExit: () => void }>;

const retro = (system: RetroSystem): Player => (props) => <RetroPlayer system={system} {...props} />;

export const PLAYERS: Record<Platform, Player> = {
  dos: DosPlayer,
  sfc: retro(SFC),
  gba: retro(GBA),
  n64: retro(N64),
};
