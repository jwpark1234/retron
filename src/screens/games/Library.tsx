// 라이브러리 화면: 게임 목록(정렬), 게임 추가(고르기·끌어다 놓기), 게임 설정.
import { useEffect, useState } from "preact/hooks";
import { useUploadIssues } from "../../cloud/games";
import { useAuth } from "../../cloud/google-auth";
import { Popover } from "../../ui/controls";
import { setPrefs, usePrefs, type LibrarySort } from "../../ui/prefs";
import { addLumaSource, lumaOf, overlap } from "../../ui/adaptive-contrast";
import type { RemoteGame } from "../../cloud/games";
import type { Game } from "../../library/library";
import { LocalGameCard, PLATFORM_LABEL, RemoteGameCard } from "./GameCard";
import { GameSettings } from "./GameSettings";
import { LibraryHeader, useAddPicker } from "./LibraryHeader";
import { useGames } from "./useGames";
import { useFileDrop, useImport, type ExeChoice } from "./useImport";

function ExeChooser({ choice, onChoose }: { choice: ExeChoice; onChoose: (v: string | null) => void }) {
  return (
    <div class="modal">
      <div class="dialog glass">
        <h2>실행할 파일을 고르세요</h2>
        {choice.candidates.map((c) => (
          <button class="glass" key={c} onClick={() => onChoose(c)}>
            {c}
          </button>
        ))}
        <button class="cancel" onClick={() => onChoose(null)}>
          취소
        </button>
      </div>
    </div>
  );
}

/** 썸네일 밝기 (한 번 재서 기억). 위쪽 막대와 카드의 ⋯ 버튼이 썸네일 위에 올 때 글자색을 맞추는 데 쓴다 */
const thumbLumas = new WeakMap<HTMLImageElement, number>();
function thumbLuma(img: HTMLImageElement): number | undefined {
  if (thumbLumas.has(img)) return thumbLumas.get(img);
  if (!img.complete || !img.naturalWidth) return undefined;
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += lumaOf(d[i], d[i + 1], d[i + 2]);
  const l = sum / 64;
  thumbLumas.set(img, l);
  return l;
}

function useThumbLuma() {
  useEffect(
    () =>
      addLumaSource((rect) => {
        let sum = 0;
        let area = 0;
        for (const img of document.querySelectorAll<HTMLImageElement>(".thumb img")) {
          const o = overlap(rect, img.getBoundingClientRect());
          const l = o ? thumbLuma(img) : undefined;
          if (!o || l === undefined) continue;
          sum += l * o.area;
          area += o.area;
        }
        return area ? { luma: sum / area, cover: area / (rect.width * rect.height) } : null;
      }),
    [],
  );
}

// --- 정렬 ---
type Item = { kind: "local"; game: Game } | { kind: "remote"; remote: RemoteGame };
const SORTS: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "최근 플레이" },
  { value: "name", label: "이름" },
  { value: "added", label: "추가한 순" },
  { value: "platform", label: "기종" },
];
const PLATFORM_ORDER = Object.keys(PLATFORM_LABEL);
const info = (i: Item) => (i.kind === "local" ? i.game : i.remote.game);
const byName = (a: Item, b: Item) => info(a).title.localeCompare(info(b).title, "ko", { numeric: true });
const COMPARE: Record<LibrarySort, (a: Item, b: Item) => number> = {
  // 이 기기에서 한 게임이 먼저(최근 플레이 순), 드라이브에만 있는 게임은 뒤에(추가한 순)
  recent: (a, b) =>
    (a.kind === "local" ? 0 : 1) - (b.kind === "local" ? 0 : 1) ||
    (a.kind === "local" && b.kind === "local" ? (b.game.lastPlayedAt ?? b.game.addedAt) - (a.game.lastPlayedAt ?? a.game.addedAt) : info(b).addedAt - info(a).addedAt),
  name: byName,
  added: (a, b) => info(b).addedAt - info(a).addedAt,
  platform: (a, b) => PLATFORM_ORDER.indexOf(info(a).platform) - PLATFORM_ORDER.indexOf(info(b).platform) || byName(a, b),
};

function SortMenu({ count }: { count: number }) {
  const { librarySort } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <div class="lib-bar">
      <span class="muted">게임 {count}개</span>
      <div class="popover-anchor">
        <button class="sort-btn" aria-haspopup="menu" onClick={() => setOpen(!open)}>
          정렬: {SORTS.find((s) => s.value === librarySort)?.label} ▾
        </button>
        <Popover open={open} onClose={() => setOpen(false)} class="sort-menu">
          {SORTS.map((o) => (
            <button
              key={o.value}
              class={o.value === librarySort ? "on" : ""}
              onClick={() => {
                setPrefs({ librarySort: o.value });
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </Popover>
      </div>
    </div>
  );
}

export function Library({ onPlay, onPlayRemote }: { onPlay: (game: Game) => void; onPlayRemote: (r: RemoteGame) => void }) {
  const { games, thumbs, remote, onDrive, transfers, refresh } = useGames();
  useThumbLuma();
  // 드라이브 목록을 못 읽었으면 null (모름)
  const driveState = (g: Game) => (onDrive ? !!g.syncKey && onDrive.has(g.syncKey) : null);
  const imp = useImport(refresh);
  const picker = useAddPicker((entries) => void imp.add(entries));
  const dragging = useFileDrop((entries) => (entries ? void imp.add(entries) : imp.fail("폴더는 넣을 수 없습니다. zip으로 묶어서 넣어 주세요")), [imp.progress]);
  const [editing, setEditing] = useState<Game | null>(null);
  const { librarySort } = usePrefs();
  const issues = useUploadIssues();
  const auth = useAuth();

  const empty = games?.length === 0 && !remote.length && !imp.progress;
  const items: Item[] = [...(games ?? []).map((game) => ({ kind: "local", game }) as Item), ...remote.map((r) => ({ kind: "remote", remote: r }) as Item)].sort(
    COMPARE[librarySort],
  );
  // 드라이브에 없는 게임: 왜 아직 안 올라갔는지 (카드에 짧게, 길게는 마우스를 올리면)
  const notUploaded = (g: Game) => issues[g.id] ?? (auth.driveReady ? undefined : "드라이브에 연결되면 올립니다");

  return (
    <div class="library">
      <LibraryHeader picker={picker} progress={imp.progress} />

      {/* 오류는 목록 위에 끼워 넣지 않고 아래쪽에 띄운다 (그리드가 밀리지 않게) */}
      {imp.error && (
        <div class="import-error glass" role="alert">
          <span>{imp.error}</span>
          <button class="icon-btn" aria-label="닫기" onClick={() => imp.fail("")}>
            ✕
          </button>
        </div>
      )}

      {empty && (
        <div class="empty glass">
          <h2>게임을 추가하세요!</h2>
          <p>.zip, .sfc .smc .gba을 추가하세요.</p>
          <button class="primary" onClick={picker.open}>
            + 게임 추가
          </button>
        </div>
      )}

      {items.length > 0 && <SortMenu count={items.length} />}

      <ul class="grid">
        {items.map((i) =>
          i.kind === "local" ? (
            <LocalGameCard
              key={i.game.id}
              game={i.game}
              thumb={thumbs[i.game.id]}
              transfer={transfers[i.game.id]}
              deviceOnly={driveState(i.game) === false}
              uploadIssue={notUploaded(i.game)}
              onPlay={() => onPlay(i.game)}
              onSettings={() => setEditing(i.game)}
            />
          ) : (
            <RemoteGameCard key={i.remote.key} remote={i.remote} transfer={transfers[i.remote.key]} onDownload={() => onPlayRemote(i.remote)} />
          ),
        )}
      </ul>

      {dragging && <div class="drop-hint">여기에 놓으면 게임을 추가합니다</div>}
      {editing && <GameSettings game={editing} onDrive={driveState(editing)} uploadIssue={notUploaded(editing)} onClose={() => setEditing(null)} onChanged={refresh} />}
      {imp.choice && <ExeChooser choice={imp.choice} onChoose={imp.choose} />}
    </div>
  );
}
