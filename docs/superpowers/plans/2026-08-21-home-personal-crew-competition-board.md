# Home Personal and Crew Competition Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 최상단에서 내 오늘 상태와 최근 운동한 크루 2명의 상태를 동시에 비교하고, 운동·프로필 확인·콕 찌르기로 바로 행동할 수 있게 한다.

**Architecture:** 기존 홈 조회를 재사용하고 DB·RPC는 바꾸지 않는다. 순수 표시 규칙은 새 `home-competition.ts`에 두고, `PersonalTodayCard`가 내 전체 기록을 표시하며, 기존 `FriendBoardCard`는 내 행·누적 지표·배지 미리보기를 제거한 `오늘의 크루` 카드로 축소한다. 크루 카드가 계산한 완료/전체 요약만 콜백으로 홈에 올려 중복 조회 없이 내 카드 비교 문구에 사용한다.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind CSS v4, Vitest, Testing Library, Supabase 기존 브라우저 클라이언트

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/domain/home-competition.ts` | 내 오늘 상태, 완료 칭찬/CTA, 크루 완료 요약, 비교 문구의 순수 규칙 |
| `src/lib/domain/home-competition.test.ts` | 위 규칙의 상태 전이와 중복 없는 문구를 고정 |
| `src/lib/domain/friend-board.ts` | 접힌 크루 수를 2명으로 변경하고 기존 최근 완료 운동순 정렬 유지 |
| `src/lib/domain/friend-board.test.ts` | 최근 완료 운동순·2명 미리보기·닉네임 동률 정렬 회귀 방지 |
| `src/components/home/personal-today-card.tsx` | 내 프로필·레벨·이번 주·스트릭·비교 문구·상태별 행동 영역 표시 |
| `src/components/home/personal-today-card.test.tsx` | 로딩, 목표 없음, 운동 전/중/완료, 프로필 링크, 중복 지표 부재 검증 |
| `src/components/home/friend-board-card.tsx` | 크루 2행, 프로필 열기, 항상 보이는 콕, 비활성 이유, 전체 보기 |
| `src/components/home/friend-board-card.test.tsx` | 압축 행과 콕·프로필·빈 상태·실패 상태 회귀 검증 |
| `src/components/home/home-client.tsx` | 새 상단 순서 연결, 기존 챌린지·초대·진행 중 카드 보존 |
| `src/components/home/home-client.order.test.ts` | 렌더 순서와 옛 중복 카드 부재를 소스 수준에서 고정 |
| `PROGRESS.md` | 실제 구현 커밋·검증 수치·배포 여부를 작업 마지막에 기록 |
| `docs/superpowers/HANDOFF-2026-08-21-home-personal-crew-competition-board.md` | 다음 세션이 재개할 현재 상태와 남은 한 가지 |

## Task 1: Pure competition rules and two-person preview

**Files:**
- Create: `src/lib/domain/home-competition.ts`
- Create: `src/lib/domain/home-competition.test.ts`
- Modify: `src/lib/domain/friend-board.ts:18-19,252-278`
- Modify: `src/lib/domain/friend-board.test.ts:315-335`

- [ ] **Step 1: Write the failing competition-rule tests**

```ts
import { describe, expect, it } from "vitest";
import {
  crewTodaySummary,
  personalComparisonText,
  personalTodayAction,
  resolvePersonalTodayStatus,
} from "./home-competition";

describe("home competition rules", () => {
  it("완료가 운동 중보다 우선한다", () => {
    expect(resolvePersonalTodayStatus(true, true)).toBe("done");
    expect(resolvePersonalTodayStatus(false, true)).toBe("active");
    expect(resolvePersonalTodayStatus(false, false)).toBe("idle");
  });

  it("크루 완료 인원은 크루 행만 센다", () => {
    expect(
      crewTodaySummary([
        { status: "done" },
        { status: "active" },
        { status: "idle" },
      ]),
    ).toEqual({ total: 3, done: 1 });
  });

  it("비교 문구는 완료 요약을 한 번만 말하고 내 상태를 붙인다", () => {
    const summary = { total: 2, done: 1 };
    expect(personalComparisonText(summary, "idle")).toBe(
      "크루 2명 중 1명 완료 · 나는 아직",
    );
    expect(personalComparisonText(summary, "active")).toBe(
      "크루 2명 중 1명 완료 · 나는 운동 중",
    );
    expect(personalComparisonText(summary, "done")).toBe(
      "크루 2명 중 1명 완료 · 나도 완료",
    );
  });

  it("운동 완료 뒤에는 링크가 아니라 칭찬 배너다", () => {
    expect(personalTodayAction("idle", 160)).toEqual({
      kind: "link",
      label: "오늘 운동하고 +160 XP",
    });
    expect(personalTodayAction("active", 160)).toEqual({
      kind: "link",
      label: "운동 이어가기",
    });
    expect(personalTodayAction("done", 160)).toEqual({
      kind: "success",
      label: "오늘 운동 완료! 오늘도 해냈어요 🔥",
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify the expected failure**

Run:

```powershell
pnpm vitest run src/lib/domain/home-competition.test.ts
```

Expected: FAIL because `./home-competition` does not exist.

- [ ] **Step 3: Add the minimal pure implementation**

```ts
import type { FriendStatus } from "./friend-board";

export type CrewTodaySummary = { total: number; done: number };

export type PersonalTodayAction =
  | { kind: "link"; label: string }
  | { kind: "success"; label: string };

export function resolvePersonalTodayStatus(
  workedOutToday: boolean,
  isActive: boolean,
): FriendStatus {
  if (workedOutToday) return "done";
  return isActive ? "active" : "idle";
}

export function crewTodaySummary(
  rows: ReadonlyArray<{ status: FriendStatus }>,
): CrewTodaySummary {
  return {
    total: rows.length,
    done: rows.filter((row) => row.status === "done").length,
  };
}

export function personalComparisonText(
  summary: CrewTodaySummary | null,
  status: FriendStatus,
): string {
  if (summary === null) return "크루 현황을 불러오는 중…";
  if (summary.total === 0) return "아직 크루가 없어요";
  const mine =
    status === "done" ? "나도 완료" : status === "active" ? "나는 운동 중" : "나는 아직";
  return `크루 ${summary.total}명 중 ${summary.done}명 완료 · ${mine}`;
}

export function personalTodayAction(
  status: FriendStatus,
  maxWorkoutXp: number,
): PersonalTodayAction {
  if (status === "done") {
    return { kind: "success", label: "오늘 운동 완료! 오늘도 해냈어요 🔥" };
  }
  if (status === "active") {
    return { kind: "link", label: "운동 이어가기" };
  }
  return { kind: "link", label: `오늘 운동하고 +${maxWorkoutXp} XP` };
}
```

- [ ] **Step 4: Change the preview constant to two and strengthen sorting tests**

Change:

```ts
export const FRIEND_PREVIEW_COUNT = 2;
```

Add or update tests so they assert:

```ts
expect(visibleFriendRows(many(7), false)).toHaveLength(2);
expect(canExpandFriendRows(many(2))).toBe(false);
expect(canExpandFriendRows(many(3))).toBe(true);
expect(sortFriendRows(rows).map((row) => row.nickname)).toEqual([
  "가장최근",
  "그다음",
  "기록없음",
]);
```

Use fixed `lastWorkoutAt` values in the test. Add a separate tie test whose two rows have the same timestamp and expect Korean nickname order.

- [ ] **Step 5: Run the focused domain tests**

Run:

```powershell
pnpm vitest run src/lib/domain/home-competition.test.ts src/lib/domain/friend-board.test.ts
```

Expected: both files PASS, including two-person preview and recent-completion sorting.

- [ ] **Step 6: Commit the pure rules**

```powershell
git add -- src/lib/domain/home-competition.ts src/lib/domain/home-competition.test.ts src/lib/domain/friend-board.ts src/lib/domain/friend-board.test.ts
git commit -m "feat: 홈 경쟁 보드 표시 규칙 추가"
```

## Task 2: Personal today card

**Files:**
- Create: `src/components/home/personal-today-card.tsx`
- Create: `src/components/home/personal-today-card.test.tsx`
- Reuse: `src/components/avatar.tsx`, `src/lib/domain/avatar-source.ts`, `src/lib/domain/streak.ts`, `src/lib/domain/viewing-pass.ts`

- [ ] **Step 1: Write failing component tests for all three states**

Create fixtures with a fixed `now` and a minimal `ProgressSummary`. Tests must assert:

```tsx
render(
  <PersonalTodayCard
    profile={{ nickname: "dev-테스터A", avatarUrl: null }}
    summary={summary}
    completedAts={[new Date("2026-08-20T03:00:00Z")]}
    weeklyGoal={5}
    status="idle"
    crewSummary={{ total: 2, done: 1 }}
    now={new Date("2026-08-21T03:00:00Z")}
  />,
);

expect(screen.getByText("나의 오늘")).toBeTruthy();
expect(screen.getByText("이번 주")).toBeTruthy();
expect(screen.getByText("1 / 5")).toBeTruthy();
expect(screen.getByText("크루 2명 중 1명 완료 · 나는 아직")).toBeTruthy();
expect(screen.getByRole("link", { name: "오늘 운동하고 +160 XP" })).toBeTruthy();
expect(screen.queryByText("배지")).toBeNull();
expect(screen.queryByText("목표 달성률")).toBeNull();
```

Add tests for:

```tsx
expect(screen.getByRole("link", { name: "운동 이어가기" })).toBeTruthy();
expect(screen.getByRole("status").textContent).toContain(
  "오늘 운동 완료! 오늘도 해냈어요 🔥",
);
expect(screen.queryByRole("link", { name: /오늘 운동 완료/ })).toBeNull();
expect(
  screen.getByRole("link", { name: /dev-테스터A 프로필/ }).getAttribute("href"),
).toBe("/profile");
```

For `weeklyGoal={null}`, assert `목표 정하기 ›` links to `/challenge` and no `0%` appears.

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm vitest run src/components/home/personal-today-card.test.tsx
```

Expected: FAIL because `PersonalTodayCard` does not exist.

- [ ] **Step 3: Implement the card with two compact metrics**

The component interface is:

```ts
export type PersonalTodayCardProps = {
  profile: { nickname: string; avatarUrl: string | null };
  summary: ProgressSummary;
  completedAts: Date[];
  weeklyGoal: number | null;
  status: FriendStatus;
  crewSummary: CrewTodaySummary | null;
  now: Date;
};
```

Use `weekWorkoutDays(completedAts, now, DEFAULT_TIMEZONE)` and
`currentStreak(workoutDayKeys(completedAts, DEFAULT_TIMEZONE), dayKey(now, DEFAULT_TIMEZONE))`.
Render only the two metric cells:

```tsx
<div className="mt-3 grid grid-cols-2 gap-2">
  {weeklyGoal && weeklyGoal > 0 ? (
    <Metric label="이번 주" value={`${days.length} / ${weeklyGoal}`} />
  ) : (
    <Link href="/challenge" className={METRIC_CLASS}>
      <strong>{days.length}일</strong>
      <span>목표 정하기 ›</span>
    </Link>
  )}
  <Metric label="연속" value={`${streak}일`} />
</div>
```

Render the single comparison line once:

```tsx
<p className="mt-3 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
  {personalComparisonText(crewSummary, status)}
</p>
```

Render the action as a link only for `kind === "link"`; otherwise render a non-clickable status:

```tsx
{action.kind === "link" ? (
  <Link href="/record" className="mt-3 flex h-12 items-center justify-center rounded-card bg-accent font-extrabold text-accent-ink">
    {action.label}
  </Link>
) : (
  <div role="status" className="mt-3 flex h-12 items-center justify-center rounded-card border border-accent/40 bg-accent-weak font-extrabold text-accent">
    {action.label}
  </div>
)}
```

Use `isPhotoAvatar` + `Avatar` for uploaded photos and `summary.characterPath` + `Image` otherwise. The avatar/name/level block is a `/profile` link; the action remains its sibling, never a nested link.

- [ ] **Step 4: Run the card tests**

```powershell
pnpm vitest run src/components/home/personal-today-card.test.tsx
```

Expected: PASS for idle, active, done, goal-null, photo/character, and profile-link cases.

- [ ] **Step 5: Commit the personal card**

```powershell
git add -- src/components/home/personal-today-card.tsx src/components/home/personal-today-card.test.tsx
git commit -m "feat: 홈 나의 오늘 카드 추가"
```

## Task 3: Compact crew card while preserving poke and profile details

**Files:**
- Modify: `src/components/home/friend-board-card.tsx:1-686`
- Modify: `src/components/home/friend-board-card.test.tsx:1-735`

- [ ] **Step 1: Rewrite failing display tests before production markup**

Update `renderBody` so `myRow` and `cta` are no longer props. Replace the old "기본 3명" tests with:

```tsx
it("접힌 상태에서는 최근 운동한 크루 2명만 보인다", () => {
  renderBody(rowsOf(FOUR));
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("전체 크루 보기 ›")).toBeTruthy();
});

it("내 행과 홈 CTA를 크루 카드 안에 그리지 않는다", () => {
  renderBody(rowsOf([{ id: "u1", nickname: "친구하나" }]));
  expect(screen.queryByText("나")).toBeNull();
  expect(screen.queryByText("운동 시작하기")).toBeNull();
});

it("누적 운동·시간·배지 대신 오늘·이번 주·연속만 표시한다", () => {
  renderBody(rowsOf([{ id: "u1", nickname: "친구하나" }]));
  expect(screen.getByText("오늘")).toBeTruthy();
  expect(screen.getByText("이번 주")).toBeTruthy();
  expect(screen.getByText("연속")).toBeTruthy();
  expect(screen.queryByText("배지")).toBeNull();
  expect(screen.queryByText("시간")).toBeNull();
});
```

Keep and adapt the existing tests that verify:

- profile button and poke button are siblings;
- clicking the profile area calls `onSelect`;
- clicking poke calls only `onPoke`;
- idle, active, and done friends all retain a poke button;
- `✅ 찌름` replaces the button after poke;
- `MemberProfileSheet` opens and still owns cumulative achievements, history, and badges.

Add the disabled explanation assertions:

```tsx
renderBody(rows, { iWorkedOut: false });
expect(screen.getByText("오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉")).toBeTruthy();
expect(
  (screen.getByLabelText("친구하나 찌르기") as HTMLButtonElement).disabled,
).toBe(true);

cleanup();
renderBody(rows, { iWorkedOut: true });
expect(screen.queryByText("오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉")).toBeNull();
expect(
  (screen.getByLabelText("친구하나 찌르기") as HTMLButtonElement).disabled,
).toBe(false);
```

- [ ] **Step 2: Run the focused test and confirm the old component fails**

```powershell
pnpm vitest run src/components/home/friend-board-card.test.tsx
```

Expected: FAIL because the old card still renders my row, three preview rows, CTA, cumulative metrics, and badge preview.

- [ ] **Step 3: Simplify the row markup**

Remove `StatChip`, badge preview markup, `myRow`, and `cta`. Keep the profile button and poke button as siblings. The metric area becomes:

```tsx
<div className="mt-1.5 grid grid-cols-[1fr_auto_auto] items-center gap-2">
  <span className={`justify-self-start rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_STYLE[row.status].className}`}>
    {STATUS_STYLE[row.status].label}
  </span>
  <span className="text-[11px] text-muted">
    이번 주 <b className="text-text">{row.weekDays}일</b>
  </span>
  <span className="text-[11px] text-muted">
    연속 <b className="text-text">{row.streak}일</b>
  </span>
</div>
```

Keep the poke branch unchanged in behavior:

```tsx
{poked.has(row.userId) ? (
  <span aria-label={`${row.nickname} 찌름 완료`}>✅ 찌름</span>
) : (
  <button
    type="button"
    onClick={() => onPoke(row)}
    disabled={!iWorkedOut || pokingId === row.userId}
    aria-label={`${row.nickname} 찌르기`}
  >
    👉 콕
  </button>
)}
```

Use compact padding and line height so the real browser row can meet the 84px target without shrinking either interactive target below 44px.

- [ ] **Step 4: Remove the unnecessary badge fetch**

Delete the `getFriendBadges` import, `badges` state, and per-person badge request. Build rows with an empty badge map because the compact home rows no longer render badge data:

```ts
const rows = useMemo(
  () =>
    base
      ? buildFriendRows({
          crew: base.crew,
          activity: base.activity,
          badges: new Map(),
          activeUserIds,
        })
      : [],
  [base, activeUserIds],
);
```

Do not change `MemberProfileSheet`: it fetches its own complete badge/history/cumulative profile through `get_crew_member_profile`, so detailed data remains available after a row click.

- [ ] **Step 5: Add a summary callback without duplicating queries**

Add this prop to `FriendBoardCard`:

```ts
onSummaryChange: (summary: CrewTodaySummary | null) => void;
```

Report `null` while loading/failed and the computed summary when ready:

```ts
useEffect(() => {
  onSummaryChange(ready && !failed ? crewTodaySummary(rows) : null);
}, [failed, onSummaryChange, ready, rows]);
```

The card header is only `오늘의 크루`; do not render a second `1 / 2명 완료` chip. Show the disabled explanation line only when `!iWorkedOut && rows.length > 0`.

- [ ] **Step 6: Run crew-card and domain tests**

```powershell
pnpm vitest run src/components/home/friend-board-card.test.tsx src/lib/domain/friend-board.test.ts src/lib/domain/home-competition.test.ts
```

Expected: PASS. Existing profile-sheet and poke-error tests remain green.

- [ ] **Step 7: Commit the compact crew card**

```powershell
git add -- src/components/home/friend-board-card.tsx src/components/home/friend-board-card.test.tsx
git commit -m "feat: 홈 크루 카드를 오늘 상태 중심으로 압축"
```

## Task 4: Wire the two-card competition area into HomeClient

**Files:**
- Modify: `src/components/home/home-client.tsx:1-289`
- Create: `src/components/home/home-client.order.test.ts`

- [ ] **Step 1: Write the failing source-order regression test**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("홈 상단 경쟁 보드 순서", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/components/home/home-client.tsx"),
    "utf8",
  );

  it("내 카드 다음에 크루 카드, 그 아래 기존 홈 카드가 온다", () => {
    const me = src.indexOf("<PersonalTodayCard");
    const crew = src.indexOf("<FriendBoardCard");
    const active = src.indexOf("<ActiveWorkoutCards");
    const challenge = src.indexOf("<ChallengeSummaryCard");
    const push = src.indexOf("<PushEnableCard");
    const invite = src.indexOf("<CrewCard");

    for (const index of [me, crew, active, challenge, push, invite]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(me).toBeLessThan(crew);
    expect(crew).toBeLessThan(active);
    expect(active).toBeLessThan(challenge);
    expect(challenge).toBeLessThan(push);
    expect(push).toBeLessThan(invite);
  });

  it("옛 중복 홈 카드와 헤더 스트릭을 렌더하지 않는다", () => {
    expect(src).not.toContain("<HeaderStreak");
    expect(src).not.toContain("<CharacterCard");
    expect(src).not.toContain("<StreakCard");
    expect(src).not.toContain("<WeeklyStats");
  });
});
```

- [ ] **Step 2: Run the order test and verify it fails**

```powershell
pnpm vitest run src/components/home/home-client.order.test.ts
```

Expected: FAIL because `PersonalTodayCard` is not wired and old cards are still rendered.

- [ ] **Step 3: Add stable summary and status state**

Add:

```ts
const [crewSummary, setCrewSummary] = useState<CrewTodaySummary | null>(null);
const [dateRef] = useState(() => new Date());

const myTodayStatus = useMemo(
  () =>
    resolvePersonalTodayStatus(
      completedAts
        ? workedOutToday(completedAts, dateRef, DEFAULT_TIMEZONE)
        : false,
      userId ? activeUserIds.has(userId) : false,
    ),
  [activeUserIds, completedAts, dateRef, userId],
);
```

Use `useCallback` so the child summary effect does not loop:

```ts
const handleCrewSummary = useCallback((next: CrewTodaySummary | null) => {
  setCrewSummary((prev) =>
    prev?.total === next?.total && prev?.done === next?.done ? prev : next,
  );
}, []);
```

- [ ] **Step 4: Replace only the top display block**

After the header render:

```tsx
{myName && summary && completedAts && (
  <PersonalTodayCard
    profile={myName}
    summary={summary}
    completedAts={completedAts}
    weeklyGoal={weeklyGoal}
    status={myTodayStatus}
    crewSummary={crewSummary}
    now={dateRef}
  />
)}

<FriendBoardCard
  activeUserIds={activeUserIds}
  iWorkedOut={myTodayStatus === "done"}
  onSummaryChange={handleCrewSummary}
/>
```

Remove the rendered `HeaderStreak`, `CharacterCard`, `StreakCard`, and `WeeklyStats` plus unused imports. Do **not** remove or reorder `ActiveWorkoutCards`, `ChallengeSummaryCard`, `PushEnableCard`, `CrewCard`, `AuthStatus`, notification bell, or bottom navigation.

If personal data is still loading, render a compact `PersonalTodayCardSkeleton` from the new card file rather than leaving the first position empty. The skeleton must keep the `/record` action visible as `운동 시작하기`.

- [ ] **Step 5: Run component and order tests**

```powershell
pnpm vitest run src/components/home/personal-today-card.test.tsx src/components/home/friend-board-card.test.tsx src/components/home/home-client.order.test.ts
```

Expected: PASS with the new order and no duplicate home widgets.

- [ ] **Step 6: Commit the home wiring**

```powershell
git add -- src/components/home/home-client.tsx src/components/home/home-client.order.test.ts
git commit -m "feat: 홈 상단에 내 상태와 크루 비교 보드 연결"
```

## Task 5: Focused regression and code review

**Files:**
- Review: all files changed in Tasks 1-4
- Modify only if a focused test reveals a defect

- [ ] **Step 1: Run every directly related test once**

```powershell
pnpm vitest run src/lib/domain/home-competition.test.ts src/lib/domain/friend-board.test.ts src/components/home/personal-today-card.test.tsx src/components/home/friend-board-card.test.tsx src/components/home/home-client.order.test.ts src/components/crew/member-profile-sheet.test.tsx
```

Expected: all listed test files PASS, zero failed tests.

- [ ] **Step 2: Review the diff against the spec**

Run:

```powershell
git diff main...HEAD -- src/lib/domain/home-competition.ts src/lib/domain/friend-board.ts src/components/home/personal-today-card.tsx src/components/home/friend-board-card.tsx src/components/home/home-client.tsx
```

Confirm all of these directly in the diff:

- no DB/RPC/migration change;
- no second completion summary chip;
- no personal badge tile;
- no cumulative workout/time/badge preview in crew rows;
- poke and profile controls are siblings;
- `MemberProfileSheet` is still mounted;
- existing challenge, invite, push, active-workout, auth components remain;
- no `git add .` was used.

- [ ] **Step 3: Commit any review-only correction**

Only if Step 2 found a defect:

```powershell
git add -- src/lib/domain/home-competition.ts src/lib/domain/home-competition.test.ts src/lib/domain/friend-board.ts src/lib/domain/friend-board.test.ts src/components/home/personal-today-card.tsx src/components/home/personal-today-card.test.tsx src/components/home/friend-board-card.tsx src/components/home/friend-board-card.test.tsx src/components/home/home-client.tsx src/components/home/home-client.order.test.ts
git commit -m "fix: 홈 경쟁 보드 회귀 보완"
```

If no defect exists, record `review: no correction needed` in the execution notes and do not create an empty commit.

## Task 6: Development-server visual verification with two accounts

**Files:**
- No source edits unless visual verification finds a defect
- Fixture state is external and must be treated as production-connected

- [ ] **Step 1: Check fixture state without mutation**

```powershell
node scripts/dev-fixture.mjs status
```

Expected: dev-테스터A and dev-테스터B exist, are crew-linked, and share the required group. If missing, stop and obtain the required approval before running the mutating `create` or `challenge` commands because `.env.local` points to production Supabase.

- [ ] **Step 2: Start the development server**

From `C:\Users\SAMSUNG\workout-app` or the execution worktree:

```powershell
pnpm dev
```

Expected: Next reports a localhost URL. Keep this process running; do not run `pnpm build` simultaneously.

- [ ] **Step 3: Verify account A before workout at 375×812 and 390×844**

Use isolated cookie stores: Chrome/profile A for dev-테스터A and Edge/profile B for dev-테스터B. Confirm the login email in settings before assertions.

For A, verify:

1. `나의 오늘` appears above `오늘의 크루`.
2. Personal card is at most 330px high.
3. Each visible crew row is at most 84px high.
4. Two most recently completed crew members are visible; the third is behind `전체 크루 보기 ›`.
5. `크루 N명 중 M명 완료` appears only once.
6. Badge tile, weekly percentage, cumulative workout count, cumulative time, separate growth/streak/weekly cards are absent from home.
7. `👉 콕` is visible but disabled and the reason line is visible.
8. Challenge summary, active workout cards when applicable, push card, `친구 초대하기`, auth status, and bottom tabs remain.
9. Browser console has zero errors.

- [ ] **Step 4: Verify profile detail and poke separation**

Click B's avatar/name area, not the poke button. Verify the sheet shows:

- level and cumulative XP;
- cumulative workout count, workout days, time, and distance when present;
- joined/level-up/badge history;
- owned badges.

Close the sheet and confirm scroll position is preserved. Click disabled `콕` and confirm it does not open the profile or send a notification.

- [ ] **Step 5: Verify the social transition with both accounts**

Use an existing completed-today state if available. Do not create or delete real workout data merely to satisfy this check. If A is already complete today:

1. A sees the non-clickable `오늘 운동 완료! 오늘도 해냈어요 🔥` banner.
2. A's poke buttons are gold and enabled.
3. A pokes B once.
4. A sees `✅ 찌름`.
5. B sees the notification-bell badge and the correct notification text.

If A is not complete today, verify the idle state and ask the user to perform the real workout-completion transition rather than fabricating production workout data. Record the completed-state flow as unverified until the user confirms it.

- [ ] **Step 6: Stop the dev server before build**

In the terminal running Next, press `Ctrl+C`.

Expected: the dev process exits and no process is listening on its port.

## Task 7: Full local gates and documentation

**Files:**
- Modify: `PROGRESS.md`
- Create: `docs/superpowers/HANDOFF-2026-08-21-home-personal-crew-competition-board.md`

- [ ] **Step 1: Run final project gates exactly once after visual verification**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- lint: exit 0;
- typecheck: exit 0;
- test: all files and assertions pass, zero failed;
- build: exit 0 and route generation completes.

Do not run production-connected regression scripts because this change has no DB/RPC/RLS behavior. The existing unit/component tests plus two-account UI flow are the proportionate checks.

- [ ] **Step 2: Update progress and handoff once**

Record:

- implementation commit SHAs;
- exact test file/assertion counts from `pnpm test`;
- lint/typecheck/build results;
- development-server URL and viewport measurements;
- A/B profile and poke results;
- DB/migration: none;
- deployment: not performed;
- any user-device item still unverified;
- next action: user reviews the development server and decides whether to approve production deployment.

- [ ] **Step 3: Verify documentation and stage exact files**

```powershell
git diff --check
git status --short
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-21-home-personal-crew-competition-board.md
git diff --cached --check
```

Expected: only the two verified documentation files are staged; unrelated user files remain unstaged.

- [ ] **Step 4: Commit documentation**

```powershell
git commit -m "docs: 홈 경쟁 보드 구현과 검증 기록"
```

- [ ] **Step 5: Final branch review**

```powershell
git status --short
git log --oneline --decorate -8
```

Expected: implementation files are committed, unrelated pre-existing files remain untouched, and no production deployment has occurred.

## Explicit stop gate

Do not merge to `main`, run `vercel --prod`, send release notifications, or change production data as part of this plan. After development-server verification and full local gates, report the evidence and request the user's separate production-deployment approval.
