// 게임 중 메뉴: 화면 설정, 게임패드 상태, 플랫폼별 설정, 상태 저장/불러오기, 나가기. DOS와 SFC가 같이 쓴다.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Row, Segmented, Switch } from "../ui/controls";
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
          <QuickButtons gameId={gameId} bridge={bridge} toast={showToast} />
          <MenuButton onClick={() => setOpen(true)} />
        </div>
      )}
      {open && (
        <div class="menu-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="glass menu-sheet">
            <div class="menu-head">
              <strong>{title}</strong>
              <button class="glass exit" disabled={!!busy} onClick={exit}>
                나가기
              </button>
              <button class="glass close" aria-label="닫기" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <section class="menu-group">
              {touchDevice && (
                <Row label="화면 방향">
                  <Segmented value={orientation.mode} options={ORIENTATIONS} onChange={orientation.setMode} />
                </Row>
              )}
              <Row label="화면 필터">
                <Segmented value={prefs.filter} options={FILTERS} onChange={(filter) => setPrefs({ filter })} />
              </Row>
              {document.fullscreenEnabled && (
                <Row label="전체화면">
                  <Switch on={fullscreen} onChange={toggleFullscreen} />
                </Row>
              )}
              <Row label="게임패드">
                <small>{pad ? padName(pad) : "패드 버튼을 누르면 연결됩니다"}</small>
              </Row>
              {children?.(() => setOpen(false))}
            </section>

            <StateSlots gameId={gameId} bridge={bridge} run={run} onLoaded={() => setOpen(false)} />
            {busy && <p class="muted">{busy}</p>}
          </div>
        </div>
      )}
      {toast && <div class="glass toast">{toast}</div>}
    </>
  );
}
