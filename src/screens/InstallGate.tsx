// 휴대폰·태블릿 브라우저로 열면 앱(PWA)으로 설치하게 한다. 설치한 앱으로 열어야 로그인·라이브러리로 들어간다.
// 까닭: 브라우저 탭에서는 저장 공간이 모자라거나 오래 안 쓰면 브라우저가 게임 파일을 지울 수 있고(설치한 앱은 보관한다),
// 주소창 없이 전체 화면으로 써야 조작 영역이 넓다. PC는 브라우저 그대로 쓴다.
import { ios, useInstall } from "../ui/install";
import { Logo } from "../ui/Logo";

const BG = { "--landing-bg": `url("${new URL(`${import.meta.env.BASE_URL}landing-bg.jpg`, document.baseURI).href}")` };

export function InstallGate() {
  const install = useInstall();
  return (
    <div class="landing install-gate" style={BG}>
      <Logo />
      <p class="gate-text">
        휴대폰에서는 <strong>앱으로 설치</strong>해서 씁니다.
        <br />
        전체 화면으로 열리고, 받은 게임을 기기에 안전하게 보관합니다.
      </p>
      {install.kind === "prompt" && (
        <button class="primary" onClick={() => void install.install().catch(() => undefined)}>
          앱 설치
        </button>
      )}
      {install.kind === "installed" && <p class="gate-text">설치했습니다. 홈 화면의 <strong>RETRON</strong> 아이콘으로 여세요.</p>}
      {install.kind === "ios" && (
        <ol class="gate-steps glass">
          <li>
            사파리 아래쪽 <b>공유 버튼</b>(네모에서 위쪽 화살표)을 누릅니다
          </li>
          <li>
            <b>홈 화면에 추가</b> → <b>추가</b>
          </li>
          <li>
            홈 화면의 <b>RETRON</b>을 열고 로그인합니다
          </li>
        </ol>
      )}
      {install.kind === "none" && (
        <ol class="gate-steps glass">
          <li>
            브라우저 메뉴(<b>⋮</b>)에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누릅니다
          </li>
          <li>
            이미 설치했다면 홈 화면의 <b>RETRON</b>으로 엽니다
          </li>
        </ol>
      )}
      {ios && <p class="fineprint">아이폰은 설치한 앱이 사파리와 저장 공간을 따로 씁니다. 사파리에서 하던 게임은 드라이브에서 다시 받습니다.</p>}
      <a class="fineprint privacy-link" href="./privacy.html">
        개인정보처리방침
      </a>
    </div>
  );
}
