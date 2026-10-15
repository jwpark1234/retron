// 여러 화면이 같이 쓰는 작은 부품: 설정 줄, 켜고 끄기 스위치, 여러 개 중 하나 고르기, 말풍선 메뉴.
import type { ComponentChildren } from "preact";

/** 메뉴의 한 줄: 왼쪽 이름, 오른쪽 조작 */
export function Row({ label, children }: { label: string; children?: ComponentChildren }) {
  return (
    <div class="menu-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <button class={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ComponentChildren; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div class="seg glass" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} class={value === o.value ? "on" : ""} title={o.title} aria-label={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 버튼 아래에 뜨는 말풍선 메뉴. 바깥을 누르면 닫힌다 */
export function Popover({ open, onClose, class: cls, children }: { open: boolean; onClose: () => void; class?: string; children: ComponentChildren }) {
  if (!open) return null;
  return (
    <>
      <div class="popover-backdrop" onClick={onClose} />
      <div class={`popover glass ${cls ?? ""}`}>{children}</div>
    </>
  );
}
