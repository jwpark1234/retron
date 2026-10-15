// 라이브러리 위쪽 막대: 로고, 게임 추가, 계정(동기화 상태, 업로드 설정, 로그아웃).
import { useRef, useState } from "preact/hooks";
import { signOut, useAuth } from "../../cloud/google-auth";
import type { Entry } from "../../library/import";
import { fromInput } from "../../library/pick";
import { useSync } from "../../sync/sync";
import { ON_OFF, Popover, Row, Segmented } from "../../ui/controls";
import { Logo } from "../../ui/Logo";
import { setPrefs, usePrefs } from "../../ui/prefs";

/** "+ 게임 추가": 파일 선택창을 바로 연다 (zip, 롬 파일). 폴더째 넣고 싶으면 창에 끌어다 놓는다 */
export function useAddPicker(onPick: (entries: Entry[]) => void) {
  const file = useRef<HTMLInputElement>(null);
  const picked = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const entries = fromInput(input.files);
    input.value = "";
    onPick(entries);
  };
  const open = () => file.current?.click();
  const inputs = <input ref={file} type="file" multiple hidden onChange={picked} />;
  return { open, inputs };
}

function AccountMenu() {
  const auth = useAuth();
  const sync = useSync();
  const { wifiOnlyUpload } = usePrefs();
  const [open, setOpen] = useState(false);
  const state = sync.conflict ? "warn" : sync.pending ? "pending" : "ok";
  const label = sync.conflict ? "세이브 충돌이 있습니다" : sync.pending ? `드라이브에 올릴 세이브 ${sync.pending}개` : "드라이브와 동기화됨";
  return (
    <div class="popover-anchor">
      <button class={`avatar ${state}`} aria-label="계정" title={auth.email} onClick={() => setOpen(!open)}>
        {(auth.email ?? "?").slice(0, 1).toUpperCase()}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} class="account">
        <strong class="email">{auth.email}</strong>
        <span class={`sync-line ${state}`}>{label}</span>
        <Row label="게임 업로드는 Wi-Fi에서만">
          <Segmented value={wifiOnlyUpload ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => setPrefs({ wifiOnlyUpload: v === "on" })} label="게임 업로드는 Wi-Fi에서만" />
        </Row>
        <button class="logout" onClick={signOut}>
          로그아웃
        </button>
      </Popover>
    </div>
  );
}

export function LibraryHeader({ picker, busy }: { picker: ReturnType<typeof useAddPicker>; busy: boolean }) {
  return (
    <header class="glass">
      <Logo size="small" />
      <div class="actions">
        <button class="primary add" disabled={busy} onClick={picker.open}>
          + 게임 추가
        </button>
        <AccountMenu />
      </div>
      {picker.inputs}
    </header>
  );
}
