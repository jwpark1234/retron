// 게임 중 메뉴(플랫폼 메뉴)와 저장·불러오기 팝업(화면의 Save·Load 버튼이 연다). DOS와 SFC·GBA가 같이 쓴다.
// 메뉴: 나가기, 필터, 다시 시작, 스크린샷, 방향(휴대폰)·전체화면(PC), 조작 — 여섯 개. 조작을 누르면 조작 설정 화면으로 넘어간다
// (그 게임 기종의 조작 설정 + 모든 게임 공통 휴대폰 조작 설정 + 게임패드 연결 상태).
// 메뉴나 팝업이 떠 있는 동안 게임을 멈춘다. 다른 창이 덮거나 앱이 뒤로 가면 메뉴를 띄워 멈추고, 돌아와도 메뉴를 닫을 때까지 멈춰 둔다.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { CONTROL_OPACITIES, CONTROL_SIZES } from "../ui/control-style";
import { ON_OFF, Row, Segmented } from "../ui/controls";
import { haptic } from "../ui/haptics";
import { IconBack, IconCamera, IconClose, IconExit, IconFullscreen, IconGamepad, IconMonitor, IconRestart, IconRotate } from "../ui/icons";
import { setPrefs, usePrefs, type ScreenFilter } from "../ui/prefs";
import type { StateBridge } from "./bridge";
import { StickStyleRow } from "./DirectionPad";
import { padName, useGamepad } from "./gamepads";
import type { MenuState } from "./MenuButton";
import { SlotButtons, SpeedMenuButtons } from "./QuickButtons";
import { touchDevice, type OrientationMode } from "./orientation";
import { saveScreenshot } from "./screenshot";
import { StateSlots } from "./StateSlots";
import { Spinner } from "../ui/Spinner";
import { useAutoSave } from "./useAutoSave";
import { useToast } from "./useToast";

const ORIENTATIONS: { value: OrientationMode; label: string }[] = [
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
function IconTile({ icon, label, danger, disabled, onClick }: { icon: ComponentChildren; label: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button class={`icon-tile ${danger ? "danger" : ""}`} disabled={disabled} onClick={onClick}>
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

/** 모든 게임 공통 휴대폰 조작 (예전에는 계정 창에 있었다) */
function TouchControlRows() {
  const { haptics, controlScale, controlOpacity } = usePrefs();
  return (
    <>
      <StickStyleRow />
      <Row label="버튼 크기">
        <Segmented value={String(controlScale)} options={CONTROL_SIZES} onChange={(v) => setPrefs({ controlScale: +v })} label="버튼 크기" />
      </Row>
      <Row label="버튼 투명도">
        <Segmented value={String(controlOpacity)} options={CONTROL_OPACITIES} onChange={(v) => setPrefs({ controlOpacity: +v })} label="버튼 투명도" />
      </Row>
      <Row label="햅틱">
        <Segmented
          value={haptics ? "on" : "off"}
          options={[...ON_OFF]}
          onChange={(v) => {
            setPrefs({ haptics: v === "on" });
            if (v === "on") haptic(true); // 켜는 순간 한 번 떨어서 이 기기에서 되는지 바로 알게
          }}
          label="햅틱"
        />
      </Row>
    </>
  );
}

/**
 * 다른 창이 덮거나(PC: 다른 창으로 감) 앱이 뒤로 가면(휴대폰: 홈, 다른 앱, 화면 꺼짐) 메뉴를 띄우고 바로 멈춘다.
 * 메뉴가 열려 있으니 돌아와도 사용자가 닫을 때까지 멈춰 있다 (예전에는 돌아오면 잠깐 진행되다 멈췄다)
 */
function usePauseWhenHidden(bridge: StateBridge | null, open: () => void) {
  const ref = useRef({ bridge, open });
  ref.current = { bridge, open };
  useEffect(() => {
    const away = () => {
      ref.current.bridge?.setPaused(true); // 메뉴가 그려지기(효과가 돌기) 전에 바로 멈춘다
      ref.current.open();
    };
    const onVisibility = () => document.visibilityState === "hidden" && away();
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("blur", away);
    addEventListener("pagehide", away);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("blur", away);
      removeEventListener("pagehide", away);
    };
  }, []);
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
  controls,
  settings,
}: {
  menu: MenuState;
  floating: boolean; // 화면 컨트롤이 없어서(PC, 게임패드) Save·Load·빨리가기·메뉴 버튼을 화면 아래에 띄울 때
  gameId: string;
  title: string;
  bridge: StateBridge | null;
  onExit: () => void;
  orientation: { mode: OrientationMode; setMode: (m: OrientationMode) => void };
  onClose?: () => void; // 메뉴를 닫았을 때 (SFC: 키 설정 대기를 끝낸다)
  /** 조작 화면에 넣을 이 기종의 조작 설정 줄 */
  controls?: () => ComponentChildren;
  /** 메뉴 첫 화면 아이콘 아래에 넣을 그 밖의 설정 줄 (빨리가기 배속 등) */
  settings?: () => ComponentChildren;
}) {
  const { open } = menu;
  const [view, setView] = useState<"main" | "controls">("main");
  const setOpen = (v: boolean) => {
    menu.setOpen(v);
    if (!v) {
      setView("main");
      onClose?.();
    }
  };
  const pad = useGamepad();
  const prefs = usePrefs();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const [busy, setBusy] = useState("");
  const [toast, showToast] = useToast(1800);
  const paused = open || !!menu.slots;
  const autoSave = useAutoSave(gameId, bridge);
  // 메뉴를 열면 자동 저장. 멈추기(아래 효과) 전에 시작해야 저장이 끝난 뒤 한 번만 멈춘다
  // (멈춘 뒤 저장하면 저장하려고 잠깐 풀었다 다시 멈춰서 게임이 툭 움직였다).
  // 앱이 뒤로 가서 열린 메뉴는 useAutoSave가 이미 저장하므로 건너뛴다
  useEffect(() => {
    if (open && document.visibilityState === "visible") void autoSave();
  }, [open]);
  useEffect(() => bridge?.setPaused(paused), [paused, bridge]);
  usePauseWhenHidden(bridge, () => menu.setOpen(true));

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
      bridge?.setPaused(false); // 나가면서 세이브(SRAM)를 쓰는 동안 에뮬레이터가 돌고 있어야 한다
      onExit();
    });

  // 다시 시작 전에 자동 저장 슬롯에 남겨 둔다 (잘못 눌렀으면 불러오기 → 자동 저장으로 되돌린다)
  const restart = () => {
    if (!bridge || !confirm("처음부터 다시 시작할까요? 지금 상태는 자동 저장 슬롯에 남겨 둡니다.")) return;
    void run("다시 시작하는 중…", async () => {
      await autoSave();
      await bridge.reset();
      setOpen(false);
    });
  };

  const screenshot = () =>
    run("스크린샷 저장 중…", async () => {
      const png = await bridge?.screenshot();
      if (!png) return "화면을 찍지 못했습니다";
      await saveScreenshot(title, png);
      return "스크린샷을 저장했습니다";
    });

  const busyLine = busy && (
    <p class="muted busy-line">
      <Spinner small />
      {busy}
    </p>
  );

  return (
    <>
      {floating && !open && (
        <div class="floating-bar">
          <SlotButtons menu={menu} bridge={bridge} />
          <SpeedMenuButtons menu={menu} />
        </div>
      )}
      {open && (
        <div class="menu-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="glass menu-sheet">
            <div class="menu-head">
              {view === "controls" ? (
                <button class="icon-btn" aria-label="뒤로" onClick={() => setView("main")}>
                  <IconBack />
                </button>
              ) : (
                <span />
              )}
              <strong>{view === "controls" ? "조작" : title}</strong>
              <button class="icon-btn" aria-label="닫기" onClick={() => setOpen(false)}>
                <IconClose />
              </button>
            </div>
            {view === "main" ? (
              <div class="menu-main">
                <div class="menu-icons">
                  <IconTile icon={<IconExit />} label="나가기" danger disabled={!!busy} onClick={exit} />
                  <IconTile icon={<IconMonitor />} label={`필터 · ${labelOf(FILTERS, prefs.filter)}`} onClick={() => setPrefs({ filter: next(FILTERS, prefs.filter) })} />
                  <IconTile icon={<IconRestart />} label="다시 시작" disabled={!bridge || !!busy} onClick={restart} />
                  <IconTile icon={<IconCamera />} label="스크린샷" disabled={!bridge || !!busy} onClick={() => void screenshot()} />
                  {/* 다섯째 자리: 휴대폰은 화면 방향, PC는 전체화면 (PC는 창 모양 그대로라 돌릴 것이 없고, 휴대폰 앱은 이미 전체 화면이다) */}
                  {touchDevice ? (
                    <IconTile icon={<IconRotate />} label={`방향 · ${labelOf(ORIENTATIONS, orientation.mode)}`} onClick={() => orientation.setMode(next(ORIENTATIONS, orientation.mode))} />
                  ) : (
                    <IconTile icon={<IconFullscreen on={fullscreen} />} label={fullscreen ? "전체화면 끄기" : "전체화면"} onClick={toggleFullscreen} />
                  )}
                  <IconTile icon={<IconGamepad />} label="조작" onClick={() => setView("controls")} />
                </div>
                {settings && <section class="menu-group">{settings()}</section>}
              </div>
            ) : (
              <div class="menu-main">
                <section class="menu-group">
                  {controls?.()}
                  {touchDevice && <TouchControlRows />}
                  <p class="menu-note">
                    <IconGamepad />
                    {pad ? padName(pad) : "패드 버튼을 누르면 연결됩니다"}
                  </p>
                </section>
              </div>
            )}
            {busyLine}
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
            {busyLine}
          </div>
        </div>
      )}
      {toast && <div class="glass toast">{toast}</div>}
    </>
  );
}
