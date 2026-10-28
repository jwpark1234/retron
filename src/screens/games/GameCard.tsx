// 라이브러리 카드. 상태는 둘뿐이다: 실행 가능(이 기기에 있음) / 다운로드 필요(드라이브에만 있음, 반투명 막).
// 올리기·받기 진행률은 썸네일 아래쪽에 겹쳐 보여 준다 (이름·날짜 줄을 가리지 않게).
import type { RemoteGame, Transfer } from "../../cloud/games";
import type { ComponentChildren } from "preact";
import type { Game, Platform } from "../../library/library";
import { IconDownload } from "../../ui/icons";

export const PLATFORM_LABEL: Record<Platform, string> = { dos: "DOS", sfc: "SFC", gba: "GBA", gbc: "GBC", n64: "N64" };

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Progress({ t }: { t?: Transfer }) {
  if (!t) return null;
  const pct = t.total ? Math.floor((t.done / t.total) * 100) : 0;
  // 올리기·받기는 평균 속도, 설치는 걸린 시간
  const extra = t.rate !== undefined ? `${(t.rate / 1048576).toFixed(1)}MB/s` : t.elapsed !== undefined && t.elapsed >= 2000 ? clock(t.elapsed) : "";
  return (
    <div class="transfer">
      <div class="bar" style={{ width: `${pct}%` }} />
      <span>
        {t.label} {pct}%{extra && ` · ${extra}`}
      </span>
    </div>
  );
}

function Card({
  title,
  thumb,
  platform,
  note,
  transfer,
  disabled,
  cover,
  onClick,
}: {
  title: string;
  thumb?: string;
  platform: Platform;
  note: string;
  transfer?: Transfer;
  disabled?: boolean;
  cover?: ComponentChildren; // 썸네일 위에 덮는 표시 (드라이브에만 있는 게임)
  onClick: () => void;
}) {
  return (
    <button class="card glass" disabled={disabled} onClick={onClick}>
      <div class="thumb">
        {thumb ? <img src={thumb} alt="" /> : !cover && <span>{title}</span>}
        {cover}
        <Progress t={transfer} />
      </div>
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

/** 이 기기에 있는 게임 = 바로 실행할 수 있다. 드라이브에 올렸는지는 카드에 적지 않는다 (게임 설정의 정보에서 본다). 올리는 중이면 진행률만 */
export function LocalGameCard({ game, thumb, transfer, onPlay, onSettings }: { game: Game; thumb?: string; transfer?: Transfer; onPlay: () => void; onSettings: () => void }) {
  return (
    <li>
      <Card title={game.title} thumb={thumb} platform={game.platform} note={playedNote(game)} transfer={transfer} onClick={onPlay} />
      <button class="more glass" title="설정" aria-label={`${game.title} 설정`} onClick={onSettings}>
        ⋯
      </button>
    </li>
  );
}

/** 드라이브에만 있는 게임: 썸네일 위에 반투명 막과 받기 표시. 누르면 받기만 하고(실행하지 않는다), 다 받으면 보통 카드가 된다 */
export function RemoteGameCard({ remote, transfer, onDownload }: { remote: RemoteGame; transfer?: Transfer; onDownload: () => void }) {
  return (
    <li class="remote">
      <Card
        title={remote.game.title}
        thumb={remote.thumb}
        platform={remote.game.platform}
        note={transfer ? "받는 중…" : "드라이브에 있음"}
        disabled={!!transfer}
        transfer={transfer}
        cover={
          !transfer && (
            <div class="need-download">
              <IconDownload />
              <span>다운로드 필요</span>
            </div>
          )
        }
        onClick={onDownload}
      />
    </li>
  );
}
