# Past Workout Import And Feed Card Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 운동 추가 화면에서 지난 기록을 중복 없이 불러오고 노력 제안을 유지하며, 사진 피드를 큰 이미지 카드로 표시한다.

**Architecture:** 불러오기 병합과 노력 문구 계산은 순수 도메인 함수로 분리해 테스트한다. 운동 임시저장은 version 3으로 올려 노력 문구를 새로고침 뒤에도 보존하고, 기존 version 1/2 데이터는 자동 변환한다. 피드는 조회 API를 유지하되 화면 필터만 제거하고 사진 유무에 따라 카드 레이아웃을 나눈다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, Vitest, Tailwind CSS

---

### Task 1: Import Domain Rules

**Files:**
- Create: `src/lib/domain/workout-import.ts`
- Create: `src/lib/domain/workout-import.test.ts`

- [x] 중복 이름을 제외하고 새 운동만 뒤에 붙이는 실패 테스트를 작성한다.
- [x] 중량, 맨몸 횟수, 시간, 유산소 거리별 노력 문구 실패 테스트를 작성한다.
- [x] `pnpm test -- src/lib/domain/workout-import.test.ts`로 RED를 확인한다.
- [x] 최소 구현을 작성하고 같은 테스트로 GREEN을 확인한다.

### Task 2: Persistent Draft Message

**Files:**
- Modify: `src/lib/workout.ts`
- Modify: `src/lib/workout-draft.test.ts`

- [x] version 1/2 임시저장이 version 3과 `effortMessage: null`로 변환되는 실패 테스트를 작성한다.
- [x] `WorkoutDraft`를 version 3으로 변경하고 이전 버전 변환을 구현한다.
- [x] 임시저장 테스트를 다시 실행한다.

### Task 3: Past Record Tab

**Files:**
- Modify: `src/components/record/exercise-picker.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`

- [x] 피커에 `운동 찾기 / 지난 기록` 탭과 완료 기록 목록을 추가한다.
- [x] 기록 선택 시 세트 값은 유지하고 완료 상태는 초기화해 중복 없는 종목만 추가한다.
- [x] 노력 문구 배너와 닫기 버튼을 추가하고 임시저장 상태에 연결한다.

### Task 4: Feed Layout

**Files:**
- Modify: `src/app/(tabs)/feed/page.tsx`
- Modify: `src/components/feed/feed-item.tsx`
- Create: `src/components/feed/feed-item.test.tsx`

- [x] 사진 기록의 상단 스탬프, 하단 사용자 정보 오버레이 실패 테스트를 작성한다.
- [x] `전체 / 사진만` 필터 상태와 버튼을 제거한다.
- [x] 사진 기록은 큰 이미지 카드, 일반 기록은 기존의 간결한 카드로 표시한다.
- [x] 반응 버튼, 날짜 그룹, 더 보기는 유지한다.

### Task 5: Verification

**Files:**
- Modify: `PROGRESS.md` only if the project convention requires a handoff note.

- [x] `pnpm test`를 실행한다.
- [x] `pnpm typecheck`를 실행한다.
- [x] `pnpm lint`를 실행한다.
- [x] `pnpm build`를 실행한다.
- [x] 로컬 모바일 화면에서 운동 불러오기와 피드 레이아웃을 확인한다.
