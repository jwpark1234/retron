// 게임 중 메뉴(나가기, 화면 설정, 플랫폼별 설정)와 저장·불러오기 팝업(화면의 저장·불러오기 버튼이 연다). DOS와 SFC가 같이 쓴다.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Row, Segmented } from "../ui/controls";
import { IconClose, IconExit, IconFullscreen, IconGamepad, IconMonitor } from "../ui/icons";
import { setPrefs, usePrefs, type ScreenFilter } from "../ui/prefs";
import { padName, useGamepad } from "./gamepads";
import { MenuButton, type MenuState } from "./MenuButton";
import { QuickButtons } from "./QuickButtons";
import { touchDevice, type OrientationMode } from "./orientation";
import { StateSlots } from "./StateSlots";
import { useAutoSave } from "./useAutoSave";
import { useToast } from "./useToast";

/** 플랫폼이 메뉴에 내주는 기능 */
export interface StateBridge {
  save(): Promise<{ state: Uint8Array; thumb: Blob | null }>;
  load(state: Uint8Array): Promise<void>;
  setFastForward?(on: boolean): Promise<void>;
}

const ORIENTATIONS: { value: OrientationMode; label: string }[] = [
  { value: "auto", label: "자동" },
  { value: "landscape", label: "가로" },
  { value: "portrait", label: "세로" },
];

const FILTERS: { value: ScreenFilter; label: string }[] = [
  { value: "sharp", label: "선명" },
  { value: "smooth", label: "부드럽게" },
  { value: "crt", label: "CRT" },
];

/** 누를 때마다 다음 값으로 넘어간다 */
const next = <T,>(list: { value: T }[], v: T) => list[(list.findIndex((o) => o.value === v) + 1) % list.length].value;
const labelOf = <T,>(list: { value: T; label: string }[], v: T) => list.find((o) => o.value === v)?.label ?? "";

/** 아이콘 토글: 아이콘 아래에 지금 값을 적는다 */
function IconTile({ icon, label, on, danger, disabled, onClick }: { icon: ComponentChildren; label: string; on?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button class={`icon-tile ${on ? "on" : ""} ${danger ? "danger" : ""}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function useFullscreen() {
  const [on, setOn] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined);
  return [on, toggle] as const;
}

export function GameMenu({
  menu,
  floating,
  gameId,
  title,
  bridge,
  onExit,
  orientation,
  onClose,
  children,
}: {
  menu: MenuState;
  floating: boolean; // 화면 컨트롤이 없어서 빠른 버튼과 메뉴 버튼을 화면 아래에 띄울 때
  gameId: string;
  title: string;
  bridge: StateBridge | null;
  onExit: () => void;
  orientation: { mode: OrientationMode; setMode: (m: OrientationMode) => void };
  onClose?: () => void; // 메뉴를 닫았을 때 (SFC: 키 설정 대기를 끝낸다)
  /** 플랫폼별 설정 줄. close로 메뉴를 닫을 수 있다 */
  children?: (close: () => void) => ComponentChildren;
}) {
  const { open } = menu;
  const setOpen = (v: boolean) => {
    menu.setOpen(v);
    if (!v) onClose?.();
  };
  const pad = useGamepad();
  const prefs = usePrefs();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const [busy, setBusy] = useState("");
  const [toast, showToast] = useToast(1800);
  const autoSave = useAutoSave(gameId, bridge);

  /** 진행 표시를 띄우고, 끝나면 돌려준 문구(또는 실패)를 알린다 */
  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const msg = await fn();
      if (msg) showToast(msg);
    } catch (e) {
      showToast(`실패: ${(e as Error).message}`);
    }
    setBusy("");
  };

  const exit = () =>
    run("자동 저장 중…", async () => {
      await autoSave();
      onExit();
    });

  return (
    <>
      {floating && !open && (
        <div class="floating-bar">
          <QuickButtons bridge={bridge} onSlots={menu.openSlots} />
          <MenuButton onClick={() => setOpen(true)} />
        </div>
      )}
      {open && (
        <div class="menu-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="glass menu-sheet">
            <div class="menu-head">
              <span />
              <strong>{title}</strong>
              <button class="icon-btn" aria-label="닫기" onClick={() => setOpen(false)}>
                <IconClose />
              </button>
            </div>
            <div class="menu-main">
              <div class="menu-icons">
                <IconTile icon={<IconExit />} label="나가기" danger disabled={!!busy} onClick={exit} />
                <IconTile icon={<IconMonitor />} label={`필터 · ${labelOf(FILTERS, prefs.filter)}`} onClick={() => setPrefs({ filter: next(FILTERS, prefs.filter) })} />
                {document.fullscreenEnabled && <IconTile icon={<IconFullscreen on={fullscreen} />} label="전체화면" on={fullscreen} onClick={toggleFullscreen} />}
              </div>
              <section class="menu-group">
                {touchDevice && (
                  <Row label="화면 방향">
                    <Segmented value={orientation.mode} options={ORIENTATIONS} onChange={orientation.setMode} />
                  </Row>
                )}
                {children?.(() => setOpen(false))}
                <p class="menu-note">
                  <IconGamepad />
                  {pad ? padName(pad) : "패드 버튼을 누르면 연결됩니다"}
                </p>
              </section>
            </div>
            {busy && <p class="muted">{busy}</p>}
          </div>
        </div>
      )}
      {menu.slots && (
        <div class="menu-backdrop" onClick={(e) => e.target === e.currentTarget && menu.openSlots(null)}>
          <div class="glass menu-sheet slots-sheet">
            <div class="menu-head">
              <span />
              <strong>{menu.slots === "save" ? "저장" : "불러오기"}</strong>
              <button class="icon-btn" aria-label="닫기" onClick={() => menu.openSlots(null)}>
                <IconClose />
              </button>
            </div>
            <StateSlots mode={menu.slots} gameId={gameId} bridge={bridge} run={run} onDone={() => menu.openSlots(null)} />
            {busy && <p class="muted">{busy}</p>}
          </div>
        </div>
      )}
      {toast && <div class="glass toast">{toast}</div>}
    </>
  );
}
