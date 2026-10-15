// 화면에 늘 떠 있는 버튼(가상패드·DOS 막대 안, 없으면 화면 아래): 저장·불러오기(슬롯 팝업을 연다), 빨리가기(누르고 있는 동안만). DOS와 SFC·GBA가 같이 쓴다.
import { useEffect, useRef, useState } from "preact/hooks";
import type { StateBridge } from "./GameMenu";
import type { SlotMode } from "./MenuButton";

export function QuickButtons({ bridge, onSlots }: { bridge: StateBridge | null; onSlots: (mode: SlotMode) => void }) {
  const [fast, setFast] = useState(false);
  const fastRef = useRef(false);
  fastRef.current = fast;
  // 누른 채로 버튼이 사라지면(메뉴를 열거나 게임패드를 꽂으면) 빨리가기를 끈다
  useEffect(() => () => void (fastRef.current && bridge?.setFastForward?.(false).catch(() => undefined)), [bridge]);

  const hold = (on: boolean) => (e: PointerEvent) => {
    e.preventDefault();
    if (on) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (on === fast || !bridge?.setFastForward) return;
    setFast(on);
    void bridge.setFastForward(on).catch(() => undefined);
  };

  return (
    <div class="quick">
      <button class="vpad-btn pill" disabled={!bridge} onClick={() => onSlots("save")}>
        저장
      </button>
      <button class="vpad-btn pill" disabled={!bridge} onClick={() => onSlots("load")}>
        불러오기
      </button>
      <button
        class={`vpad-btn pill ${fast ? "held" : ""}`}
        disabled={!bridge?.setFastForward}
        aria-label="빨리가기 (누르고 있는 동안)"
        onPointerDown={hold(true)}
        onPointerUp={hold(false)}
        onPointerCancel={hold(false)}
      >
        ▶▶
      </button>
    </div>
  );
}
