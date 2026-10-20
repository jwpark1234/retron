// 자동 저장: 메뉴를 열 때(GameMenu가 부른다), 웹을 닫거나 다른 앱으로 넘어갈 때 상태를 자동 저장 슬롯에 둔다.
// 몇 분마다 하던 저장은 없앴다 (2026-10-20 사용자 요청). 멈춘 에뮬레이터는 상태를 저장하지 못해서 저장하는 동안 잠깐 풀어 주는데(bridge.ts),
// 메뉴를 열어 둔 채 기다리면 그때마다 게임이 잠깐 진행됐다 다시 멈췄다. 대신 탭을 갑자기 닫으면(pagehide도 못 받으면) 마지막 메뉴 이후 진행은 잃는다
import { useEffect, useRef } from "preact/hooks";
import { AUTO_SLOT, writeSlot } from "../library/states";
import { markDirty } from "../sync/sync";
import type { StateBridge } from "./bridge";

/** 돌려주는 함수로 지금 바로 자동 저장한다 (메뉴를 열 때, 나가기·다시 시작 전에) */
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
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", onPageHide);
    };
  }, [bridge]);

  return save;
}
