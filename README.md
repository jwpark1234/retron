# retron

옛날 DOS 게임과 슈퍼패미컴(SFC) 게임을 브라우저에서 하는 웹 런처입니다. 여러 게임을 등록해 두고 라이브러리에서 골라 플레이합니다.

> 게임 파일은 이 저장소에 들어 있지 않습니다. 본인이 가진 게임 파일을 직접 등록해서 씁니다. 등록한 게임은 브라우저 저장소(OPFS)에 두고, 로그인하면 본인 구글 드라이브에만 올라갑니다. 다른 사용자와 공유되지 않습니다.

## 기능

- **라이브러리**: 등록한 게임을 그리드나 목록으로 봅니다. 썸네일은 게임 아이콘(.ico)이 있으면 그것을, 없으면 첫 실행 화면을 1:1로 잘라 씁니다.
- **게임 등록**: 폴더, zip, ROM 파일을 고릅니다.
  - **DOS**: 실행 파일이 있는 폴더를 C:로 씁니다. bin/cue나 iso가 있으면 D:(CD)로 연결합니다. CD 음악(레드북 오디오)도 재생됩니다.
  - **SFC**: .sfc, .smc, .fig, .swc
  - **zip**: 수백 MB짜리도 스트리밍으로 풀고, 한글(CP949) 파일명도 읽습니다.
- **저장**
  - **게임 안 세이브**: 게임에서 저장하면 브라우저에 자동으로 보관됩니다.
  - **상태 저장/불러오기**: 게임마다 슬롯 4개를 씁니다.
  - **자동 저장**: 나가거나, 웹을 닫거나, 다른 앱으로 넘어갈 때 저장하고, 3분마다도 저장합니다.
- **게임 중 메뉴(☰)**
  - 화면 방향: 자동, 가로, 세로
  - 화면 필터: 선명, 부드럽게, CRT
  - 볼륨과 음소거, 전체화면
  - 빨리가기: SFC만 지원합니다.
  - 상태 저장 슬롯
  - 라이브러리로 나가기
- **게임 설정(카드의 ⋯)**
  - 이름 변경
  - DOS: 실행 파일, 속도(cycles), 키 재배치, 게임패드 버튼 배치
  - 세이브 백업: 게임 안 세이브와 상태 슬롯을 zip으로 내보내고 가져옵니다.
  - 게임 삭제
- **조작**
  - PC: 마우스와 키보드를 씁니다.
  - 모바일: 탭은 좌클릭, 길게 누르면 우클릭입니다. 가상 키(ESC, Enter, Space, Y, N)도 있습니다.
  - 게임패드(DOS): 버튼은 키나 마우스 버튼으로, 스틱은 방향키나 마우스 커서로 보냅니다. SFC는 EmulatorJS의 게임패드 설정을 씁니다.

알려진 게임은 맞춤 설정을 씁니다(`src/platforms/dos/profiles.ts`). 지금은 창세기전2가 들어 있습니다.

## 실행

```bash
npm install
npm run dev
```

`npm run build`를 하면 `dist/`에 정적 파일이 만들어집니다.

### 구글 로그인과 드라이브 저장

Cloudflare Pages는 정적 파일 서빙만 합니다. 로그인하면 게임 파일, 세이브, 설정이 **각 사용자의 구글 드라이브** `retron` 폴더에 저장되고, 다른 기기에서 같은 계정으로 로그인하면 게임을 받아 이어서 할 수 있습니다. 앱은 `drive.file` 권한만 써서, 자기가 만든 파일 외의 드라이브 내용은 보지 못합니다.

```
내 드라이브/retron/
  games/{게임키}/   게임 파일 + manifest.json
  saves/{게임키}.zip 세이브 묶음 (게임 안 세이브, 상태 슬롯, SRAM)
  settings.json     볼륨, 화면 필터 등
```

- `.env`의 `VITE_GOOGLE_CLIENT_ID`: Google Cloud OAuth 클라이언트 ID (웹 애플리케이션). 승인된 JavaScript 원본에 사이트 주소를 넣어야 합니다.
- `npm run deploy`: 빌드한 뒤 Cloudflare Pages 프로젝트 `retron`에 배포합니다.

## 구성

| 영역 | 사용 기술 |
|---|---|
| UI | Preact + Vite |
| DOS | [js-dos 8](https://js-dos.com) `emulators` (DOSBox-X, Worker). js-dos 기본 UI는 쓰지 않고 화면, 소리, 입력을 직접 연결합니다 |
| SFC | [EmulatorJS](https://emulatorjs.org) 4.2.3 (snes9x), iframe으로 띄웁니다 |
| 저장소 | OPFS (게임 파일, 세이브, 상태, 썸네일) |
| 로그인·저장 | Google Identity Services, Google Drive API (`drive.file`) |
| 서빙 | Cloudflare Pages (정적 파일만) |

```
src/
  library/      게임 목록, 가져오기(zip, bin/cue 변환), 상태 슬롯, 썸네일, OPFS
  platforms/
    dos/        js-dos 연결, 세이브 감시, 게임 프로필
    sfc/        EmulatorJS 페이지와 플레이어
  cloud/        구글 로그인, 드라이브 API, 게임 올리기/받기, 설정 동기화
  sync/         세이브 동기화
  ui/           라이브러리, 게임 메뉴, 설정, 화면 방향, 가상 키
```

## 참고

- js-dos 8은 CD 오디오 트랙으로 raw BINARY만 재생합니다. 그래서 bin/cue는 등록할 때 `DATA.ISO`와 `TRACKnn.BIN`으로 나눠 둡니다.
- DOS 상태 저장은 DOSBox-X의 savestate(`hand_savestate`/`hand_loadstate` 이벤트)를 씁니다.
- DOS 빨리가기는 지원하지 않습니다. js-dos가 에뮬레이션 시간을 실제 시간에 맞춰 돌리기 때문입니다.
