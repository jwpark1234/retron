// 라이브러리 목록: 이 기기의 게임(최근 플레이 순) + 썸네일 + 드라이브에만 있는 게임(다른 기기에서 올린 것).
// 드라이브 목록은 기기에 적어 둔 것을 먼저 보여 주고, 연결돼 있으면 새로 받는다. 오프라인이어도 드라이브 게임이 사라지지 않는다.
// 드라이브에 올라간 게임 키(onDrive)도 같이 준다. 이 기기에만 있는 게임은 다른 기기 라이브러리에 안 보이므로 카드에 표시한다.
import { useEffect, useRef, useState } from "preact/hooks";
import { cachedRemoteGames, listRemoteGames, useTransfers, type RemoteGame } from "../../cloud/games";
import { useAuth } from "../../cloud/google-auth";
import { listGames, thumbnailFile, type Game } from "../../library/library";

export function useGames() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [remote, setRemote] = useState<RemoteGame[]>([]);
  const [onDrive, setOnDrive] = useState<Set<string> | null>(null); // 드라이브 목록을 못 읽었으면 null
  // 썸네일 주소는 그림이 바뀔 때만 새로 만든다. 목록을 새로 읽을 때마다 만들면 모든 카드 그림이 다시 그려져 그리드가 깜빡인다
  const thumbCache = useRef(new Map<string, { stamp: string; url: string }>());
  const auth = useAuth();
  const transfers = useTransfers();

  const refresh = async () => {
    const list = (await listGames()).sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
    setGames(list);
    const next: Record<string, string> = {};
    const cache = thumbCache.current;
    for (const g of list) {
      const f = await thumbnailFile(g.id);
      const old = cache.get(g.id);
      const stamp = f ? `${f.lastModified}:${f.size}` : "";
      if (old && old.stamp !== stamp) URL.revokeObjectURL(old.url);
      if (!f) cache.delete(g.id);
      else if (old?.stamp !== stamp) cache.set(g.id, { stamp, url: URL.createObjectURL(f) });
      if (f) next[g.id] = cache.get(g.id)!.url;
    }
    setThumbs((prev) => (Object.keys(prev).length === Object.keys(next).length && Object.entries(next).every(([k, v]) => prev[k] === v) ? prev : next));
    if (!auth.signedIn) return setRemote([]);
    const local = new Set(list.map((g) => g.syncKey));
    const show = (r: RemoteGame[]) => {
      setRemote(r.filter((x) => !local.has(x.key)));
      setOnDrive(new Set(r.map((x) => x.key)));
    };
    const cached = await cachedRemoteGames();
    if (cached.length) show(cached);
    if (auth.driveReady && navigator.onLine) await listRemoteGames().then(show, () => undefined);
  };

  useEffect(() => {
    void navigator.storage.persist?.();
    return () => thumbCache.current.forEach((t) => URL.revokeObjectURL(t.url));
  }, []);
  useEffect(() => void refresh(), [auth.signedIn, auth.driveReady]);

  // 올리기·받기가 끝나면 목록을 다시 맞춘다
  const busy = Object.keys(transfers).length;
  useEffect(() => {
    if (!busy) void refresh();
  }, [busy]);

  return { games, thumbs, remote, onDrive, transfers, refresh };
}
