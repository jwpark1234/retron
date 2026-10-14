// 게임 중 플랫폼 메뉴: 상태 저장/불러오기, 자동 저장, 빨리가기, 화면 방향, 나가기. DOS와 SFC가 같이 쓴다.
import { useEffect, useRef, useState } from "preact/hooks";
import { AUTO_SLOT, SLOTS, listSlots, readSlot, writeSlot, type SlotInfo } from "../library/states";
import type { OrientationMode } from "./orientation";
import { setPrefs, usePrefs, type ScreenFilter } from "./prefs";
import { markDirty } from "../sync/sync";

export interface StateBridge {
  save(): Promise<{ state: Uint8Array; thumb: Blob | null }>;
  load(state: Uint8Array): Promise<void>;
  /** 지원하는 플랫폼만 (DOS는 js-dos가 빨리가기를 지원하지 않음) */
  setFastForward?(on: boolean): Promise<void>;
}

const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 탭을 갑자기 닫아도 최근 상태가 남도록
const ALL_SLOTS = [AUTO_SLOT, ...SLOTS];
const ORIENTATIONS: { mode: OrientationMode; label: string }[] = [
  { mode: "auto", label: "자동" },
  { mode: "landscape", label: "가로" },
  { mode: "portrait", label: "세로" },
];

const FILTERS: { filter: ScreenFilter; label: string }[] = [
  { filter: "sharp", label: "선명" },
  { filter: "smooth", label: "부드럽게" },
  { filter: "crt", label: "CRT" },
];

const fmt = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function GameMenu({
  gameId,
  bridge,
  onExit,
  orientation,
}: {
  gameId: string;
  bridge: StateBridge | null;
  onExit: () => void;
  orientation: { mode: OrientationMode; setMode: (m: OrientationMode) => void };
}) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<(SlotInfo | null)[]>([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [fast, setFast] = useState(false);
  const autoSaving = useRef(false);
  const prefs = usePrefs();
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () =>
    void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined);

  const refresh = async () => {
    const next = await listSlots(gameId, ALL_SLOTS);
    setSlots((old) => {
      old.forEach((s) => s?.thumb && URL.revokeObjectURL(s.thumb));
      return next;
    });
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  // 웹을 닫거나 다른 앱으로 넘어갈 때, 그리고 주기적으로 자동 저장
  const autoSave = async () => {
    if (!bridge || autoSaving.current) return;
    autoSaving.current = true;
    try {
      const { state, thumb } = await bridge.save();
      await writeSlot(gameId, AUTO_SLOT, state, thumb);
      markDirty(gameId);
    } catch {
      // 게임이 아직 시작 전이면 저장할 것이 없다
    } finally {
      autoSaving.current = false;
    }
  };

  useEffect(() => {
    if (!bridge) return;
    const onVisibility = () => document.visibilityState === "hidden" && void autoSave();
    const onPageHide = () => void autoSave();
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", onPageHide);
    const timer = setInterval(autoSave, AUTO_SAVE_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", onPageHide);
      clearInterval(timer);
    };
  }, [bridge]);

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
      markDirty(gameId);
      await refresh();
      flash(`슬롯 ${slot}에 저장했습니다`);
    });

  const load = (slot: number) =>
    run("불러오는 중…", async () => {
      const state = await readSlot(gameId, slot);
      if (!state) return;
      await bridge!.load(state);
      setOpen(false);
      flash(slot === AUTO_SLOT ? "자동 저장을 불러왔습니다" : `슬롯 ${slot}을 불러왔습니다`);
    });

  const toggleFast = () =>
    run("", async () => {
      await bridge!.setFastForward!(!fast);
      setFast(!fast);
    });

  const exit = () =>
    run("자동 저장 중…", async () => {
      await autoSave();
      onExit();
    });

  return (
    <>
      <button class="glass menu-button" aria-label="메뉴" onClick={() => setOpen(!open)}>
        {open ? "✕" : "☰"}
      </button>
      {fast && !open && <div class="glass ff-badge">▶▶</div>}
      {open && (
        <div class="menu-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="glass menu-sheet">
            <div class="menu-row">
              <span>화면 방향</span>
              <div class="seg glass">
                {ORIENTATIONS.map((o) => (
                  <button key={o.mode} class={orientation.mode === o.mode ? "on" : ""} onClick={() => orientation.setMode(o.mode)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div class="menu-row">
              <span>화면 필터</span>
              <div class="seg glass">
                {FILTERS.map((f) => (
                  <button key={f.filter} class={prefs.filter === f.filter ? "on" : ""} onClick={() => setPrefs({ filter: f.filter })}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div class="menu-row">
              <button class="icon-toggle" aria-label={prefs.muted ? "소리 켜기" : "음소거"} onClick={() => setPrefs({ muted: !prefs.muted })}>
                {prefs.muted || prefs.volume === 0 ? "🔇" : "🔊"}
              </button>
              <input
                class="volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={prefs.volume}
                aria-label="볼륨"
                onInput={(e) => setPrefs({ volume: +(e.target as HTMLInputElement).value, muted: false })}
              />
            </div>
            {document.fullscreenEnabled && (
              <div class="menu-row">
                <span>전체화면</span>
                <button class={`switch ${fullscreen ? "on" : ""}`} role="switch" aria-checked={fullscreen} onClick={toggleFullscreen}>
                  <i />
                </button>
              </div>
            )}
            {bridge?.setFastForward && (
              <div class="menu-row">
                <span>빨리가기</span>
                <button class={`switch ${fast ? "on" : ""}`} role="switch" aria-checked={fast} onClick={toggleFast}>
                  <i />
                </button>
              </div>
            )}

            <h2>상태 저장 · 불러오기</h2>
            {!bridge && <p class="muted">게임이 시작되면 사용할 수 있습니다.</p>}
            <div class="slots">
              {ALL_SLOTS.map((slot, i) => {
                const s = slots[i];
                const auto = slot === AUTO_SLOT;
                return (
                  <div class={`slot ${auto ? "auto" : ""}`} key={slot}>
                    <div class="slot-thumb">{s?.thumb ? <img src={s.thumb} alt="" /> : <span>{auto ? "없음" : "빈 슬롯"}</span>}</div>
                    <div class="slot-info">
                      <strong>{auto ? "자동 저장" : `슬롯 ${slot}`}</strong>
                      <small>{s ? fmt(s.savedAt) : auto ? "나가거나 웹을 닫을 때 저장" : "—"}</small>
                    </div>
                    <div class="slot-actions">
                      {!auto && (
                        <button class="glass" disabled={!bridge || !!busy} onClick={() => save(slot)}>
                          저장
                        </button>
                      )}
                      <button class="glass" disabled={!bridge || !s || !!busy} onClick={() => load(slot)}>
                        불러오기
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {busy && <p class="muted">{busy}</p>}
            <button class="glass exit" disabled={!!busy} onClick={exit}>
              라이브러리로 나가기
            </button>
          </div>
        </div>
      )}
      {toast && <div class="glass toast">{toast}</div>}
    </>
  );
}
