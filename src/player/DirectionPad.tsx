// 방향 조작 (터치 기기): 원형 패드(360도 스틱) 또는 십자 패드. 둘 다 8방향으로 나눠 방향 넷의 눌림으로 넘긴다.
// SFC·GBA 가상패드와 DOS 방향키가 같이 쓴다.
import { useRef, useState } from "preact/hooks";
import { Row, Segmented } from "../ui/controls";
import { setPrefs, usePrefs, type StickStyle } from "../ui/prefs";
import { rotateDelta } from "./orientation";

export type Direction = "up" | "down" | "left" | "right";

const DEAD = 0.3; // 반지름 대비 이만큼은 가운데로 본다
const DPAD_DEAD = 0.15; // 십자 패드는 가운데를 좁게 (누르자마자 방향이 들어가게)
const SECTORS: Direction[][] = [["right"], ["right", "down"], ["down"], ["down", "left"], ["left"], ["left", "up"], ["up"], ["up", "right"]];

/**
 * 방향 조작. 원형 패드: 손가락을 따라 노브가 원 안에서 움직인다. 십자 패드: 눌린 방향 팔이 밝아진다.
 * 둘 다 게임에는 방향키만 있으므로 각도를 8방향으로 나눠 넘긴다
 */
export function DirectionPad({ press, rotation, style }: { press: (source: string, dir: Direction, pressed: boolean) => void; rotation: number; style: StickStyle }) {
  const el = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null); // 스틱을 잡은 손가락 하나만 따른다
  const held = useRef(new Set<Direction>());
  const [lit, setLit] = useState<Direction[]>([]); // 십자 패드에서 밝힐 방향
  const dpad = style === "dpad";

  const set = (next: Direction[]) => {
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

const STICK_STYLES: { value: StickStyle; label: string }[] = [
  { value: "stick", label: "원형 패드" },
  { value: "dpad", label: "십자 패드" },
];

/** 메뉴의 "방향 조작" 줄 */
export function StickStyleRow() {
  const { stickStyle } = usePrefs();
  return (
    <Row label="방향 조작">
      <Segmented value={stickStyle} options={STICK_STYLES} onChange={(v) => setPrefs({ stickStyle: v })} />
    </Row>
  );
}
