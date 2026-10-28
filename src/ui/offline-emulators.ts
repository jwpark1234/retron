// 에뮬레이터 미리 받기: 서비스 워커는 그 기종 게임을 한 번 온라인에서 실행해야 에뮬레이터를 기기에 남겼다.
// Wi-Fi(또는 PC)일 때 뒤에서 모두 받아 두면 처음 하는 기종도 오프라인에서 바로 된다 (모두 합쳐 20MB쯤).
// 받기만 하면 서비스 워커(public/sw.js)가 기기에 둔다. 목록은 scripts/copy-emulators.mjs가 public/precache.json에 적는다.
// 모바일 데이터에서는 받지 않는다: 연결 종류를 모르는 휴대폰(아이폰)도 Wi-Fi인지 알 수 없으니 받지 않는다
import { touchDevice } from "../player/orientation";

interface Connection {
  type?: string;
  saveData?: boolean;
}
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;

/** 지금 큰 파일을 받아도 되는 연결 */
function unmetered(): boolean {
  const c = connection();
  if (!navigator.onLine || c?.saveData) return false;
  if (c?.type === "wifi" || c?.type === "ethernet") return true;
  return !touchDevice && c?.type !== "cellular";
}

let running = false;

export async function precacheEmulators() {
  if (running || !navigator.serviceWorker?.controller || !unmetered()) return;
  running = true;
  try {
    const list = (await (await fetch("./precache.json", { cache: "no-cache" })).json()) as string[];
    for (const path of list) {
      const url = new URL(path, document.baseURI).href;
      if (await caches.match(url)) continue;
      if (!unmetered()) break;
      await (await fetch(url)).blob(); // 끝까지 받아야 서비스 워커가 기기에 넣는다
    }
  } catch {
    // 다음에 다시 받는다 (받은 파일은 남는다)
  } finally {
    running = false;
  }
}
