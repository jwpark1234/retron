// SFC·GBA 플레이 화면: Nostalgist로 띄운 게임 + 메뉴 + 입력(키보드, 게임패드, 가상패드). 기종 차이는 systems.ts가 맡는다.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { uploadGame } from "../../cloud/games";
import { gameDir, type Game } from "../../library/library";
import { AUTO_SLOT, writeSlot } from "../../library/states";
import { getFile, writeFile } from "../../library/store";
import { imageFileToSquare } from "../../library/thumbnail";
import { watchFirstRunThumbnail } from "../../player/first-run-thumbnail";
import { Screen } from "../../player/Screen";
import { useToast } from "../../player/useToast";
import { markDirty } from "../../sync/sync";
import { pausable, type StateBridge } from "../../player/bridge";
import { GameMenu } from "../../player/GameMenu";
import { useMenuState } from "../../player/MenuButton";
import { ControlTop } from "../../player/QuickButtons";
import { useGamepad } from "../../player/gamepads";
import { rotatedStyle, touchDevice, useOrientation } from "../../player/orientation";
import { getPrefs, setPrefs, usePrefs } from "../../ui/prefs";
import { createRetro, type RetroEmulator } from "./create-retro";
import { createInput, watchRetroGamepad } from "./input";
import { FastSpeedSetting, KeySettings, VirtualPadSetting, useRetroKeyboard } from "./RetroSettings";
import type { RetroSystem } from "./systems";
import { VirtualPad } from "./VirtualPad";

const SRAM_CHECK_MS = 5000;
const same = (a: Uint8Array, b: Uint8Array | null) => !!b && a.length === b.length && a.every((x, i) => x === b[i]);

export function RetroPlayer({ system, game, onExit }: { system: RetroSystem; game: Game; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const emu = useRef<RetroEmulator | null>(null);
  const [status, setStatus] = useState("불러오는 중…");
  const [toast, showToast] = useToast();
  const [ready, setReady] = useState(false);
  const orientation = useOrientation();
  const prefs = usePrefs();
  const pad = useGamepad();
  const input = useMemo(() => createInput((b, p) => emu.current?.press(b, p)), []);
  const { capturing, setCapturing } = useRetroKeyboard(system, input);
  const dir = gameDir(game.id);
  const sramPath = `${dir}/sram.srm`;
  const lastSram = useRef<Uint8Array | null>(null);
  const finishThumb = useRef<() => Promise<void>>(async () => {});
  // 빨리가기 배속을 바꾸면 에뮬레이터를 다시 띄운다 (RetroArch는 실행 중에 배속을 못 바꾼다). 그동안 상태를 들고 간다
  const [launch, setLaunch] = useState(0);
  const carry = useRef<Uint8Array | null>(null);

  // 세이브(SRAM)가 바뀌었으면 기기에 저장하고 드라이브 동기화를 예약한다
  const persistSram = async (flush = false) => {
    const data = await emu.current?.readSram(flush);
    if (!data || same(data, lastSram.current)) return;
    lastSram.current = data.slice();
    await writeFile(sramPath, data);
    markDirty(game.id, "saves");
    showToast("저장되었습니다");
  };

  // 게임 시작
  useEffect(() => {
    let disposed = false;
    const stops: (() => void)[] = [];
    (async () => {
      const { rom: romName } = game.rom!;
      const rom = (await getFile(`${dir}/${romName}`))!;
      const sram = await getFile(sramPath);
      if (sram) lastSram.current = new Uint8Array(await sram.arrayBuffer());
      setStatus("에뮬레이터 준비 중…");
      const e = await createRetro(system, canvas.current!, new File([rom], romName), sram, getPrefs().fastSpeed);
      if (disposed) return e.exit();
      emu.current = e;
      if (carry.current) {
        await e.loadState(carry.current);
        carry.current = null;
      }
      setReady(true);
      setStatus("");
      stops.push(watchRetroGamepad(system, input));
      const timer = setInterval(() => void persistSram().catch(() => undefined), SRAM_CHECK_MS);
      stops.push(() => clearInterval(timer));
      finishThumb.current = watchFirstRunThumbnail(
        game.id,
        async () => imageFileToSquare(await e.screenshot()),
        () => void uploadGame(game.id).catch(() => undefined), // 다른 기기에서도 썸네일이 보이게
      );
    })().catch((err) => setStatus(`게임을 시작하지 못했습니다: ${(err as Error).message}`));
    return () => {
      disposed = true;
      stops.forEach((s) => s());
      input.releaseAll();
      void finishThumb.current().catch(() => undefined);
      emu.current?.exit();
      emu.current = null;
      setReady(false);
    };
  }, [launch]);

  const bridge = useMemo<StateBridge | null>(
    () =>
      ready
        ? pausable({
            save: async () => {
              const e = emu.current!;
              return { state: await e.saveState(), thumb: await e.screenshot().catch(() => null) };
            },
            load: (state) => emu.current!.loadState(state),
            setFastForward: async (on) => emu.current!.setFastForward(on),
            pause: () => emu.current?.pause(),
            resume: () => emu.current?.resume(),
            reset: async () => emu.current!.reset(),
            screenshot: () => emu.current!.screenshot(),
          })
        : null,
    [ready],
  );
  const menu = useMenuState(bridge);

  const changeSpeed = async (speed: number) => {
    setPrefs({ fastSpeed: speed });
    if (!bridge) return;
    setStatus("배속 바꾸는 중…");
    try {
      const { state, thumb } = await bridge.save();
      carry.current = state;
      // 다시 띄운 뒤 상태를 못 불러와도 되돌릴 수 있게 자동 저장 슬롯에도 남긴다
      await writeSlot(game.id, AUTO_SLOT, state, thumb);
      markDirty(game.id, "states");
      await persistSram(true);
    } catch {
      carry.current = null; // 상태를 못 들고 가면 처음부터 시작하지 않도록 다시 띄우지 않는다
      setStatus("");
      return;
    }
    setLaunch((n) => n + 1);
  };

  const exit = async () => {
    await persistSram(true).catch(() => undefined);
    await finishThumb.current().catch(() => undefined);
    onExit();
  };

  const showPad = touchDevice && prefs.virtualPad && !pad;

  return (
    <div class="game" style={rotatedStyle(orientation.rotation)}>
      <Screen canvasRef={canvas} filter={prefs.filter} aspect={system.aspect} />
      <GameMenu menu={menu} floating={!showPad} gameId={game.id} title={game.title} bridge={bridge} onExit={exit} orientation={orientation} onClose={() => setCapturing(null)}>
        {() => (
          <>
            <FastSpeedSetting onChange={(v) => void changeSpeed(v)} />
            {touchDevice ? <VirtualPadSetting gamepad={!!pad} /> : <KeySettings system={system} capturing={capturing} onCapture={setCapturing} />}
          </>
        )}
      </GameMenu>
      {showPad && (
        <VirtualPad
          system={system}
          press={input.set}
          rotation={orientation.rotation}
          style={prefs.stickStyle}
          top={<ControlTop menu={menu} bridge={bridge} />}
        />
      )}
      {status && <div class="overlay">{status}</div>}
      {toast && <div class="glass toast">{toast}</div>}
    </div>
  );
}
