// 다른 앱에서 "공유"로 보낸 롬(manifest의 share_target)은 서비스 워커(public/sw.js)가 받는다.
// 서비스 워커가 아직 없을 때(앱을 설치하고 한 번도 열지 않음)만 여기로 온다: 파일은 받지 못하고 앱 첫 화면으로 돌려보낸다
export const onRequestPost = ({ request }: { request: Request }) => Response.redirect(new URL("./", request.url).href, 303);
