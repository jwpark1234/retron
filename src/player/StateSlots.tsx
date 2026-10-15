// 저장·불러오기 슬롯 격자. 저장 모드는 슬롯 1~5를 누르면 저장, 불러오기 모드는 자동 저장까지 보여 주고 누르면 불러온다.
// 저장하면 드라이브 동기화를 예약한다.
import { useEffect, useState } from "preact/hooks";
import { AUTO_SLOT, QUICK_SLOT, SLOTS, listSlots, readSlot, writeSlot, type SlotInfo } from "../library/states";
import { markDirty } from "../sync/sync";
import type { StateBridge } from "./GameMenu";
import type { SlotMode } from "./MenuButton";

// 예전 빠른 저장 슬롯은 슬롯 5로 쓴다
const SAVE_SLOTS = [...SLOTS, QUICK_SLOT];
const nameOf = (slot: number) => (slot === AUTO_SLOT ? "자동 저장" : `슬롯 ${slot}`);
const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const revoke = (list: (SlotInfo | null)[]) => list.forEach((s) => s?.thumb && URL.revokeObjectURL(s.thumb));

export function StateSlots({
  mode,
  gameId,
  bridge,
  run,
  onDone,
}: {
  mode: SlotMode;
  gameId: string;
  bridge: StateBridge | null;
  /** 진행 표시와 결과 알림을 맡는 실행기. fn이 돌려준 문구를 알림으로 띄운다 */
  run: (label: string, fn: () => Promise<string | void>) => Promise<void>;
  onDone: () => void;
}) {
  const list = mode === "save" ? SAVE_SLOTS : [AUTO_SLOT, ...SAVE_SLOTS];
  const [slots, setSlots] = useState<(SlotInfo | null)[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listSlots(gameId, list).then((next) => setSlots((old) => (revoke(old), next)));
    return () => setSlots((old) => (revoke(old), []));
  }, [mode]);

  const pick = (slot: number) => {
    setBusy(true);
    const job =
      mode === "save"
        ? run("저장 중…", async () => {
            const { state, thumb } = await bridge!.save();
            await writeSlot(gameId, slot, state, thumb);
            markDirty(gameId, "states");
            onDone();
            return `${nameOf(slot)}에 저장했습니다`;
          })
        : run("불러오는 중…", async () => {
            const state = await readSlot(gameId, slot);
            if (!state) return;
            await bridge!.load(state);
            onDone();
            return `${nameOf(slot)}을 불러왔습니다`;
          });
    void job.finally(() => setBusy(false));
  };

  return (
    <>
      {!bridge && <p class="muted">게임이 시작되면 사용할 수 있습니다.</p>}
      <div class="slots">
        {list.map((slot, i) => {
          const s = slots[i];
          const auto = slot === AUTO_SLOT;
          return (
            <button class={`slot ${auto ? "auto" : ""}`} key={slot} disabled={!bridge || busy || (mode === "load" && !s)} onClick={() => pick(slot)}>
              <div class="slot-thumb">{s?.thumb ? <img src={s.thumb} alt="" /> : <span>{auto ? "나갈 때 저장" : "비어 있음"}</span>}</div>
              <div class="slot-info">
                <strong>{nameOf(slot)}</strong>
                <small>{s ? fmt(s.savedAt) : ""}</small>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
