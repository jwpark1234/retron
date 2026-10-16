// 라이브러리 카드: 기기에 있는 게임, 드라이브에만 있는 게임. 올리기·받기 진행률은 썸네일 아래쪽에 겹쳐 보여 준다 (이름·날짜 줄을 가리지 않게).
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

function Card({
  title,
  thumb,
  platform,
  note,
  deviceOnly,
  uploadIssue,
  transfer,
  disabled,
  onClick,
}: {
  title: string;
  thumb?: string;
  platform: Platform;
  note: string;
  deviceOnly?: boolean;
  uploadIssue?: string;
  transfer?: Transfer;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button class="card glass" disabled={disabled} onClick={onClick}>
      <div class="thumb">
        {thumb ? <img src={thumb} alt="" /> : <span>{title}</span>}
        <Progress t={transfer} />
      </div>
      <div class="meta">
        <strong>{title}</strong>
        <small>
          <span class="badge">{PLATFORM_LABEL[platform]}</span>
          {deviceOnly && (
            <span class={`badge local${uploadIssue?.startsWith("올리지 못") ? " failed" : ""}`} title={uploadIssue ?? "드라이브에 아직 없어서 다른 기기에는 안 보입니다"}>
              {badgeText(uploadIssue)}
            </span>
          )}
          {note}
        </small>
      </div>
    </button>
  );
}

/** 드라이브에 없는 게임의 표시: 까닭이 있으면 짧게 (자세한 내용은 게임 설정과 마우스를 올렸을 때) */
const badgeText = (issue?: string) => (!issue ? "이 기기에만" : issue.startsWith("올리지 못") ? "올리기 실패" : issue.includes("Wi-Fi") ? "Wi-Fi 대기" : "올리기 대기");

const playedNote = (g: Game) =>
  g.lastPlayedAt ? `${new Date(g.lastPlayedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })} 플레이` : "새로 추가됨";

/** deviceOnly: 드라이브에 올라가 있지 않다 (다른 기기 라이브러리에 안 나온다). uploadIssue: 아직 못 올린 까닭 */
export function LocalGameCard({
  game,
  thumb,
  transfer,
  deviceOnly,
  uploadIssue,
  onPlay,
  onSettings,
}: {
  game: Game;
  thumb?: string;
  transfer?: Transfer;
  deviceOnly: boolean;
  uploadIssue?: string;
  onPlay: () => void;
  onSettings: () => void;
}) {
  return (
    <li>
      <Card title={game.title} thumb={thumb} platform={game.platform} note={playedNote(game)} deviceOnly={deviceOnly && !transfer} uploadIssue={uploadIssue} transfer={transfer} onClick={onPlay} />
      <button class="more glass" title="설정" aria-label={`${game.title} 설정`} onClick={onSettings}>
        ⋯
      </button>
    </li>
  );
}

export function RemoteGameCard({ remote, transfer, onDownload }: { remote: RemoteGame; transfer?: Transfer; onDownload: () => void }) {
  return (
    <li class="remote">
      <Card title={remote.game.title} thumb={remote.thumb} platform={remote.game.platform} note="☁ 드라이브 · 눌러서 받기" disabled={!!transfer} transfer={transfer} onClick={onDownload} />
    </li>
  );
}
