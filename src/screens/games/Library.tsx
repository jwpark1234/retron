// 라이브러리 화면: 게임 목록, 게임 추가(고르기·끌어다 놓기), 게임 설정.
import { useState } from "preact/hooks";
import type { RemoteGame } from "../../cloud/games";
import type { Game } from "../../library/library";
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

export function Library({ onPlay, onPlayRemote }: { onPlay: (game: Game) => void; onPlayRemote: (r: RemoteGame) => void }) {
  const { games, thumbs, remote, transfers, refresh } = useGames();
  const imp = useImport(refresh);
  const picker = useAddPicker((entries) => void imp.add(entries));
  const dragging = useFileDrop((entries) => (entries ? void imp.add(entries) : imp.fail("폴더는 넣을 수 없습니다. zip으로 묶어서 넣어 주세요")), [imp.progress]);
  const [editing, setEditing] = useState<Game | null>(null);

  const empty = games?.length === 0 && !remote.length && !imp.progress;

  return (
    <div class="library">
      <LibraryHeader picker={picker} busy={!!imp.progress} />

      {imp.progress && <p class="progress">{imp.progress}</p>}
      {imp.error && <p class="error">{imp.error}</p>}

      {empty && (
        <div class="empty glass">
          <h2>게임을 추가하세요!</h2>
          <p>DOS 게임은 zip, SFC·GBA는 롬 파일(.sfc .smc .gba)이나 zip을 추가하세요.</p>
          <button class="primary" onClick={picker.open}>
            + 게임 추가
          </button>
        </div>
      )}

      <ul class="grid">
        {games?.map((g) => (
          <LocalGameCard key={g.id} game={g} thumb={thumbs[g.id]} transfer={transfers[g.id]} onPlay={() => onPlay(g)} onSettings={() => setEditing(g)} />
        ))}
        {remote.map((r) => (
          <RemoteGameCard key={r.key} remote={r} transfer={transfers[r.key]} onDownload={() => onPlayRemote(r)} />
        ))}
      </ul>

      {dragging && <div class="drop-hint">여기에 놓으면 게임을 추가합니다</div>}
      {editing && <GameSettings game={editing} onClose={() => setEditing(null)} onChanged={refresh} />}
      {imp.choice && <ExeChooser choice={imp.choice} onChoose={imp.choose} />}
    </div>
  );
}
