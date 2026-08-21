# Feed Photo And Exercise Reload Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 정상 저장된 인증사진을 피드에 표시하고, 각 운동 카드에서 같은 종목의 직전 세트 전체를 명시적으로 불러온다.

**Architecture:** Supabase 관계 응답의 객체·배열 차이는 소셜 순수 함수에서 하나의 사진 경로로 정규화한다. 개별 운동 불러오기는 기존 `getLastRecordedSets`를 재사용하고, 세트 완료 상태 초기화는 운동 불러오기 도메인 함수로 고정한다. 운동 카드에는 화면 명령만 두고 실제 조회·임시저장 변경·알림은 기록 페이지가 담당한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, Vitest, Tailwind CSS

---

### Task 1: Normalize Feed Image Relations

**Files:**
- Modify: `src/lib/domain/social.ts`
- Modify: `src/lib/domain/social.test.ts`
- Modify: `src/lib/social.ts`

- [x] **Step 1: Write failing relation-shape tests**

`src/lib/domain/social.test.ts`에 다음 테스트와 import를 추가한다.

```ts
import {
  activeSessionIds,
  feedDateLabel,
  firstWorkoutImagePath,
  groupByDay,
  unreadCount,
  type SocialEvent,
} from "./social";

describe("firstWorkoutImagePath", () => {
  it("일대일 관계 객체에서 사진 경로를 읽는다", () => {
    expect(firstWorkoutImagePath({ image_path: "user/session/photo.jpg" })).toBe(
      "user/session/photo.jpg",
    );
  });

  it("배열 관계에서도 첫 사진 경로를 읽는다", () => {
    expect(
      firstWorkoutImagePath([{ image_path: "user/session/photo.jpg" }]),
    ).toBe("user/session/photo.jpg");
  });

  it("관계가 없으면 null을 반환한다", () => {
    expect(firstWorkoutImagePath(null)).toBeNull();
    expect(firstWorkoutImagePath([])).toBeNull();
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm test -- src/lib/domain/social.test.ts
```

Expected: FAIL because `firstWorkoutImagePath` is not exported.

- [x] **Step 3: Implement the relation normalizer**

`src/lib/domain/social.ts`에 다음 타입과 함수를 추가한다.

```ts
export type WorkoutImageRelation =
  | { image_path: string }
  | { image_path: string }[]
  | null;

export function firstWorkoutImagePath(
  relation: WorkoutImageRelation,
): string | null {
  const image = Array.isArray(relation) ? relation[0] : relation;
  return image?.image_path ?? null;
}
```

- [x] **Step 4: Use the normalizer in the feed query result**

`src/lib/social.ts`에서 도메인 함수를 import하고 관계 타입과 서명 대상 변환을 변경한다.

```ts
import {
  activeSessionIds,
  firstWorkoutImagePath,
  type SocialEvent,
  type WorkoutImageRelation,
} from "@/lib/domain/social";

type FeedSessionRow = {
  // existing fields
  workout_images: WorkoutImageRelation;
};

const withImage = rows
  .map((row) => ({
    id: row.id,
    path: firstWorkoutImagePath(row.workout_images),
  }))
  .filter((row): row is { id: string; path: string } => row.path !== null);
```

- [x] **Step 5: Run feed-focused tests and commit**

Run:

```powershell
pnpm test -- src/lib/domain/social.test.ts src/components/feed/feed-item.test.tsx
```

Expected: PASS.

Commit:

```powershell
git add -- src/lib/domain/social.ts src/lib/domain/social.test.ts src/lib/social.ts
git commit -m "fix: restore workout photos in feed"
```

### Task 2: Reset Imported Set Completion State

**Files:**
- Modify: `src/lib/domain/workout-import.ts`
- Modify: `src/lib/domain/workout-import.test.ts`

- [x] **Step 1: Write a failing set-replacement test**

`src/lib/domain/workout-import.test.ts`에 다음 테스트와 import를 추가한다.

```ts
import {
  buildEffortMessage,
  mergeImportedExercises,
  replaceWithLastRecordedSets,
} from "./workout-import";

describe("replaceWithLastRecordedSets", () => {
  it("직전 세트 전체를 복사하고 완료 상태를 해제한다", () => {
    const current = exercise({
      name: "랫풀다운",
      exerciseType: "weight",
      sets: [
        { key: "current", weightKg: 10, reps: 5, distanceKm: 0, durationMin: 0, done: true },
      ],
    });
    const recordedSets = [
      { key: "last-1", weightKg: 43, reps: 12, distanceKm: 0, durationMin: 0, done: true },
      { key: "last-2", weightKg: 43, reps: 11, distanceKm: 0, durationMin: 0, done: true },
    ];

    const result = replaceWithLastRecordedSets(current, recordedSets);

    expect(result.sets).toHaveLength(2);
    expect(result.sets.map((set) => [set.weightKg, set.reps, set.done])).toEqual([
      [43, 12, false],
      [43, 11, false],
    ]);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm test -- src/lib/domain/workout-import.test.ts
```

Expected: FAIL because `replaceWithLastRecordedSets` is not exported.

- [x] **Step 3: Implement the replacement rule**

`src/lib/domain/workout-import.ts`에 다음 함수를 추가한다.

```ts
export function replaceWithLastRecordedSets(
  exercise: LocalExercise,
  recordedSets: LocalSet[],
): LocalExercise {
  return {
    ...exercise,
    sets: recordedSets.map((set) => ({ ...set, done: false })),
  };
}
```

- [x] **Step 4: Run the focused test and commit**

Run:

```powershell
pnpm test -- src/lib/domain/workout-import.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- src/lib/domain/workout-import.ts src/lib/domain/workout-import.test.ts
git commit -m "feat: define individual exercise reload rules"
```

### Task 3: Add The Per-Exercise Reload Button

**Files:**
- Create: `src/components/record/exercise-card.test.tsx`
- Modify: `src/components/record/exercise-card.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`

- [x] **Step 1: Write failing button-state tests**

`src/components/record/exercise-card.test.tsx`를 다음 내용으로 만든다.

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExerciseCard } from "./exercise-card";

const exercise = {
  key: "lat-pulldown",
  name: "랫풀다운",
  bodyPart: "등" as const,
  exerciseType: "weight" as const,
  measure: null,
  isCustom: false,
  sets: [
    { key: "set-1", weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0, done: false },
  ],
};

function renderCard(active: boolean, loadingLast = false): string {
  return renderToStaticMarkup(
    <ExerciseCard
      exercise={exercise}
      index={0}
      active={active}
      loadingLast={loadingLast}
      onLoadLast={vi.fn()}
      onUpdateSet={vi.fn()}
      onToggleDone={vi.fn()}
      onAddSet={vi.fn()}
      onRemoveSet={vi.fn()}
      onRemoveExercise={vi.fn()}
    />,
  );
}

describe("ExerciseCard 직전 기록 불러오기", () => {
  it("운동 시작 전 불러오기 버튼을 표시한다", () => {
    const html = renderCard(false);
    expect(html).toContain("↻ 불러오기");
    expect(html).toContain('aria-label="랫풀다운 직전 기록 불러오기"');
    expect(html).not.toContain('disabled=""');
  });

  it("운동 중에는 불러오기 버튼을 비활성화한다", () => {
    expect(renderCard(true)).toContain('disabled=""');
  });

  it("조회 중에는 버튼 문구와 상태를 바꾼다", () => {
    const html = renderCard(false, true);
    expect(html).toContain("불러오는 중…");
    expect(html).toContain('disabled=""');
  });
});
```

- [x] **Step 2: Run the component test and verify RED**

Run:

```powershell
pnpm test -- src/components/record/exercise-card.test.tsx
```

Expected: FAIL because `loadingLast` and `onLoadLast` are not component props.

- [x] **Step 3: Add the button to the shared exercise summary row**

`src/components/record/exercise-card.tsx`에 props를 추가한다.

```ts
loadingLast: boolean;
onLoadLast: () => void;
```

운동 유형별 입력 표 위의 공통 요약 줄에 다음 버튼을 넣고, 기존 중복 설명 문구는 이 줄로 합친다.

```tsx
<button
  type="button"
  aria-label={`${exercise.name} 직전 기록 불러오기`}
  onClick={onLoadLast}
  disabled={active || loadingLast}
  className="flex-none text-xs font-extrabold text-accent disabled:text-faint"
>
  {loadingLast ? "불러오는 중…" : "↻ 불러오기"}
</button>
```

- [x] **Step 4: Replace automatic preload with an explicit page handler**

`src/app/(tabs)/record/page.tsx`에서 `addExercises`의 `getLastRecordedSets` 반복 호출을 제거한다. 화면 상태와 다음 처리 함수를 추가한다.

기존 운동 불러오기 import에 새 교체 함수를 연결한다.

```ts
import {
  buildEffortMessage,
  mergeImportedExercises,
  replaceWithLastRecordedSets,
} from "@/lib/domain/workout-import";
```

```ts
const [loadingExerciseKey, setLoadingExerciseKey] = useState<string | null>(null);

async function loadLastExercise(exercise: LocalExercise) {
  if (active || loadingExerciseKey) return;
  setLoadingExerciseKey(exercise.key);
  try {
    const sets = await getLastRecordedSets(userId, exercise.name);
    if (!sets) {
      showToast("아직 불러올 직전 기록이 없어요");
      return;
    }
    const loaded = replaceWithLastRecordedSets(exercise, sets);
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((item) =>
        item.key === exercise.key ? loaded : item,
      ),
      effortMessage: buildEffortMessage([loaded]),
    }));
    showToast(`${exercise.name} 직전 기록을 불러왔어요`);
  } catch (error) {
    showToast(errorMessage(error));
  } finally {
    setLoadingExerciseKey(null);
  }
}
```

`ExerciseCard` 호출에 다음 props를 연결한다.

```tsx
loadingLast={loadingExerciseKey === ex.key}
onLoadLast={() => void loadLastExercise(ex)}
```

- [x] **Step 5: Run record-focused tests and commit**

Run:

```powershell
pnpm test -- src/components/record/exercise-card.test.tsx src/lib/domain/workout-import.test.ts src/lib/workout-draft.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- 'src/app/(tabs)/record/page.tsx' src/components/record/exercise-card.tsx src/components/record/exercise-card.test.tsx
git commit -m "feat: add per-exercise previous record reload"
```

### Task 4: Verify The Complete User Flow

**Files:**
- Modify: `docs/superpowers/plans/archive/2026-07-19-feed-photo-exercise-reload.md`

- [x] **Step 1: Run all automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all tests and build pass; lint has zero errors. Record any pre-existing warning separately.

- [x] **Step 2: Verify the local feed with real data**

Open `http://localhost:3000/feed` and confirm the latest `camera_verified` session renders a large image with the date at the top and profile/completion time at the bottom.

- [x] **Step 3: Verify individual exercise reload on mobile width**

Open `http://localhost:3000/record`, add an exercise, confirm it starts with the normal new-exercise defaults rather than an automatic history lookup, press `↻ 불러오기`, and verify the latest weight, rep values, and set count replace the card with all completion checks off. Remove the temporary draft exercise after verification.

- [x] **Step 4: Mark this plan complete and commit verification state**

Change completed checklist entries in this file from `[ ]` to `[x]`, then run:

```powershell
git add -- docs/superpowers/plans/archive/2026-07-19-feed-photo-exercise-reload.md
git commit -m "docs: record feed photo and exercise reload verification"
```

Do not deploy. Production deployment requires a separate explicit user approval.
