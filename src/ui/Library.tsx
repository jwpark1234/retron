import { useEffect, useRef, useState } from "preact/hooks";
import { listGames, thumbnailUrl, type Game } from "../library/library";
import { importFiles, type Entry } from "../library/import";
import { canPickFolder, fromDrop, fromInput } from "../library/pick";
import { Logo } from "./Logo";
import { GameSettings } from "./GameSettings";
import { useSync } from "../sync/sync";
import { listRemoteGames, uploadGame, useTransfers, type RemoteGame, type Transfer } from "../cloud/games";
import { signOut, useAuth } from "../cloud/google-auth";

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
  const [addMenu, setAddMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
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

  const add = async (picked: Entry[]) => {
    setAddMenu(false);
    if (!picked.length || progress) return;
    setError("");
    try {
      const added = await importFiles(picked, {
        progress: setProgress,
        chooseExe: (candidates) => new Promise((resolve) => setChoice({ candidates, resolve })),
      });
      await refresh();
      // 내 구글 드라이브에 올린다 (뒤에서 하나씩)
      void (async () => {
        for (const g of added) await uploadGame(g.id).catch((err) => setError(`드라이브에 올리지 못했습니다: ${(err as Error).message}`));
      })();
    } catch (err) {
      setError((err as Error).message);
    }
    setProgress("");
  };

  const onPick = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const picked = fromInput(input.files);
    input.value = "";
    void add(picked);
  };

  // 휴대폰은 폴더를 못 고르므로 바로 파일 선택창을 연다
  const openAdd = () => (canPickFolder() ? setAddMenu(!addMenu) : fileInput.current?.click());

  // PC: 파일이나 폴더를 창에 끌어다 놓아도 추가된다
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => hasFiles(e) && (depth++, setDragging(true));
    const leave = (e: DragEvent) => hasFiles(e) && --depth <= 0 && ((depth = 0), setDragging(false));
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void fromDrop(e.dataTransfer!).then(add);
    };
    addEventListener("dragenter", enter);
    addEventListener("dragleave", leave);
    addEventListener("dragover", over);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragenter", enter);
      removeEventListener("dragleave", leave);
      removeEventListener("dragover", over);
      removeEventListener("drop", drop);
    };
  }, [progress]);

  const syncState = sync.conflict ? "warn" : sync.pending ? "pending" : "ok";
  const syncLabel = sync.conflict ? "세이브 충돌이 있습니다" : sync.pending ? `드라이브에 올릴 세이브 ${sync.pending}개` : "드라이브와 동기화됨";

  return (
    <div class="library">
      <header class="glass">
        <Logo size="small" />
        <div class="actions">
          <div class="seg glass" role="group" aria-label="보기 방식">
            <button class={view === "grid" ? "on" : ""} aria-label="그리드" title="그리드" onClick={() => changeView("grid")}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="1" y="1" width="6" height="6" rx="1.5" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" />
              </svg>
            </button>
            <button class={view === "list" ? "on" : ""} aria-label="목록" title="목록" onClick={() => changeView("list")}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="1" y="2" width="14" height="3" rx="1.5" />
                <rect x="1" y="6.5" width="14" height="3" rx="1.5" />
                <rect x="1" y="11" width="14" height="3" rx="1.5" />
              </svg>
            </button>
          </div>
          <div class="popover-anchor">
            <button class="primary add" disabled={!!progress} onClick={openAdd}>
              + 게임 추가
            </button>
            {addMenu && (
              <>
                <div class="popover-backdrop" onClick={() => setAddMenu(false)} />
                <div class="popover glass">
                  <button onClick={() => fileInput.current?.click()}>
                    <strong>파일 선택</strong>
                    <small>zip, SFC ROM (.sfc .smc)</small>
                  </button>
                  <button onClick={() => folderInput.current?.click()}>
                    <strong>폴더 선택</strong>
                  </button>
                  <p class="muted">파일이나 폴더를 창에 끌어다 놓아도 됩니다</p>
                </div>
              </>
            )}
          </div>
          <div class="popover-anchor">
            <button class={`avatar ${syncState}`} aria-label="계정" title={auth.email} onClick={() => setAccountMenu(!accountMenu)}>
              {(auth.email ?? "?").slice(0, 1).toUpperCase()}
            </button>
            {accountMenu && (
              <>
                <div class="popover-backdrop" onClick={() => setAccountMenu(false)} />
                <div class="popover glass account">
                  <strong class="email">{auth.email}</strong>
                  <span class={`sync-line ${syncState}`}>{syncLabel}</span>
                  <button class="logout" onClick={signOut}>
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={onPick} />
        <input ref={folderInput} type="file" {...{ webkitdirectory: true }} hidden onChange={onPick} />
      </header>

      {progress && <p class="progress">{progress}</p>}
      {error && <p class="error">{error}</p>}

      {games?.length === 0 && !remote.length && !progress && (
        <div class="empty glass">
          <h2>게임을 추가하세요!</h2>
          <p>
            DOS 게임은 게임 폴더나 zip, SFC는 ROM 파일(.sfc/.smc)이나 zip을 추가하세요.
          </p>
          <button class="primary" onClick={openAdd}>
            + 게임 추가
          </button>
        </div>
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
                  {g.lastPlayedAt ? `${new Date(g.lastPlayedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })} 플레이` : "새로 추가됨"}
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

      {dragging && <div class="drop-hint">여기에 놓으면 게임을 추가합니다</div>}

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
