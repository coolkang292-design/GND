# 인수인계 — GND 실행 동기부여 스플래시 (2026-08-28 갱신)

## 0. 한 줄

새 GND 실행 세션마다 최종 사용자 승인 블랙·골드 배틀로프 v5 이미지를 압축 없이
한 번 보여준다. 새 문구 적용, 개발·운영 확인, `main` 반영과 운영 배포까지 완료했다.

## 1. 현재 위치와 상태

- 작업 브랜치: `codex/gnd-launch-copy-v5`
- worktree: `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-launch-copy-v5`
- 로컬 `main`: 구현 `700cf4a`, 병합 `42f1ed5`
- 운영 배포: `gnd-d8umbq37a-gnd4.vercel.app` → `gnd-one.vercel.app`, `READY`
- GitHub: 사용자 지시로 푸시하지 않음
- DB/마이그레이션: 변경 없음

최근 구현 커밋:

```text
700cf4a feat: GND 시작 이미지 카피 교체
0289890 fix: 지정한 GND 시작 이미지 원본 적용
498ee64 fix: GND 시작 카피 폰트 확정
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

이미지 안의 실제 문구:

```text
의지가 꺾인 날에도
계속한 사람이, 결국 이긴다
```

사용자가 승인한 v5 이미지 전체를 그대로 사용한다. 별도 HTML 카피는 겹치지 않으며,
Next Image 자동 압축을 끄고 `941×1672` 원본 PNG를 직접 로드한다. 이미지 실패 때만
같은 두 줄의 HTML 대체 화면이 나타난다.

## 3. 주요 파일

| 파일 | 책임 |
|---|---|
| `public/splash/gnd-launch-motivation-v5.png` | GND와 새 최종 카피가 포함된 사용자 승인 원본 |
| `src/lib/domain/launch-splash.ts` | 세션 1회 노출 게이트와 저장소 오류 폴백 |
| `src/lib/domain/launch-splash.test.ts` | 게이트 단위 테스트 5건 |
| `src/components/launch-motivation-splash.tsx` | 원본 이미지·타이머·터치·오류·접근성 설명 |
| `src/components/launch-motivation-splash.test.tsx` | 컴포넌트 테스트 7건 |
| `src/app/(tabs)/layout.tsx` | 일반 앱 셸 연결 |
| `src/app/(tabs)/layout.test.tsx` | 정확히 한 번 마운트하는 연결 테스트 1건 |
| `docs/superpowers/specs/2026-08-17-gnd-launch-motivation-splash-design.md` | 최종 설계 |
| `docs/superpowers/plans/archive/2026-08-17-gnd-launch-motivation-splash.md` | 구현 계획 |

승인 배경 원본:
`C:\Users\SAMSUNG\.codex\generated_images\01a00e30-700a-7db3-8985-3271be4850fd\exec-357efd9f-ef06-4ee9-940f-71396f45dc60.png`

v5 앱 자산: `941×1672`, 2,608,775바이트

원본/앱 자산 SHA256:
`7957571D481BF3EB6933DFC15A23C75060E6FBFC9E36F346BAB5F4CBBF84B981`

## 4. 직접 확인한 증거

개발 서버 `http://localhost:3011`에서 브라우저를 실제 조작했다.

- 시작 화면 1개, 승인 v5 이미지 `941×1672` 직접 로드, 자동 압축 주소 미사용
- 별도 HTML 카피 0개, 이미지 내 새 최종 카피만 표시
- 자동 종료 뒤 0개
- 새 세션 터치 전 1개 → 터치 후 0개
- 같은 세션 새로고침 0개, `/record` 이동 뒤 0개
- 브라우저 오류 0건

최종 로컬 검사:

- lint: exit 0, 오류 0, 기존 경고 2개(`scripts/make-study-pack.mjs`)
- typecheck: exit 0
- test: **176 파일 / 2,579건 통과**
- build: 성공, 정적 페이지 18개

## 5. 운영 배포와 남은 실기기 확인

운영 배포와 브라우저 실물 확인은 완료했다.

- 배포: `gnd-d8umbq37a-gnd4.vercel.app`, 별칭 `gnd-one.vercel.app`, `READY`
- 운영 `/home` 200, v5 원본 크기·SHA256 일치
- 운영 청크에서 v5 경로와 새 문구를 확인했다.
- 새 익명 운영 브라우저에서 스플래시가 312ms에 추가되고 367ms에
  `941×1672` v5와 정확한 접근성 문구로 로드됐다. 895ms에 제거된 직접 원인은
  타이머나 클릭이 아니라 신규 사용자 정상 흐름의 `/onboarding` 이동이었다.
- 기존 온보딩 완료 계정의 운영 자동 종료는 이번 세션에서 다시 확인하지 못했다.
  표시·터치·자동 종료 로직은 변경하지 않았고 개발 실화면과 전체 회귀 검사는 통과했다.

사용자 휴대폰에서는 아래 최종 체감만 확인한다.

| 조작 | 정상 결과 |
|---|---|
| 첫 아이콘 실행 | 스플래시 1회 → 홈 |
| 앱 완전 종료 후 재실행 | 스플래시 다시 1회 |
| 다른 앱으로 이동 후 복귀 | 스플래시 미표시 |
| 스플래시 터치 | 즉시 홈 |
| 세로 노치 화면 | GND·두 줄 카피가 가려지지 않음 |

운영 브라우저 검증은 끝났으므로 휴대폰 확인은 배포 후 체감 화질 확인 항목이다.
