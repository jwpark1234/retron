# 앞으로 할 일

## N64 지원 (보류)

- 보류한 이유: 실제 롬으로 시험하다 개발 PC가 버티지 못하고 멈췄다.
- 지금까지 한 것: 로컬 브랜치 `n64-wip` (커밋 6ba9857, push 안 함). main에는 들어가 있지 않다.
  - 에뮬레이터: N64Wasm (MIT, github.com/nbarkhina/N64Wasm, 커밋 고정). `scripts/copy-emulators.mjs`가 빌드 때 `public/n64/`로 받는다
  - `src/platforms/n64/` (실행, 가상패드), 아날로그 방향 패드, SFC·GBA와 같이 쓰는 키보드 설정·입력
  - RetroArch 웹 빌드(1.17~1.22.2)에는 N64 코어가 없어서 N64Wasm을 골랐다
- 남은 일: 가벼운 환경(휴대폰, 다른 PC)에서 실제 롬 실행 확인 → 저장·불러오기, 가상패드 확인 → main에 합치기
- 시험용 롬: `D:\zz\legend of zelda korean.n64`

## 윈도우 98 지원

- 아직 이야기만 했다. 정해진 것 없음
- 후보: DOSBox-X(지금 DOS에 쓰는 js-dos 8)로 윈도우 98 하드 디스크 이미지를 부팅하거나, v86 같은 PC 에뮬레이터
- 윈도우 98 설치 이미지는 사용자가 직접 가져와야 한다 (앱에 넣을 수 없다). 이미지가 커서(수백 MB~) 드라이브 올리기·받기, 저장 방식을 따로 정해야 한다

## 테스트용·쓸데없는 폴더와 파일 지우기

지우기 전에 목록을 보여 주고 확인받는다.

- `game-data/`(git 밖 테스트 자료)와 `dist/`는 2026-10-20에 모두 지웠다. 브라우저 시험 스크립트(playwright), 시험 롬(KeyColor.gba 등), zip·인증 시험도 같이 없어졌으니 다시 시험하려면 새로 만든다
- Cloudflare R2 버킷 `retron` (예전 방식에서 쓰던 것, 비어 있지 않음, 지금은 안 씀)
- 브랜치 `n64-wip` (N64를 main에 합친 뒤)
- 저장소 밖 `D:\zz`의 게임 zip들(`DARK.zip`, `Ed3.zip`, `ed4.zip`, `Genesis2.zip`, `water2.zip`)은 사용자 게임이라 손대지 않는다
