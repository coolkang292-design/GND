# 블랙&골드 브랜딩 적용 — 설계 (2026-07-18)

사용자 결정(2026-07-18): 앱 디자인 = 블랙&골드. 브랜딩 레퍼런스 = `C:\Users\SAMSUNG\Desktop\Workout app\GND 앱 아이콘 디자인 소개.png`
(GND 덤벨 로고 + 불독 마스코트 + "NO EXCUSES. JUST RESULTS."). 계획서 §2 결정 변경 항목의 구현 스펙.

## 확정 결정

1. **항상 블랙&골드 단일 테마** — 기기 라이트/다크 설정 무시. `globals.css`의
   `prefers-color-scheme` 미디어쿼리·`data-theme` 오버라이드 블록 제거, `:root` 하나로 통합.
   (JS 테마 토글 코드는 원래 없음 — CSS만 정리하면 됨)
2. **아이콘 = 시안 이미지에서 크롭** — 좌측 대형 아이콘 패널(1024×1024 시안)을 잘라
   192/512/maskable-512 PNG 생성, `public/icons/` 교체. maskable은 안전영역(중앙 80%) 여백 확보.
3. **완료 초록 유지, 경고색은 주황으로 이동** — 기존 `--warn` 앰버(#F0A64B)가 골드 액센트와
   거의 같아 스트릭 소멸 경고가 액센트와 구분되지 않는 문제 예방.

## 토큰 값 (globals.css `:root`)

| 토큰 | 값 | 비고 |
|---|---|---|
| `--bg` | `#0B0B0C` | 딥 블랙 |
| `--surface` | `#16161A` | 카드 |
| `--surface-2` | `#211F18` | 웜 블랙(인풋·서브 배경) |
| `--text` | `#F2EFE6` | 웜 화이트 |
| `--muted` | `#A49E8D` | |
| `--faint` | `#6F6A5C` | |
| `--line` | `#2C2A24` | |
| `--accent` | `#E8B84B` | 골드 |
| `--accent-ink` | `#1C1403` | 골드 버튼 위 글자 |
| `--accent-weak` | `#33290F` | 골드 틴트 배경 |
| `--good` | `#3DD37E` | 유지(완료=초록 분리 원칙) |
| `--good-weak` | `#15301F` | |
| `--warn` | `#FB8A3C` | 앰버→주황 |
| `--shadow` | 다크 그림자 유지 | |

홈 배경 라디얼 글로우는 `--accent` 참조라 자동으로 골드 글로우.

## 변경 파일

- `src/app/globals.css` — 토큰 단일화·값 교체
- `src/app/layout.tsx` — `themeColor` 단일 `#0B0B0C`
- `src/app/manifest.ts` — `background_color #0B0B0C`·`theme_color #E8B84B`·description에 태그라인
- `src/app/onboarding/…` 첫 화면 상단 — 골드 "GND" 로고타입 + "NO EXCUSES. JUST RESULTS." 캡션(텍스트 렌더, 이미지 아님)
- `public/icons/icon-192.png`·`icon-512.png`·`icon-maskable-512.png` — 시안 크롭으로 교체

## 하지 않는 것 (YAGNI)

- 스플래시 화면 별도 제작(PWA가 manifest 색+아이콘으로 자동 생성)
- 목업 html 재작성(목업은 시점 기록으로 유지)
- 라이트 테마 병행 지원
- 불독 마스코트 SVG 재제작(시안 크롭 사용)

## 검증

- 기존 unit 115·lint·typecheck 통과(신규 도메인 로직 없음 — 순수 스타일·자산 교체)
- 아이콘 산출물은 생성 후 이미지로 직접 열어 육안 확인
- 폰 전 탭 육안 확인: 가독성, 골드 버튼, 경고 배너가 액센트와 구분되는지
- build는 폰 확인 뒤 dev 서버 종료 후 실행(교훈 8)
