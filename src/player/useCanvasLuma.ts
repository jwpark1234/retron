// 게임 화면 밝기를 리퀴드 글래스 글자색 맞추기(ui/adaptive-contrast)에 알려 준다.
// 화면 위에 겹친 버튼이 있을 때만(가로 화면 조작, PC 버튼, 알림) 화면을 작은 격자로 찍어 둔다. 세로 화면처럼 안 겹치면 찍지 않는다.
import { useEffect, type MutableRef } from "preact/hooks";
import { addLumaSource, lumaOf, overlap } from "../ui/adaptive-contrast";
import { toLocal } from "./orientation";

const W = 32;
const H = 24;

/**
 * grab: 지금 화면 그림. 없으면 캔버스를 그대로 쓴다 (DOS: 2D 캔버스).
 * WebGL 캔버스(SFC·GBA·N64)는 그린 직후가 아니면 비어 있어서 에뮬레이터 스크린샷을 넘긴다.
 * everyMs: 찍는 간격 (스크린샷은 비싸니 길게)
 */
export function useCanvasLuma(
  canvas: MutableRef<HTMLCanvasElement | null>,
  rotation: MutableRef<number>,
  grab?: () => Promise<CanvasImageSource | null>,
  everyMs = 500,
) {
  useEffect(() => {
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    const ctx = small.getContext("2d", { willReadFrequently: true })!;
    let grid: Float32Array | null = null;
    let wanted = false; // 최근에 겹친 버튼이 있었다
    let busy = false;

    const refresh = async () => {
      if (!wanted || busy || document.hidden || !canvas.current?.width) return;
      wanted = false;
      busy = true;
      try {
        const img = grab ? await grab() : canvas.current;
        if (!img) return;
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        const g = new Float32Array(W * H);
        for (let i = 0; i < g.length; i++) g[i] = lumaOf(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
        grid = g;
      } catch {
        // 이번에는 못 찍었다
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void refresh(), everyMs);

    const off = addLumaSource((rect) => {
      const c = canvas.current;
      if (!c) return null;
      const cr = c.getBoundingClientRect();
      const o = overlap(rect, cr);
      if (!o) return null;
      wanted = true;
      if (!grid) return null;
      // 겹친 부분의 네 귀퉁이를 게임 좌표(0~1)로 바꿔 격자 범위를 잡는다 (화면을 돌렸으면 돌려서)
      const pts = [
        [o.left, o.top],
        [o.left + o.width, o.top],
        [o.left, o.top + o.height],
        [o.left + o.width, o.top + o.height],
      ].map(([x, y]) => toLocal({ clientX: x, clientY: y }, cr, rotation.current));
      const x0 = Math.floor(Math.min(...pts.map((p) => p.x)) * (W - 1));
      const x1 = Math.ceil(Math.max(...pts.map((p) => p.x)) * (W - 1));
      const y0 = Math.floor(Math.min(...pts.map((p) => p.y)) * (H - 1));
      const y1 = Math.ceil(Math.max(...pts.map((p) => p.y)) * (H - 1));
      let sum = 0;
      let n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (sum += grid[y * W + x]), n++;
      return n ? { luma: sum / n, cover: o.area / (rect.width * rect.height) } : null;
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);
}
