// 새 버전 확인: 휴대폰은 설치한 앱을 며칠씩 띄워 둬서, 배포해도 옛 코드가 계속 돈다.
// 화면으로 돌아올 때와 30분마다 서버의 첫 페이지가 부르는 진입 파일(assets/index-해시.js)을 지금 도는 것과 비교한다.
// 다르면 라이브러리 위쪽 로고 옆에 업데이트 버튼을 보여 준다 (창을 띄우지 않는다). 누르면 다시 연다:
// 서비스 워커가 첫 페이지는 서버에서 먼저 받으므로 새 버전이 열린다
import { useEffect, useState } from "preact/hooks";

const CHECK_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

const entryOf = (html: string) => html.match(/assets\/index-[^"']+\.js/)?.[0];
/** 지금 돌고 있는 진입 파일 (개발 서버에는 없다) */
const running = () => entryOf(document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute("src") ?? "");

let available = false;
let checking = false;
const listeners = new Set<() => void>();

async function check() {
  const now = running();
  if (available || checking || !now || !navigator.onLine || document.visibilityState !== "visible") return;
  checking = true;
  try {
    // ?version: 서비스 워커가 기기에 둔 것을 주지 않고 늘 서버에 묻는다 (public/sw.js)
    const res = await fetch("./?version", { cache: "no-store" });
    const latest = res.ok ? entryOf(await res.text()) : undefined;
    if (latest && latest !== now) {
      available = true;
      listeners.forEach((l) => l());
    }
  } catch {
    // 다음에 다시 본다
  } finally {
    checking = false;
  }
}

if (import.meta.env.PROD) {
  document.addEventListener("visibilitychange", () => void check());
  addEventListener("online", () => void check());
  setTimeout(() => void check(), FIRST_CHECK_MS);
  setInterval(() => void check(), CHECK_MS);
}

/** 새 버전이 배포됐다 */
export function useUpdateAvailable(): boolean {
  const [v, setV] = useState(available);
  useEffect(() => {
    const l = () => setV(true);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return v;
}

export const applyUpdate = () => location.reload();
