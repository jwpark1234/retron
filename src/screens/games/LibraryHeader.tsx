// 라이브러리 위쪽 막대: 로고, 게임 추가, 계정(동기화 상태, 기기 저장 공간, 업로드 설정, 휴대폰 조작 공통 설정, 로그아웃).
import { useEffect, useRef, useState } from "preact/hooks";
import { signOut, useAuth } from "../../cloud/google-auth";
import type { Entry } from "../../library/import";
import { fromInput } from "../../library/pick";
import { StickStyleRow } from "../../player/DirectionPad";
import { touchDevice } from "../../player/orientation";
import { useSync } from "../../sync/sync";
import { CONTROL_OPACITIES, CONTROL_SIZES } from "../../ui/control-style";
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

const GB = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)}GB` : `${Math.round(n / 1024 ** 2)}MB`);

/** 이 브라우저가 쓰는 저장 공간 / 쓸 수 있는 공간 (게임 파일, 세이브, 썸네일). 메뉴를 열 때마다 다시 잰다 */
function StorageLine() {
  const [text, setText] = useState("");
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then(({ usage = 0, quota = 0 }) => setText(`${GB(usage)} / ${GB(quota)}`))
      .catch(() => undefined);
  }, []);
  if (!text) return null;
  return (
    <Row label="기기 저장 공간">
      <small>{text}</small>
    </Row>
  );
}

function AccountMenu() {
  const auth = useAuth();
  const sync = useSync();
  const { wifiOnlyUpload, haptics, controlScale, controlOpacity } = usePrefs();
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
        <StorageLine />
        <Row label="게임 업로드는 Wi-Fi에서만">
          <Segmented value={wifiOnlyUpload ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => setPrefs({ wifiOnlyUpload: v === "on" })} label="게임 업로드는 Wi-Fi에서만" />
        </Row>
        {touchDevice && (
          <>
            <h3 class="popover-title">조작 (모든 게임)</h3>
            <StickStyleRow />
            <Row label="버튼 크기">
              <Segmented value={String(controlScale)} options={CONTROL_SIZES} onChange={(v) => setPrefs({ controlScale: +v })} label="버튼 크기" />
            </Row>
            <Row label="버튼 투명도">
              <Segmented value={String(controlOpacity)} options={CONTROL_OPACITIES} onChange={(v) => setPrefs({ controlOpacity: +v })} label="버튼 투명도" />
            </Row>
            <Row label="버튼 햅틱">
              <Segmented value={haptics ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => setPrefs({ haptics: v === "on" })} label="버튼 햅틱" />
            </Row>
          </>
        )}
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
