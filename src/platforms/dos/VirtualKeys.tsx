// 휴대폰 화면 키. cols 칸 격자에 놓고, 넓은 키(Space, Enter 등)는 두 칸을 쓴다. 가로 화면 가운데 자리(mid)에서는 한 줄로 흘려 놓는다.
// 키가 많아 자리를 넘치면 오른쪽에 스크롤 막대가 생긴다. 키 위를 끌어서 스크롤하게 하지 않은 까닭: 키는 닿는 순간 눌려야 해서
// (게임 반응) 끌기를 스크롤로 바꾸면 그 사이 키가 잠깐 눌려 게임에 들어간다. 막대를 끌거나 누르면 그 자리로 넘어간다
import type { JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

function useScrollRail() {
  const grid = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ top: number; size: number } | null>(null); // 막대 손잡이 위치·크기 (0~1). 넘치지 않으면 null
  const update = () => {
    const g = grid.current;
    if (!g) return;
    const over = g.scrollHeight - g.clientHeight;
    const next = over > 1 ? { top: g.scrollTop / g.scrollHeight, size: g.clientHeight / g.scrollHeight } : null;
    // 그릴 때마다 다시 재므로, 값이 같으면 상태를 바꾸지 않는다 (바꾸면 다시 그리기가 끝없이 돈다)
    setView((v) => (v?.top === next?.top && v?.size === next?.size ? v : next));
  };
  useLayoutEffect(() => {
    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid.current!);
    for (const c of grid.current!.children) ro.observe(c);
    return () => ro.disconnect();
  });
  // 막대 위 손가락 위치(0~1)에 손잡이 가운데가 오게
  const seek = (e: PointerEvent) => {
    const g = grid.current;
    if (!g || !view) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = (e.clientY - r.top) / r.height - view.size / 2;
    g.scrollTop = Math.max(0, Math.min(1, at / (1 - view.size))) * (g.scrollHeight - g.clientHeight);
    update();
  };
  const rail = view && (
    <div
      class="vkeys-rail"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seek(e);
      }}
      onPointerMove={(e) => (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId) && seek(e)}
    >
      <div class="thumb" style={{ top: `${view.top * 100}%`, height: `${view.size * 100}%` }} />
    </div>
  );
  return { grid, rail, scrolls: !!view };
}

export function VirtualKeys<K>({
  keys,
  cols,
  onKey,
  class: cls,
  style,
}: {
  keys: { label: string; key: K; wide?: boolean }[];
  cols: number;
  onKey: (key: K, pressed: boolean) => void;
  class?: string;
  style?: JSX.CSSProperties;
}) {
  const { grid, rail, scrolls } = useScrollRail();
  return (
    <div class={`vkeys ${scrolls ? "scrolls" : ""} ${cls ?? ""}`} style={{ ...style, "--cols": cols }}>
      <div class="vkeys-grid" ref={grid}>
        {keys.map((k) => (
          <button
            key={k.label}
            class={k.wide ? "wide" : ""}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              onKey(k.key, true);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              onKey(k.key, false);
            }}
            onPointerCancel={() => onKey(k.key, false)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {rail}
    </div>
  );
}
