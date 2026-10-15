// 게임 화면: 기종 비율(기본 4:3) 상자 안의 캔버스 + 화면 필터(선명/부드럽게/CRT). 모든 기종이 같이 쓴다.
import type { Ref } from "preact";
import type { ScreenFilter } from "../ui/prefs";

export function Screen({ canvasRef, filter, aspect = "4 / 3" }: { canvasRef: Ref<HTMLCanvasElement>; filter: ScreenFilter; aspect?: string }) {
  return (
    <div class="screen" style={{ "--aspect": aspect }}>
      <canvas ref={canvasRef} class={`filter-${filter}`} />
      {filter === "crt" && <div class="crt-overlay" />}
    </div>
  );
}
