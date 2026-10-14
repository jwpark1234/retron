// 모바일(터치 기기)에서만 보이는 가상 키
export function VirtualKeys<K>({ keys, onKey }: { keys: { label: string; key: K }[]; onKey: (key: K, pressed: boolean) => void }) {
  if (!matchMedia("(pointer: coarse)").matches) return null;
  return (
    <div class="vkeys">
      {keys.map((k) => (
        <button
          key={k.label}
          onPointerDown={(e) => {
            e.preventDefault();
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
