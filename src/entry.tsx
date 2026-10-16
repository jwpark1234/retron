import { render } from "preact";
import { App } from "./App";
import { applyControlStyle } from "./ui/control-style";
import { installHaptics } from "./ui/haptics";
import { preventZoom } from "./ui/no-zoom";
import "./style.css";

preventZoom();
installHaptics();
applyControlStyle();
render(<App />, document.getElementById("app")!);
