// 게임을 올리거나 받는 동안 화면이 꺼지지 않게 한다 (Screen Wake Lock, iOS 16.4+·안드로이드 크롬).
// 휴대폰은 화면이 꺼지면 브라우저가 페이지를 멈춰서 올리기가 끊긴다. 다른 앱으로 넘어가는 것은 막을 수 없다.

type Sentinel = { release(): Promise<void>; released: boolean };

let want = false;
let sentinel: Sentinel | null = null;

async function acquire() {
  if (!want || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
  try {
    sentinel = await (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } }).wakeLock?.request("screen") ?? null;
  } catch {
    // 지원하지 않거나 배터리 절약 모드: 그냥 둔다
  }
}

// 화면을 벗어나면 브라우저가 풀어 버리므로 돌아오면 다시 잡는다
document.addEventListener("visibilitychange", () => void acquire());

/** 전송 중이면 true */
export function keepAwake(on: boolean) {
  if (on === want) return;
  want = on;
  if (on) void acquire();
  else {
    void sentinel?.release().catch(() => undefined);
    sentinel = null;
  }
}
