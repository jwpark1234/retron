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
import { useInstall } from "../../ui/install";
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

/** 앱으로 설치: 설치 창을 띄울 수 있으면 버튼, 아이폰이면 방법 안내, 이미 설치했으면 없음 */
function InstallRow() {
  const install = useInstall();
  if (install.kind === "prompt")
    return (
      <button class="install" onClick={() => void install.install().catch(() => undefined)}>
        앱으로 설치
        <small>홈 화면·앱 목록에서 바로 열고, 전체 화면으로 씁니다</small>
      </button>
    );
  if (install.kind === "ios") return <p class="muted install-hint">앱으로 쓰려면 사파리의 공유 버튼 → "홈 화면에 추가"</p>;
  return null;
}

function AccountMenu() {
  const auth = useAuth();
  const sync = useSync();
  const { wifiOnlyUpload, haptics, controlScale, controlOpacity } = usePrefs();
  const [open, setOpen] = useState(false);
  const state = sync.conflict ? "warn" : sync.pending || !auth.driveReady ? "pending" : "ok";
  const label = sync.conflict
    ? `세이브 충돌: ${sync.conflictTitles.join(", ")} · 게임을 열면 이 기기 것과 드라이브 것 중 고릅니다`
    : !auth.driveReady
      ? `${navigator.onLine ? "드라이브 연결 안 됨" : "오프라인"} · 기기에 저장 중${sync.pending ? ` (올릴 세이브 ${sync.pending}개)` : ""}`
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
        {/* 드라이브 연결이 끊겼을 때만 (보통은 서버가 조용히 다시 이어 준다. 권한을 거뒀거나 오래 안 쓴 경우) */}
        {!auth.driveReady && navigator.onLine && (
          <button class="reconnect" disabled={auth.busy} onClick={() => void reconnectDrive().catch(() => undefined)}>
            드라이브 다시 연결
          </button>
        )}
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
        <InstallRow />
        <button class="logout" onClick={signOut}>
          로그아웃
        </button>
      </Popover>
    </div>
  );
}

/** 진행 메시지에서 진행률(0~1)을 읽는다: "45%" 또는 "3/10". 못 읽으면 null (돌아가는 고리로 보여 준다) */
function fractionOf(msg: string): number | null {
  const pct = msg.match(/(\d+)%/);
  if (pct) return Math.min(1, +pct[1] / 100);
  const part = msg.match(/(\d+)\/(\d+)/);
  return part ? Math.min(1, +part[1] / +part[2]) : null;
}

/**
 * 게임 추가 중에는 버튼 왼쪽에 진행 메시지를, 버튼 테두리에 진행률 고리를 보여 준다.
 * 목록 위에 줄을 끼워 넣지 않아서 그리드가 들썩이지 않는다
 */
export function LibraryHeader({ picker, progress }: { picker: ReturnType<typeof useAddPicker>; progress: string }) {
  const f = progress ? fractionOf(progress) : null;
  return (
    <header class="glass">
      <Logo size="small" />
      <div class="actions">
        {progress && (
          <span class="add-status" role="status" title={progress}>
            {progress}
          </span>
        )}
        <button
          class={`primary add${progress ? (f === null ? " busy spin" : " busy") : ""}`}
          style={f === null ? undefined : { "--p": f }}
          disabled={!!progress}
          onClick={picker.open}
        >
          + 게임 추가
        </button>
        <AccountMenu />
      </div>
      {picker.inputs}
    </header>
  );
}
