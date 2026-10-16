// 라이브러리 목록: 이 기기의 게임(최근 플레이 순) + 썸네일 + 드라이브에만 있는 게임(다른 기기에서 올린 것).
// 드라이브 목록은 기기에 적어 둔 것을 먼저 보여 주고, 연결돼 있으면 새로 받는다. 오프라인이어도 드라이브 게임이 사라지지 않는다.
// 드라이브에 올라간 게임 키(onDrive)도 같이 준다. 이 기기에만 있는 게임은 다른 기기 라이브러리에 안 보이므로 카드에 표시한다.
import { useEffect, useRef, useState } from "preact/hooks";
import { cachedRemoteGames, listRemoteGames, useTransfers, type RemoteGame } from "../../cloud/games";
import { useAuth } from "../../cloud/google-auth";
import { listGames, thumbnailUrl, type Game } from "../../library/library";

export function useGames() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [remote, setRemote] = useState<RemoteGame[]>([]);
  const [onDrive, setOnDrive] = useState<Set<string> | null>(null); // 드라이브 목록을 못 읽었으면 null
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
    return () => urls.current.forEach(URL.revokeObjectURL);
  }, []);
  useEffect(() => void refresh(), [auth.signedIn, auth.driveReady]);

  // 올리기·받기가 끝나면 목록을 다시 맞춘다
  const busy = Object.keys(transfers).length;
  useEffect(() => {
    if (!busy) void refresh();
  }, [busy]);

  return { games, thumbs, remote, onDrive, transfers, refresh };
}
