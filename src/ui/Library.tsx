import { useEffect, useRef, useState } from "preact/hooks";
import { listGames, thumbnailUrl, type Game } from "../library/library";
import { importFiles } from "../library/import";
import { GameSettings } from "./GameSettings";
import { useSync } from "../sync/sync";
import { listRemoteGames, uploadGame, useTransfers, type RemoteGame, type Transfer } from "../cloud/games";
import { signIn, signOut, useAuth } from "../cloud/google-auth";

type View = "grid" | "list";
const PLATFORM_LABEL = { dos: "DOS", sfc: "SFC" } as const;

function loadView(): View {
  try {
    return localStorage.getItem("view") === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

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

export function Library({ onPlay, onPlayRemote }: { onPlay: (game: Game) => void; onPlayRemote: (r: RemoteGame) => void }) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const urlsRef = useRef<string[]>([]);
  const [view, setView] = useState<View>(loadView);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Game | null>(null);
  const sync = useSync();
  const auth = useAuth();
  const transfers = useTransfers();
  const [remote, setRemote] = useState<RemoteGame[]>([]);
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
    if (auth.signedIn) {
      // 드라이브에만 있는 게임 (다른 기기에서 올린 것)
      const local = new Set(list.map((g) => g.syncKey));
      listRemoteGames()
        .then((r) => setRemote(r.filter((x) => !local.has(x.key))))
        .catch(() => undefined);
    } else setRemote([]);
  };

  useEffect(() => {
    void navigator.storage.persist?.();
    return () => urlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  useEffect(() => void refresh(), [auth.signedIn]);
  // 올리기·받기가 끝나면 목록을 다시 맞춘다
  const busy = Object.keys(transfers).length;
  useEffect(() => {
    if (!busy) void refresh();
  }, [busy]);

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
      const added = await importFiles(files, {
        progress: setProgress,
        chooseExe: (candidates) => new Promise((resolve) => setChoice({ candidates, resolve })),
      });
      await refresh();
      // 로그인했으면 내 구글 드라이브에 올린다 (뒤에서 하나씩)
      void (async () => {
        for (const g of added) await uploadGame(g.id).catch((err) => setError(`드라이브에 올리지 못했습니다: ${(err as Error).message}`));
      })();
    } catch (err) {
      setError((err as Error).message);
    }
    setProgress("");
  };


  return (
    <div class="library">
      <header class="glass">
        <h1>retron</h1>
        <div class="account">
          {auth.signedIn ? (
            <>
              <span class={`sync-chip ${sync.conflict ? "warn" : sync.pending ? "pending" : "ok"}`}>
                {sync.conflict ? "⚠ 충돌 있음" : sync.pending ? `↑ ${sync.pending}개 대기` : "✓ 드라이브 동기화"}
              </span>
              <span class="email" title={auth.email}>
                {auth.email}
              </span>
              <button class="logout" onClick={signOut}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button class="glass google" disabled={auth.busy} onClick={() => void signIn().catch(() => undefined)}>
                {auth.busy ? "로그인 중…" : "Google 로그인"}
              </button>
              <span class="sync-chip off">로그인하면 게임과 세이브가 내 구글 드라이브에 저장됩니다</span>
            </>
          )}
        </div>
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

      {auth.error && <p class="error">로그인하지 못했습니다: {auth.error}</p>}

      {games?.length === 0 && !remote.length && !progress && (
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
            <Progress t={transfers[g.id]} />
            <button class="more glass" title="설정" aria-label={`${g.title} 설정`} onClick={() => setEditing(g)}>
              ⋯
            </button>
          </li>
        ))}
        {remote.map((r) => (
          <li key={r.key} class="remote">
            <button class="card glass" disabled={!!transfers[r.key]} onClick={() => onPlayRemote(r)}>
              <div class="thumb">{r.thumb ? <img src={r.thumb} alt="" /> : <span>{r.game.title}</span>}</div>
              <div class="meta">
                <strong>{r.game.title}</strong>
                <small>
                  <span class="badge">{PLATFORM_LABEL[r.game.platform]}</span>☁ 드라이브 · 눌러서 받기
                </small>
              </div>
            </button>
            <Progress t={transfers[r.key]} />
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
