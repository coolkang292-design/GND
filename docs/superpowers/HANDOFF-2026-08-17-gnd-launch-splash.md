# 인수인계 — GND 실행 동기부여 스플래시 (2026-08-17)

## 0. 한 줄

새 GND 실행 세션마다 승인된 블랙·골드 배틀로프 화면을 한 번 보여주고, 생성 이미지가
틀리던 한글은 실제 HTML 텍스트로 정확하게 표시한다. 개발 서버와 전체 검증은 끝났고
실제 휴대폰 PWA 재실행 확인·`main` 반영·운영 배포는 남아 있다.

## 1. 현재 위치와 상태

- 브랜치: `codex/gnd-launch-splash`
- worktree: `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-launch-splash`
- 로컬 `main`: 미반영
- 운영 배포: 안 함
- DB/마이그레이션: 변경 없음

최근 구현 커밋:

```text
bdfc36b test: 시작 이미지 대역 경고 제거
9f0a405 fix: GND 시작 카피를 실제 텍스트로 표시
eba3d07 docs: GND 시작 문구 실제 텍스트 방식 반영
9d4d5e4 fix: 시작 이미지 로딩 크기 제한
9372b3f feat: 최종 GND 시작 이미지와 카피 적용
```

## 2. 최종 사용자 경험

- 마운트 위치: `src/app/(tabs)/layout.tsx`
- 포함: `/home`, `/feed`, `/record`, `/challenge`, `/profile`과 그 하위 화면
- 제외: 로그인·인증·온보딩·초대·계정·크루·공지·관리자 직접 진입
- 새 `sessionStorage` 세션에서 1회 표시
- 이미지 로드 후 1.5초 표시 + 180ms 페이드
- 화면 어디든 터치하면 즉시 종료
- 같은 세션 새로고침·탭 이동은 재표시하지 않음
- 저장소 오류는 메모리 플래그, 이미지 지연은 최대 3초, 이미지 오류는 텍스트 대체 화면
- reduced-motion 사용자는 페이드 없이 종료

실제 문구:

```text
지금은 같은 출발선.
1년 뒤, 프로와 아마추어가 갈린다.
```

이미지에 한글을 굽지 않는다. `같은`이 `갈은`으로 반복 생성된 것이 직접 원인이다.
첫 줄 흰색·둘째 줄 골드·굵은 전진 기울기·왼쪽 속도선을 HTML/CSS로 렌더한다.

## 3. 주요 파일

| 파일 | 책임 |
|---|---|
| `public/splash/gnd-launch-motivation-v3.png` | 상단 GND만 포함한 승인 배경 |
| `src/lib/domain/launch-splash.ts` | 세션 1회 노출 게이트와 저장소 오류 폴백 |
| `src/lib/domain/launch-splash.test.ts` | 게이트 단위 테스트 5건 |
| `src/components/launch-motivation-splash.tsx` | 이미지·실제 카피·타이머·터치·오류·접근성 |
| `src/components/launch-motivation-splash.test.tsx` | 컴포넌트 테스트 7건 |
| `src/app/(tabs)/layout.tsx` | 일반 앱 셸 연결 |
| `src/app/(tabs)/layout.test.tsx` | 정확히 한 번 마운트하는 연결 테스트 1건 |
| `docs/superpowers/specs/2026-08-17-gnd-launch-motivation-splash-design.md` | 최종 설계 |
| `docs/superpowers/plans/2026-08-17-gnd-launch-motivation-splash.md` | 구현 계획 |

승인 배경 원본:
`C:\Users\SAMSUNG\.codex\generated_images\01a00e30-700a-7db3-8985-3271be4850fd\exec-ad00adda-4124-415a-a088-e7eb81ce2b24.png`

원본/앱 자산 SHA256:
`0092B12118DD9ED60B7AC985E0829BAAA86346CCA737BA75BC8D2D92B08357B5`

## 4. 직접 확인한 증거

개발 서버 `http://localhost:3011`에서 브라우저를 실제 조작했다.

- 시작 화면 1개, 이미지 `430×763`, Next Image 실제 요청 폭 `640px`
- `지금은 같은 출발선.` 1개, `갈은 출발선` 0개, 둘째 줄 1개
- 자동 종료 뒤 0개
- 새 세션 터치 전 1개 → 터치 후 0개
- 같은 세션 새로고침 0개, `/record` 이동 뒤 0개
- 브라우저 오류 0건

최종 로컬 검사:

- lint: exit 0, 경고 0
- typecheck: exit 0
- test: **153 파일 / 2,261건 통과**
- build: 성공, 정적 페이지 18개

## 5. 남은 관문

**[미검증] 실제 휴대폰 설치형 PWA 완전 종료 → 아이콘 재실행.** 다음 표를 확인한다.

| 조작 | 정상 결과 |
|---|---|
| 첫 아이콘 실행 | 스플래시 1회 → 홈 |
| 앱 완전 종료 후 재실행 | 스플래시 다시 1회 |
| 다른 앱으로 이동 후 복귀 | 스플래시 미표시 |
| 스플래시 터치 | 즉시 홈 |
| 세로 노치 화면 | GND·두 줄 카피가 가려지지 않음 |

위 확인 전에는 배포하지 않는다. 확인 후에도 순서는 다음과 같다.

1. 현재 브랜치를 검증한 그대로 로컬 `main`에 반영
2. 사용자에게 운영 배포 승인 요청
3. 프로젝트 지정 Vercel CLI 방식으로 배포
4. `gnd-one.vercel.app`에서 이미지·정확한 카피·자동/터치 종료·재노출을 실물 확인
