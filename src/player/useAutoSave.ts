// 자동 저장: 웹을 닫거나 다른 앱으로 넘어갈 때, 그리고 몇 분마다 상태를 자동 저장 슬롯에 둔다.
import { useEffect, useRef } from "preact/hooks";
import { AUTO_SLOT, writeSlot } from "../library/states";
import { markDirty } from "../sync/sync";
import type { StateBridge } from "./bridge";

const INTERVAL_MS = 3 * 60 * 1000; // 탭을 갑자기 닫아도 최근 상태가 남도록

/**
 * 돌려주는 함수로 지금 바로 자동 저장한다 (나가기 전에).
 * paused: 메뉴·슬롯 창으로 멈춘 동안. 몇 분마다 하는 저장은 건너뛴다. 멈춘 에뮬레이터는 상태를 저장하지 못해서
 * 저장하는 동안 잠깐 풀어 주는데(bridge.ts), 메뉴를 열어 둔 채 기다리면 몇 분마다 게임이 잠깐 진행됐다 다시 멈췄다.
 * 멈춘 동안에는 상태가 바뀌지 않으니 건너뛰어도 잃는 것이 없다. 앱이 뒤로 갈 때의 저장은 그대로 한다 (화면이 안 보일 때라 괜찮다)
 */
export function useAutoSave(gameId: string, bridge: StateBridge | null, paused: boolean): () => Promise<void> {
  const busy = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const save = async () => {
    if (!bridge || busy.current) return;
    busy.current = true;
    try {
      const { state, thumb } = await bridge.save();
      await writeSlot(gameId, AUTO_SLOT, state, thumb);
      markDirty(gameId, "states");
    } catch {
      // 게임이 아직 시작 전이면 저장할 것이 없다
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (!bridge) return;
    const onVisibility = () => document.visibilityState === "hidden" && void save();
    const onPageHide = () => void save();
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", onPageHide);
    const timer = setInterval(() => !pausedRef.current && void save(), INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", onPageHide);
      clearInterval(timer);
    };
  }, [bridge]);

  return save;
}
