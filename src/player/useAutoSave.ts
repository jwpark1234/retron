// 자동 저장: 웹을 닫거나 다른 앱으로 넘어갈 때, 그리고 몇 분마다 상태를 자동 저장 슬롯에 둔다.
import { useEffect, useRef } from "preact/hooks";
import { AUTO_SLOT, writeSlot } from "../library/states";
import { markDirty } from "../sync/sync";
import type { StateBridge } from "./GameMenu";

const INTERVAL_MS = 3 * 60 * 1000; // 탭을 갑자기 닫아도 최근 상태가 남도록

/** 돌려주는 함수로 지금 바로 자동 저장한다 (나가기 전에) */
export function useAutoSave(gameId: string, bridge: StateBridge | null): () => Promise<void> {
  const busy = useRef(false);
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
    const timer = setInterval(save, INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", onPageHide);
      clearInterval(timer);
    };
  }, [bridge]);

  return save;
}
