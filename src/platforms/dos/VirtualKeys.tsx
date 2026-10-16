// 휴대폰 화면 키. cols 칸 격자에 놓고, 넓은 키(Space, Enter 등)는 두 칸을 쓴다. 가로 화면 가운데 자리(mid)에서는 한 줄로 흘려 놓는다
import type { JSX } from "preact";

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
  return (
    <div class={`vkeys ${cls ?? ""}`} style={{ ...style, "--cols": cols }}>
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
  );
}
