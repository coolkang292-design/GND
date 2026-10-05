# GND 원본 온보딩·앱 시작 화면 인수인계 (2026-10-06)

## 최종 사용자 선택
사진 AI 재생성을 중단하고 원본 자르기를 명시적으로 승인했다. 1번은 온보딩: '지금 이 도전이 / 더 나은 나를 만든다'. 2번은 앱 시작: '의지가 꺾인 날에도 / 계속한 사람이 / 결국 이긴다'. 앱 시작의 시작하기/로그인 버튼과 점은 제외, 원본 사진과 보조 문구 유지. 이전 AI 후보는 적용하지 않는다.

## 자산
로컬 Git 제외 폴더: 어플 UI 이미지/Performance-Social-2026-10-06-Brand-Entry/. original-extracts/onboarding-original-approved.png(755×1408), launch-original-approved.png(420×670), source-map.json. 최종 앱 시작 WebP는 splash/gnd-launch-original-approved-v8.webp(97,176 bytes). 적용 지침/정확한copy.json/index.html/manifest/verification 포함. 같은 상위 폴더의 GND-Brand-Entry-2026-10-06.zip을 Claude에게 전달 가능. 이전 mockups/screens/photos는 후보 보존이며 최종 선택 아님.

## 로컬 앱 변경
LaunchMotivationSplash를 tabs layout에서 root layout으로 이동하여 로그인/온보딩 이동 시 사라지지 않도록 한다. 최종 원본 WebP 사용. 정상 표시1.5초+페이드180ms, 로딩 포함 최대2초 안전 종료, 탭으로 건너뛰기, 세션당 한 번. 인증/DB 로직 변경 없음. 온보딩 전체 화면은 Claude 적용 대기이며 버튼·입력은 실제 HTML 요소로 구현한다. onboarding linkIdentity와 login signInWithOAuth를 교체하지 않는다.

## 검증과 한계
- 최종 관련4파일15테스트 통과. 전체233파일4,037테스트 통과(최종 이미지경로 v8 교체 전 v7에서 실시, 동작은 동일; v8 관련 테스트 재실시).
- ESLint 오류0/기존 경고4, tsc --noEmit 통과. 독립 복사본 webpack build는 컴파일 성공 후 challenge/page.ts의 errorMessage 내보내기 Next 페이지 계약 오류로 실패. 이번 변경 외 오류이며 수정하지 않음.
- 개발서버/login에서 v8 원본 표시·버튼 없는 문구·자동 종료·비밀번호 보기/숨기기·세션 새로고침 후 재노출 없음 확인. 실제 로그인 제출/온보딩/실기기/PWA OS 실행 시간 미검증. 브라우저 증빙 splash/browser-original-launch.png.
- 자산 ZIP 갱신, 운영 배포 없음. 다른 세션 파일은 스테이징하지 않는다.

다음 하나: Claude가 온보딩 원본을 기준으로 기존 실제 버튼/인증 흐름에 연결하고 개발 환경에서 확인.
