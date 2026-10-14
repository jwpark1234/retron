import { useEffect, useRef, useState } from "preact/hooks";
import type { Game } from "../../library/library";

export function SfcPlayer({ game, onExit }: { game: Game; onExit: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === "saved") {
        setToast("저장되었습니다");
        clearTimeout(timer);
        timer = setTimeout(() => setToast(""), 2000);
      }
      if (e.data?.type === "exited") onExit();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const exit = () => {
    frame.current?.contentWindow?.postMessage({ type: "exit" }, location.origin);
    setTimeout(onExit, 4000); // iframe이 응답하지 않아도 나간다
  };

  return (
    <div class="game">
      <iframe ref={frame} class="sfc-frame" src={`/sfc.html?id=${encodeURIComponent(game.id)}`} allow="autoplay; fullscreen; gamepad" />
      <div class="toolbar">
        <button onClick={exit}>나가기</button>
      </div>
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}
