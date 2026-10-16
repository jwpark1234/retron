// 기기 공통 설정(화면 필터, 조작 등)을 드라이브의 retron/settings.json과 맞춘다. 게임 파일·세이브와 같은 방식(기기 우선):
// 바꾸면 기기(localStorage)에 먼저 저장하고, 드라이브에 연결돼 있으면 올린다. 못 올렸으면 표시해 두고 연결되면 다시 올린다.
// 기기와 드라이브 중 마지막으로 바꾼 쪽(updatedAt)을 남긴다.
import { getPrefs, onPrefsChange, prefsUpdatedAt, setPrefs } from "../ui/prefs";
import { createFile, download, findChild, updateFile } from "./drive";
import { driveFolders } from "./games";
import { authState } from "./google-auth";

const DIRTY_KEY = "prefs-dirty";
const LEGACY_AT = 1; // updatedAt이 없던 예전 settings.json: 이 기기에서 바꾼 적이 있으면 기기 것이 이긴다

let timer: ReturnType<typeof setTimeout> | undefined;
let applying = false;
let subscribed = false;

const dirty = (v?: boolean) => {
  try {
    if (v === undefined) return localStorage.getItem(DIRTY_KEY) === "1";
    if (v) localStorage.setItem(DIRTY_KEY, "1");
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    // 표시를 못 남기면 다음 로그인 때 시각을 비교해서 맞춘다
  }
  return false;
};

const ready = () => authState().driveReady && navigator.onLine;

async function save() {
  if (!ready()) return;
  const { root } = await driveFolders();
  const blob = new Blob([JSON.stringify({ prefs: getPrefs(), updatedAt: prefsUpdatedAt() })], { type: "application/json" });
  const file = await findChild(root, "settings.json");
  if (file) await updateFile(file.id, blob);
  else await createFile(root, "settings.json", blob);
  dirty(false);
}

/** 앱을 시작할 때: 이 기기에서 바꾸면 표시해 두고 잠시 뒤 올린다 (연결이 없으면 표시만 남는다) */
export function initSettingsSync() {
  if (subscribed) return;
  subscribed = true;
  onPrefsChange(() => {
    if (applying) return;
    dirty(true);
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch(() => undefined), 3000);
  });
}

/** 드라이브와 맞춘다: 더 최근 쪽을 남긴다. 드라이브에 연결될 때마다 부른다 */
export async function syncSettings() {
  initSettingsSync();
  if (!ready()) return;
  const { root } = await driveFolders();
  const file = await findChild(root, "settings.json");
  const remote = file ? ((await (await download(file.id)).json()) as { prefs?: object; updatedAt?: number }) : null;
  const remoteAt = remote?.prefs ? (remote.updatedAt ?? LEGACY_AT) : 0;
  const localAt = prefsUpdatedAt();
  if (remote?.prefs && remoteAt > localAt) {
    applying = true;
    setPrefs(remote.prefs, remoteAt);
    applying = false;
    dirty(false);
  } else if (localAt > remoteAt || dirty()) {
    await save();
  }
}

/** 못 올린 설정이 있으면 올린다 (연결이 돌아왔을 때) */
export async function retrySettings() {
  if (dirty()) await save();
}
