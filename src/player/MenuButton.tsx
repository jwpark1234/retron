// 게임 메뉴 버튼과 열림 상태. 버튼은 화면 컨트롤(가상패드, 키 막대) 안에 들어가기도 해서 플레이 화면이 상태를 갖는다.
// 저장·불러오기 팝업도 화면 버튼(QuickButtons)이 열므로 여기서 같이 갖는다.
import { useState } from "preact/hooks";

export type MenuState = ReturnType<typeof useMenuState>;
export type SlotMode = "save" | "load";

export function useMenuState() {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotMode | null>(null);
  return { open, setOpen, toggle: () => setOpen((o) => !o), slots, openSlots: (mode: SlotMode | null) => setSlots(mode) };
}

/** 화면 컨트롤이 있으면 그 안에, 없으면 빠른 버튼과 함께 화면 아래 가운데에 흐리게 띄운다(GameMenu). 게임 화면을 가리지 않게 위쪽은 쓰지 않는다 */
export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button class="glass menu-button" aria-label="메뉴" onClick={onClick}>
      ☰
    </button>
  );
}
