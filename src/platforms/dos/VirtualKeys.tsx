// 모바일(터치 기기)에서만 보이는 가상 키. cols 칸 격자에 놓고, 넓은 키(Space, Enter 등)는 두 칸을 쓴다
import { touchDevice } from "../../player/orientation";

export function VirtualKeys<K>({ keys, cols, onKey }: { keys: { label: string; key: K; wide?: boolean }[]; cols: number; onKey: (key: K, pressed: boolean) => void }) {
  if (!touchDevice) return null;
  return (
    <div class="vkeys" style={{ "--cols": cols }}>
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
