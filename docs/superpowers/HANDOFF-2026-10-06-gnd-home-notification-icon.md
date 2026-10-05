# GND 바탕화면·푸시 알림 아이콘 (2026-10-06)

사용자 범위: 바탕화면 OPTION 1 G Monogram과 푸시 알림의 같은 이미지. 앱 내부 디자인은 Claude가 진행 중이다. Codex가 잠깐 수정한 onboarding/page와 launch splash는 HEAD로 되돌렸으며 이 커밋에 포함하지 않는다.

## 적용
- 원본: Downloads/GND 앱 아이콘 디자인 프레젠테이션.png의 left64/top234/width282/height282 크롭. G 형태·빛·테두리 원본 유지. 512는 확대 출력이며 새로운 사진 디테일을 만들지 않았다.
- public/icons/gnd-monogram-master.png로 재생성 가능. scripts/generate-icons.mjs는 Next가 이미 사용하는 Sharp를 사용하므로 새 의존성 없음.
- /icons/gnd-monogram-180.png는 metadata apple-touch-icon + src/app/apple-icon.png. Android manifest는 192/512/maskable512. 파일명 변경으로 새 설치가 옛 캐시 경로를 고르지 않도록 한다. 기존 icon-192/512/maskable 경로도 같은 이미지로 유지하여 앱 내부 알림 목록과 기존 참조 호환.
- sw.js push 옵션 icon은 새192, badge는 투명 배경 단색 G96. 작은 Android 상태표시줄은 OS가 단색 마스킹하므로 컬러 사각 아이콘 대신 같은 G 실루엣. 알림 제목/본문/대상 URL/notificationclick 로직 유지.
- favicon ICO도 G로 통일. PNG-in-ICO는 RGBA로 출력(실제 개발 화면에서 RGB 포맷 오류 발견 후 수정·재확인).

## 검증
- 개발 localhost:3000의 실제 아이콘 이미지, 로그인 페이지 apple-touch-icon 새 URL, manifest 응답3종과 사이즈/purpose 확인.
- 8769/app-icon/installed-preview.html은 디자인 검수용 미리보기. 버튼으로 원형 안전 영역 표시, 이미지7장 로딩 성공. 알림 그림은 모형이며 실제 OS 알림 수신 증빙이 아니다.
- sw 실제 코드의 push handler를 VM에서 가짜 registration으로 실행: icon/badge 새 경로, title/body/url 유지 확인. 실제 사용자 알림 미발송.
- 전체233파일4,038테스트 PASS. 원본 체크아웃 lint/typecheck는 ignored 자산/output 실험 파일로 실패. 이 커밋+HEAD만 별도 검증 복사본에서 ESLint 오류0/기존 경고4. Next webpack 컴파일 성공 후 기존 challenge/page.ts의 errorMessage export 페이지 계약 오류로 build/typecheck 실패. 이번 작업 범위 밖, 수정하지 않음.
- 운영 배포/실기기 설치/OS 푸시 아이콘 수신 미검증. 기존 설치본은 OS가 아이콘을 보관하므로 갱신 여부를 실기기에서 확인해야 한다. 아이콘만 바꾸기 위해 인증 저장소를 초기화하지 않는다.

다음 하나: 기존 챌린지 export 오류 해결 뒤 운영 배포 승인 및 실제 폰 설치·알림 수신 확인.
