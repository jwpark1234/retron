// 라이브러리 목록: 이 기기의 게임(최근 플레이 순) + 썸네일 + 드라이브에만 있는 게임(다른 기기에서 올린 것).
import { useEffect, useRef, useState } from "preact/hooks";
import { listRemoteGames, useTransfers, type RemoteGame } from "../../cloud/games";
import { useAuth } from "../../cloud/google-auth";
import { listGames, thumbnailUrl, type Game } from "../../library/library";

export function useGames() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [remote, setRemote] = useState<RemoteGame[]>([]);
  const urls = useRef<string[]>([]);
  const auth = useAuth();
  const transfers = useTransfers();

  const refresh = async () => {
    const list = (await listGames()).sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
    setGames(list);
    const next: Record<string, string> = {};
    for (const g of list) {
      const url = await thumbnailUrl(g.id);
      if (url) next[g.id] = url;
    }
    urls.current.push(...Object.values(next));
    setThumbs(next);
    if (!auth.signedIn) return setRemote([]);
    const local = new Set(list.map((g) => g.syncKey));
    listRemoteGames()
      .then((r) => setRemote(r.filter((x) => !local.has(x.key))))
      .catch(() => undefined);
  };

  useEffect(() => {
    void navigator.storage.persist?.();
    return () => urls.current.forEach(URL.revokeObjectURL);
  }, []);
  useEffect(() => void refresh(), [auth.signedIn]);

  // 올리기·받기가 끝나면 목록을 다시 맞춘다
  const busy = Object.keys(transfers).length;
  useEffect(() => {
    if (!busy) void refresh();
  }, [busy]);

  return { games, thumbs, remote, transfers, refresh };
}
