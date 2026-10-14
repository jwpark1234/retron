import { VIRTUAL_KEYS } from "./game-config";

export function VirtualKeyboard({ onKey }: { onKey: (key: number, pressed: boolean) => void }) {
  return (
    <div class="vkeys">
      {VIRTUAL_KEYS.map((k) => (
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
