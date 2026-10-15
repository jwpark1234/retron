// 라이브러리 위쪽 막대: 로고, 보기 방식(그리드/목록), 게임 추가, 계정(동기화 상태, 로그아웃).
import { useRef, useState } from "preact/hooks";
import { signOut, useAuth } from "../../cloud/google-auth";
import type { Entry } from "../../library/import";
import { fromInput } from "../../library/pick";
import { useSync } from "../../sync/sync";
import { Popover, Segmented } from "../../ui/controls";
import { Logo } from "../../ui/Logo";

export type View = "grid" | "list";

const VIEWS: { value: View; title: string; label: preact.JSX.Element }[] = [
  {
    value: "grid",
    title: "그리드",
    label: (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    value: "list",
    title: "목록",
    label: (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="2" width="14" height="3" rx="1.5" />
        <rect x="1" y="6.5" width="14" height="3" rx="1.5" />
        <rect x="1" y="11" width="14" height="3" rx="1.5" />
      </svg>
    ),
  },
];

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
        <button class="logout" onClick={signOut}>
          로그아웃
        </button>
      </Popover>
    </div>
  );
}

export function LibraryHeader({ view, onView, picker, busy }: { view: View; onView: (v: View) => void; picker: ReturnType<typeof useAddPicker>; busy: boolean }) {
  return (
    <header class="glass">
      <Logo size="small" />
      <div class="actions">
        <Segmented value={view} options={VIEWS} onChange={onView} label="보기 방식" />
        <button class="primary add" disabled={busy} onClick={picker.open}>
          + 게임 추가
        </button>
        <AccountMenu />
      </div>
      {picker.inputs}
    </header>
  );
}
