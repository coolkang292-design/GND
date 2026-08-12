# GND 공식 프로그램 남은 구현 — Claude Code 인수인계

> 작성: 2026-08-12
> 구현 담당: Claude Code
> 최종 검수 담당: Codex
> Claude 작업공간: `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-interval-copy`
> Claude 브랜치: `codex/gnd-interval-copy`
> 시작 커밋: `630009fc92b65e40c739fa4190365177d7e0e12b`

## 1. 결론

대표 이미지 5종 생성·압축·앱 교체는 완료됐다. Claude는 이미 준비된 격리 작업공간에서 아래 남은 구현을 이어서 완료하고, 배포하지 않은 채 최종 커밋 SHA와 검증 결과를 Codex에 넘긴다. Codex는 그 결과를 독립적으로 검토하고 개발 서버의 실제 사용자 흐름과 전체 회귀를 최종 확인한다.

Claude 작업공간에는 이미 다음 TDD 변경이 시작돼 있다. 이것은 사용자 작업이므로 보존하고 이어서 사용한다.

- `src/components/record/calendar-view.test.tsx`
- `src/components/feed/feed-item.test.tsx`

`git reset --hard`, `git checkout --`, `git clean`, 기존 변경 덮어쓰기를 금지한다.

## 2. 완료된 범위

### 공식 프로그램과 일정 등록

- 공식 프로그램 5종 정적 카탈로그와 A/B/C 처방
- 주 3회·6주·18회 일정 계산과 최소 2일 회복 간격
- 충돌 제안과 프로그램 등록·재배치 RPC
- `program_enrollments`와 `workout_plans` 프로그램 메타데이터
- 프로그램 I/O, 18회 RPC payload, fail-closed 복원
- 운동 추가 허브의 프로그램/직접 검색 병행
- 프로그램 카탈로그, 상세, 시작일·요일·시간, 18회 미리보기
- `/record/programs` 페이지와 기록 화면 진입 연결
- 0066 마이그레이션은 사용자가 SQL Editor에서 적용했다. 다시 적용하지 않는다.
- 기록상 DB 회귀 검사는 프로그램 등록 27/27, 운동 계획 22/22 통과했다. 운영 DB 검사를 임의로 재실행하지 않는다.

### 대표 이미지

다음 5개는 최종 확정·적용됐다.

- `public/program-assets/shoulder.webp`: 후면 덤벨 숄더프레스 + 체열 수증기
- `public/program-assets/chest.webp`: 덤벨 가슴 운동 + 체열 수증기
- `public/program-assets/arms.webp`: 얼굴이 가려진 케이블 팔 운동 + 수증기
- `public/program-assets/lower.webp`: 얼굴이 가려진 사이드 런지 + 수증기
- `public/program-assets/lean.webp`: 모자를 쓴 검정·금빛 전신 인터벌 실루엣

이미지는 72~156KB이며 `src/lib/domain/program-assets.test.ts` 5/5를 통과했다. 이 5개 이미지와 이미지 경로는 수정하지 않는다.

### 관련 주요 커밋

- `ed4878b` 공식 프로그램 등록·재배치 스키마
- `3146409`, `bab29eb` 일정 계산·회복 간격
- `821f692`, `6e0bc3f` 프로그램 I/O와 스냅샷 일관성
- `b7243d7` 운동 추가를 프로그램과 검색으로 분리
- `a72944b` 검색 화면에 상황·부위 추천 배치
- `9cee3ae` 프로그램 5종 카탈로그 UI
- `43391db` 3단계 일정 설정
- `b96c839` 프로그램 페이지·기록 화면 연결
- `630009f` 최종 운동 장면 이미지 5종

## 3. 남은 구현 순서

아래 순서를 지킨다. 각 단계는 TDD RED → 최소 구현 → 관련 GREEN → 논리적 커밋 순서로 진행한다.

### A. 사용자 노출 명칭을 전신 인터벌로 마무리

계획 원문:

- `docs/superpowers/plans/2026-08-12-exercise-entry-hub-and-program-ui.md` Task 8

현재 시작된 두 테스트를 먼저 실행해 RED를 확인하고 이어서 구현한다.

사용자가 현재 화면에서 보는 문구만 바꾼다.

- 달력: `🔥 전신 인터벌 N분 예정`, `🔥 전신 인터벌 준비하기`, 완료 기록 문구
- 피드: `🔥 전신 인터벌 N분`
- XP 안내: `전신 인터벌 완료`, 설명, 내역 배지
- 챌린지: `인터벌 운동 횟수`, 설정 화면의 `전신 인터벌`
- 기록 화면의 확인창·토스트: `전신 인터벌`

내부 호환용 이름은 바꾸지 않는다.

- `tabata_count`, `tabata_minutes`, `tabataMinutes`
- `Tabata*` 타입·컴포넌트·함수·파일명
- DB 컬럼과 마이그레이션
- 내부 장애 주석과 과거 `release-notes.data.json`

전역 치환을 금지한다. `INTERVAL_COPY`를 재사용할 수 있는 현재 런타임 문구만 중앙화한다.

최소 관련 검사:

```powershell
pnpm test -- src/components/record/calendar-view.test.tsx src/components/feed/feed-item.test.tsx src/components/profile/growth-hub.test.tsx src/components/challenge/setup-sheet.test.tsx src/lib/challenge.test.ts
```

`src/app/(tabs)/record/page.tsx`를 수정하면 관련 record 테스트도 찾아 실행한다.

권장 커밋:

```text
refactor: 사용자 화면의 인터벌 명칭 통일
```

### B. 달력의 프로그램 진행 표시와 결석 재배치

계획 원문:

- `docs/superpowers/plans/2026-08-12-official-program-scheduling.md` Task 7

구현 목표:

- 프로그램 계획 상세에 프로그램 제목과 `N주차 · A/B/C` 표시
- 프로그램 계획을 일반 계획과 구분
- 지난 미완료 회차에 `놓친 운동` 표시
- 사용자가 재배치를 요청했을 때만 제안 생성
- 제안을 먼저 보여주고 확인 뒤 `rescheduleProgramEnrollment()` 호출
- 제안만 생성했을 때 DB를 바꾸지 않음
- 일반 계획·다른 프로그램 계획을 자동 삭제하거나 덮어쓰지 않음
- 이미 완료·삭제된 계획을 이동 대상으로 만들지 않음

현재 0066 스키마는 완료된 계획 삭제와 수동 삭제를 DB에서 완전히 구분하지 못한다. 남아 있는 enrollment 계획만 이동하고 `plan_not_found`는 안전하게 안내한다. 이 한계를 숨기지 말고 UI와 테스트에서 fail-closed로 처리한다.

권장 커밋:

```text
feat: 달력에 프로그램 진행과 재배치 연결
```

### C. 프로그램 운동의 자동 무게·반복·휴식·노력 피드백

계획 원문 전체:

- `docs/superpowers/plans/2026-08-12-program-guided-workout.md`

이 단계는 DB 마이그레이션이 포함된 고위험 작업이다.

구현 목표:

1. 최근 성공 기록을 이용한 무게 추천 순수 함수
2. 최근 기록이 없으면 임의 무게를 넣지 않고 다음 안내 표시

```text
8~10회를 안정된 자세로 수행할 수 있는 무게를 선택하세요.
10회를 마치고도 2회 정도 더 할 수 있는 무게가 적당합니다.
```

3. 프로그램 계획을 열 때 처방의 반복 범위·휴식시간 복원
4. 종목별 휴식시간을 기존 휴식 타이머에 연결
5. 첫 세트와 마지막 세트에만 노력 피드백
   - 너무 가벼움
   - 적당함
   - 너무 무거움
6. 다음 회차 권장 무게 계산
7. 완료 세션에 프로그램 enrollment·주차·회차 연결을 남겨 계획 행 삭제 뒤에도 진행률 보존

0067 처리 규칙:

- 이미 적용된 0066을 수정하지 않는다.
- 새 파일 `supabase/migrations/0067_program_guided_workout.sql`을 작성한다.
- SQL과 실 DB 회귀 스크립트를 먼저 정적으로 검토한다.
- 실제 SQL 적용은 사용자가 Supabase SQL Editor에서 직접 한다.
- 사용자 적용 확인 전에는 운영 DB 검사나 데이터 쓰기를 실행하지 않는다.
- SQL 적용 게이트가 오면 작업을 멈추고 정확한 파일 경로·기대 결과·실행 뒤 검사 명령을 사용자에게 전달한다.
- 사용자 승인 없이 계정 생성·삭제, 운영 데이터 변경, 외부 알림을 하지 않는다.

권장 논리적 커밋:

```text
feat: 프로그램 권장 무게 계산
feat: 완료 운동에 프로그램 진행 정보 보존
feat: 프로그램 처방과 종목별 휴식 연결
feat: 세트 노력 피드백 연결
```

### D. GND 핵심 운동 안내와 네이버 원문 링크

계획 원문 전체:

- `docs/superpowers/plans/2026-08-12-exercise-guides-and-source-links.md`

구현 목표:

- 프로그램 운동 카드에서 `자세 안내` 진입
- GND 핵심 안내를 항상 먼저 표시
  - 시작 자세
  - 동작 순서
  - 호흡
  - 자주 하는 실수
  - 안전 주의
- 준비 화면과 운동 진행 화면 양쪽에서 같은 안내 사용
- 네이버 원문은 선택 링크일 뿐이며, 링크가 없어도 GND 안내는 정상 작동
- 외부 글·사진·영상 내용을 복사하거나 iframe으로 삽입하지 않음
- 사람이 직접 확인한 URL만 등록

사용자가 제공한 최초 검토 링크:

```text
https://terms.naver.com/entry.naver?docId=2099791&cid=51030&categoryId=51030
```

이 링크가 어떤 운동을 설명하는지 실제 원문을 확인한 뒤 해당 운동에만 연결한다. 문서 ID나 다른 운동 URL을 추측해 만들지 않는다. 확인되지 않은 운동은 GND 안내만 표시한다.

권장 논리적 커밋:

```text
feat: 공식 프로그램 운동 안내 데이터
feat: 운동 자세 안내 시트 연결
```

## 4. Claude가 하지 않을 일

- 대표 이미지 5장 재생성·교체
- 성별별 프로그램·이미지 분기
- 관리자 CMS
- 0066 재적용 또는 수정
- 사용자의 SQL 승인 전 0067 적용·운영 DB 쓰기
- 운영 배포, Vercel 명령, Git push
- 실제 사용자 알림·이메일 발송
- `main` 병합
- Codex 기준 작업공간 수정

## 5. 작업공간과 Git 규칙

Claude는 다음 경로에서만 작업한다.

```text
C:\Users\SAMSUNG\workout-app\.worktrees\gnd-interval-copy
```

시작 명령:

```powershell
cd C:\Users\SAMSUNG\workout-app\.worktrees\gnd-interval-copy
git rev-parse --show-toplevel
git branch --show-current
git status --short
git log -1 --oneline
```

기대 결과:

- 브랜치: `codex/gnd-interval-copy`
- 기반: `630009f`
- 기존 수정 2개가 보일 수 있음:
  - `src/components/record/calendar-view.test.tsx`
  - `src/components/feed/feed-item.test.tsx`

규칙:

- 기존 수정 보존
- `git add .` 금지
- 논리적으로 검증된 파일만 정확히 지정해 스테이징
- 각 커밋 전 `git diff --check`
- 다른 worktree나 `main`에 cherry-pick·merge하지 않음
- 최종 SHA만 Codex에 전달

## 6. 검증 책임 분리

### Claude가 구현 중 수행

- 각 Task의 RED와 GREEN
- 변경 파일 ESLint
- `pnpm typecheck`
- 관련 테스트
- 모든 동작 코드 완료 뒤 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` 각각 한 번
- 실패가 있으면 숨기지 않고 실패 수·원인·미해결 범위 보고

개발 서버를 띄울 수는 있지만 최종 검수를 대신하지 않는다. Claude가 화면을 확인했다면 어떤 주소에서 무엇을 클릭했는지 증거를 남긴다.

### Codex가 인수 후 독립적으로 수행

1. Claude 커밋 범위와 기존 기능 회귀 코드 리뷰
2. 개발 서버 실행
3. 실제 화면 직접 조작
   - `/record` → 운동 추가
   - 프로그램과 직접 검색 병행 노출
   - 프로그램 5종과 최종 이미지 확인
   - 상세 → 시작일 → 주 3회 요일·시간 → 18회 미리보기
   - 달력 등록과 프로그램 주차·회차 표시
   - 예정 운동 열기 → 권장 무게·반복 범위·휴식 확인
   - 첫·마지막 세트 노력 피드백
   - 놓친 회차 재배치 제안 → 확인 뒤 반영
   - 자세 안내와 검수된 네이버 원문 링크
   - 빠른 시작의 전신 인터벌 이미지·문구
4. 모바일 폭과 데스크톱 폭 확인
5. 전체 lint·typecheck·test·build 재실행
6. `PROGRESS.md`와 최종 인수인계서 갱신
7. 사용자에게 검수 결과와 운영 배포 승인 요청

Codex 최종 검수 전에는 완료 또는 배포 가능이라고 단정하지 않는다.

## 7. Claude 완료 보고 형식

다음을 한 번에 보고한다.

```text
1. 최종 커밋 SHA 목록과 각 커밋 목적
2. 변경 파일 목록
3. 각 Task의 RED 실패 증거와 GREEN 수치
4. lint·typecheck·전체 test·build 결과
5. 0067 작성 여부·사용자 적용 여부·실 DB 검사 여부
6. 개발 서버에서 직접 확인한 화면과 클릭 흐름(실행했다면)
7. 남은 사용자 노출 “타바타” 검색 결과의 분류
8. 미구현·미검증·알려진 한계
9. Codex가 최종 검수할 때 우선 볼 위험 지점
```

## 8. 현재 미검증과 배포 상태

- 최종 이미지가 포함된 통합 프로그램 흐름의 개발 서버 직접 조작: 미실행
- 프로그램 결석 재배치 UI: 미구현
- 자동 무게·노력 피드백·0067: 미구현
- GND 자세 안내·네이버 원문 링크: 미구현
- 최신 전체 lint·typecheck·test·build: 미실행
- 로컬 `main` 반영: 안 됨
- 운영 배포: 안 됨

이 상태는 정상적인 인수 시점이다. Claude 구현 → Codex 최종 검수 → 사용자 배포 승인 순서를 지킨다.
