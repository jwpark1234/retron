// 가상패드 (터치 기기). 왼쪽은 원형 패드(360도 스틱) 또는 십자 패드(설정에서 고름, 둘 다 8방향으로 넘김), 오른쪽 버튼은 기종에 따라 X/Y/A/B(SFC) 또는 B/A(GBA).
// 버튼은 여러 손가락을 동시에 받는다.
import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { rotateDelta } from "../../player/orientation";
import type { StickStyle } from "../../ui/prefs";
import type { RetroButton, RetroSystem } from "./systems";

type Press = (source: string, button: RetroButton, pressed: boolean) => void;

const DEAD = 0.3; // 반지름 대비 이만큼은 가운데로 본다
const DPAD_DEAD = 0.15; // 십자 패드는 가운데를 좁게 (누르자마자 방향이 들어가게)
const SECTORS: RetroButton[][] = [["right"], ["right", "down"], ["down"], ["down", "left"], ["left"], ["left", "up"], ["up"], ["up", "right"]];

/**
 * 방향 조작. 원형 패드: 손가락을 따라 노브가 원 안에서 움직인다. 십자 패드: 눌린 방향 팔이 밝아진다.
 * 둘 다 게임에는 방향키만 있으므로 각도를 8방향으로 나눠 넘긴다
 */
function Stick({ press, rotation, style }: { press: Press; rotation: number; style: StickStyle }) {
  const el = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null); // 스틱을 잡은 손가락 하나만 따른다
  const held = useRef(new Set<RetroButton>());
  const [lit, setLit] = useState<RetroButton[]>([]); // 십자 패드에서 밝힐 방향
  const dpad = style === "dpad";

  const set = (next: RetroButton[]) => {
    if (next.length === held.current.size && next.every((b) => held.current.has(b))) return;
    for (const b of held.current) if (!next.includes(b)) press("stick", b, false);
    for (const b of next) if (!held.current.has(b)) press("stick", b, true);
    held.current = new Set(next);
    if (dpad) setLit(next);
  };
  const follow = (e: PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    const radius = r.width / 2;
    const { dx, dy } = rotateDelta(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), rotation);
    const dist = Math.hypot(dx, dy);
    const k = Math.min(1, radius / (dist || 1)); // 노브는 원 밖으로 나가지 않는다
    if (!dpad) knob.current!.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    if (dist < radius * (dpad ? DPAD_DEAD : DEAD)) return set([]);
    const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); // 화면 기준 각도 → 45도씩 8칸
    set(SECTORS[(sector + 8) % 8]);
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== finger.current) return;
    finger.current = null;
    if (!dpad) knob.current!.style.transform = "";
    set([]);
  };
  return (
    <div
      ref={el}
      class={dpad ? "vpad-dpad" : "vpad-stick"}
      onPointerDown={(e) => {
        e.preventDefault();
        if (finger.current !== null) return;
        finger.current = e.pointerId;
        el.current!.setPointerCapture(e.pointerId);
        follow(e);
      }}
      onPointerMove={(e) => e.pointerId === finger.current && follow(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {dpad ? (["up", "down", "left", "right"] as const).map((d) => <i key={d} class={`arm ${d} ${lit.includes(d) ? "on" : ""}`} />) : <div ref={knob} class="knob" />}
    </div>
  );
}

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

/** menuButton: SELECT와 START 사이에 둘 메뉴 버튼. quick: 그 위 빠른 버튼 줄. rotation: 화면을 CSS로 돌렸을 때 각도 */
export function VirtualPad({
  system,
  press,
  rotation,
  style,
  menuButton,
  quick,
}: {
  system: RetroSystem;
  press: Press;
  rotation: number;
  style: StickStyle;
  menuButton: ComponentChildren;
  quick: ComponentChildren;
}) {
  return (
    <div class="vpad">
      <div class="vpad-shoulders">
        <Button button="l" label="L" press={press} class="shoulder" />
        <Button button="r" label="R" press={press} class="shoulder" />
      </div>
      <Stick key={style} press={press} rotation={rotation} style={style} />
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
      <div class="vpad-mid">
        {quick}
        <div class="vpad-sys">
        <Button button="select" label="SELECT" press={press} class="pill" />
        {menuButton}
        <Button button="start" label="START" press={press} class="pill" />
        </div>
      </div>
    </div>
  );
}
