# retron 설계

- 작성일: 2026-10-14
- 상태: 승인된 설계 (구현 계획 작성 전)
- 첫 대상 게임: 창세기전2 (DOS, CD 오디오 BGM)

## 1. 목표와 범위

옛 게임을 브라우저에서 PC와 모바일로 플레이하고, 세이브를 기기 간에 공유하는 웹 런처입니다. 허용한 지인 몇 명이 함께 씁니다.

- **코드만 공개합니다.** 게임 파일은 저장소에 넣지 않고, 사용자가 자기 원본을 직접 올립니다. 사용자 간에 게임 파일을 공유하지 않습니다.
- **PC와 모바일(안드로이드 크롬, 아이폰 사파리) 모두 지원합니다.** 설계는 더 까다로운 아이폰 기준에 맞춥니다.
- **세이브는 자동으로 동기화합니다.** 기기 우선(local-first)으로 저장하고 Cloudflare R2를 기준 사본으로 둡니다.
- **플랫폼을 늘릴 수 있게 공통부분을 분리합니다.** v1은 DOS(js-dos 8)만 구현하고, SFC 등은 어댑터 인터페이스만 열어 둡니다.

### v1 범위
- `packages/core`, `packages/adapter-dos`, `packages/profiles`(창세기전2), `apps/web`, `functions/api`
- PC 브라우저에서 bin/cue 업로드와 변환
- 헤드리스 테스트 하네스

### v1에서 제외
- SFC 어댑터 (v1 이후 별도 스펙)
- 에뮬레이터 상태 저장(세이브 스테이트): js-dos DOS 백엔드가 지원하지 않음. 인터페이스에 기능 플래그만 둠
- "다른 기기에서 플레이 중" 실시간 잠금: 조건부 쓰기로 충돌을 잡으므로 불필요
- 공개 가입

## 2. 사전 검증 결과 (2026-10-14)

js-dos 8.4.1(DOSBox-X 백엔드)을 Node에서 헤드리스로 돌려 확인했습니다 (`tools/node-cd-test.cjs`).

| 항목 | 결과 |
|---|---|
| 부팅, CD 인식 | ✅ 인트로 → 타이틀 → 처음부터 하기 → 월드맵 |
| 게임 내 CD 음악 | ✅ 월드맵에서 트랙 11 재생 확인 (트랙별 사인파 판별) |
| CD 트랙 형식 | **raw BINARY만 동작.** WAV/OGG/Opus/FLAC/MP3는 마운트 실패 또는 `IMGMOUNT::Run()` wasm 크래시 |
| CD 진품 검사 | 트랙 길이가 원본과 다르면 "CD를 넣어주세요". 트랙 길이는 원본 그대로 유지해야 함 |
| CD 음량 | 약 -20dB로 작음. mixer 설정으로 보정 필요 |
| 사운드 구성 | 인트로 음성은 `SOFTMAX.VOC`, BGM은 전부 CD 음원 |

원본 용량: 데이터 트랙 ISO 148MB, 오디오 트랙 18개 raw 약 450MB, 게임 폴더 약 63MB.

## 3. CD 오디오 처리 방식: C (A로 시작, 필요하면 B)

- **A. 메모리에 전부 올리기**: 보관·전송은 Opus로 압축하고, 실행 직전에 wasm 디코더로 raw PCM으로 풀어 에뮬레이터 가상 FS에 넣습니다. 실행 중 메모리는 약 660MB입니다.
- **B. 에뮬레이터 직접 빌드**: CD 오디오를 에뮬레이터 밖에서 스트리밍 재생하도록 포크합니다. 메모리 문제는 해결되지만 빌드·유지보수 부담이 큽니다.
- **결정**: A로 시작합니다. 어댑터의 `prepare()` 안에 변환을 가둬서 B로 바꿀 때 이 부분만 교체합니다. 실기기 메모리 측정값(9장)을 근거로 B 전환 여부를 정합니다.

## 4. 아키텍처

npm workspaces 모노레포입니다.

```
retron/
├─ packages/
│  ├─ core/            플랫폼 무관 공통부분
│  │   ├─ library       게임 목록, 매니페스트
│  │   ├─ storage       OPFS 캐시 (게임 파일, 세이브, 로컬 히스토리)
│  │   ├─ sync          R2와 세이브 동기화, 충돌 감지, 업로드 대기열
│  │   ├─ input         입력 원천 → 게임 입력 매핑, 터치 모드, 가상 키 바
│  │   ├─ auth          현재 사용자
│  │   ├─ import        bin/cue 분리, 해시, Opus 인코딩 파이프라인
│  │   ├─ ui            Preact 셸 (게임 선택, 업로드, 게임 중 툴바, 토스트, 충돌 화면)
│  │   └─ EmulatorAdapter 인터페이스
│  ├─ adapter-dos/     js-dos 8 emulators API 직접 사용 (js-dos 기본 UI 미사용)
│  └─ profiles/        게임 프로필 (genesis2/: dosbox.conf, profile.json)
├─ apps/web/           Vite 앱. core + 어댑터 + 프로필 조립, PWA
├─ functions/api/      Cloudflare Pages Functions (R2 API)
└─ tools/harness/      Node 헤드리스 테스트 하네스
```

js-dos 기본 UI를 쓰지 않는 이유: 세이브 동기화, 모바일 조작, 툴바를 플랫폼과 상관없이 똑같이 맞추려면 UI를 직접 가져야 합니다.

### EmulatorAdapter 인터페이스

```ts
interface EmulatorAdapter {
  readonly capabilities: { saveStates: boolean };
  prepare(profile: GameProfile, files: GameFiles): Promise<PreparedGame>; // 예: Opus → raw
  start(canvas: HTMLCanvasElement, game: PreparedGame): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  input: AdapterInput;                    // 키, 마우스(절대 좌표), 버튼
  listSaveFiles(): Promise<string[]>;     // 프로필의 세이브 패턴에 맞는 파일
  readSave(): Promise<SaveSet>;
  writeSave(set: SaveSet): Promise<void>; // 시작 전에만 호출
  onSaveChanged(cb: () => void): Unsubscribe;
}
```

### 게임 프로필 (저장소에 포함, 모든 사용자 공유)

`packages/profiles/genesis2/profile.json`에 다음을 둡니다.
- 플랫폼(`dos`), 표시 이름
- 원본 판별용 데이터 트랙 sha256
- 마운트·실행 구성 (`mount c GENESIS2`, `imgmount d CD/GENE2.CUE -t iso`, `GENE2`)과 `dosbox.conf` (svga_s3, memsize 16, SB16 220/7/1/5, cycles=max; 현재 `config/dosbox.conf`)
- 세이브 파일 패턴 (예: `CHAPDATA/*.SV?`, `BLACKBOX.SV?`, `GENESIS.QSV`. 실제 게임에서 세이브해 보고 구현 때 확정)
- 가상 키 바 구성, 기본 키 리매핑

## 5. 사용자와 데이터 분리

- **인증**: Cloudflare Access + 구글 로그인. 허용 이메일 목록은 관리자가 Cloudflare 대시보드에서 관리합니다. 지인은 Cloudflare에 가입하지 않습니다.
- **Functions**: 모든 요청에서 Access JWT를 검증하고(Access 앞단과 이중 방어) `sub`를 userId로 씁니다. 모든 R2 경로는 서버가 `users/{userId}/` 아래로 강제하며, 클라이언트는 경로를 지정할 수 없습니다.
- **용량 한도**: 사용자별 기본 2GB. 업로드할 때 확인합니다. 창세기전2는 1인당 약 250MB입니다.

### R2 구조 (버킷 `retron`)
```
users/{userId}/games/{gameId}/...           변환된 게임 파일 (ISO, Opus 트랙, 게임 폴더)
users/{userId}/saves/{gameId}/HEAD.json     { rev, parentRev, device, savedAt, sha256 }
users/{userId}/saves/{gameId}/revs/{rev}.zip  최근 20개 보관
users/{userId}/settings.json                개인 설정 (프로필 기본값 위에 덮어쓰는 값만)
```

### 데이터 위치

| 데이터 | R2 (기준) | 기기 OPFS | 비고 |
|---|---|---|---|
| 게임 파일 | ✅ | ✅ 캐시 | 지워지면 다시 받음 |
| 세이브 | ✅ 최근 20개 | ✅ 현재 + 업로드 대기 + 최근 5개 | |
| 개인 설정 | ✅ | 캐시 | |
| 게임 프로필 | ❌ | 앱에 포함 | 저장소 코드, Pages로 배포 |
| 원본 bin/cue | ❌ | ❌ | 변환 결과만 업로드 |
| 로그인 정보 | ❌ | ❌ | 구글과 Access가 처리 |

## 6. 게임 가져오기 (PC 브라우저)

PC 브라우저(크롬/엣지)의 업로드 화면에서 진행합니다. 모바일에서는 업로드 화면을 숨기고 "PC에서 올려 주세요"라고 안내합니다.

1. 사용자가 bin/cue와 게임 폴더를 선택합니다.
2. JS로 bin을 데이터 ISO(MODE1/2352 → 2048)와 트랙별 raw PCM으로 분리합니다 (`tools/split_cue.py`와 같은 로직).
3. 데이터 트랙 sha256으로 프로필을 판별합니다. 맞는 프로필이 없으면 거부합니다.
4. 오디오 트랙을 WebCodecs로 Opus 인코딩합니다. 디코딩 후 샘플 수가 원본과 정확히 같도록 트랙별 원본 샘플 수를 매니페스트에 기록합니다 (CD 진품 검사 때문).
5. 파일별 sha256을 담은 매니페스트와 함께 R2에 업로드합니다.

재생할 때 Opus 디코딩은 wasm 디코더로 합니다. 아이폰 사파리를 포함해 모든 기기에서 같은 결과를 내기 위해서입니다.

## 7. 세이브 동기화

원칙: 기기 우선, 서버는 기준 사본, 충돌은 사용자가 선택합니다.

- **단위**: 게임별 세이브 세트 하나. 프로필의 세이브 패턴에 맞는 파일 전체를 zip 하나로 묶어 하나의 리비전으로 다룹니다.
- **게임 시작**: HEAD를 조회합니다.
  - 서버가 더 새것이고 기기에 올리지 않은 변경이 없으면 서버 것을 받습니다. 덮어쓰기 전에 기기 세이브를 로컬 히스토리에 먼저 보관합니다.
  - 양쪽 다 바뀌었으면 충돌 화면을 띄웁니다. "서버 것 사용" / "이 기기 것 사용" 중 고르고, 고르지 않은 쪽은 히스토리에 남깁니다.
- **게임 중 세이브**: `onSaveChanged` → 2초 디바운스 → OPFS 저장(`await` 완료 후 표시) → R2 업로드.
- **업로드는 조건부 쓰기**: "내가 알던 HEAD가 그대로일 때만" 덮어씁니다 (R2 etag 조건). 그 사이 다른 기기가 먼저 올렸으면 충돌 화면을 띄웁니다.
- **자동 업로드**: 사용자가 업로드 버튼을 누를 일은 없습니다. 실패하거나 오프라인이면 대기열에 넣고 다음 시점에 자동으로 다시 시도합니다.
  1. 브라우저가 온라인으로 바뀌는 순간 (`online` 이벤트)
  2. 앱을 다시 열거나 화면으로 돌아왔을 때 (`visibilitychange`)
  3. 앱이 열려 있는 동안 주기적 재시도 (5초 → 30초 → 2분 → 최대 5분)
  4. 안드로이드 크롬: 앱을 닫은 뒤에도 Background Sync API로 업로드
  - 아이폰 사파리는 Background Sync를 지원하지 않으므로 다음에 앱을 열 때 올라갑니다. 이 경우의 안전장치는 충돌 화면입니다.
- **툴바 상태**: ✓ 동기화됨 / ↑ 업로드 대기 / ⚠ 충돌
- **이탈 경고**: 업로드 대기가 있을 때만 띄웁니다.
- **수동 기능**: 세이브 zip 다운로드·업로드(백업), 히스토리에서 이전 리비전으로 되돌리기.

## 8. 조작

창세기전2는 마우스 중심 게임이므로 DOS 어댑터의 핵심은 포인터 입력입니다.

**PC**
- 마우스는 절대 좌표로 매핑합니다 (`sendMouseMotion(x, y)` 동작 확인). 포인터 잠금이 필요 없습니다.
- 키보드는 그대로 전달하고, 프로필과 개인 설정으로 리매핑할 수 있습니다.

**모바일 터치** (툴바에서 전환)
- **직접 터치 모드**(기본): 탭 = 그 위치로 이동 후 좌클릭. 길게 누르기(0.5초) 또는 두 손가락 탭 = 우클릭.
- **트랙패드 모드**: 드래그로 커서를 상대 이동, 탭으로 클릭. 작은 버튼을 정확히 누를 때 씁니다.
- **가상 키 바**: 프로필에 정의한 키만(ESC, Enter, Space 등). 접을 수 있습니다.

**공통 입력 계층 (`core/input`)**: 키보드, 마우스, 터치, 게임패드(Gamepad API), 가상 키 바를 매핑을 거쳐 게임 입력으로 바꾸고 어댑터로 넘깁니다.

**화면**
- 4:3 비율 유지. 가로 화면은 게임 최대 크기, 세로 화면은 위에 게임·아래에 컨트롤.
- PWA 지원. 아이폰은 전체화면 API가 없고, 홈 화면 앱일 때 저장소가 덜 지워지므로 PWA 사용을 권장합니다.
- 첫 화면에 "탭하여 시작" 버튼 (iOS 오디오 활성화 조건).

## 9. 배포, 기기 캐시, 에러 처리

**배포**
- Cloudflare Pages 프로젝트 `retron`: 정적 앱 + `/api/*` Functions, R2 버킷 `retron` 바인딩.
- 사이트 전체를 Access 뒤에 둡니다.
- 게임 파일은 Functions가 R2에서 스트리밍하며 Range 요청을 지원합니다(이어받기).
- js-dos Worker 모드에 COOP/COEP 헤더가 필요한지는 구현 때 확인하고, 필요하면 `_headers`로 설정합니다.

**기기 캐시**
- OPFS `games/{gameId}/`에 저장하고 매니페스트 해시로 버전을 관리합니다.
- `navigator.storage.persist()`로 영구 저장을 요청하고 사용량을 표시합니다.

**에러 처리**
- 다운로드: 이어받기, 매니페스트 sha256 검증.
- 메모리 부족: 에뮬레이터 시작 실패나 탭 강제 종료를 감지하면 안내합니다. 기기별 메모리 측정값을 로컬에 기록해 B 방식 전환 판단 근거로 씁니다.
- 동기화 실패: 업로드 대기열 + 상태 표시. 기기 세이브는 절대 먼저 지우지 않습니다.
- iOS 저장소 삭제: 캐시가 사라졌으면 다시 다운로드를 안내합니다. 세이브는 R2에 있으므로 안전합니다.

## 10. 테스트

- **core 단위 테스트** (Vitest): 동기화 상태 머신(충돌 케이스 전부), 업로드 재시도 시점, 입력 매핑, 프로필·매니페스트 파싱, bin/cue 분리.
- **Functions 테스트**: wrangler 로컬 R2로 JWT 검증, 경로 강제, 용량 한도, 조건부 쓰기, Range 요청.
- **DOS 어댑터 통합 테스트**: `tools/harness`(현재 `node-cd-test.cjs`를 정식화)로 타이틀 도달, CD 트랙 재생 판별, Opus 왕복 후 진품 검사 통과, 세이브 변경 감지. 로컬에 게임 파일이 없으면 건너뜁니다.
- **수동 기기 체크리스트**: 안드로이드 크롬, 아이폰 사파리(PWA). 메모리 측정 포함.

## 11. 남은 확인 사항 (구현 중 확정)

- 창세기전2 실제 세이브 파일 목록
- js-dos Worker 모드의 COOP/COEP 필요 여부
- CD 음량 보정 값
- 아이폰에서 660MB 메모리로 실행 가능한지 (B 전환 여부)
