// 라이브러리 카드: 기기에 있는 게임, 드라이브에만 있는 게임. 올리기·받기 진행률을 카드 아래에 보여 준다.
import type { RemoteGame, Transfer } from "../../cloud/games";
import type { Game, Platform } from "../../library/library";

export const PLATFORM_LABEL: Record<Platform, string> = { dos: "DOS", sfc: "SFC", gba: "GBA" };

function Progress({ t }: { t?: Transfer }) {
  if (!t) return null;
  const pct = t.total ? Math.floor((t.done / t.total) * 100) : 0;
  return (
    <div class="transfer">
      <div class="bar" style={{ width: `${pct}%` }} />
      <span>
        {t.label} {pct}%
      </span>
    </div>
  );
}

function Card({ title, thumb, platform, note, disabled, onClick }: { title: string; thumb?: string; platform: Platform; note: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button class="card glass" disabled={disabled} onClick={onClick}>
      <div class="thumb">{thumb ? <img src={thumb} alt="" /> : <span>{title}</span>}</div>
      <div class="meta">
        <strong>{title}</strong>
        <small>
          <span class="badge">{PLATFORM_LABEL[platform]}</span>
          {note}
        </small>
      </div>
    </button>
  );
}

const playedNote = (g: Game) =>
  g.lastPlayedAt ? `${new Date(g.lastPlayedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })} 플레이` : "새로 추가됨";

export function LocalGameCard({ game, thumb, transfer, onPlay, onSettings }: { game: Game; thumb?: string; transfer?: Transfer; onPlay: () => void; onSettings: () => void }) {
  return (
    <li>
      <Card title={game.title} thumb={thumb} platform={game.platform} note={playedNote(game)} onClick={onPlay} />
      <Progress t={transfer} />
      <button class="more glass" title="설정" aria-label={`${game.title} 설정`} onClick={onSettings}>
        ⋯
      </button>
    </li>
  );
}

export function RemoteGameCard({ remote, transfer, onDownload }: { remote: RemoteGame; transfer?: Transfer; onDownload: () => void }) {
  return (
    <li class="remote">
      <Card title={remote.game.title} thumb={remote.thumb} platform={remote.game.platform} note="☁ 드라이브 · 눌러서 받기" disabled={!!transfer} onClick={onDownload} />
      <Progress t={transfer} />
    </li>
  );
}
