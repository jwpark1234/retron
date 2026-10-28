// 가상패드 (터치 기기). 왼쪽은 원형 패드(360도 스틱) 또는 십자 패드(설정에서 고름, 둘 다 8방향으로 넘김), 오른쪽 버튼은 기종에 따라 X/Y/A/B(SFC) 또는 B/A(GBA).
// 버튼은 여러 손가락을 동시에 받는다. 터치스크린이 있는 기종(NDS)은 가로 화면에서 SELECT·START를 화면 위가 아니라 오른쪽 버튼 위에 둔다.
import type { ComponentChildren } from "preact";
import { DirectionPad } from "../../player/DirectionPad";
import type { StickStyle } from "../../ui/prefs";
import type { RetroButton, RetroSystem } from "./systems";

type Press = (source: string, button: RetroButton, pressed: boolean) => void;

function Button({ button, label, press, class: cls }: { button: RetroButton; label: string; press: Press; class?: string }) {
  const down = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    press(`btn${e.pointerId}`, button, true);
  };
  const up = (e: PointerEvent) => press(`btn${e.pointerId}`, button, false);
  return (
    <button class={`vpad-btn ${cls ?? ""}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
      {label}
    </button>
  );
}

/**
 * top: Save·Load(왼쪽)와 빨리가기·메뉴(오른쪽) 줄. 세로 화면은 조작 영역 맨 위, 가로 화면은 화면 맨 위(L·R 위)에 온다.
 * rotation: 화면을 CSS로 돌렸을 때 각도
 */
export function VirtualPad({ system, press, rotation, style, top }: { system: RetroSystem; press: Press; rotation: number; style: StickStyle; top: ComponentChildren }) {
  return (
    <div class={system.touch ? "vpad touch-screen" : "vpad"}>
      {top}
      <div class="vpad-shoulders">
        <Button button="l" label="L" press={press} class="shoulder" />
        <Button button="r" label="R" press={press} class="shoulder" />
      </div>
      <DirectionPad key={style} press={press} rotation={rotation} style={style} />
      <div class={`vpad-face ${system.face}`}>
        {system.face === "diamond" && (
          <>
            <Button button="x" label="X" press={press} class="x" />
            <Button button="y" label="Y" press={press} class="y" />
          </>
        )}
        <Button button="a" label="A" press={press} class="a" />
        <Button button="b" label="B" press={press} class="b" />
      </div>
      <div class="vpad-sys">
        <Button button="select" label="SELECT" press={press} class="pill" />
        <Button button="start" label="START" press={press} class="pill" />
      </div>
    </div>
  );
}
