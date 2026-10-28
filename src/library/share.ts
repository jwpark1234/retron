// 다른 앱에서 "공유"로 보낸 롬 (안드로이드에 설치한 앱). 서비스 워커(public/sw.js)가 받아서 기기에 두고 앱을 연다.
// 라이브러리가 열리면 가져가서 게임 추가와 똑같이 넣는다. 로그인 전에 받았으면 로그인한 뒤 라이브러리에서 가져간다.
import type { Entry } from "./import";

const SHARE = "retron-share";

/** 공유로 받아 두고 아직 추가하지 않은 파일 */
export async function sharedFiles(): Promise<Entry[]> {
  if (new URLSearchParams(location.search).has("shared")) history.replaceState(null, "", location.pathname);
  if (!("caches" in window) || !(await caches.has(SHARE))) return [];
  const cache = await caches.open(SHARE);
  const out: Entry[] = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    if (!res) continue;
    const name = new URL(req.url).searchParams.get("name") || "game";
    out.push({ path: name, file: new File([await res.blob()], name, { type: res.headers.get("Content-Type") ?? "" }) });
  }
  return out;
}

/** 추가를 마쳤으면 지운다 (실패해도 지운다: 같은 오류가 앱을 열 때마다 나지 않게) */
export const clearShared = () => caches.delete(SHARE).catch(() => false);
