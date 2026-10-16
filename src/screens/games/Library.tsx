// 라이브러리 화면: 게임 목록, 게임 추가(고르기·끌어다 놓기), 게임 설정.
import { useEffect, useState } from "preact/hooks";
import { addLumaSource, lumaOf, overlap } from "../../ui/adaptive-contrast";
import type { RemoteGame } from "../../cloud/games";
import type { Game } from "../../library/library";
import { Spinner } from "../../ui/Spinner";
import { LocalGameCard, RemoteGameCard } from "./GameCard";
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

export function Library({ onPlay, onPlayRemote }: { onPlay: (game: Game) => void; onPlayRemote: (r: RemoteGame) => void }) {
  const { games, thumbs, remote, onDrive, transfers, refresh } = useGames();
  useThumbLuma();
  // 드라이브 목록을 못 읽었으면 null (모름)
  const driveState = (g: Game) => (onDrive ? !!g.syncKey && onDrive.has(g.syncKey) : null);
  const imp = useImport(refresh);
  const picker = useAddPicker((entries) => void imp.add(entries));
  const dragging = useFileDrop((entries) => (entries ? void imp.add(entries) : imp.fail("폴더는 넣을 수 없습니다. zip으로 묶어서 넣어 주세요")), [imp.progress]);
  const [editing, setEditing] = useState<Game | null>(null);

  const empty = games?.length === 0 && !remote.length && !imp.progress;

  return (
    <div class="library">
      <LibraryHeader picker={picker} busy={!!imp.progress} />

      {imp.progress && (
        <p class="progress">
          <Spinner small />
          {imp.progress}
        </p>
      )}
      {imp.error && <p class="error">{imp.error}</p>}

      {empty && (
        <div class="empty glass">
          <h2>게임을 추가하세요!</h2>
          <p>.zip, .sfc .smc .gba을 추가하세요.</p>
          <button class="primary" onClick={picker.open}>
            + 게임 추가
          </button>
        </div>
      )}

      <ul class="grid">
        {games?.map((g) => (
          <LocalGameCard
            key={g.id}
            game={g}
            thumb={thumbs[g.id]}
            transfer={transfers[g.id]}
            deviceOnly={driveState(g) === false}
            onPlay={() => onPlay(g)}
            onSettings={() => setEditing(g)}
          />
        ))}
        {remote.map((r) => (
          <RemoteGameCard key={r.key} remote={r} transfer={transfers[r.key]} onDownload={() => onPlayRemote(r)} />
        ))}
      </ul>

      {dragging && <div class="drop-hint">여기에 놓으면 게임을 추가합니다</div>}
      {editing && <GameSettings game={editing} onDrive={driveState(editing)} onClose={() => setEditing(null)} onChanged={refresh} />}
      {imp.choice && <ExeChooser choice={imp.choice} onChoose={imp.choose} />}
    </div>
  );
}
