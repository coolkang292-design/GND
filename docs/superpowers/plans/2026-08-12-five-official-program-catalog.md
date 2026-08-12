# Five Official Programs Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어깨·가슴·팔·하체·체지방 관리의 GND 공식 6주 프로그램 5종을 완전한 운동 처방과 검증 가능한 정적 카탈로그로 만든다.

**Architecture:** 프로그램 본문은 `src/lib/domain/official-programs.ts` 한 곳에서 버전이 있는 불변 데이터로 관리하고, UI와 DB 등록은 이 카탈로그를 읽기만 한다. 모든 프로그램은 전신 기본 운동을 유지하고 목표 부위의 직접 세트만 높이며, DB 운동 카탈로그에 없는 이름이 하나라도 있으면 등록 전에 중단한다.

**Tech Stack:** TypeScript 5, Vitest 4, Supabase REST read-only check, existing `CatalogExercise` and workout-plan domain types

---

## 실행 전 조건

- 설계 기준: `docs/superpowers/specs/2026-08-12-recommendation-hub-cognitive-layout-design.md`
- 과학 기준: `docs/superpowers/specs/2026-08-12-official-workout-programs-design.md` §8~§11
- 이 계획은 `2026-08-12-official-program-scheduling.md`의 **Task 1을 대체**한다.
- 실행 시 사용자 미추적 파일과 격리하기 위해 `using-git-worktrees`를 먼저 사용한다.
- DB 쓰기와 마이그레이션은 하지 않는다. 실제 `exercise_catalog` 검사는 읽기 전용이다.
- 아래 처방은 건강한 성인의 일반 프로그램이다. 통증·부상·임신·의사의 운동 제한은 개인 지시를 우선한다.

## 파일 구조

**생성**

- `src/lib/domain/official-programs.ts` — 5종 메타데이터, A/B/C 처방, 이름 해석
- `src/lib/domain/official-programs.test.ts` — 카피·구조·세트·반복·휴식·종목명 계약
- `scripts/official-program-catalog-check.mjs` — 운영 카탈로그 읽기 전용 이름 검사

**수정**

- `src/lib/domain/workout-plan.ts` — `ExercisePrescription` 타입 추가
- `package.json` — `programs:check-catalog` 읽기 전용 스크립트 추가
- `PROGRESS.md` — 실제 테스트 수치와 카탈로그 검사 결과 기록

## 공통 처방 규칙

- 주 3회, 6주, A/B/C를 주당 한 번씩 수행한다.
- 복합 운동은 6~10회 또는 8~12회, 120~150초 휴식이다.
- 고립 운동은 10~20회, 75~90초 휴식이다.
- 첫 주는 3회 여유, 2~6주는 기본 1~2회 여유다.
- 반복 상한을 모든 세트에서 달성하고 마지막 세트가 `적당함`이면 다음 회차에 최소 단위 증량을 제안한다.
- `beginnerSets/experiencedSets`가 같으면 `3/3`처럼 적는다.

## 확정 처방표

### 어깨 — `shoulder-frame-6w`

| 회차 | 운동 | 세트 초보/경험 | 반복 | RIR | 휴식 |
|---|---|---:|---:|---:|---:|
| A | 바벨 백스쿼트 | 3/3 | 6~10 | 2 | 150초 |
| A | 벤치프레스 | 3/3 | 6~10 | 2 | 150초 |
| A | 시티드 로우 | 3/3 | 8~12 | 2 | 120초 |
| A | 숄더프레스 | 2/3 | 8~12 | 2 | 120초 |
| A | 사이드 레터럴 레이즈 | 2/3 | 12~20 | 1~2 | 75초 |
| B | 루마니안 데드리프트 | 3/3 | 6~10 | 2 | 150초 |
| B | 랫풀다운 | 3/3 | 8~12 | 2 | 120초 |
| B | 인클라인 벤치프레스 | 3/3 | 8~12 | 2 | 120초 |
| B | 페이스풀 | 2/3 | 12~20 | 1~2 | 75초 |
| B | 덤벨 컬 | 2/2 | 10~15 | 2 | 75초 |
| C | 레그프레스 | 3/3 | 8~12 | 2 | 150초 |
| C | 덤벨 벤치프레스 | 3/3 | 8~12 | 2 | 120초 |
| C | 바벨 로우 | 3/3 | 8~12 | 2 | 120초 |
| C | 덤벨 레터럴 레이즈 | 3/4 | 12~20 | 1~2 | 75초 |
| C | 페이스풀 | 2/2 | 12~20 | 1~2 | 75초 |
| C | 케이블 푸시다운 | 2/2 | 10~15 | 2 | 75초 |

### 가슴 — `chest-frame-6w`

| 회차 | 운동 | 세트 초보/경험 | 반복 | RIR | 휴식 |
|---|---|---:|---:|---:|---:|
| A | 바벨 백스쿼트 | 3/3 | 6~10 | 2 | 150초 |
| A | 벤치프레스 | 3/3 | 6~10 | 2 | 150초 |
| A | 시티드 로우 | 3/3 | 8~12 | 2 | 120초 |
| A | 인클라인 벤치프레스 | 2/3 | 8~12 | 2 | 120초 |
| A | 사이드 레터럴 레이즈 | 2/2 | 12~20 | 2 | 75초 |
| B | 루마니안 데드리프트 | 3/3 | 6~10 | 2 | 150초 |
| B | 랫풀다운 | 3/3 | 8~12 | 2 | 120초 |
| B | 덤벨 벤치프레스 | 3/3 | 8~12 | 2 | 120초 |
| B | 덤벨 플라이 | 2/3 | 10~15 | 2 | 90초 |
| B | 케이블 푸시다운 | 2/2 | 10~15 | 2 | 75초 |
| C | 레그프레스 | 3/3 | 8~12 | 2 | 150초 |
| C | 체스트프레스 머신 | 2/2 | 8~12 | 2 | 120초 |
| C | 바벨 로우 | 3/3 | 8~12 | 2 | 120초 |
| C | 푸시업 | 2/2 | 8~15 | 2 | 90초 |
| C | 페이스풀 | 2/2 | 12~20 | 2 | 75초 |

### 팔 — `arm-outline-6w`

| 회차 | 운동 | 세트 초보/경험 | 반복 | RIR | 휴식 |
|---|---|---:|---:|---:|---:|
| A | 레그프레스 | 3/3 | 8~12 | 2 | 150초 |
| A | 벤치프레스 | 3/3 | 6~10 | 2 | 150초 |
| A | 시티드 로우 | 3/3 | 8~12 | 2 | 120초 |
| A | 덤벨 컬 | 3/3 | 10~15 | 2 | 75초 |
| A | 케이블 푸시다운 | 3/3 | 10~15 | 2 | 75초 |
| B | 루마니안 데드리프트 | 3/3 | 6~10 | 2 | 150초 |
| B | 숄더프레스 | 3/3 | 8~12 | 2 | 120초 |
| B | 랫풀다운 | 3/3 | 8~12 | 2 | 120초 |
| B | 덤벨 해머 컬 | 3/3 | 10~15 | 2 | 75초 |
| B | 벤치 딥스 | 3/3 | 8~15 | 2 | 90초 |
| C | 맨몸 스쿼트 | 3/3 | 12~20 | 2 | 90초 |
| C | 덤벨 벤치프레스 | 3/3 | 8~12 | 2 | 120초 |
| C | 덤벨 로우 | 3/3 | 8~12 | 2 | 120초 |
| C | 덤벨 컬 | 2/2 | 10~15 | 2 | 75초 |
| C | 케이블 푸시다운 | 2/2 | 10~15 | 2 | 75초 |
| C | 사이드 레터럴 레이즈 | 2/2 | 12~20 | 2 | 75초 |

### 하체 — `lower-balance-6w`

| 회차 | 운동 | 세트 초보/경험 | 반복 | RIR | 휴식 |
|---|---|---:|---:|---:|---:|
| A | 바벨 백스쿼트 | 3/3 | 6~10 | 2 | 150초 |
| A | 벤치프레스 | 3/3 | 6~10 | 2 | 150초 |
| A | 시티드 로우 | 3/3 | 8~12 | 2 | 120초 |
| A | 레그 익스텐션 | 2/3 | 10~15 | 2 | 90초 |
| A | 레그 컬 | 2/3 | 10~15 | 2 | 90초 |
| B | 루마니안 데드리프트 | 3/3 | 6~10 | 2 | 150초 |
| B | 숄더프레스 | 3/3 | 8~12 | 2 | 120초 |
| B | 랫풀다운 | 3/3 | 8~12 | 2 | 120초 |
| B | 런지 | 3/3 | 8~12 | 2 | 120초 |
| B | 힙 브릿지 | 3/3 | 10~15 | 2 | 90초 |
| C | 레그프레스 | 3/3 | 8~12 | 2 | 150초 |
| C | 덤벨 벤치프레스 | 3/3 | 8~12 | 2 | 120초 |
| C | 덤벨 로우 | 3/3 | 8~12 | 2 | 120초 |
| C | 레그 익스텐션 | 2/2 | 10~15 | 2 | 90초 |
| C | 레그 컬 | 2/2 | 10~15 | 2 | 90초 |

### 체지방 관리 — `lean-body-6w`

| 회차 | 운동 | 세트 초보/경험 | 반복 | RIR | 휴식 |
|---|---|---:|---:|---:|---:|
| A | 레그프레스 | 3/3 | 8~12 | 2 | 120초 |
| A | 체스트프레스 머신 | 3/3 | 8~12 | 2 | 90초 |
| A | 랫풀다운 | 3/3 | 8~12 | 2 | 90초 |
| A | 크런치 | 2/3 | 12~20 | 2 | 60초 |
| B | 루마니안 데드리프트 | 3/3 | 8~12 | 2 | 120초 |
| B | 숄더프레스 | 3/3 | 8~12 | 2 | 90초 |
| B | 시티드 로우 | 3/3 | 8~12 | 2 | 90초 |
| B | 런지 | 2/3 | 10~15 | 2 | 90초 |
| B | 푸시업 | 2/2 | 8~15 | 2 | 75초 |
| C | 맨몸 스쿼트 | 3/3 | 12~20 | 2 | 75초 |
| C | 덤벨 벤치프레스 | 3/3 | 8~12 | 2 | 90초 |
| C | 덤벨 로우 | 3/3 | 8~12 | 2 | 90초 |
| C | 덤벨 컬 | 2/2 | 10~15 | 2 | 60초 |
| C | 케이블 푸시다운 | 2/2 | 10~15 | 2 | 60초 |

체지방 관리 프로그램은 감량을 보장하지 않는다. 상세 설명에 `체중 변화는 식사와
일상 활동량의 영향도 받습니다`를 고정하고, 근력과 근육량 유지에 초점을 둔다.

---

### Task 1: 프로그램 타입과 메타데이터 계약

**Files:**
- Create: `src/lib/domain/official-programs.test.ts`
- Create: `src/lib/domain/official-programs.ts`
- Modify: `src/lib/domain/workout-plan.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { OFFICIAL_PROGRAMS } from "./official-programs";

const EXPECTED = [
  ["shoulder-frame-6w", "시선이 머무는 어깨", "상체의 틀을 넓히는 6주"],
  ["chest-frame-6w", "옷태를 세우는 가슴", "상체 앞면을 단단하게 만드는 6주"],
  ["arm-outline-6w", "소매를 채우는 팔", "팔의 두께와 윤곽을 만드는 6주"],
  ["lower-balance-6w", "실루엣을 완성하는 하체", "하체의 힘과 균형을 세우는 6주"],
  ["lean-body-6w", "몸은 가볍게, 인상은 선명하게", "근육을 지키는 체지방 관리 6주"],
];

describe("GND 공식 프로그램 카탈로그", () => {
  it("승인된 5종을 순서대로 제공한다", () => {
    expect(OFFICIAL_PROGRAMS.map((p) => [p.key, p.eyebrow, p.title])).toEqual(EXPECTED);
  });

  it("모두 주 3회 6주 A/B/C 구조다", () => {
    for (const program of OFFICIAL_PROGRAMS) {
      expect(program.weeks).toBe(6);
      expect(program.sessionsPerWeek).toBe(3);
      expect(program.sessions.map((s) => s.key)).toEqual(["A", "B", "C"]);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/official-programs.test.ts`

Expected: FAIL with `Cannot find module './official-programs'`.

- [ ] **Step 3: 공용 타입과 메타데이터 구현**

```ts
export type ExercisePrescription = {
  repsMin: number;
  repsMax: number;
  targetRir: 1 | 2 | 3;
  restSeconds: 60 | 75 | 90 | 120 | 150;
  loadStepKg: 1 | 2.5 | 5;
};

export type OfficialProgramKey =
  | "shoulder-frame-6w"
  | "chest-frame-6w"
  | "arm-outline-6w"
  | "lower-balance-6w"
  | "lean-body-6w";

export type ProgramExerciseTemplate = ExercisePrescription & {
  exerciseName: string;
  beginnerSets: number;
  experiencedSets: number;
};

export type OfficialProgram = {
  key: OfficialProgramKey;
  version: 1;
  eyebrow: string;
  title: string;
  description: string;
  durationMinutes: readonly [number, number];
  coverImage: string;
  weeks: 6;
  sessionsPerWeek: 3;
  sessions: readonly {
    key: "A" | "B" | "C";
    title: string;
    exercises: readonly ProgramExerciseTemplate[];
  }[];
};
```

`OFFICIAL_PROGRAMS`의 메타데이터는 위 `EXPECTED` 순서와 카피를 그대로 사용하고,
이미지는 `/program-assets/{shoulder|chest|arms|lower|lean}.webp`로 고정한다.

- [ ] **Step 4: 관련 테스트 통과**

Run: `pnpm test -- src/lib/domain/official-programs.test.ts src/lib/domain/workout-plan.test.ts`

Expected: 새 카탈로그 테스트와 기존 계획 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add -- src/lib/domain/official-programs.ts src/lib/domain/official-programs.test.ts src/lib/domain/workout-plan.ts
git commit -m "feat: GND 공식 프로그램 5종 메타데이터"
```

### Task 2: A/B/C 처방을 데이터로 고정

**Files:**
- Modify: `src/lib/domain/official-programs.ts`
- Modify: `src/lib/domain/official-programs.test.ts`

- [ ] **Step 1: 처방 계약 실패 테스트 추가**

```ts
it("모든 운동에 유효한 세트·반복·여유·휴식·증량 단위가 있다", () => {
  for (const program of OFFICIAL_PROGRAMS) {
    for (const session of program.sessions) {
      expect(session.exercises.length).toBeGreaterThanOrEqual(5);
      expect(session.exercises.length).toBeLessThanOrEqual(6);
      for (const exercise of session.exercises) {
        expect(exercise.beginnerSets).toBeGreaterThanOrEqual(2);
        expect(exercise.experiencedSets).toBeGreaterThanOrEqual(exercise.beginnerSets);
        expect(exercise.repsMin).toBeLessThanOrEqual(exercise.repsMax);
        expect([1, 2, 3]).toContain(exercise.targetRir);
        expect([60, 75, 90, 120, 150]).toContain(exercise.restSeconds);
        expect([1, 2.5, 5]).toContain(exercise.loadStepKg);
      }
    }
  }
});

it("다섯 프로그램의 회차별 종목 이름이 승인 표와 같다", () => {
  expect(OFFICIAL_PROGRAMS.map((program) =>
    program.sessions.map((session) => session.exercises.map((exercise) => exercise.exerciseName)),
  )).toMatchSnapshot();
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/official-programs.test.ts`

Expected: 빈 `sessions` 또는 처방 누락으로 FAIL.

- [ ] **Step 3: 확정 처방표를 그대로 입력**

반복을 줄이기 위해 아래 헬퍼만 사용한다.

```ts
const ex = (
  exerciseName: string,
  beginnerSets: number,
  experiencedSets: number,
  repsMin: number,
  repsMax: number,
  targetRir: 1 | 2 | 3,
  restSeconds: 60 | 75 | 90 | 120 | 150,
  loadStepKg: 1 | 2.5 | 5,
): ProgramExerciseTemplate => ({
  exerciseName,
  beginnerSets,
  experiencedSets,
  repsMin,
  repsMax,
  targetRir,
  restSeconds,
  loadStepKg,
});
```

각 프로그램의 `sessions`에는 이 문서의 확정 처방표를 행 순서까지 그대로 입력한다.
기계·바벨 복합 운동의 `loadStepKg`는 5, 덤벨·고립 운동은 2.5, 맨몸 운동은 1로
입력한다. 체지방 관리 프로그램의 `description` 끝에는 다음 문장을 고정한다.

```text
체중 변화는 식사와 일상 활동량의 영향도 받습니다. 이 프로그램은 근력과 근육량을
지키며 꾸준히 움직이는 습관을 만드는 데 초점을 둡니다.
```

- [ ] **Step 4: 스냅샷을 검토하고 통과 확인**

Run: `pnpm test -- src/lib/domain/official-programs.test.ts -u`

Expected: 스냅샷 1개 생성, 프로그램 5종 × A/B/C 이름이 위 표와 정확히 일치, 전체 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add -- src/lib/domain/official-programs.ts src/lib/domain/official-programs.test.ts src/lib/domain/__snapshots__/official-programs.test.ts.snap
git commit -m "feat: 공식 프로그램 5종 운동 처방"
```

### Task 3: 실제 카탈로그 이름을 읽기 전용으로 검증

**Files:**
- Create: `scripts/official-program-catalog-check.mjs`
- Modify: `package.json`
- Modify: `src/lib/domain/official-programs.test.ts`

- [ ] **Step 1: 누락 이름 오류 테스트 작성**

```ts
import { resolveProgram } from "./official-programs";

it("카탈로그에서 빠진 종목명을 모두 알려준다", () => {
  expect(() => resolveProgram(OFFICIAL_PROGRAMS[0], [])).toThrow(
    /program_exercise_missing:/,
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/official-programs.test.ts`

Expected: `resolveProgram is not a function`으로 FAIL.

- [ ] **Step 3: 이름 해석 함수 구현**

```ts
export function resolveProgram(
  program: OfficialProgram,
  catalog: readonly CatalogExercise[],
) {
  const byName = new Map(catalog.map((item) => [item.name, item]));
  const names = [...new Set(program.sessions.flatMap((session) =>
    session.exercises.map((exercise) => exercise.exerciseName),
  ))];
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length) throw new Error(`program_exercise_missing:${missing.join(",")}`);
  return program.sessions.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      item: byName.get(exercise.exerciseName)!,
    })),
  }));
}
```

- [ ] **Step 4: 읽기 전용 스크립트 작성**

`scripts/official-program-catalog-check.mjs`는 `.env.local`의 공개 URL과 anon key로
`exercise_catalog?select=name&is_custom=eq.false`를 GET하고, 아래 고정 배열과 비교한다.
POST·PATCH·DELETE는 사용하지 않는다.

```js
const requiredNames = [
  "바벨 백스쿼트", "벤치프레스", "시티드 로우", "숄더프레스",
  "사이드 레터럴 레이즈", "루마니안 데드리프트", "랫풀다운",
  "인클라인 벤치프레스", "페이스풀", "덤벨 컬", "레그프레스",
  "덤벨 벤치프레스", "바벨 로우", "덤벨 레터럴 레이즈",
  "케이블 푸시다운", "덤벨 플라이", "체스트프레스 머신", "푸시업",
  "덤벨 해머 컬", "벤치 딥스", "맨몸 스쿼트", "덤벨 로우",
  "레그 익스텐션", "레그 컬", "런지", "힙 브릿지", "크런치",
];
```

누락이 있으면 `MISSING <name>`을 한 줄씩 출력하고 exit 1, 모두 있으면
`PASS 27/27 official-program exercise names`와 exit 0을 반환한다.

`package.json`에 다음만 추가한다.

```json
"programs:check-catalog": "node scripts/official-program-catalog-check.mjs"
```

- [ ] **Step 5: 단위 테스트와 실제 이름 검사**

Run:

```powershell
pnpm test -- src/lib/domain/official-programs.test.ts
pnpm programs:check-catalog
```

Expected: 단위 테스트 PASS, 실제 검사 `PASS 27/27`. 하나라도 누락되면 구현을 멈추고
실제 DB 이름으로 처방과 승인 표를 함께 고친 뒤 다시 실행한다.

- [ ] **Step 6: 커밋**

```powershell
git add -- scripts/official-program-catalog-check.mjs package.json src/lib/domain/official-programs.ts src/lib/domain/official-programs.test.ts
git commit -m "test: 공식 프로그램 종목명 실카탈로그 검증"
```

### Task 4: 카탈로그 단계 검증과 기록

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/HANDOFF-2026-08-12-official-program-design.md`

- [ ] **Step 1: 관련 검사 실행**

```powershell
pnpm test -- src/lib/domain/official-programs.test.ts src/lib/domain/workout-plan.test.ts
pnpm typecheck
pnpm programs:check-catalog
git diff --check
```

Expected: 테스트 실패 0, typecheck 오류 0, 카탈로그 27/27, diff-check 출력 0줄.

- [ ] **Step 2: 진행 기록 갱신**

`PROGRESS.md`와 인수인계서에 프로그램별 운동 수, 테스트 건수, 실제 카탈로그
27/27 여부, DB 쓰기 0건, 개발 서버·운영 배포 미실행을 기록한다.

- [ ] **Step 3: 지정 문서만 커밋**

```powershell
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-12-official-program-design.md
git commit -m "docs: 공식 프로그램 5종 카탈로그 검증 기록"
```

다음 실행은 `2026-08-12-official-program-scheduling.md`의 Task 2~5다. Task 1은 다시
실행하지 않는다.
