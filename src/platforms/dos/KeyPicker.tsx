// 키 버튼 고르기 팝업: 전체 키보드를 보여 주고, 이 게임에서 쓸 키만 눌러 켠다. 방향키(또는 키패드 8·2·4·6)는 넷이 같이 켜지고 방향 패드로 나온다.
import { IconClose } from "../../ui/icons";
import { KB_COLUMNS, KEYBOARD, arrowGroup, isArrow } from "./keyboard";

export function KeyPicker({ keys, onChange, onReset, onClose }: { keys: number[]; onChange: (keys: number[]) => void; onReset: () => void; onClose: () => void }) {
  const on = new Set(keys);
  const toggle = (key: number) => {
    const group = isArrow(key) ? arrowGroup(key) : [key];
    onChange(on.has(key) ? keys.filter((k) => !group.includes(k)) : [...keys, ...group]);
  };
  const count = keys.filter((k) => !isArrow(k)).length;
  return (
    <div class="menu-backdrop kb-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="glass menu-sheet kb-sheet">
        <div class="menu-head">
          <span />
          <strong>키 버튼 고르기</strong>
          <button class="icon-btn" aria-label="닫기" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <p class="kb-hint">이 게임에서 쓸 키를 눌러 켜세요. 방향키나 키패드 8·4·6·2를 켜면 방향 패드가 나옵니다.</p>
        <div class="kb-scroll">
          <div class="kb" style={{ gridTemplateColumns: `repeat(${KB_COLUMNS}, 1fr)` }}>
            {KEYBOARD.map((k) => (
              <button
                key={`${k.row}-${k.col}`}
                class={on.has(k.key) ? "on" : ""}
                style={{ gridRow: k.row, gridColumn: `${k.col} / span ${k.span}` }}
                onClick={() => toggle(k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div class="kb-foot">
          <span>
            키 {count}개{keys.some(isArrow) ? " · 방향 패드" : ""}
          </span>
          <button class="glass small" onClick={onReset}>
            기본값
          </button>
          <button class="glass small primary" onClick={onClose}>
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
