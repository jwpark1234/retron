// 기기 공통 설정(볼륨, 화면 필터 등)을 드라이브의 retron/settings.json에 둔다
import { getPrefs, onPrefsChange, setPrefs } from "../ui/prefs";
import { createFile, download, findChild, updateFile } from "./drive";
import { driveFolders } from "./games";
import { authState } from "./google-auth";

let timer: ReturnType<typeof setTimeout> | undefined;
let applying = false;
let subscribed = false;

async function save() {
  if (!authState().signedIn) return;
  const { root } = await driveFolders();
  const blob = new Blob([JSON.stringify({ prefs: getPrefs() })], { type: "application/json" });
  const file = await findChild(root, "settings.json");
  if (file) await updateFile(file.id, blob);
  else await createFile(root, "settings.json", blob);
}

/** 로그인했을 때: 드라이브 설정을 불러오고, 이후 바뀌면 저장한다 */
export async function syncSettings() {
  const { root } = await driveFolders();
  const file = await findChild(root, "settings.json");
  if (file) {
    const remote = (await (await download(file.id)).json()) as { prefs?: object };
    applying = true;
    if (remote.prefs) setPrefs(remote.prefs);
    applying = false;
  }
  if (subscribed) return;
  subscribed = true;
  onPrefsChange(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch(() => undefined), 3000);
  });
}
