// 화면에 늘 떠 있는 버튼: 왼쪽 묶음 Save·Load(슬롯 팝업을 연다), 오른쪽 묶음 빨리가기(눌러서 켜고 끄기)·메뉴.
// 휴대폰은 세로 화면이면 조작 영역 맨 위 양끝, 가로 화면이면 화면 위 양끝에(ControlTop, 자리는 style.css), PC는 화면 오른쪽 아래에 두 묶음으로(GameMenu의 floating-bar) 놓는다.
import { IconFastForward, IconMenu } from "../ui/icons";
import type { StateBridge } from "./bridge";
import type { MenuState } from "./MenuButton";

export function SlotButtons({ menu, bridge }: { menu: MenuState; bridge: StateBridge | null }) {
  return (
    <div class="quick">
      <button class="vpad-btn pill" disabled={!bridge} onClick={() => menu.openSlots("save")}>
        Save
      </button>
      <button class="vpad-btn pill" disabled={!bridge} onClick={() => menu.openSlots("load")}>
        Load
      </button>
    </div>
  );
}

export function SpeedMenuButtons({ menu }: { menu: MenuState }) {
  return (
    <div class="quick">
      <button
        class={`vpad-btn pill icon ${menu.fast ? "held" : ""}`}
        disabled={!menu.canFast}
        aria-label="빨리가기"
        aria-pressed={menu.fast}
        onClick={menu.toggleFast}
      >
        <IconFastForward />
      </button>
      <button class="vpad-btn pill icon" aria-label="메뉴" onClick={menu.toggle}>
        <IconMenu />
      </button>
    </div>
  );
}

/** 휴대폰 조작 영역의 윗줄: 왼쪽 Save·Load, 오른쪽 빨리가기·메뉴 */
export function ControlTop({ menu, bridge }: { menu: MenuState; bridge: StateBridge | null }) {
  return (
    <div class="ctl-top">
      <SlotButtons menu={menu} bridge={bridge} />
      <SpeedMenuButtons menu={menu} />
    </div>
  );
}
