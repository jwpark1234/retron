// 플레이 화면이 갖는 상태: 메뉴 열림, 저장·불러오기 팝업, 빨리가기(켜고 끄기).
// 버튼은 화면 컨트롤(가상패드, DOS 막대) 안에 들어가거나 PC에서는 화면 아래에 떠서 여러 곳에서 쓰므로 여기서 같이 갖는다.
import { useEffect, useRef, useState } from "preact/hooks";
import type { StateBridge } from "./bridge";

export type MenuState = ReturnType<typeof useMenuState>;
export type SlotMode = "save" | "load";

export function useMenuState(bridge: StateBridge | null) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotMode | null>(null);
  const [fast, setFast] = useState(false);
  const fastRef = useRef(fast);
  fastRef.current = fast;

  // 게임이 새로 준비되면(브리지가 바뀌면) 빨리가기는 꺼진 상태에서 시작한다
  useEffect(() => setFast(false), [bridge]);

  const toggleFast = () => {
    if (!bridge?.setFastForward) return;
    const next = !fastRef.current;
    setFast(next);
    void bridge.setFastForward(next).catch(() => setFast(!next));
  };

  return {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
    slots,
    openSlots: (mode: SlotMode | null) => setSlots(mode),
    fast,
    canFast: !!bridge?.setFastForward,
    toggleFast,
  };
}
