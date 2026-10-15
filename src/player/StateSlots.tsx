// 상태 저장 슬롯 목록: 자동 저장 + 빠른 저장 + 슬롯 1~4. 저장하면 드라이브 동기화를 예약한다.
import { useEffect, useState } from "preact/hooks";
import { AUTO_SLOT, QUICK_SLOT, SLOTS, listSlots, readSlot, writeSlot, type SlotInfo } from "../library/states";
import { markDirty } from "../sync/sync";
import type { StateBridge } from "./GameMenu";

const ALL_SLOTS = [AUTO_SLOT, QUICK_SLOT, ...SLOTS];
const NAMES: Record<number, string> = { [AUTO_SLOT]: "자동 저장", [QUICK_SLOT]: "빠른 저장" };
const nameOf = (slot: number) => NAMES[slot] ?? `슬롯 ${slot}`;
const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const revoke = (list: (SlotInfo | null)[]) => list.forEach((s) => s?.thumb && URL.revokeObjectURL(s.thumb));

export function StateSlots({
  gameId,
  bridge,
  run,
  onLoaded,
}: {
  gameId: string;
  bridge: StateBridge | null;
  /** 진행 표시와 결과 알림을 맡는 실행기 (메뉴가 준다). fn이 돌려준 문구를 알림으로 띄운다 */
  run: (label: string, fn: () => Promise<string | void>) => Promise<void>;
  onLoaded: () => void;
}) {
  const [slots, setSlots] = useState<(SlotInfo | null)[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await listSlots(gameId, ALL_SLOTS);
    setSlots((old) => (revoke(old), next));
  };
  useEffect(() => {
    void refresh();
    return () => setSlots((old) => (revoke(old), []));
  }, []);

  const act = (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    return run(label, fn).finally(() => setBusy(false));
  };

  const save = (slot: number) =>
    act("저장 중…", async () => {
      const { state, thumb } = await bridge!.save();
      await writeSlot(gameId, slot, state, thumb);
      markDirty(gameId, "states");
      await refresh();
      return `${nameOf(slot)}에 저장했습니다`;
    });

  const load = (slot: number) =>
    act("불러오는 중…", async () => {
      const state = await readSlot(gameId, slot);
      if (!state) return;
      await bridge!.load(state);
      onLoaded();
      return `${nameOf(slot)}을 불러왔습니다`;
    });

  return (
    <>
      <h2>상태 저장 · 불러오기</h2>
      {!bridge && <p class="muted">게임이 시작되면 사용할 수 있습니다.</p>}
      <div class="slots">
        {ALL_SLOTS.map((slot, i) => {
          const s = slots[i];
          const auto = slot === AUTO_SLOT;
          return (
            <div class={`slot ${auto ? "auto" : ""}`} key={slot}>
              <div class="slot-thumb">{s?.thumb ? <img src={s.thumb} alt="" /> : <span>{auto ? "없음" : "비어 있음"}</span>}</div>
              <div class="slot-info">
                <strong>{nameOf(slot)}</strong>
                <small>{s ? fmt(s.savedAt) : auto ? "나갈 때 저장" : "—"}</small>
              </div>
              <div class="slot-actions">
                {!auto && (
                  <button class="glass" disabled={!bridge || busy} onClick={() => save(slot)}>
                    저장
                  </button>
                )}
                <button class="glass" disabled={!bridge || !s || busy} onClick={() => load(slot)}>
                  불러오기
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
