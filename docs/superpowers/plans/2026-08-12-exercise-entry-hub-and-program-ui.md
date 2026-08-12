# Exercise Entry Hub and Program UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 추가 첫 화면을 프로그램/직접 검색 두 경로로 재구성하고, 5종 프로그램 카드·3단계 일정 설정·전신 인터벌 명칭을 승인된 검정·골드 UI로 연결한다.

**Architecture:** `ExercisePicker`의 허브 책임을 `ExerciseEntryHub`로 분리하고 기존 추천·검색·과거 기록·루틴 로직은 유지한다. 프로그램 화면은 정적 `OFFICIAL_PROGRAMS`를 읽는 카탈로그/상세와, 기존 순수 일정 함수 및 RPC를 호출하는 설정 화면으로 나눈다. 사용자 노출 용어만 중앙 상수로 바꾸며 내부 `tabata` 타입과 DB 값은 유지한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, next/image, Vitest, Testing Library, ImageGen, WebP

---

## 실행 순서와 전제

1. `2026-08-12-five-official-program-catalog.md` 전체를 먼저 실행한다.
2. `2026-08-12-official-program-scheduling.md` Task 2~5를 실행한다.
3. 이 계획을 실행한다. 이 계획은 기존 일정 계획의 **Task 6을 대체**한다.
4. 이 계획 완료 뒤 기존 일정 계획 Task 7~8을 실행한다.
5. DB 마이그레이션 0066은 사용자 승인과 SQL Editor 적용 전까지 실행하지 않는다.
6. 실행 시 `using-git-worktrees`로 격리한다.

## 파일 구조

**생성**

- `src/components/record/exercise-entry-hub.tsx` — 두 핵심 경로와 빠른 시작
- `src/components/record/exercise-entry-hub.test.tsx` — 계층·조건부 항목·콜백 계약
- `src/components/programs/program-catalog.tsx` — 대표 1 + 2×2 프로그램 선택
- `src/components/programs/program-catalog.test.tsx` — 5종 카피·이미지·상세 진입
- `src/components/programs/program-schedule-setup.tsx` — 시작일·요일/시간·18회 미리보기
- `src/components/programs/program-schedule-setup.test.tsx` — 3단계·충돌·이중 저장 방지
- `src/components/programs/program-flow.tsx` — 카탈로그·상세·일정·완료 상태 전환
- `src/components/programs/program-flow.test.tsx` — 프로그램 선택부터 완료까지 통합 흐름
- `src/app/(tabs)/record/programs/page.tsx` — 프로그램 흐름 연결
- `src/lib/domain/program-assets.test.ts` — WebP 5장 존재·형식·용량 계약
- `public/program-assets/shoulder.webp`
- `public/program-assets/chest.webp`
- `public/program-assets/arms.webp`
- `public/program-assets/lower.webp`
- `public/program-assets/lean.webp`

**수정**

- `src/lib/domain/tabata.ts` — 사용자 노출용 `INTERVAL_COPY`
- `src/lib/domain/tabata.test.ts` — 명칭 계약
- `src/components/record/exercise-picker.tsx` — 허브 분리, 검색 안 추천 바로가기
- `src/components/record/exercise-picker.test.tsx` — 프로그램/검색 병행과 기존 경로 회귀
- `src/components/record/tabata-sheet.tsx` — 새 제목·설명·버튼
- `src/components/record/tabata-sheet.test.tsx` — 새 문구와 기존 타이머 동작
- `src/app/(tabs)/record/page.tsx` — 프로그램 페이지 이동
- `src/components/record/calendar-view.tsx` — 사용자 노출 인터벌 명칭
- `src/components/feed/feed-item.tsx` — 사용자 노출 인터벌 명칭
- `src/components/profile/xp-guide-sheet.tsx` — 사용자 노출 인터벌 명칭
- `src/lib/challenge.ts` — 목표 라벨만 `인터벌 운동 횟수`, key는 유지
- 관련 테스트 파일
- `PROGRESS.md` — 실제 검증 기록

---

### Task 1: 전신 인터벌 사용자 노출 명칭 중앙화

**Files:**
- Modify: `src/lib/domain/tabata.ts`
- Modify: `src/lib/domain/tabata.test.ts`
- Modify: `src/components/record/tabata-sheet.tsx`
- Modify: `src/components/record/tabata-sheet.test.tsx`

- [ ] **Step 1: 명칭 실패 테스트 작성**

```ts
import { INTERVAL_COPY } from "./tabata";

it("사용자에게 방식보다 시간을 먼저 말한다", () => {
  expect(INTERVAL_COPY.title).toBe("4분부터 시작하는 전신 인터벌");
  expect(INTERVAL_COPY.short).toBe("4분 인터벌");
  expect(INTERVAL_COPY.description).toBe("음악에 맞춰 20초 운동 · 10초 휴식");
  expect(INTERVAL_COPY.session(8)).toBe("전신 인터벌 8분");
});
```

컴포넌트 테스트에는 다음 단언을 추가한다.

```tsx
expect(screen.getByRole("heading", { name: /4분부터 시작하는 전신 인터벌/ })).toBeVisible();
expect(screen.getByText("음악에 맞춰 20초 운동 · 10초 휴식")).toBeVisible();
expect(screen.getByRole("button", { name: "전신 인터벌 시작" })).toBeEnabled();
expect(screen.queryByText(/타바타 —/)).toBeNull();
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/tabata.test.ts src/components/record/tabata-sheet.test.tsx`

Expected: `INTERVAL_COPY` 없음과 옛 `타바타` 문구로 FAIL.

- [ ] **Step 3: 중앙 상수와 화면 문구 구현**

```ts
export const INTERVAL_COPY = {
  title: "4분부터 시작하는 전신 인터벌",
  short: "4분 인터벌",
  description: "음악에 맞춰 20초 운동 · 10초 휴식",
  start: "전신 인터벌 시작",
  session: (minutes: TabataMinutes) => `전신 인터벌 ${minutes}분`,
} as const;
```

`TabataSheet` 제목은 `INTERVAL_COPY.title`, 설명 첫 줄은
`INTERVAL_COPY.description`, 시작 버튼은 `INTERVAL_COPY.start`를 사용한다. 내부
컴포넌트명, 타입, 음원 ID, 기록의 `tabataMinutes`는 바꾸지 않는다.

- [ ] **Step 4: 테스트 통과**

Run: `pnpm test -- src/lib/domain/tabata.test.ts src/components/record/tabata-sheet.test.tsx`

Expected: 모두 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add -- src/lib/domain/tabata.ts src/lib/domain/tabata.test.ts src/components/record/tabata-sheet.tsx src/components/record/tabata-sheet.test.tsx
git commit -m "feat: 타바타를 전신 인터벌로 안내"
```

### Task 2: 운동 추가 입구를 두 핵심 경로로 분리

**Files:**
- Create: `src/components/record/exercise-entry-hub.tsx`
- Create: `src/components/record/exercise-entry-hub.test.tsx`
- Modify: `src/components/record/exercise-picker.tsx`
- Modify: `src/components/record/exercise-picker.test.tsx`

- [ ] **Step 1: 허브 실패 테스트 작성**

```tsx
render(
  <ExerciseEntryHub
    hasPast
    routineCount={2}
    onPrograms={onPrograms}
    onSearch={onSearch}
    onPast={onPast}
    onRoutine={onRoutine}
    onInterval={onInterval}
  />,
);

expect(screen.getByRole("button", { name: /프로그램으로 시작하기/ })).toBeVisible();
expect(screen.getByRole("button", { name: /운동 직접 고르기/ })).toBeVisible();
expect(screen.getByRole("button", { name: /지난 운동/ })).toBeVisible();
expect(screen.getByRole("button", { name: /내 루틴/ })).toBeVisible();
expect(screen.getByRole("button", { name: /4분부터 시작하는 전신 인터벌/ })).toBeVisible();
expect(screen.queryByRole("button", { name: /^상황별 추천/ })).toBeNull();
```

`hasPast=false`, `routineCount=0`, `onInterval=undefined`일 때 각 빠른 시작 항목이
사라지는 테스트도 별도로 작성한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/record/exercise-entry-hub.test.tsx`

Expected: 모듈 없음으로 FAIL.

- [ ] **Step 3: 허브 컴포넌트 구현**

컴포넌트의 공개 인터페이스를 다음으로 고정한다.

```ts
type ExerciseEntryHubProps = {
  hasPast: boolean;
  routineCount: number;
  onPrograms?: () => void;
  onSearch: () => void;
  onPast: () => void;
  onRoutine: () => void;
  onInterval?: () => void;
};
```

레이아웃 순서와 카피는 다음과 같다.

```text
프로그램으로 시작하기
목표만 고르면 6주 계획을 달력에 자동으로 담아요

운동 직접 고르기
검색·상황·부위별로 오늘 운동을 추가해요

빠른 시작
지난 운동 / 내 루틴

4분부터 시작하는 전신 인터벌
음악에 맞춰 20초 운동 · 10초 휴식
```

프로그램 카드에는 `/record-assets/exercise-picker-hero.webp`, 검색 카드에는
`/ui-icons/hub-search.webp`, 인터벌에는 `/ui-icons/hub-tabata.webp`를 사용한다.
이미지는 `alt=""`, 카드 전체는 button, 모든 button은 최소 높이 44px다.

- [ ] **Step 4: `ExercisePicker`에 연결**

`PickerProps`에 `onOpenPrograms?: () => void`를 추가한다. `mode="hub"`에서는
`ExerciseEntryHub`만 렌더하고 다음 콜백을 전달한다.

```tsx
<ExerciseEntryHub
  hasPast={pastSessions.length > 0}
  routineCount={routines?.length ?? 0}
  onPrograms={onOpenPrograms}
  onSearch={() => setMode("search")}
  onPast={() => setMode("past")}
  onRoutine={() => setMode("routine")}
  onInterval={onOpenTabata}
/>
```

`ExerciseEntryHub`는 `onPrograms`가 undefined일 때 프로그램 카드를 렌더하지 않는다.
달력 예정표 피커에서 눌러도 엉뚱하게 검색으로 가는 가짜 프로그램 진입을 만들지 않는다.

- [ ] **Step 5: 관련 테스트 통과**

Run: `pnpm test -- src/components/record/exercise-entry-hub.test.tsx src/components/record/exercise-picker.test.tsx`

Expected: 새 허브와 기존 검색·과거·루틴·추천 동작 모두 PASS.

- [ ] **Step 6: 커밋**

```powershell
git add -- src/components/record/exercise-entry-hub.tsx src/components/record/exercise-entry-hub.test.tsx src/components/record/exercise-picker.tsx src/components/record/exercise-picker.test.tsx
git commit -m "feat: 운동 추가를 프로그램과 검색으로 분리"
```

### Task 3: 검색 화면에 상황·부위 추천 바로가기 배치

**Files:**
- Modify: `src/components/record/exercise-picker.tsx`
- Modify: `src/components/record/exercise-picker.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
fireEvent.click(screen.getByRole("button", { name: /운동 직접 고르기/ }));
expect(screen.getByPlaceholderText(/운동 검색/)).toHaveFocus();
expect(screen.getByRole("button", { name: "상황별 추천" })).toBeVisible();
expect(screen.getByRole("button", { name: "부위별 추천" })).toBeVisible();

fireEvent.click(screen.getByRole("button", { name: "상황별 추천" }));
expect(screen.getByText("오늘 어떤 상황인가요?")).toBeVisible();
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/record/exercise-picker.test.tsx`

Expected: 검색 화면에 추천 버튼이 없어 FAIL.

- [ ] **Step 3: 검색 상단 구현**

검색 input에 `ref={searchRef}`와 `autoFocus`를 적용한다. input 바로 아래에
`빠르게 찾기` 라벨과 두 개의 동일 폭 44px 버튼을 추가한다.

```tsx
<div className="mt-3">
  <p className="mb-1.5 text-xs font-bold text-muted">빠르게 찾기</p>
  <div className="grid grid-cols-2 gap-2">
    <button type="button" onClick={() => setMode("situation")}>상황별 추천</button>
    <button type="button" onClick={() => setMode("part")}>부위별 추천</button>
  </div>
</div>
```

자주 한 운동 칩은 기존 한 줄 구조를 유지하고 이 두 버튼 아래에 둔다.

- [ ] **Step 4: 테스트 통과와 커밋**

Run: `pnpm test -- src/components/record/exercise-picker.test.tsx src/components/record/recommended-flow.test.tsx`

Expected: 모두 PASS.

```powershell
git add -- src/components/record/exercise-picker.tsx src/components/record/exercise-picker.test.tsx
git commit -m "feat: 검색 안에 상황과 부위 추천 배치"
```

### Task 4: 프로그램 대표 이미지 5장 계약과 생성

**Files:**
- Create: `src/lib/domain/program-assets.test.ts`
- Create: `public/program-assets/shoulder.webp`
- Create: `public/program-assets/chest.webp`
- Create: `public/program-assets/arms.webp`
- Create: `public/program-assets/lower.webp`
- Create: `public/program-assets/lean.webp`

- [ ] **Step 1: 자산 실패 테스트 작성**

```ts
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["shoulder", "chest", "arms", "lower", "lean"];

describe("공식 프로그램 대표 이미지", () => {
  for (const name of FILES) {
    it(`${name}.webp는 유효한 WebP이고 180KB 이하다`, () => {
      const path = join(process.cwd(), `public/program-assets/${name}.webp`);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(statSync(path).size).toBeLessThanOrEqual(180_000);
    });
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/program-assets.test.ts`

Expected: 5개 파일 없음으로 5건 FAIL.

- [ ] **Step 3: ImageGen으로 동일 계열 이미지 생성**

실행 시 `imagegen` 스킬을 사용한다. 공통 프롬프트:

```text
Create a premium cinematic fitness program cover, square 1:1, nearly black background,
dark graphite athletic clothing, restrained warm gold rim light, realistic 3D product-ad
quality, one anonymous adult athletic figure, three-quarter camera angle, generous negative
space, readable silhouette at 140px, no text, no logo, no watermark, no gym brand, no trophy,
no badge, no sexualized pose, no before-and-after comparison. Keep camera height, lighting,
wardrobe, and rendering style identical across the five covers.
```

장면별 추가 문장:

- shoulder: `Emphasize the shoulder width and upper-back silhouette.`
- chest: `Front three-quarter pose, emphasize the upper-torso and chest outline.`
- arms: `Natural bent-arm pose, emphasize arm thickness without bodybuilding exaggeration.`
- lower: `Dynamic stable stance, emphasize thighs and glute strength.`
- lean: `Full-body moving stance with subtle motion trails, energetic but not frantic.`

생성 결과를 PNG로 받은 뒤 기존 이미지 도구 또는 Pillow로 1024×1024 WebP quality 86,
method 6으로 변환한다. 자르기나 색 보정은 다섯 장에 같은 값으로 적용한다.

- [ ] **Step 4: 자산 테스트와 육안 확인**

Run: `pnpm test -- src/lib/domain/program-assets.test.ts`

Expected: 5건 PASS.

5장을 140px와 72px로 축소해 어깨·가슴·팔·하체·전신 차이가 글자 없이 구분되는지
직접 확인한다. 구분되지 않는 한 장만 다시 생성한다.

- [ ] **Step 5: 커밋**

```powershell
git add -- public/program-assets src/lib/domain/program-assets.test.ts
git commit -m "assets: 공식 프로그램 대표 이미지 5종"
```

### Task 5: 대표 1개와 2×2 프로그램 카탈로그

**Files:**
- Create: `src/components/programs/program-catalog.tsx`
- Create: `src/components/programs/program-catalog.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
render(<ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={onPick} />);

expect(screen.getAllByRole("button")).toHaveLength(5);
expect(screen.getByText("시선이 머무는 어깨").closest("button")).toHaveAttribute(
  "data-featured", "true",
);
for (const title of [
  "옷태를 세우는 가슴",
  "소매를 채우는 팔",
  "실루엣을 완성하는 하체",
  "몸은 가볍게, 인상은 선명하게",
]) expect(screen.getByText(title)).toBeVisible();

fireEvent.click(screen.getByText("소매를 채우는 팔"));
expect(onPick).toHaveBeenCalledWith("arm-outline-6w");
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/programs/program-catalog.test.tsx`

Expected: 모듈 없음으로 FAIL.

- [ ] **Step 3: 카탈로그 구현**

어깨는 전폭 `data-featured="true"` 카드, 나머지는 `grid grid-cols-2 gap-2`에 둔다.
각 카드 전체를 button으로 만들고 `Image fill sizes`를 설정한다. 카드에 표시하는 정보는
헤드라인, 프로그램명, `주 3회 · 6주`, 회당 시간뿐이다. 상세 설명과 운동 종목은
선택 뒤에만 보여준다.

이미지 `onError` 시 해당 Image를 숨기는 로컬 상태를 두되 텍스트와 button 높이를
유지한다. 선택 핸들러는 프로그램 key만 넘긴다.

- [ ] **Step 4: 상세 화면 추가**

같은 파일에 `ProgramDetail`을 export하되 책임은 상세 표시와 CTA 하나로 제한한다.

```ts
type ProgramDetailProps = {
  program: OfficialProgram;
  onBack: () => void;
  onSchedule: () => void;
};
```

순서는 대표 이미지 → 기간 메타 → 적합 대상 세 문장 → 전신/집중 설명 → A회차
미리보기 → 자동 무게/휴식 설명 → `요일과 시간 정하기` 고정 버튼이다. 체지방 관리
상세에는 식사·활동량 문구를 반드시 표시한다.

- [ ] **Step 5: 테스트 통과와 커밋**

Run: `pnpm test -- src/components/programs/program-catalog.test.tsx`

Expected: 모두 PASS.

```powershell
git add -- src/components/programs/program-catalog.tsx src/components/programs/program-catalog.test.tsx
git commit -m "feat: 공식 프로그램 5종 카탈로그 UI"
```

### Task 6: 시작일·요일/시간·18회 미리보기 3단계

**Files:**
- Create: `src/components/programs/program-schedule-setup.tsx`
- Create: `src/components/programs/program-schedule-setup.test.tsx`

- [ ] **Step 1: 3단계 실패 테스트 작성**

```tsx
render(
  <ProgramScheduleSetup
    today="2026-08-12"
    program={program}
    occupiedPlans={[]}
    onConfirm={onConfirm}
  />,
);

expect(screen.getByText("1/3 · 시작일")).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "다음 주 시작" }));
expect(screen.getByText("2/3 · 요일과 시간")).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "월 · 수 · 금" }));
fireEvent.change(screen.getByLabelText("세 요일 모두 같은 시간"), { target: { value: "19:00" } });
fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));
expect(screen.getByText("3/3 · 18회 미리보기")).toBeVisible();
expect(screen.getAllByTestId("program-plan-date")).toHaveLength(18);
fireEvent.click(screen.getByRole("button", { name: "18회 계획을 달력에 담기" }));
expect(onConfirm).toHaveBeenCalledTimes(1);
```

연속 요일 직접 선택, 기존 계획 충돌, 저장 중 이중 클릭, 실패 뒤 입력 유지 테스트도
각각 하나씩 작성한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/programs/program-schedule-setup.test.tsx`

Expected: 모듈 없음으로 FAIL.

- [ ] **Step 3: 상태와 화면 구현**

```ts
type ScheduleStep = "start" | "slots" | "preview";
type TimeMode = "same" | "per-day";

type ProgramScheduleSetupProps = {
  today: string;
  program: OfficialProgram;
  occupiedPlans: readonly WorkoutPlan[];
  onConfirm: (input: CreateProgramEnrollmentInput) => Promise<void>;
};
```

`start`는 이번 주/다음 주/날짜 input, `slots`는 월수금/화목토/직접 선택과 시간,
`preview`는 `buildProgramSchedule()` 결과를 6행 × 3칸으로 표시한다. 기존 계획 충돌은
`기존 계획 유지`와 제안 날짜를 함께 보여준다.

`today`는 페이지에서 로컬 `YYYY-MM-DD`로 한 번 계산해 넘긴다. 컴포넌트 렌더 중
`new Date()`를 호출하지 않아 테스트와 SSR의 날짜가 달라지지 않게 한다.

`onConfirm`이 reject되면 `저장하지 못했어요. 일정은 그대로 두었어요.`를 표시하고
step·날짜·요일·시간을 유지한다. pending 동안 최종 버튼을 disabled한다.

- [ ] **Step 4: 테스트 통과와 커밋**

Run: `pnpm test -- src/components/programs/program-schedule-setup.test.tsx src/lib/domain/program-schedule.test.ts`

Expected: 모두 PASS.

```powershell
git add -- src/components/programs/program-schedule-setup.tsx src/components/programs/program-schedule-setup.test.tsx
git commit -m "feat: 공식 프로그램 3단계 일정 설정"
```

### Task 7: 프로그램 페이지와 기록 화면 연결

**Files:**
- Create: `src/components/programs/program-flow.tsx`
- Create: `src/components/programs/program-flow.test.tsx`
- Create: `src/app/(tabs)/record/programs/page.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`
- Modify: `src/components/record/exercise-picker.tsx`
- Modify: `src/components/record/exercise-picker.test.tsx`

- [ ] **Step 1: 페이지 흐름 테스트 작성**

```tsx
render(
  <ProgramFlow
    programs={OFFICIAL_PROGRAMS}
    occupiedPlans={[]}
    onCreate={vi.fn().mockResolvedValue({
      enrollmentId: "enrollment-1",
      nextPlan: { date: "2026-08-17", time: "19:00", title: "밀고 세우기" },
    })}
  />,
);

fireEvent.click(screen.getByRole("button", { name: /시선이 머무는 어깨/ }));
expect(screen.getByRole("button", { name: "요일과 시간 정하기" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "요일과 시간 정하기" }));
expect(screen.getByText("1/3 · 시작일")).toBeVisible();

// ProgramScheduleSetup의 세 단계 입력을 마친 뒤 최종 버튼을 누른다.
fireEvent.click(screen.getByRole("button", { name: "18회 계획을 달력에 담기" }));
expect(await screen.findByText("6주 계획이 준비됐어요")).toBeVisible();
expect(screen.getByText(/8월 17일.*오후 7:00/)).toBeVisible();
```

`ProgramFlow` 공개 인터페이스는 다음으로 고정한다.

```ts
type ProgramFlowProps = {
  programs: readonly OfficialProgram[];
  occupiedPlans: readonly WorkoutPlan[];
  activeEnrollment?: ProgramEnrollment | null;
  onCreate: (input: CreateProgramEnrollmentInput) => Promise<{
    enrollmentId: string;
    nextPlan: { date: string; time: string; title: string };
  }>;
};
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/programs/program-flow.test.tsx src/components/programs/program-catalog.test.tsx src/components/programs/program-schedule-setup.test.tsx src/components/record/exercise-picker.test.tsx`

Expected: 기록 화면에 `onOpenPrograms` 연결이 없어 관련 단언 FAIL.

- [ ] **Step 3: 페이지 구현과 라우팅 연결**

`ProgramFlow`의 내부 상태는 다음 네 값만 사용한다.

```ts
type ProgramFlowStep = "catalog" | "detail" | "schedule" | "done";
```

`record/page.tsx`에서 `useRouter()`를 사용해 다음 콜백을 전달한다.

```tsx
onOpenPrograms={() => router.push("/record/programs")}
```

프로그램 페이지는 인증 사용자, `getWorkoutPlans(userId)`,
`createProgramEnrollment()`만 연결한다. catalog/detail에서는 DB 쓰기를 하지 않는다.
동일 프로그램의 active enrollment가 있으면 새 일정 대신 `진행 중인 프로그램 보기`를
표시한다. 최종 등록은 0066의 원자적 RPC 한 번만 호출하며, 18개 중 일부만 저장하는
클라이언트 반복 insert를 만들지 않는다.

- [ ] **Step 4: 테스트 통과와 커밋**

Run: `pnpm test -- src/components/programs src/components/record/exercise-entry-hub.test.tsx src/components/record/exercise-picker.test.tsx`

Expected: 모두 PASS.

```powershell
git add -- 'src/app/(tabs)/record/programs/page.tsx' 'src/app/(tabs)/record/page.tsx' src/components/record/exercise-picker.tsx src/components/record/exercise-picker.test.tsx src/components/programs
git commit -m "feat: 운동 추가에서 공식 프로그램 일정 연결"
```

### Task 8: 나머지 사용자 노출 용어 통일

**Files:**
- Modify: `src/components/record/calendar-view.tsx`
- Modify: `src/components/feed/feed-item.tsx`
- Modify: `src/components/profile/xp-guide-sheet.tsx`
- Modify: `src/lib/challenge.ts`
- Modify: corresponding `*.test.tsx` and `*.test.ts`

- [ ] **Step 1: 사용자 문구 실패 테스트 작성**

각 화면 테스트에서 다음 문구를 단언한다.

```text
전신 인터벌 8분 예정
전신 인터벌 8분
전신 인터벌 완료
인터벌 운동 횟수
```

내부 키 `tabata_count`와 필드 `tabataMinutes`가 그대로인 것도 도메인 테스트에서
단언한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/record/calendar-view.test.tsx src/components/feed/feed-item.test.tsx src/components/profile/xp-guide-sheet.test.tsx src/lib/challenge.test.ts`

Expected: 옛 사용자 문구 `타바타` 때문에 새 단언 FAIL.

- [ ] **Step 3: 표시 문구만 교체**

세션 시간 표시는 `INTERVAL_COPY.session(minutes)`, 목표 라벨은 `인터벌 운동 횟수`,
완료 문구는 `전신 인터벌 완료`를 사용한다. DB 값, 타입, 함수명, analytics key는
바꾸지 않는다.

- [ ] **Step 4: 테스트 통과와 커밋**

Run: 위 Step 2 명령을 다시 실행.

Expected: 모두 PASS.

```powershell
git add -- src/components/record/calendar-view.tsx src/components/record/calendar-view.test.tsx src/components/feed/feed-item.tsx src/components/feed/feed-item.test.tsx src/components/profile/xp-guide-sheet.tsx src/components/profile/xp-guide-sheet.test.tsx src/lib/challenge.ts src/lib/challenge.test.ts
git commit -m "refactor: 사용자 화면의 인터벌 명칭 통일"
```

### Task 9: 개발 서버 직접 조작과 전체 검사

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/HANDOFF-2026-08-12-official-program-design.md`

- [ ] **Step 1: 개발 서버 실행**

Run: `pnpm dev`

브라우저 조작 수단이 없으면 배포로 넘어가지 않고 사용자에게 아래 표를 전달해 결과를
기다린다.

- [ ] **Step 2: 실제 화면 확인**

| # | 조작 | 확인할 실물 |
|---|---|---|
| 1 | `/record` → 운동 추가 | 프로그램과 검색 카드가 첫 화면에 함께 보임 |
| 2 | 운동 직접 고르기 | 검색창 focus, 상황별/부위별 추천, 자주 한 운동 표시 |
| 3 | 프로그램으로 시작 | 어깨 1개 전폭 + 나머지 4개 2×2, 이미지 5장 |
| 4 | 각 프로그램 선택 | 카피·기간·회당 시간·A회차 미리보기 정확 |
| 5 | 시작일 → 월수금 19시 | 6주 18회 표, 날짜·시간 정확 |
| 6 | 기존 계획과 충돌 | 원본 유지와 대체 일정 표시 |
| 7 | 저장 | 정확히 18개, 중복 0, 완료 화면의 다음 운동 |
| 8 | 인터벌 진입 | 새 명칭, 4/8/16분, 기존 음원·자동 기록 정상 |
| 9 | 360/390/430px | 가로 잘림·하단 버튼 가림·텍스트 겹침 0 |
| 10 | 이미지 실패 | 카드 제목·설명·버튼 유지 |

- [ ] **Step 3: 개발 서버 종료 후 최종 검사**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: lint/typecheck 오류 0, 전체 테스트 실패 0, build 성공, diff-check 출력 0줄.

- [ ] **Step 4: 기록 갱신**

PROGRESS와 인수인계서에 관련·전체 테스트 실제 건수, 10개 화면 확인 결과, 0066 적용
여부, 운영 배포 안 함, 다음 할 일 `달력 진행 표시와 재배치`를 기록한다.

- [ ] **Step 5: 문서 커밋**

```powershell
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-12-official-program-design.md
git commit -m "docs: 추천 프로그램과 검색 UI 검증 기록"
```

이후 `2026-08-12-official-program-scheduling.md` Task 7~8을 실행한다. 개발 서버 실물과
전체 검사가 끝나도 운영 배포는 사용자 별도 승인 전까지 하지 않는다.
