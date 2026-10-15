import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Game } from "../../library/library";
import { GameMenu, type StateBridge } from "../../ui/GameMenu";
import { rotatedStyle } from "../../ui/RotatedStage";
import { useOrientation } from "../../ui/orientation";
import { effectiveVolume, usePrefs } from "../../ui/prefs";
import { markDirty } from "../../sync/sync";
import { uploadGame } from "../../cloud/games";

export function SfcPlayer({ game, onExit }: { game: Game; onExit: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>());
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState("불러오는 중…"); // 게임이 시작될 때까지 iframe 대신 보여 준다
  const orientation = useOrientation();
  const prefs = usePrefs();
  const sendPrefs = () =>
    frame.current?.contentWindow?.postMessage({ type: "prefs", volume: effectiveVolume(prefs), filter: prefs.filter }, location.origin);
  useEffect(sendPrefs, [prefs]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      const d = e.data ?? {};
      if (d.type === "saved") {
        markDirty(game.id);
        setToast("저장되었습니다");
        clearTimeout(timer);
        timer = setTimeout(() => setToast(""), 2000);
      } else if (d.type === "progress") setStatus((s) => (s ? d.text : s));
      else if (d.type === "started") setStatus("");
      else if (d.type === "thumbnail") void uploadGame(game.id).catch(() => undefined); // 다른 기기에서도 썸네일이 보이게
      else if (d.type === "exited") onExit();
      else if (d.type === "result") {
        const p = pending.current.get(d.reqId);
        pending.current.delete(d.reqId);
        if (d.error) p?.reject(new Error(d.error));
        else p?.resolve(d);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // iframe 안의 EmulatorJS와 요청/응답으로 주고받는다
  const bridge = useMemo<StateBridge>(() => {
    let next = 0;
    const call = (msg: object) =>
      new Promise<any>((resolve, reject) => {
        const reqId = ++next;
        pending.current.set(reqId, { resolve, reject });
        frame.current?.contentWindow?.postMessage({ ...msg, reqId }, location.origin);
        setTimeout(() => pending.current.has(reqId) && (pending.current.delete(reqId), reject(new Error("응답이 없습니다"))), 5000);
      });
    return {
      save: async () => {
        const r = await call({ type: "save-state" });
        return { state: r.state, thumb: r.thumb };
      },
      load: async (state) => void (await call({ type: "load-state", state })),
      setFastForward: async (on) => void (await call({ type: "fast-forward", on })),
    };
  }, []);

  const exit = () => {
    frame.current?.contentWindow?.postMessage({ type: "exit" }, location.origin);
    setTimeout(onExit, 4000); // iframe이 응답하지 않아도 나간다
  };

  return (
    <div class="game" style={rotatedStyle(orientation.rotation)}>
      <iframe ref={frame} class={`sfc-frame ${status ? "loading" : ""}`} src={`${import.meta.env.BASE_URL}sfc.html?id=${encodeURIComponent(game.id)}`} allow="autoplay; fullscreen; gamepad" onLoad={sendPrefs} />
      <GameMenu gameId={game.id} title={game.title} bridge={bridge} onExit={exit} orientation={orientation} />
      {status && <div class="overlay">{status}</div>}
      {toast && <div class="glass toast">{toast}</div>}
    </div>
  );
}
