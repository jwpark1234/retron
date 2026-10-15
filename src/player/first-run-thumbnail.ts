// 첫 실행 썸네일 (아이콘이 없던 게임): 로고가 지나간 뒤 충분히 밝은 화면을 찍는다.
// 그 전에 나가면 그때까지 가장 밝았던 화면을 쓴다. DOS와 SFC가 같이 쓴다.
import { saveThumbnail } from "../library/library";
import { hasThumbnail, litFraction } from "../library/thumbnail";

const EVERY_MS = 2500;
const MIN_WAIT_MS = 8000; // 회사 로고, 검은 화면이 지나갈 시간
const BRIGHT = 0.08; // 밝은 점이 이만큼이면 바로 쓴다
const SOME = 0.01; // 이보다 어두우면 아예 쓰지 않는다

/**
 * capture: 지금 화면을 1:1 PNG로 (못 찍으면 null)
 * onSaved: 썸네일을 저장했을 때 (드라이브에 올리기 등)
 * 돌려주는 함수: 그만 찍고, 찍어 둔 것이 있으면 저장한다 (게임을 나갈 때 부른다)
 */
export function watchFirstRunThumbnail(gameId: string, capture: () => Promise<Blob | null>, onSaved: () => void): () => Promise<void> {
  let best: { lit: number; png: Blob } | null = null;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const startedAt = Date.now();

  const finish = async () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (!best) return;
    await saveThumbnail(gameId, best.png);
    onSaved();
  };

  const tick = async () => {
    if (done) return;
    try {
      const png = await capture();
      const lit = png ? await litFraction(png) : 0;
      if (png && lit > (best?.lit ?? SOME)) best = { lit, png };
      if (lit >= BRIGHT && Date.now() - startedAt >= MIN_WAIT_MS) return void (await finish());
    } catch {
      // 이번 화면은 못 찍었다. 다음에 다시
    }
    if (!done) timer = setTimeout(tick, EVERY_MS);
  };

  void hasThumbnail(gameId).then((has) => (has ? (done = true) : (timer = setTimeout(tick, EVERY_MS))));
  return finish;
}
