import { useEffect, useRef, useState } from "preact/hooks";
import { listGames, thumbnailUrl, type Game } from "../library/library";
import { importFiles } from "../library/import";
import { GameSettings } from "./GameSettings";

type View = "grid" | "list";
const PLATFORM_LABEL = { dos: "DOS", sfc: "SFC" } as const;

function loadView(): View {
  try {
    return localStorage.getItem("view") === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function Library({ onPlay }: { onPlay: (game: Game) => void }) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const urlsRef = useRef<string[]>([]);
  const [view, setView] = useState<View>(loadView);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Game | null>(null);
  const [choice, setChoice] = useState<{ candidates: string[]; resolve: (v: string | null) => void } | null>(null);

  const refresh = async () => {
    const list = (await listGames()).sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
    setGames(list);
    const urls: Record<string, string> = {};
    for (const g of list) {
      const url = await thumbnailUrl(g.id);
      if (url) urls[g.id] = url;
    }
    urlsRef.current.push(...Object.values(urls));
    setThumbs(urls);
  };

  useEffect(() => {
    void navigator.storage.persist?.();
    void refresh();
    return () => urlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("view", v);
    } catch {
      // 저장 못 해도 이번 화면에서는 적용된다
    }
  };

  const onPick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    setError("");
    try {
      await importFiles(files, {
        progress: setProgress,
        chooseExe: (candidates) => new Promise((resolve) => setChoice({ candidates, resolve })),
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setProgress("");
  };


  return (
    <div class="library">
      <header class="glass">
        <h1>retron</h1>
        <div class="actions">
          <div class="seg glass">
            <button class={view === "grid" ? "on" : ""} onClick={() => changeView("grid")}>
              그리드
            </button>
            <button class={view === "list" ? "on" : ""} onClick={() => changeView("list")}>
              목록
            </button>
          </div>
          <label class="pick glass">
            폴더 추가
            <input type="file" {...{ webkitdirectory: true }} onChange={onPick} hidden disabled={!!progress} />
          </label>
          <label class="pick glass">
            파일 추가
            <input type="file" multiple accept=".zip,.sfc,.smc,.fig,.swc" onChange={onPick} hidden disabled={!!progress} />
          </label>
        </div>
      </header>

      {progress && <p class="progress">{progress}</p>}
      {error && <p class="error">{error}</p>}

      {games?.length === 0 && !progress && (
        <p class="hint">
          게임을 추가하세요. DOS 게임은 게임 폴더나 zip(CD 게임은 bin/cue나 iso를 함께), SFC는 ROM 파일(.sfc/.smc)이나 zip을 고르면 됩니다.
        </p>
      )}

      <ul class={view}>
        {games?.map((g) => (
          <li key={g.id}>
            <button class="card glass" onClick={() => onPlay(g)}>
              <div class="thumb">{thumbs[g.id] ? <img src={thumbs[g.id]} alt="" /> : <span>{g.title}</span>}</div>
              <div class="meta">
                <strong>{g.title}</strong>
                <small>
                  <span class="badge">{PLATFORM_LABEL[g.platform]}</span>
                  {g.lastPlayedAt ? `${new Date(g.lastPlayedAt).toLocaleDateString()} 플레이` : "새로 추가됨"}
                </small>
              </div>
            </button>
            <button class="more glass" title="설정" aria-label={`${g.title} 설정`} onClick={() => setEditing(g)}>
              ⋯
            </button>
          </li>
        ))}
      </ul>

      {editing && <GameSettings game={editing} onClose={() => setEditing(null)} onChanged={refresh} />}

      {choice && (
        <div class="modal">
          <div class="dialog glass">
            <h2>실행할 파일을 고르세요</h2>
            {choice.candidates.map((c) => (
              <button
                class="glass"
                key={c}
                onClick={() => {
                  choice.resolve(c);
                  setChoice(null);
                }}
              >
                {c}
              </button>
            ))}
            <button
              class="cancel"
              onClick={() => {
                choice.resolve(null);
                setChoice(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
