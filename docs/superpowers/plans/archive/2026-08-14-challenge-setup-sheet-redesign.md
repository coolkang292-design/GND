# 챌린지 세팅 시트 개편 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** `새 챌린지 만들기` 시트를 달성률 세팅(① 내 운동 목표)과 참여율 세팅(② 참여 계획)으로 갈라, 한 화면에 있던 두 개의 `주 N일`이 서로 안 헷갈리게 만든다.

**Architecture:** 총 목표↔하루 기준 환산을 순수 함수(`lib/domain/challenge-goal-calc.ts`)로 뽑아 TDD로 먼저 고정한다. 600줄짜리 `setup-sheet.tsx`에서 목표 카드를 `goal-card.tsx`로, 숫자 입력을 `number-field.tsx`로 분리해 시트는 3섹션 배치만 담당한다. **점수 로직·DB·저장 경로는 한 줄도 안 바뀐다** — `SetupSubmit` 모양이 그대로라 호출부(`challenge/page.tsx`)를 안 건드린다.

**Tech Stack:** Next 16 · React 19 · TypeScript · Tailwind v4 · vitest + @testing-library/react (jsdom)

**설계 문서:** [docs/superpowers/specs/2026-08-14-challenge-setup-sheet-redesign-design.md](../specs/2026-08-14-challenge-setup-sheet-redesign-design.md)

---

## ⚠️ 커밋 규칙 — 이 계획에는 중간 커밋이 없다

사용자 지시(2026-07-17 이후 상설): **기능 완성 → lint/typecheck/test/build → 사용자가 dev 서버에서 직접 눌러 확인 → 그다음 커밋.**

Task 1~7은 커밋하지 않는다. Task 8에서 전체 검증을 돌리고 사용자 확인을 받은 뒤 Task 9에서 한 번 커밋한다. 이 순서를 바꾸지 마라.

---

## 실행 중 사용자 지시로 바뀐 것 (2026-08-14, 개발 서버 확인 중)

계획대로 Task 1~7을 끝낸 뒤 화면을 보며 받은 지시다. **설계 문서 §4.2·§4.4·§4.5에
반영했다** — 계획서와 설계서가 갈리지 않게 여기에도 남긴다.

| 지시 | 반영 |
|---|---|
| *"하루 기준으로 설정하고 자동 계산이 되어서 설정 요약에 표시되게"* | 계산기 **기본 펼침**(`useState(true)`), 요약 각 줄에 `하루 25회 × 주 3일` 추가 |
| *"챌린지 만들기 버튼도 좀 키워주고"* | `h-12 text-sm` → `h-14 text-[17px]` |
| *"챌린지 추가하기 버튼과 동일한 디자인으로"* | 금색 채움 → 테두리형 (`border-accent/40` + `bg-accent-weak` + `text-accent`) |
| (실측으로 발견) | **`shrink-0` 추가** — 없으면 시트 flex 축소에 눌려 `h-14`가 26px이 된다 |

이에 맞춰 `goal-card.test.tsx`의 `기본은 접혀 있어…` → `기본은 펼쳐져 있다`로 뒤집었고,
`setup-sheet.test.tsx`에 `요약이 하루 기준을 같이 보여준다`를 추가했다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/domain/challenge-goal-calc.ts` **(신규)** | 총 목표 ↔ 하루 기준 ↔ 주 N일 환산. 순수 함수만 |
| `src/lib/domain/challenge-goal-calc.test.ts` **(신규)** | 위 함수 TDD |
| `src/components/challenge/number-field.tsx` **(신규)** | 숫자 입력 한 칸. 타이핑 중 값이 튀지 않게 draft 문자열을 들고 있는다 |
| `src/components/challenge/goal-card.tsx` **(신규)** | 목표 카드 1장 — 카테고리·지표·기간 총 목표·접히는 계산기·일수형 qualifier |
| `src/components/challenge/goal-card.test.tsx` **(신규)** | 카드 단위 테스트 |
| `src/components/challenge/setup-sheet.tsx` **(수정)** | 헤더·①컨테이너·②참여 계획·③요약·CTA. 카드 내부 로직은 안 갖는다 |
| `src/components/challenge/setup-sheet.test.tsx` **(수정)** | 기존 2 describe 유지 + 두 축 분리 회귀선 추가 |

---

## Task 1: 환산 순수 함수

**Files:**
- Create: `src/lib/domain/challenge-goal-calc.ts`
- Test: `src/lib/domain/challenge-goal-calc.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/challenge-goal-calc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  perDayFromTotal,
  perWeekFromTotalDays,
  totalDaysFromPerWeek,
  totalFromPerDay,
} from "./challenge-goal-calc";

describe("totalFromPerDay — 하루 기준 → 기간 총량", () => {
  it("하루 30회 × 주 3일 × 28일(4주) = 360회", () => {
    expect(totalFromPerDay(30, 3, 28)).toBe(360);
  });

  it("소수 첫째 자리까지만 남긴다", () => {
    // 5km × 주 3일 × 25일 = 53.571… → 53.6
    expect(totalFromPerDay(5, 3, 25)).toBe(53.6);
  });

  it("하루 목표가 0이면 0", () => {
    expect(totalFromPerDay(0, 3, 28)).toBe(0);
  });

  it("주 며칠이 0이면 0 — 0으로 나눌 일을 애초에 안 만든다", () => {
    expect(totalFromPerDay(30, 0, 28)).toBe(0);
  });
});

describe("perDayFromTotal — 기간 총량 → 하루 기준", () => {
  it("360회 ÷ (주 3일 × 4주) = 30회", () => {
    expect(perDayFromTotal(360, 3, 28)).toBe(30);
  });

  it("totalFromPerDay의 역이다", () => {
    expect(perDayFromTotal(totalFromPerDay(30, 3, 28), 3, 28)).toBe(30);
  });

  it("총량이 0이면 0", () => {
    expect(perDayFromTotal(0, 3, 28)).toBe(0);
  });

  it("주 며칠이 0이면 0 (0 나눗셈 방지)", () => {
    expect(perDayFromTotal(360, 0, 28)).toBe(0);
  });

  it("기간이 0이면 0 (0 나눗셈 방지)", () => {
    expect(perDayFromTotal(360, 3, 0)).toBe(0);
  });
});

describe("totalDaysFromPerWeek — 일수형 목표: 주 N일 → 기간 총 운동일", () => {
  it("주 3일 × 28일 = 12일", () => {
    expect(totalDaysFromPerWeek(3, 28)).toBe(12);
  });

  it("반올림한다 — 주 5일 × 25일 = 17.86 → 18일", () => {
    expect(totalDaysFromPerWeek(5, 25)).toBe(18);
  });

  it("최소 1일 — 참여율 분모와 같은 규칙이라 0이 나오면 안 된다", () => {
    expect(totalDaysFromPerWeek(1, 1)).toBe(1);
  });
});

describe("perWeekFromTotalDays — 일수형 목표: 기간 총 운동일 → 주 N일", () => {
  it("12일 ÷ 4주 = 주 3일", () => {
    expect(perWeekFromTotalDays(12, 28)).toBe(3);
  });

  it("7일을 넘지 않는다", () => {
    expect(perWeekFromTotalDays(28, 28)).toBe(7);
  });

  it("1일 밑으로 안 내려간다", () => {
    expect(perWeekFromTotalDays(0, 28)).toBe(1);
  });

  it("기간이 0이면 1 (0 나눗셈 방지)", () => {
    expect(perWeekFromTotalDays(12, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: 실패하는지 확인한다**

```bash
npx vitest run src/lib/domain/challenge-goal-calc.test.ts
```

Expected: FAIL — `Failed to load url ./challenge-goal-calc`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/lib/domain/challenge-goal-calc.ts`:

```ts
/**
 * 챌린지 목표의 총량 ↔ 하루 기준 환산 (2026-08-14).
 *
 * ⚠️⚠️ **여기는 달성률(종합 80%) 쪽 계산이다.** 인자로 받는 `daysPerWeek`는
 * "이 종목을 주 며칠 할 것인가"이고, **참여율 분모가 아니다.** 참여율 분모는
 * `user_goals.planned_days` 하나뿐이고 `goal-score.ts`의
 * `plannedDaysForPeriod`가 환산한다. 두 값을 같은 것으로 다루면 참여율이
 * 조용히 틀린 값을 쓰게 된다 — 이 파일이 생긴 이유가 그 사고를 막는 것이다.
 * 설계 §2·§4.2 참조.
 */
import { plannedDaysForPeriod } from "./goal-score";

/** 소수 첫째 자리까지 */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 하루 목표 × 주 N일 × 주수 → 기간 총 목표 */
export function totalFromPerDay(
  perDay: number,
  daysPerWeek: number,
  periodDays: number,
): number {
  if (perDay <= 0 || daysPerWeek <= 0 || periodDays <= 0) return 0;
  return round1((perDay * daysPerWeek * periodDays) / 7);
}

/** 기간 총 목표 ÷ (주 N일 × 주수) → 하루 목표 */
export function perDayFromTotal(
  total: number,
  daysPerWeek: number,
  periodDays: number,
): number {
  if (total <= 0 || daysPerWeek <= 0 || periodDays <= 0) return 0;
  return round1((total * 7) / (daysPerWeek * periodDays));
}

/**
 * 일수형 목표(`weight_days`·`bodyweight_days`)의 주 N일 → 기간 총 운동일.
 *
 * ⚠️ 식이 `plannedDaysForPeriod`와 **같아서 그 함수에 위임한다.** 산술을 여기에
 * 다시 적으면 한쪽만 고쳐지는 날이 온다. 뜻은 다르다(이건 달성률 목표값,
 * 저건 참여율 분모) — 그래서 이름은 따로 둔다.
 */
export function totalDaysFromPerWeek(
  daysPerWeek: number,
  periodDays: number,
): number {
  return plannedDaysForPeriod(daysPerWeek, periodDays);
}

/** 기간 총 운동일 → 주 N일 (1~7로 자른다) */
export function perWeekFromTotalDays(
  totalDays: number,
  periodDays: number,
): number {
  if (periodDays <= 0) return 1;
  return Math.min(7, Math.max(1, Math.round((totalDays * 7) / periodDays)));
}
```

- [ ] **Step 4: 통과하는지 확인한다**

```bash
npx vitest run src/lib/domain/challenge-goal-calc.test.ts
```

Expected: PASS — 16 tests

---

## Task 2: 숫자 입력 한 칸 (`NumberField`)

지금 카드의 숫자 입력은 `defaultValue` + `key`로 되어 있다. 계산기가 생기면 **다른 입력을 건드렸을 때 이 칸의 글자가 따라 바뀌어야** 하는데 `defaultValue`로는 안 된다. 그렇다고 `value={String(n)}`로 두면 칸을 비우는 순간 `0`이 튀어나와 타이핑이 막힌다. 포커스 중에만 draft 문자열을 쓰는 방식으로 둘 다 푼다.

**Files:**
- Create: `src/components/challenge/number-field.tsx`
- Test: `src/components/challenge/goal-card.test.tsx` (Task 3에서 함께 검증한다 — 이 컴포넌트는 카드 밖에서 쓰이지 않는다)

- [ ] **Step 1: 구현을 쓴다**

`src/components/challenge/number-field.tsx`:

```tsx
"use client";

import { useState } from "react";

/**
 * 숫자 한 칸 — 타이핑 중에는 사용자가 친 글자를 그대로 보여 주고, 포커스를
 * 잃으면 부모가 들고 있는 값으로 되돌아온다.
 *
 * ⚠️ **`defaultValue`로 돌아가지 마라.** 목표 카드의 `기간 총 목표`는 계산기의
 * `하루 목표`·`주 며칠`을 건드릴 때 **따라 바뀌어야 한다.** 비제어 입력은 그
 * 갱신을 화면에 못 그린다(값은 바뀌었는데 칸에는 옛 숫자가 남는다).
 *
 * ⚠️ 그렇다고 `value={String(value)}`만 쓰면 칸을 지우는 순간 `0`이 들어와
 * 커서가 밀린다. 그래서 포커스 중에만 draft를 쓴다.
 */
export function NumberField({
  value,
  onValue,
  ariaLabel,
  className = "",
}: {
  value: number;
  onValue: (v: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onFocus={(e) => setDraft(e.target.value)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        onValue(Number.isFinite(v) ? v : 0);
      }}
      className={`h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-right font-mono text-sm font-bold ${className}`}
    />
  );
}
```

- [ ] **Step 2: 타입이 통과하는지 확인한다**

```bash
pnpm typecheck
```

Expected: 오류 없음 (아직 아무도 import하지 않는다)

---

## Task 3: 목표 카드 (`GoalCard`)

**Files:**
- Create: `src/components/challenge/goal-card.tsx`
- Test: `src/components/challenge/goal-card.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/challenge/goal-card.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalCard, type GoalRow } from "./goal-card";

afterEach(cleanup);

const WEIGHT_ROW: GoalRow = {
  category: "weight",
  type: "weight_reps",
  total: 300,
  calcDaysPerWeek: 3,
  qualifier: 0,
};

const DAYS_ROW: GoalRow = {
  category: "weight",
  type: "weight_days",
  total: 12,
  calcDaysPerWeek: 3,
  qualifier: 3,
};

function renderCard(row: GoalRow, onChange = vi.fn()) {
  render(
    <GoalCard
      index={0}
      row={row}
      periodDays={28}
      canRemove
      onChange={onChange}
      onRemove={vi.fn()}
    />,
  );
  return onChange;
}

describe("GoalCard — 기간 총 목표", () => {
  it("총 목표를 주인공 입력칸으로 보여준다", () => {
    renderCard(WEIGHT_ROW);
    const input = screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement;
    expect(input.value).toBe("300");
  });

  it("총 목표를 고치면 그 값이 그대로 올라간다", () => {
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.change(screen.getByLabelText("기간 총 목표 (회)"), {
      target: { value: "500" },
    });
    expect(onChange).toHaveBeenCalledWith({ total: 500 });
  });
});

describe("GoalCard — 접히는 계산기", () => {
  // ⚠️ 토글 버튼은 `getByText`로 잡히지 않는다. 안에 "▸"와 문구가 **별개 텍스트
  //    노드**라 textContent가 "▸ 하루 기준으로 계산하기"다. aria-label로 잡는다.
  const openCalc = () =>
    fireEvent.click(screen.getByLabelText("하루 기준으로 계산하기"));

  it("기본은 접혀 있어 '하루 목표' 칸이 없다", () => {
    renderCard(WEIGHT_ROW);
    expect(screen.queryByLabelText("하루 목표 (회)")).toBeNull();
  });

  it("'하루 기준으로 계산하기'를 누르면 펼쳐진다", () => {
    renderCard(WEIGHT_ROW);
    openCalc();
    expect(screen.getByLabelText("하루 목표 (회)")).toBeTruthy();
  });

  it("펼치면 하루 목표가 총 목표에서 역산돼 보인다 — 300 ÷ (주3일 × 4주) = 25", () => {
    renderCard(WEIGHT_ROW);
    openCalc();
    expect((screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value).toBe("25");
  });

  it("총 목표가 다른 값이면 역산도 따라 바뀐다 — 600 ÷ (주3일 × 4주) = 50", () => {
    renderCard({ ...WEIGHT_ROW, total: 600 });
    openCalc();
    expect((screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value).toBe("50");
  });

  it("하루 목표를 바꾸면 총 목표가 다시 계산된다 — 30 × 주3일 × 4주 = 360", () => {
    const onChange = renderCard(WEIGHT_ROW);
    openCalc();
    fireEvent.change(screen.getByLabelText("하루 목표 (회)"), {
      target: { value: "30" },
    });
    expect(onChange).toHaveBeenCalledWith({ total: 360 });
  });

  it("주 며칠을 올리면 총 목표가 다시 계산된다 — 25 × 주4일 × 4주 = 400", () => {
    const onChange = renderCard(WEIGHT_ROW);
    openCalc();
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));
    expect(onChange).toHaveBeenCalledWith({ calcDaysPerWeek: 4, total: 400 });
  });
});

describe("GoalCard — 일수형 목표", () => {
  const openCalc = () =>
    fireEvent.click(screen.getByLabelText("하루 기준으로 계산하기"));

  it("하루 목표 칸이 없다 — '주 며칠'만으로 총 일수가 정해진다", () => {
    renderCard(DAYS_ROW);
    openCalc();
    expect(screen.queryByLabelText("하루 목표 (일)")).toBeNull();
    expect(screen.getByLabelText("주 며칠 늘리기")).toBeTruthy();
  });

  it("주 며칠을 올리면 총 일수가 다시 계산된다 — 주4일 × 4주 = 16일", () => {
    const onChange = renderCard(DAYS_ROW);
    openCalc();
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));
    expect(onChange).toHaveBeenCalledWith({ calcDaysPerWeek: 4, total: 16 });
  });

  it("하루 최소 종목 수 스테퍼가 보인다 — 달성률 정의라 남는다", () => {
    renderCard(DAYS_ROW);
    expect(screen.getByText(/하루 최소 종목 수/)).toBeTruthy();
  });
});

describe("GoalCard — 카테고리·지표", () => {
  it("카테고리를 바꾸면 그 분류의 첫 지표와 기본 목표값으로 갈아탄다", () => {
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.click(screen.getByRole("button", { name: "유산소" }));
    expect(onChange).toHaveBeenCalledWith({
      category: "cardio",
      type: "cardio_distance",
      total: 20,
      qualifier: 0,
    });
  });
});
```

- [ ] **Step 2: 실패하는지 확인한다**

```bash
npx vitest run src/components/challenge/goal-card.test.tsx
```

Expected: FAIL — `Failed to load url ./goal-card`

- [ ] **Step 3: 구현을 쓴다**

`src/components/challenge/goal-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { NumberField } from "@/components/challenge/number-field";
import {
  perDayFromTotal,
  totalDaysFromPerWeek,
  totalFromPerDay,
} from "@/lib/domain/challenge-goal-calc";
import type { GoalType } from "@/lib/domain/goal-score";
import { GOAL_TYPE_META, goalLabel, type GoalCategory } from "@/lib/challenge";

const CATEGORIES: { key: GoalCategory; label: string }[] = [
  { key: "weight", label: "웨이트" },
  { key: "cardio", label: "유산소" },
  { key: "bodyweight", label: "맨몸" },
];

/** 카테고리별 선택 가능한 지표 (레거시 volume 제외) */
export const CATEGORY_TYPES: Record<GoalCategory, GoalType[]> = {
  weight: ["weight_reps", "weight_days"],
  cardio: ["cardio_distance", "cardio_time"],
  bodyweight: ["bodyweight_reps", "bodyweight_time", "bodyweight_days", "tabata_count"],
};

/** 지표 짧은 라벨 (카테고리 우선 UI용) */
const METRIC_LABEL: Record<GoalType, string> = {
  weight_reps: "횟수",
  weight_days: "운동일(종목)",
  cardio_distance: "거리",
  cardio_time: "시간",
  bodyweight_reps: "횟수",
  bodyweight_time: "시간",
  bodyweight_days: "운동일(종목)",
  tabata_count: "전신 인터벌",
  volume: "총볼륨",
};

const DAYS_TYPES: GoalType[] = ["weight_days", "bodyweight_days"];
export const isDaysType = (t: GoalType) => DAYS_TYPES.includes(t);

/**
 * 목표 카드 한 장 — **달성률(종합 80%) 재료만** 담는다.
 *
 * ⚠️⚠️ `calcDaysPerWeek`는 "이 종목을 주 며칠 할 것인가"이고 **참여율 분모가
 * 아니다.** 참여율은 시트의 `② 참여 계획` 하나에서만 온다. 2026-08-14 이전에는
 * 둘이 한 화면에 섞여 있어서 사람도 코드도 헷갈렸다(설계 §1).
 */
export type GoalRow = {
  category: GoalCategory;
  type: GoalType;
  /** 기간 총 목표 — 저장되는 값 */
  total: number;
  /** 계산기 전용. 저장되지 않는다 */
  calcDaysPerWeek: number;
  /** 일수형: 하루 최소 종목 수. 아니면 0 */
  qualifier: number;
};

export function GoalCard({
  index,
  row,
  periodDays,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  row: GoalRow;
  periodDays: number;
  canRemove: boolean;
  onChange: (patch: Partial<GoalRow>) => void;
  onRemove: () => void;
}) {
  const [calcOpen, setCalcOpen] = useState(false);
  const meta = GOAL_TYPE_META[row.type];
  const days = isDaysType(row.type);
  const weeks = periodDays / 7;
  const perDay = perDayFromTotal(row.total, row.calcDaysPerWeek, periodDays);

  const metricOptions = CATEGORY_TYPES[row.category].includes(row.type)
    ? CATEGORY_TYPES[row.category]
    : [...CATEGORY_TYPES[row.category], row.type];

  function changeDaysPerWeek(next: number) {
    const dpw = Math.min(7, Math.max(1, next));
    onChange({
      calcDaysPerWeek: dpw,
      total: days
        ? totalDaysFromPerWeek(dpw, periodDays)
        : totalFromPerDay(perDay, dpw, periodDays),
    });
  }

  return (
    <div className="mt-2 rounded-card-sm border border-line bg-surface p-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-bold text-muted">목표 {index + 1}</label>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`목표 ${index + 1} 삭제`}
          className="grid h-7 w-7 place-items-center rounded-card-sm border border-line bg-surface text-xs disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      {/* 카테고리 3버튼 — 시안의 아이콘 자산이 아직 없어 글자만 (설계 §8) */}
      <div className="mt-1 flex gap-1 rounded-card-sm border border-line bg-surface-2 p-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              const type = CATEGORY_TYPES[c.key][0];
              onChange({
                category: c.key,
                type,
                total: GOAL_TYPE_META[type].defaultTarget,
                qualifier: isDaysType(type) ? 3 : 0,
              });
            }}
            className={`h-9 flex-1 rounded-[8px] text-[12.5px] font-bold ${
              row.category === c.key ? "bg-accent-weak text-accent" : "text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <select
        value={row.type}
        aria-label={`목표 ${index + 1} 지표`}
        onChange={(e) => {
          const type = e.target.value as GoalType;
          onChange({
            type,
            total: GOAL_TYPE_META[type].defaultTarget,
            qualifier: isDaysType(type) ? row.qualifier || 3 : 0,
          });
        }}
        className="mt-2 h-11 w-full rounded-card-sm border border-line bg-surface px-2 text-sm font-bold"
      >
        {metricOptions.map((t) => (
          <option key={t} value={t}>
            {METRIC_LABEL[t]}
          </option>
        ))}
      </select>

      <label className="mt-2 block text-[12px] font-bold text-muted">
        기간 총 목표 ({meta.unit})
      </label>
      <NumberField
        ariaLabel={`기간 총 목표 (${meta.unit})`}
        value={row.total}
        onValue={(v) => onChange({ total: v })}
        className="mt-1"
      />
      <p className="mt-1 text-right text-[12px] font-bold text-accent">
        → 기간 목표{" "}
        <span className="font-mono">
          {row.total.toLocaleString()}
          {meta.unit}
        </span>
      </p>

      {/* 접히는 계산기 — 총 목표를 정하는 감이 필요할 때만 편다 (설계 §4.2) */}
      {/* ⚠️ `aria-label`을 지우지 마라. 화살표와 문구가 별개 텍스트 노드라
          `getByText("하루 기준으로 계산하기")`로는 안 잡힌다 — 테스트가 이걸로 연다 */}
      <button
        aria-label="하루 기준으로 계산하기"
        onClick={() => setCalcOpen((v) => !v)}
        className="mt-1.5 text-[12px] font-bold text-muted"
      >
        {calcOpen ? "▾" : "▸"} 하루 기준으로 계산하기
      </button>

      {calcOpen && (
        <div className="mt-1.5 rounded-card-sm border border-line bg-surface-2 p-2">
          <div className="flex items-end gap-2">
            {!days && (
              <div className="flex-1">
                <label className="text-[12px] font-bold text-muted">
                  하루 목표 ({meta.unit})
                </label>
                <NumberField
                  ariaLabel={`하루 목표 (${meta.unit})`}
                  value={perDay}
                  onValue={(v) =>
                    onChange({ total: totalFromPerDay(v, row.calcDaysPerWeek, periodDays) })
                  }
                  className="mt-1 bg-surface"
                />
              </div>
            )}
            <div className="flex-1">
              <label className="text-[12px] font-bold text-muted">주 며칠</label>
              <div className="mt-1 flex h-11 items-center justify-between rounded-card-sm border border-line bg-surface px-1.5">
                <button
                  aria-label="주 며칠 줄이기"
                  onClick={() => changeDaysPerWeek(row.calcDaysPerWeek - 1)}
                  className="h-8 w-8 rounded-full text-base font-bold"
                >
                  –
                </button>
                <span className="font-mono text-sm font-extrabold">
                  {row.calcDaysPerWeek}일
                </span>
                <button
                  aria-label="주 며칠 늘리기"
                  onClick={() => changeDaysPerWeek(row.calcDaysPerWeek + 1)}
                  className="h-8 w-8 rounded-full text-base font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {days
              ? `주 ${row.calcDaysPerWeek}일 × ${weeks.toFixed(1)}주 = ${row.total}일`
              : `${perDay}${meta.unit} × 주 ${row.calcDaysPerWeek}일 × ${weeks.toFixed(1)}주`}
            {" · "}이 값은 총 목표를 정하는 데만 써요 (참여율과 무관)
          </p>
        </div>
      )}

      {days && (
        <div className="mt-2 rounded-card-sm border border-line bg-surface-2 p-2">
          <label className="text-[12px] font-bold text-muted">
            하루 최소 종목 수 — 이만큼 완료한 날만 인정
          </label>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[12.5px] font-bold">
              {goalLabel(row.type, row.qualifier)}
            </span>
            <div className="flex items-center gap-2">
              <button
                aria-label="하루 최소 종목 수 줄이기"
                onClick={() => onChange({ qualifier: Math.max(1, row.qualifier - 1) })}
                className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
              >
                –
              </button>
              <span className="w-14 text-center font-mono text-sm font-extrabold">
                {row.qualifier}종목+
              </span>
              <button
                aria-label="하루 최소 종목 수 늘리기"
                onClick={() => onChange({ qualifier: Math.min(7, row.qualifier + 1) })}
                className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 통과하는지 확인한다**

```bash
npx vitest run src/components/challenge/goal-card.test.tsx
```

Expected: PASS — 12 tests

---

## Task 4: 시트를 3섹션으로 재구성

**Files:**
- Modify: `src/components/challenge/setup-sheet.tsx` (전면 교체)

- [ ] **Step 1: `setup-sheet.tsx`를 아래 내용으로 바꾼다**

```tsx
"use client";

import { useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import {
  CATEGORY_TYPES,
  GoalCard,
  isDaysType,
  type GoalRow,
} from "@/components/challenge/goal-card";
import { perWeekFromTotalDays } from "@/lib/domain/challenge-goal-calc";
import { plannedDaysForPeriod } from "@/lib/domain/goal-score";
import {
  CATEGORY_LABEL,
  GOAL_TYPE_META,
  type GoalDraft,
} from "@/lib/challenge";

/** 완료 보너스가 최대 3개라(`COMPLETED_GOAL_BONUS_MAX`) 화면도 3개에서 멈춘다 */
export const MAX_GOALS = 3;

export type SetupSubmit = {
  name: string;
  startDate: string;
  endDate: string;
  goals: GoalDraft[];
  plannedDays: number;
};

function periodDaysOf(startDate: string, endDate: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  const diff = Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 28;
}

/**
 * 저장된 목표(총량) → 카드 상태.
 *
 * ⚠️ `fallbackDays`(= ②의 주 N일)는 계산기의 **첫 표시값**일 뿐이다. 이후로 두
 * 값은 서로를 안 건드린다. 여기를 "연동"으로 고치지 마라 — 그게 이 개편이
 * 없앤 혼동이다(설계 §1).
 */
function rowFromGoal(g: GoalDraft, periodDays: number, fallbackDays: number): GoalRow {
  return {
    category: GOAL_TYPE_META[g.type].category,
    type: g.type,
    total: g.target,
    calcDaysPerWeek: isDaysType(g.type)
      ? perWeekFromTotalDays(g.target, periodDays)
      : Math.min(7, Math.max(1, fallbackDays)),
    qualifier: isDaysType(g.type) ? (g.qualifier ?? 3) : 0,
  };
}

export function ChallengeSetupSheet({
  mode,
  defaults,
  prevGoals,
  periodDaysFixed,
  busy,
  onSubmit,
  onClose,
}: {
  mode: "create" | "goals";
  defaults: SetupSubmit;
  prevGoals: GoalDraft[] | null;
  periodDaysFixed?: number;
  busy: boolean;
  onSubmit: (value: SetupSubmit) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [plannedDays, setPlannedDays] = useState(defaults.plannedDays);
  const [notice, setNotice] = useState<string | null>(null);

  const periodDays =
    mode === "create"
      ? periodDaysOf(startDate, endDate)
      : (periodDaysFixed ?? periodDaysOf(startDate, endDate));
  const weeks = periodDays / 7;

  const [rows, setRows] = useState<GoalRow[]>(() =>
    defaults.goals
      .slice(0, MAX_GOALS)
      .map((g) => rowFromGoal(g, periodDays, defaults.plannedDays)),
  );

  const atMax = rows.length >= MAX_GOALS;

  function updateRow(i: number, patch: Partial<GoalRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  /**
   * ⚠️ **새 목표는 안 쓴 분류부터 고른다.** 예전처럼 무조건 `웨이트 횟수`를 넣으면
   * `+ 목표 추가`를 누르는 순간 같은 지표가 두 개가 되고, 제출이
   * "같은 지표의 목표가 두 개 있어요"로 막힌다. 목표 3개 제한이 생기면서 이게
   * 더 자주 보인다(세 번 누르면 웨이트 횟수 3개). 시안도 목표2를 유산소로 그렸다.
   */
  function addRow() {
    if (atMax) return;
    setRows((rs) => {
      const used = new Set(rs.map((r) => r.category));
      const category =
        (["weight", "cardio", "bodyweight"] as const).find((c) => !used.has(c)) ??
        "weight";
      const type = CATEGORY_TYPES[category][0];
      return [
        ...rs,
        {
          category,
          type,
          total: GOAL_TYPE_META[type].defaultTarget,
          calcDaysPerWeek: Math.min(7, Math.max(1, plannedDays)),
          qualifier: isDaysType(type) ? 3 : 0,
        },
      ];
    });
  }

  function removeRow(i: number) {
    if (rows.length > 1) setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function loadPrev() {
    if (!prevGoals || prevGoals.length === 0) return;
    setRows(
      prevGoals
        .slice(0, MAX_GOALS)
        .map((g) => rowFromGoal(g, periodDays, plannedDays)),
    );
    setNotice(
      prevGoals.length > MAX_GOALS
        ? `지난 목표 중 ${MAX_GOALS}개만 불러왔어요 ↺`
        : "지난 챌린지 목표를 불러왔어요 · 숫자만 수정하세요 ↺",
    );
  }

  function submit() {
    if (mode === "create") {
      if (!name.trim()) {
        setNotice("챌린지 이름을 입력하세요");
        return;
      }
      if (!startDate || !endDate || startDate > endDate) {
        setNotice("기간을 확인하세요 (시작일 ≤ 종료일)");
        return;
      }
    }
    const types = rows.map((r) => r.type);
    if (new Set(types).size !== types.length) {
      setNotice("같은 지표의 목표가 두 개 있어요 — 하나로 합쳐주세요");
      return;
    }
    const goals: GoalDraft[] = rows.map((r) => ({
      type: r.type,
      target: r.total,
      qualifier: isDaysType(r.type) ? r.qualifier : undefined,
    }));
    if (goals.some((g) => !(g.target > 0))) {
      setNotice("목표값은 0보다 커야 해요");
      return;
    }
    onSubmit({ name: name.trim(), startDate, endDate, goals, plannedDays });
  }

  return (
    <>
      <button
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-base font-extrabold">
            {mode === "create" ? (
              "새 챌린지 만들기"
            ) : (
              <>
                <UiIcon name="goal" size={20} />내 운동 목표 설정
              </>
            )}
          </h3>
          <span className="flex-none rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] font-bold text-muted">
            기간 {periodDays}일 ({weeks.toFixed(1)}주)
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          운동 목표를 여러 개 추가하고, 내 목표 대비 달성률로 자동 점수화해요
        </p>

        <div className="mt-3 flex-1 overflow-y-auto">
          {mode === "create" && (
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <label className="text-[12px] font-bold text-muted">챌린지 이름</label>
              <input
                autoFocus
                placeholder="챌린지 이름을 입력하세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm font-bold"
              />
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="text-[12px] font-bold text-muted">시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[12px] font-bold text-muted">종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 rounded-card-sm bg-accent/10 px-3 py-2 text-[12px] font-bold text-accent">
                <UiIcon name="camera" size={15} />이 챌린지는 사진 인증한 운동만
                집계돼요
              </p>
            </div>
          )}

          {/* ── ① 달성률 재료만 ───────────────────────────── */}
          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[14px] font-extrabold">
                <UiIcon name="goal" size={18} />내 운동 목표
              </p>
              <div className="flex gap-1.5">
                {prevGoals && prevGoals.length > 0 && (
                  <button
                    onClick={loadPrev}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-bold"
                  >
                    ↺ 지난 목표
                  </button>
                )}
                <button
                  onClick={addRow}
                  disabled={atMax}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-bold text-accent disabled:opacity-40"
                >
                  + 목표 추가
                </button>
              </div>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              무엇을 얼마나 할 것인가 · 종합점수의 80%
            </p>

            {rows.map((row, i) => (
              <GoalCard
                key={i}
                index={i}
                row={row}
                periodDays={periodDays}
                canRemove={rows.length > 1}
                onChange={(patch) => updateRow(i, patch)}
                onRemove={() => removeRow(i)}
              />
            ))}

            <button
              onClick={addRow}
              disabled={atMax}
              className="mt-2 w-full rounded-card-sm border border-dashed border-line py-3 text-[13px] font-bold text-accent disabled:opacity-40"
            >
              + 목표 추가하기
            </button>
            <p className="mt-1 text-center text-[12px] text-muted">
              {atMax
                ? `최대 ${MAX_GOALS}개까지 추가할 수 있어요`
                : `최대 ${MAX_GOALS}개까지 · 목표를 여러 개 달성하면 보너스`}
            </p>
          </div>

          {/* ── ② 참여율 재료만 ───────────────────────────── */}
          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <p className="text-[14px] font-extrabold">📅 참여 계획</p>
            <p className="mt-1 text-[12px] text-muted">
              얼마나 자주 나올 것인가 · 종합점수의 20%
            </p>
            <p className="mt-2 text-[13px] font-bold">
              일주일에 며칠 운동할 계획인가요?
            </p>
            <div className="mt-1.5 flex items-center justify-center gap-3">
              <button
                aria-label="계획 운동일 줄이기"
                onClick={() => setPlannedDays((d) => Math.max(1, d - 1))}
                className="h-10 w-10 rounded-full border border-line bg-surface text-lg font-bold"
              >
                –
              </button>
              <span className="w-20 text-center font-mono text-[17px] font-extrabold">
                주 {plannedDays}일
              </span>
              <button
                aria-label="계획 운동일 늘리기"
                onClick={() => setPlannedDays((d) => Math.min(7, d + 1))}
                className="h-10 w-10 rounded-full border border-line bg-surface text-lg font-bold"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">
              종목과 상관없이 &lsquo;운동한 날&rsquo;을 셉니다 · → 이 기간{" "}
              {periodDays}일 중 {plannedDaysForPeriod(plannedDays, periodDays)}일
            </p>
          </div>

          {/* ── ③ 요약 ───────────────────────────────────── */}
          <div className="mt-3 rounded-card border border-accent/40 bg-accent/5 p-3">
            <p className="text-[13px] font-extrabold">📋 현재 설정 요약</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rows.map((r, i) => (
                <span
                  key={i}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-bold"
                >
                  {CATEGORY_LABEL[r.category]} {r.total.toLocaleString()}
                  {GOAL_TYPE_META[r.type].unit}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] font-bold text-muted">
              목표 {rows.length}개 · 주 {plannedDays}일 계획
            </p>
          </div>

          {notice && (
            <p className="mt-2 text-center text-[12.5px] font-bold text-warn">{notice}</p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-3 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          {busy
            ? "저장 중…"
            : mode === "create"
              ? `챌린지 만들기 (목표 ${rows.length}개 포함)`
              : `내 목표 저장 (${rows.length}개)`}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 기존 테스트가 아직 통과하는지 확인한다**

```bash
npx vitest run src/components/challenge/setup-sheet.test.tsx
```

Expected: PASS — 3 tests (이름칸 자동 포커스 · `전신 인터벌` 옵션 · `타바타` 미노출)

- [ ] **Step 3: 타입·린트를 확인한다**

```bash
pnpm typecheck && pnpm lint
```

Expected: 오류 없음.

import 4개가 모두 실제로 쓰인다 — `CATEGORY_TYPES`·`isDaysType`은 `addRow`/`submit`에서,
`perWeekFromTotalDays`는 `rowFromGoal`에서, `plannedDaysForPeriod`는 ② 환산 줄에서.
안 쓰이는 게 생기면 `pnpm lint`가 잡는다.

---

## Task 5: 두 축 분리 회귀선 + 개수 규칙 테스트

**Files:**
- Modify: `src/components/challenge/setup-sheet.test.tsx` (아래 describe들을 파일 끝에 추가)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

파일 맨 위 import에 `fireEvent`를 추가한다:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
```

그리고 파일 끝에 붙인다:

```tsx
/**
 * ⚠️⚠️ **이 describe를 지우지 마라** (2026-08-14).
 *
 * 한 화면에 `주 N일`이 두 개 있다 — 목표 카드 계산기의 것(달성률 재료)과
 * `② 참여 계획`의 것(참여율 분모)이다. 2026-08-14 이전에는 둘이 섞여 있어
 * 사람도 코드도 헷갈렸고, 다시 엉키면 **참여율이 조용히 틀린 값을 쓴다.**
 * 화면만 봐서는 안 잡히는 종류라 여기서 잡는다. 설계 §6.
 */
describe("ChallengeSetupSheet — 달성 세팅과 참여 세팅은 서로를 안 건드린다", () => {
  function renderSheet(onSubmit = vi.fn()) {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "분리 테스트",
          startDate: "2026-08-02",
          endDate: "2026-08-29", // 28일 = 4주
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    return onSubmit;
  }

  // ⚠️ CTA를 `getByText(/챌린지 만들기/)`로 잡으면 제목 "새 챌린지 만들기"까지
  //    걸려 getBy가 다중 매치로 던진다. 버튼 role + 개수 문구까지 포함해 잡는다.
  const submitCta = () =>
    screen.getByRole("button", { name: /챌린지 만들기 \(목표 \d+개 포함\)/ });

  it("② 참여 계획의 주 N일을 바꿔도 목표 카드의 기간 총 목표는 안 바뀐다", () => {
    renderSheet();
    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("300");

    fireEvent.click(screen.getByLabelText("계획 운동일 늘리기"));
    fireEvent.click(screen.getByLabelText("계획 운동일 늘리기"));

    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("300");
  });

  it("① 계산기의 주 며칠을 바꿔도 제출되는 plannedDays는 안 바뀐다", () => {
    const onSubmit = renderSheet();

    fireEvent.click(screen.getByLabelText("하루 기준으로 계산하기"));
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));

    fireEvent.click(submitCta());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].plannedDays).toBe(3);
  });

  it("② 참여 계획의 값이 그대로 plannedDays로 나간다", () => {
    const onSubmit = renderSheet();

    fireEvent.click(screen.getByLabelText("계획 운동일 늘리기"));
    fireEvent.click(submitCta());

    expect(onSubmit.mock.calls[0][0].plannedDays).toBe(4);
  });

  it("총 목표를 직접 고친 뒤 계산기를 열면 하루 목표가 역산돼 보인다", () => {
    renderSheet();

    fireEvent.change(screen.getByLabelText("기간 총 목표 (회)"), {
      target: { value: "600" },
    });
    fireEvent.click(screen.getByLabelText("하루 기준으로 계산하기"));

    // 600 ÷ (주3일 × 4주) = 50
    expect(
      (screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value,
    ).toBe("50");
  });

  it("요약 칩과 CTA의 개수가 실제 카드 수를 따라간다", () => {
    renderSheet();
    expect(screen.getByText("목표 1개 · 주 3일 계획")).toBeTruthy();
    expect(submitCta()).toBeTruthy();

    fireEvent.click(screen.getByText("+ 목표 추가하기"));

    expect(screen.getByText("목표 2개 · 주 3일 계획")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "챌린지 만들기 (목표 2개 포함)" }),
    ).toBeTruthy();
  });
});

describe("ChallengeSetupSheet — 목표 개수", () => {
  function renderWithPrev(prevGoals: GoalDraft[] | null) {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "개수 테스트",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={prevGoals}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("3개가 되면 추가 버튼이 잠기고 4번째 카드가 안 생긴다", () => {
    renderWithPrev(null);
    const add = screen.getByText("+ 목표 추가하기");

    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByLabelText(/^목표 \d+ 지표$/)).toHaveLength(3);

    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(add);
    expect(screen.getAllByLabelText(/^목표 \d+ 지표$/)).toHaveLength(3);
    expect(screen.getByText("최대 3개까지 추가할 수 있어요")).toBeTruthy();
  });

  it("새 목표는 안 쓴 분류부터 고른다 — 누르자마자 중복이 되지 않는다", () => {
    renderWithPrev(null); // 목표 1 = 웨이트 횟수
    fireEvent.click(screen.getByText("+ 목표 추가하기"));

    const selects = screen.getAllByLabelText(
      /^목표 \d+ 지표$/,
    ) as HTMLSelectElement[];
    expect(selects[0].value).toBe("weight_reps");
    // 웨이트가 이미 있으니 유산소로 간다. 옛 동작(무조건 weight_reps)이면
    // 바로 "같은 지표의 목표가 두 개 있어요"에 막힌다.
    expect(selects[1].value).toBe("cardio_distance");
  });

  it("지난 목표가 5개여도 3개만 불러오고 그 사실을 말해 준다", () => {
    renderWithPrev([
      { type: "weight_reps", target: 100 },
      { type: "cardio_distance", target: 20 },
      { type: "bodyweight_reps", target: 200 },
      { type: "cardio_time", target: 300 },
      { type: "bodyweight_time", target: 60 },
    ]);

    fireEvent.click(screen.getByText("↺ 지난 목표"));

    expect(screen.getAllByLabelText(/^목표 \d+ 지표$/)).toHaveLength(3);
    expect(screen.getByText("지난 목표 중 3개만 불러왔어요 ↺")).toBeTruthy();
  });
});

describe("ChallengeSetupSheet — 없어진 것들 (제거 검증)", () => {
  it("'하루 기준 계산 / 총량 직접 입력' 모드 토글이 없다", () => {
    const { container } = render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "제거 검증",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("총량 직접 입력");
    expect(text).not.toContain("KPI");
  });
});
```

`GoalDraft` 타입 import를 파일 상단에 추가한다:

```tsx
import type { GoalDraft } from "@/lib/challenge";
```

- [ ] **Step 2: 실패/통과를 확인한다**

```bash
npx vitest run src/components/challenge/setup-sheet.test.tsx
```

Expected: PASS — 12 tests (기존 3 + 신규 9). 하나라도 FAIL이면 Task 4 구현을 고친다 (테스트를 고치지 마라).

---

## Task 6: 호출부가 안 깨졌는지 확인

`SetupSubmit` 모양을 안 바꿨으므로 `challenge/page.tsx`는 수정하지 않는다. 그 사실을 확인만 한다.

**Files:**
- Verify only: `src/app/(tabs)/challenge/page.tsx`

- [ ] **Step 1: 시트 전체 테스트를 돌린다**

```bash
npx vitest run src/app/\(tabs\)/challenge/page.test.tsx
```

Expected: PASS (기존 그대로)

- [ ] **Step 2: 저장 경로가 안 바뀌었는지 눈으로 확인한다**

`src/lib/challenge.ts`의 `saveMyGoals`에서 `planned_days: input.plannedDays`가 **모든 행에 같은 값**으로 들어가는지 확인한다. 바뀌었다면 되돌린다 — `buildParticipantInput`이 `goals[0].planned_days`를 읽고 `getMyWeeklyGoalDays`가 `max`를 쓰므로, 값이 다르면 두 화면이 다른 숫자를 말한다.

---

## Task 7: 전체 자동 검증

- [ ] **Step 1: 린트·타입·전체 테스트·빌드**

```bash
pnpm lint
```
Expected: 오류 0

```bash
pnpm typecheck
```
Expected: 오류 0

```bash
pnpm test
```
Expected: 전체 PASS. 새로 늘어난 단언은 Task 1(16) + Task 3(12) + Task 5(9) = **37건**

```bash
pnpm build
```
Expected: 성공

- [ ] **Step 2: 문서 갱신**

`PROGRESS.md`의 최신 항목 위에 아래 줄을 넣는다:

```markdown
- **챌린지 목표 세팅에서 달성 계획과 참여 계획을 갈랐다** — 한 화면에 `주 N일`이 두 개(목표 카드의 계산기용 / 참여율 분모용) 있어 사람도 코드도 헷갈렸다. `① 내 운동 목표`(달성률 80%)와 `② 참여 계획`(참여율 20%)으로 섹션을 나누고, `하루 기준 계산 / 총량 직접 입력` 토글을 접히는 계산기로 대체했다. **점수 로직·DB는 무변경.** 두 축이 다시 엉키는 것은 `setup-sheet.test.tsx`의 `달성 세팅과 참여 세팅은 서로를 안 건드린다`가 잡는다. 설계: `docs/superpowers/specs/2026-08-14-challenge-setup-sheet-redesign-design.md`
```

---

## Task 8: 개발 서버에서 눈으로 확인 (사용자)

⚠️ **여기를 건너뛰고 커밋하지 마라.** `pnpm test`·`build`는 화면이 어떻게 보이는지를 하나도 검증하지 않는다 (`CLAUDE.md` 최상단).

- [ ] **Step 1: dev 서버를 띄운다**

`.claude/launch.json`의 `next-dev` 설정으로 preview를 시작한다 (Bash로 서버를 띄우지 마라). 열린 뒤 `/challenge`로 이동한다. `.env.local`을 그대로 쓰므로 **운영 Supabase에 붙는다** — 픽스처 A(`dev-fixture-a@gnd.local`)로 로그인한다.

```bash
node scripts/dev-fixture.mjs status
```

- [ ] **Step 2: 아래를 직접 조작한다**

| 조작 | 기대 결과 |
|---|---|
| `새 챌린지 만들기` 열기 | 제목 우측에 `기간 28일 (4.0주)` 뱃지 |
| 화면을 훑는다 | `하루 기준 계산 / 총량 직접 입력` 토글이 **없다**, `KPI`라는 글자가 **없다** |
| `+ 목표 추가하기` 3번 누르기 | 카드가 **3개에서 멈추고** 버튼이 잠긴다. `최대 3개까지 추가할 수 있어요` |
| `▸ 하루 기준으로 계산하기` 누르기 | `하루 목표`·`주 며칠`이 펼쳐진다 |
| `하루 목표`를 30으로 | `기간 총 목표`가 **따라 바뀐다** |
| 계산기의 `주 며칠` + | `기간 총 목표`가 **따라 바뀐다** |
| ②의 `주 N일` + | **목표 카드 숫자가 안 움직인다** ← 핵심 |
| ②의 `주 N일`을 5로 | `→ 이 기간 28일 중 20일` |
| 요약 카드 | 칩 **개수를 센다**. `목표 3개 · 주 5일 계획` |
| CTA | `챌린지 만들기 (목표 3개 포함)` |
| 실제로 만들기 | 토스트가 뜨고 챌린지가 생긴다 |
| 만든 챌린지에서 `내 목표` 열기 | goals 모드 — 이름·날짜 칸이 없고 CTA가 `내 목표 저장 (N개)` |

- [ ] **Step 3: 사용자 확인을 받는다**

이상이 있으면 배포·커밋을 멈추고 고친 뒤 Step 1부터 다시 한다.

---

## Task 9: 커밋 (사용자 확인 후에만)

- [ ] **Step 1: 커밋**

```bash
git add src/lib/domain/challenge-goal-calc.ts src/lib/domain/challenge-goal-calc.test.ts src/components/challenge/number-field.tsx src/components/challenge/goal-card.tsx src/components/challenge/goal-card.test.tsx src/components/challenge/setup-sheet.tsx src/components/challenge/setup-sheet.test.tsx docs/superpowers/specs/2026-08-14-challenge-setup-sheet-redesign-design.md docs/superpowers/plans/archive/2026-08-14-challenge-setup-sheet-redesign.md PROGRESS.md
```

```bash
git commit -m "feat: 챌린지 목표 세팅에서 달성 계획과 참여 계획을 가른다"
```

커밋 본문에 담을 것: 한 화면에 `주 N일`이 두 개 있어 헷갈리던 문제, 점수 로직 무변경, 두 축 분리 회귀선 테스트 위치.
