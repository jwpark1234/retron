import { render } from "preact";
import { App } from "./App";
import { applyControlStyle } from "./ui/control-style";
import { installHaptics } from "./ui/haptics";
import "./ui/install"; // 앱 설치 창을 시작할 때부터 받아 둔다
import { preventZoom } from "./ui/no-zoom";
import "./style.css";

preventZoom();
installHaptics();
applyControlStyle();
render(<App />, document.getElementById("app")!);

// 오프라인에서도 앱이 열리게 (public/sw.js). 개발 서버에서는 쓰지 않는다 (고친 코드가 바로 보이게)
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
