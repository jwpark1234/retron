// 게임 중 플랫폼 메뉴: 상태 저장/불러오기 슬롯과 나가기. DOS와 SFC가 같이 쓴다.
import { useEffect, useState } from "preact/hooks";
import { SLOTS, listSlots, readSlot, writeSlot, type SlotInfo } from "../library/states";

export interface StateBridge {
  save(): Promise<{ state: Uint8Array; thumb: Blob | null }>;
  load(state: Uint8Array): Promise<void>;
}

const fmt = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function GameMenu({ gameId, bridge, onExit }: { gameId: string; bridge: StateBridge | null; onExit: () => void }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<(SlotInfo | null)[]>([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  const refresh = async () => {
    const next = await listSlots(gameId);
    setSlots((old) => {
      old.forEach((s) => s?.thumb && URL.revokeObjectURL(s.thumb));
      return next;
    });
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      flash(`실패: ${(e as Error).message}`);
    }
    setBusy("");
  };

  const save = (slot: number) =>
    run("저장 중…", async () => {
      const { state, thumb } = await bridge!.save();
      await writeSlot(gameId, slot, state, thumb);
      await refresh();
      flash(`슬롯 ${slot}에 저장했습니다`);
    });

  const load = (slot: number) =>
    run("불러오는 중…", async () => {
      const state = await readSlot(gameId, slot);
      if (!state) return;
      await bridge!.load(state);
      setOpen(false);
      flash(`슬롯 ${slot}을 불러왔습니다`);
    });

  return (
    <>
      <button class="glass menu-button" aria-label="메뉴" onClick={() => setOpen(!open)}>
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div class="menu-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="glass menu-sheet">
            <h2>상태 저장 · 불러오기</h2>
            {!bridge && <p class="muted">게임이 시작되면 사용할 수 있습니다.</p>}
            <div class="slots">
              {SLOTS.map((slot, i) => {
                const s = slots[i];
                return (
                  <div class="slot" key={slot}>
                    <div class="slot-thumb">{s?.thumb ? <img src={s.thumb} alt="" /> : <span>빈 슬롯</span>}</div>
                    <div class="slot-info">
                      <strong>슬롯 {slot}</strong>
                      <small>{s ? fmt(s.savedAt) : "—"}</small>
                    </div>
                    <div class="slot-actions">
                      <button class="glass" disabled={!bridge || !!busy} onClick={() => save(slot)}>
                        저장
                      </button>
                      <button class="glass" disabled={!bridge || !s || !!busy} onClick={() => load(slot)}>
                        불러오기
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {busy && <p class="muted">{busy}</p>}
            <button class="glass exit" onClick={onExit}>
              라이브러리로 나가기
            </button>
          </div>
        </div>
      )}
      {toast && <div class="glass toast">{toast}</div>}
    </>
  );
}
