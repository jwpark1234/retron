// 가상패드 (터치 기기). 왼쪽은 원형 패드(360도 스틱) 또는 십자 패드(설정에서 고름, 둘 다 8방향으로 넘김), 오른쪽 버튼은 기종에 따라 X/Y/A/B(SFC) 또는 B/A(GBA).
// N64: 왼쪽은 아날로그 스틱(기울인 만큼), 오른쪽은 A·B와 C 버튼 넷, 어깨에 L·Z / R, 가운데는 START 하나.
// 버튼은 여러 손가락을 동시에 받는다.
import type { ComponentChildren } from "preact";
import { DirectionPad } from "../../player/DirectionPad";
import type { StickStyle } from "../../ui/prefs";
import type { RetroButton, RetroSystem } from "./systems";
import { ConsoleDeck } from "../../player/ConsoleDeck";

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
 * rotation: 화면을 CSS로 돌렸을 때 각도. axis: 아날로그 스틱 기종(N64)의 스틱
 */
export function VirtualPad({
  system,
  press,
  axis,
  rotation,
  style,
  top,
  title,
}: {
  system: RetroSystem;
  title: string;
  press: Press;
  axis: (source: string, x: number, y: number) => void;
  rotation: number;
  style: StickStyle;
  top: ComponentChildren;
}) {
  const n64 = system.face === "n64";
  return (
    <div class="vpad">
      {top}
      <ConsoleDeck platform={system.platform} title={title} />
      <div class="vpad-shoulders">
        {n64 ? (
          <span class="vpad-pair">
            <Button button="l" label="L" press={press} class="shoulder" />
            <Button button="z" label="Z" press={press} class="shoulder" />
          </span>
        ) : (
          <Button button="l" label="L" press={press} class="shoulder" />
        )}
        <Button button="r" label="R" press={press} class="shoulder" />
      </div>
      <DirectionPad key={style} press={press} axis={system.analog ? (x, y) => axis("stick", x, y) : undefined} rotation={rotation} style={style} />
      <div class={`vpad-face ${system.face}`}>
        {system.face === "diamond" && (
          <>
            <Button button="x" label="X" press={press} class="x" />
            <Button button="y" label="Y" press={press} class="y" />
          </>
        )}
        {n64 && (
          <>
            <Button button="cup" label="▲" press={press} class="c cup" />
            <Button button="cleft" label="◀" press={press} class="c cleft" />
            <Button button="cright" label="▶" press={press} class="c cright" />
            <Button button="cdown" label="▼" press={press} class="c cdown" />
          </>
        )}
        <Button button="a" label="A" press={press} class="a" />
        <Button button="b" label="B" press={press} class="b" />
      </div>
      <div class="vpad-sys">
        {!n64 && <Button button="select" label="SELECT" press={press} class="pill" />}
        <Button button="start" label="START" press={press} class="pill" />
      </div>
    </div>
  );
}
