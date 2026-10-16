// 라이브러리 위쪽 막대: 로고, 게임 추가, 계정(동기화 상태, 기기 저장 공간, 업로드 설정, 휴대폰 조작 공통 설정, 로그아웃).
import { useEffect, useRef, useState } from "preact/hooks";
import { reconnectDrive, signOut, useAuth } from "../../cloud/google-auth";
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
  const state = sync.conflict ? "warn" : sync.pending || !auth.driveReady ? "pending" : "ok";
  const label = sync.conflict
    ? "세이브 충돌이 있습니다"
    : !auth.driveReady
      ? `드라이브 연결 안 됨 · 기기에 저장 중${sync.pending ? ` (올릴 세이브 ${sync.pending}개)` : ""}`
      : sync.pending
        ? `드라이브에 올릴 세이브 ${sync.pending}개`
        : "드라이브와 동기화됨";
  return (
    <div class="popover-anchor">
      <button class={`avatar ${state}`} aria-label="계정" title={auth.email} onClick={() => setOpen(!open)}>
        {(auth.email ?? "?").slice(0, 1).toUpperCase()}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} class="account">
        <strong class="email">{auth.email}</strong>
        <span class={`sync-line ${state}`}>{label}</span>
        <StorageLine />
        <Row label="모바일 데이터로 게임 안 올리기">
          <Segmented value={wifiOnlyUpload ? "on" : "off"} options={[...ON_OFF]} onChange={(v) => setPrefs({ wifiOnlyUpload: v === "on" })} label="모바일 데이터로 게임 안 올리기" />
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

/**
 * 드라이브 토큰이 끊겼을 때(1시간이 지났거나 오프라인으로 시작) 다시 연결하는 버튼.
 * 구글 창은 사용자가 누른 순간에만 띄울 수 있어서 저절로 다시 연결하지 못한다. 연결 전까지는 기기에 저장해 둔다
 */
function ReconnectButton() {
  const auth = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => (removeEventListener("online", update), removeEventListener("offline", update));
  }, []);
  if (!auth.signedIn || auth.driveReady) return null;
  if (!online) return <span class="drive-chip offline">오프라인 · 기기에 저장 중</span>;
  return (
    <button class="drive-chip" disabled={auth.busy} onClick={() => void reconnectDrive().catch(() => undefined)} title="연결 전까지 세이브와 설정은 이 기기에 저장해 두고, 연결되면 올립니다">
      드라이브 연결
    </button>
  );
}

export function LibraryHeader({ picker, busy }: { picker: ReturnType<typeof useAddPicker>; busy: boolean }) {
  return (
    <header class="glass">
      <Logo size="small" />
      <div class="actions">
        <ReconnectButton />
        <button class="primary add" disabled={busy} onClick={picker.open}>
          + 게임 추가
        </button>
        <AccountMenu />
      </div>
      {picker.inputs}
    </header>
  );
}
