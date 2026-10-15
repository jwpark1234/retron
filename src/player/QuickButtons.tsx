// 화면에 늘 떠 있는 빠른 버튼(가상패드·DOS 막대 안, 없으면 화면 아래): 빠른 저장, 빠른 불러오기, 빨리가기(누르고 있는 동안만). DOS와 SFC·GBA가 같이 쓴다.
import { useEffect, useRef, useState } from "preact/hooks";
import { QUICK_SLOT, readSlot, writeSlot } from "../library/states";
import { markDirty } from "../sync/sync";
import type { StateBridge } from "./GameMenu";

export function QuickButtons({ gameId, bridge, toast }: { gameId: string; bridge: StateBridge | null; toast: (msg: string) => void }) {
  const busy = useRef(false);
  const [fast, setFast] = useState(false);
  const fastRef = useRef(false);
  fastRef.current = fast;
  // 누른 채로 버튼이 사라지면(메뉴를 열거나 게임패드를 꽂으면) 빨리가기를 끈다
  useEffect(() => () => void (fastRef.current && bridge?.setFastForward?.(false).catch(() => undefined)), [bridge]);

  const run = async (fn: () => Promise<string>) => {
    if (!bridge || busy.current) return;
    busy.current = true;
    try {
      toast(await fn());
    } catch (e) {
      toast(`실패: ${(e as Error).message}`);
    } finally {
      busy.current = false;
    }
  };

  const save = () =>
    run(async () => {
      const { state, thumb } = await bridge!.save();
      await writeSlot(gameId, QUICK_SLOT, state, thumb);
      markDirty(gameId, "states");
      return "빠른 저장했습니다";
    });

  const load = () =>
    run(async () => {
      const state = await readSlot(gameId, QUICK_SLOT);
      if (!state) return "빠른 저장이 없습니다";
      await bridge!.load(state);
      return "빠른 저장을 불러왔습니다";
    });

  const hold = (on: boolean) => (e: PointerEvent) => {
    e.preventDefault();
    if (on) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (on === fast || !bridge?.setFastForward) return;
    setFast(on);
    void bridge.setFastForward(on).catch(() => undefined);
  };

  return (
    <div class="quick">
      <button class="vpad-btn pill" disabled={!bridge} onClick={save}>
        저장
      </button>
      <button class="vpad-btn pill" disabled={!bridge} onClick={load}>
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
