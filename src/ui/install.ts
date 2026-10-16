// 앱으로 설치(PWA). 크롬·엣지·안드로이드는 브라우저가 주는 설치 창을 띄우고, 아이폰·아이패드 사파리는 설치 창이 없어서 방법을 알려 준다.
// 브라우저는 설치 창을 페이지가 열릴 때 한 번만 넘겨주므로 앱이 시작될 때부터 받아 둔다 (entry.tsx에서 이 파일을 불러온다).
import { useEffect, useState } from "preact/hooks";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // 브라우저가 알아서 띄우는 안내 대신 계정 메뉴의 버튼으로
  deferred = e as InstallPrompt;
  changed();
});
addEventListener("appinstalled", () => {
  deferred = null;
  changed();
});

/** 이미 설치한 앱으로 열려 있다 */
export const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** 아이폰·아이패드 (아이패드는 데스크톱 사파리처럼 보이므로 터치로 가린다) */
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export type InstallState = { kind: "prompt"; install: () => Promise<void> } | { kind: "ios" } | { kind: "none" };

export function useInstall(): InstallState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (standalone()) return { kind: "none" };
  if (deferred) {
    const d = deferred;
    return {
      kind: "prompt",
      install: async () => {
        await d.prompt();
        if ((await d.userChoice).outcome === "accepted") deferred = null;
        changed();
      },
    };
  }
  return ios ? { kind: "ios" } : { kind: "none" };
}
