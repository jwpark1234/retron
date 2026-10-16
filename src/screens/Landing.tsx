// 첫 화면: 로고와 구글 로그인. 로그인해야 라이브러리로 들어간다
import { signIn, useAuth } from "../cloud/google-auth";
import { Logo } from "../ui/Logo";

export function Landing() {
  const auth = useAuth();
  return (
    <div class="landing">
      <Logo />
      <button class="google-signin" disabled={auth.busy} onClick={() => void signIn().catch(() => undefined)}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
          <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {auth.busy ? "로그인 중…" : "Google 계정으로 로그인"}
      </button>
      {auth.error && <p class="error">로그인하지 못했습니다: {auth.error}</p>}
      <p class="fineprint">모든 데이터는 내 구글 드라이브의 retron 폴더에 저장됩니다.</p>
    </div>
  );
}
