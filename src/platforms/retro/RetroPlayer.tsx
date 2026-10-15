// SFC·GBA 플레이 화면: Nostalgist로 띄운 게임 + 메뉴 + 입력(키보드, 게임패드, 가상패드). 기종 차이는 systems.ts가 맡는다.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { uploadGame } from "../../cloud/games";
import { gameDir, type Game } from "../../library/library";
import { getFile, writeFile } from "../../library/store";
import { imageFileToSquare } from "../../library/thumbnail";
import { watchFirstRunThumbnail } from "../../player/first-run-thumbnail";
import { Screen } from "../../player/Screen";
import { useToast } from "../../player/useToast";
import { markDirty } from "../../sync/sync";
import { GameMenu, type StateBridge } from "../../player/GameMenu";
import { MenuButton, useMenuState } from "../../player/MenuButton";
import { QuickButtons } from "../../player/QuickButtons";
import { useGamepad } from "../../player/gamepads";
import { rotatedStyle, touchDevice, useOrientation } from "../../player/orientation";
import { usePrefs } from "../../ui/prefs";
import { createRetro, type RetroEmulator } from "./create-retro";
import { createInput, watchRetroGamepad } from "./input";
import { KeySettings, VirtualPadSetting, useRetroKeyboard } from "./RetroSettings";
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
  const menu = useMenuState();
  const input = useMemo(() => createInput((b, p) => emu.current?.press(b, p)), []);
  const { capturing, setCapturing } = useRetroKeyboard(system, input);
  const dir = gameDir(game.id);
  const sramPath = `${dir}/sram.srm`;
  const lastSram = useRef<Uint8Array | null>(null);
  const finishThumb = useRef<() => Promise<void>>(async () => {});

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
      const e = await createRetro(system, canvas.current!, new File([rom], romName), sram);
      if (disposed) return e.exit();
      emu.current = e;
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
      emu.current?.exit();
      emu.current = null;
    };
  }, []);

  const bridge = useMemo<StateBridge | null>(
    () =>
      ready
        ? {
            save: async () => {
              const e = emu.current!;
              return { state: await e.saveState(), thumb: await e.screenshot().catch(() => null) };
            },
            load: (state) => emu.current!.loadState(state),
            setFastForward: async (on) => emu.current!.setFastForward(on),
          }
        : null,
    [ready],
  );

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
        {() => (touchDevice ? <VirtualPadSetting gamepad={!!pad} /> : <KeySettings system={system} capturing={capturing} onCapture={setCapturing} />)}
      </GameMenu>
      {showPad && (
        <VirtualPad
          system={system}
          press={input.set}
          rotation={orientation.rotation}
          style={prefs.stickStyle}
          menuButton={<MenuButton onClick={menu.toggle} />}
          quick={<QuickButtons gameId={game.id} bridge={bridge} toast={showToast} />}
        />
      )}
      {status && <div class="overlay">{status}</div>}
      {toast && <div class="glass toast">{toast}</div>}
    </div>
  );
}
