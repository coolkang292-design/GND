# 계획 없는 날 운동 제안 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 오늘 계획도 없고 운동도 안 한 사람에게 각자의 알림 시각에 "무엇을 할지"를 보내고, 그 알림을 누르면 기록 탭이 **이미 담긴 채로** 열려 `운동 시작` 한 번만 누르면 되게 한다.

**Architecture:** 분기와 문구를 순수 함수 한 벌(`workout-suggestion.ts`)에 두고 **브리핑 라우트와 기록 탭이 같이 import**한다. 함수 공유만으로는 부족해서 **입력도 양쪽이 싸게 만들 수 있는 것으로 낮춘다**(완료 수가 아니라 `hasHistory` 1비트). DB에 계획을 심지 않으므로 달력은 그대로고, draft의 날짜 스탬프가 자정에 제안을 지운다.

**Tech Stack:** Next.js 16 App Router · TypeScript · Vitest + Testing Library · Supabase (PostgREST + service_role) · Tailwind

**설계:** `docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md`

---

## 착수 전 실측 (2026-08-16 확인 완료)

계획이 전제로 삼은 것을 **전부 열어서 확인했다.**

| 전제 | 실측 결과 |
|---|---|
| `pnpm lint` | `eslint` — `next lint`가 **아니다** |
| `pnpm typecheck` / `test` / `build` | `tsc --noEmit` / `vitest run` / `next build` ✅ |
| 현재 브랜치 | **`main`** — 작업 브랜치를 먼저 판다 |
| 작업 트리 | 무관한 미커밋 변경 다수 → **`git add`에 경로를 명시**한다. `git add -A` 금지 |
| `profiles.created_at` | ✅ 있다 (`0001_identity_crew.sql:15`) |
| `workout_sessions.tabata_minutes` | ✅ 있다 (`0019_tabata.sql:8`), `check in (4,8,16)` |
| `notifications.type` | CHECK 허용목록 — 최신 목록은 `0077:20~30` |
| `TYPE_ICON` | **exhaustive** — 유형을 늘리면 타입 오류로 막힌다 (`notification-bell.tsx:16`) |
| `PUSH_URL_BY_TYPE` | **exhaustive 아님** — 손으로 안 넣으면 조용히 `/home` |
| `pickByDay` | `streak-messages.ts`가 export. `pickByDay(배열, todayKey)` → 원소 |
| `briefing.test.ts:39` | `skipped`를 **통째로 비교**한다 → 스킵 사유를 늘리면 깨진다 |
| `loadDraft` 승격 | v1~v5 분기가 **전부 v6로 끝난다**. v7로 올리면 **여섯 곳 전부** 고쳐야 한다 |
| `hasCompletedHistory` | `workout.ts:989` — `head:true` 개수 질의 |
| `useSearchParams` | ⚠️ 이 저장소가 **두 번 거부**했다 (`record-view.ts:8`) |

⚠️ **`loadDraft` 승격 경로가 이 계획에서 가장 조용히 망가지는 곳이다.** `workout.ts:158`의 주석이 경고한다 — *"승격 경로는 전부 v6에서 끝난다. 하나라도 옛 번호로 끝내면 그 draft는 통째로 버려진다 — 진행 중이던 운동이 날아간다."* v7로 올리면서 하나를 빠뜨리면 **운동 중이던 사용자의 기록이 사라진다.**

---

## File Structure

| 파일 | 무엇을 맡나 | 신규/수정 |
|---|---|---|
| `src/lib/domain/workout-suggestion.ts` | 분기(`pickSuggestionKind`)·보조(`secondaryKind`)·문구(`suggestionCopy`) 전량 | 신규 |
| `src/lib/domain/workout-suggestion.test.ts` | 위 셋의 단위 테스트 | 신규 |
| `src/lib/domain/briefing.ts` | 제안이 있으면 `type`·`body`·`url`을 갈아 낀다 | 수정 |
| `src/lib/domain/briefing.test.ts` | 신규 유저 통과 · 계획 있는 날 보존 회귀선 | 수정 |
| `src/lib/domain/push.ts` | `workout_suggestion` 목적지 | 수정 |
| `src/lib/domain/push.test.ts` | 목적지 회귀선 | 수정 |
| `src/components/notification-bell.tsx` | `TYPE_ICON` 한 줄 (안 넣으면 타입 오류) | 수정 |
| `src/lib/social.ts` | `NotificationRow["type"]` 유니온에 1종 | 수정 |
| `src/lib/workout.ts` | draft v7 + `expireStaleSuggestion` | 수정 |
| `src/lib/workout.test.ts` | 만료 규칙 회귀선 | 수정 또는 신규 |
| `src/app/api/briefing/route.ts` | 계획·가입일·챌린지·타바타 조회 추가 | 수정 |
| `src/app/(tabs)/record/page.tsx` | `?suggest` 읽어 담기 · URL 정리 · 카드 배선 | 수정 |
| `src/components/record/record-empty-state.tsx` | 제안 카드 | 수정 |
| `src/components/record/record-empty-state.test.tsx` | 카드 렌더 회귀선 | 수정 |
| `supabase/migrations/0078_workout_suggestion_notification.sql` | 허용목록 1종 | 신규 |

**왜 `workout-suggestion.ts`를 새로 파나:** `briefing.ts`에 넣으면 기록 탭이 브리핑 모듈을 import하게 된다. 브리핑은 서버 전용 개념(스트릭 집계·dedupe)을 안고 있어서 화면 번들이 커지고, 무엇보다 **"이건 알림 코드"라는 인상 때문에 다음 사람이 화면 쪽 분기를 여기 안 넣고 따로 만든다.** 그 순간 §3이 막으려던 갈림이 생긴다.

---

### Task 0: 작업 브랜치를 판다

**Files:** 없음

- [ ] **Step 1: 브랜치 생성**

```bash
cd /c/Users/SAMSUNG/workout-app
git checkout -b feat/empty-day-workout-suggestion
git branch --show-current
```
Expected: `feat/empty-day-workout-suggestion`

⚠️ 작업 트리에 이 작업과 **무관한 미커밋 변경**이 여럿 있다(`.gitignore`, 자산 폴더들). 그대로 둔다. 아래 모든 커밋은 **경로를 명시해서** `git add`한다.

---

### Task 1: 분기 함수 `pickSuggestionKind`

**Files:**
- Create: `src/lib/domain/workout-suggestion.ts`
- Test: `src/lib/domain/workout-suggestion.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/workout-suggestion.test.ts` 신규 생성:

```ts
import { describe, expect, it } from "vitest";
import { NEW_USER_GRACE_DAYS, pickSuggestionKind } from "./workout-suggestion";

/** 이력 있는 사람의 기본형 — 각 테스트가 필요한 것만 덮어쓴다 */
const base = {
  hasPlanToday: false,
  didWorkoutToday: false,
  hasHistory: true,
  lastSessionWasInterval: false,
  isInActiveChallenge: false,
  signedUpDayKey: "2026-01-01",
  todayKey: "2026-08-16",
};

describe("pickSuggestionKind — 제안하지 않는 경우", () => {
  it("오늘 계획이 있으면 제안하지 않는다", () => {
    expect(pickSuggestionKind({ ...base, hasPlanToday: true })).toBeNull();
  });

  it("오늘 이미 운동했으면 제안하지 않는다", () => {
    expect(pickSuggestionKind({ ...base, didWorkoutToday: true })).toBeNull();
  });

  /**
   * ⚠️⚠️ **이 파일에서 가장 중요한 단언이다.**
   *
   * 가입만 하고 잊은 사람에게 영원히 알림이 가면 안 된다. 이 창이 없으면
   * 기록 0건인 계정 전부가 매일 알림을 받는다 — 알림 차단이나 앱 삭제로 이어진다.
   */
  it("기록 0건이고 가입 창이 지났으면 제안하지 않는다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-08", // 8일 전
        todayKey: "2026-08-16",
      }),
    ).toBeNull();
  });
});

describe("pickSuggestionKind — 신규 유저", () => {
  it("가입 당일이면 걷기를 권한다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-16",
        todayKey: "2026-08-16",
      }),
    ).toBe("walk");
  });

  /**
   * 창의 **마지막 날**이다. 위의 "8일 전은 null"과 한 쌍이라야 경계를 잡는다 —
   * 한쪽만 있으면 창을 통째로 열거나 닫아도 통과한다.
   */
  it("가입 창의 마지막 날까지는 걷기를 권한다", () => {
    expect(NEW_USER_GRACE_DAYS).toBe(7);
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        signedUpDayKey: "2026-08-10", // 6일 전 → 창 안
        todayKey: "2026-08-16",
      }),
    ).toBe("walk");
  });

  /**
   * 챌린지에 참가했는데 기록이 0건인 사람. 되살릴 지난 운동이 없으므로
   * 걷기 창이 지났어도 인터벌로 보낸다 — 사용자 지시 2026-08-16.
   */
  it("기록 0건이어도 챌린지 참가 중이면 인터벌을 권한다", () => {
    expect(
      pickSuggestionKind({
        ...base,
        hasHistory: false,
        isInActiveChallenge: true,
        signedUpDayKey: "2026-01-01", // 창 밖
      }),
    ).toBe("interval");
  });
});

describe("pickSuggestionKind — 이력 있는 유저", () => {
  it("지난 운동을 그대로 권한다", () => {
    expect(pickSuggestionKind(base)).toBe("repeat");
  });

  /**
   * ⚠️ 지난 세션이 인터벌이었으면 주 제안이 인터벌이다. 안 그러면
   * 주 제안(지난 운동 = 인터벌)과 보조 제안(인터벌)이 **같은 것 둘**이 된다.
   */
  it("지난 세션이 인터벌이면 인터벌을 권한다", () => {
    expect(
      pickSuggestionKind({ ...base, lastSessionWasInterval: true }),
    ).toBe("interval");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/workout-suggestion.test.ts`
Expected: FAIL — `Failed to resolve import "./workout-suggestion"`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/workout-suggestion.ts` 신규 생성:

```ts
/**
 * 계획 없는 날의 운동 제안 — 분기와 문구 (2026-08-16).
 *
 * 설계: `docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md`
 *
 * ⚠️⚠️ **이 모듈은 브리핑 라우트(서버)와 기록 탭(화면)이 같이 쓴다.**
 * `viewing-pass.ts`가 서버 규칙과 갈려서 `peek-reset-check.mjs`라는 감시
 * 스크립트를 낳았는데, 여기는 양쪽 다 TypeScript라 애초에 한 벌로 둘 수 있다.
 *
 * ⚠️ I/O를 하지 않는다. "무엇을 제안할까"만 정하고 조회는 부르는 쪽이 한다.
 */

/** 무엇을 제안하는가 */
export type SuggestionKind = "walk" | "repeat" | "interval";

/**
 * 새 사용자에게 걷기를 권하는 창(일). 이 뒤로도 기록이 없으면 **조용해진다.**
 *
 * ⚠️ 이 창을 지우거나 늘리기 전에 생각하라. 창이 없으면 기록 0건인 계정 전부가
 * 매일 알림을 받는다 — 가입만 하고 잊은 사람에게 영원히 가는 알림은 차단이나
 * 앱 삭제로 이어진다.
 */
export const NEW_USER_GRACE_DAYS = 7;

/** `"YYYY-MM-DD"` 두 개의 날짜 차이(일). `Date`를 안 쓴다 — 타임존이 끼어든다 */
function daysBetween(fromDayKey: string, toDayKey: string): number {
  const ms =
    Date.parse(`${toDayKey}T00:00:00Z`) - Date.parse(`${fromDayKey}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * 오늘 무엇을 제안할까. 제안할 것이 없으면 `null`.
 *
 * ⚠️ **종목을 반환하지 않는다.** `kind`만 돌려주고 무엇을 담을지는 화면이 정한다.
 *    서버가 종목까지 실어 보내면, 알림이 저장된 뒤 사용자가 운동을 하나 더 해도
 *    옛 제안이 그대로 온다.
 *
 * ⚠️ **입력에 `completedCount`를 쓰지 마라.** 화면은 완료 수를 모르고
 *    `hasHistory` 1비트만 갖고 있다(`record/page.tsx`의 `hasHistory`). 수를
 *    요구하면 화면이 새 질의를 하게 되고, 그 질의가 서버와 미묘하게 갈리는 순간
 *    **알림은 걷기를 말하는데 화면은 지난 운동을 담는다.**
 */
export function pickSuggestionKind(input: {
  hasPlanToday: boolean;
  didWorkoutToday: boolean;
  hasHistory: boolean;
  lastSessionWasInterval: boolean;
  isInActiveChallenge: boolean;
  signedUpDayKey: string;
  todayKey: string;
}): SuggestionKind | null {
  if (input.hasPlanToday) return null;
  if (input.didWorkoutToday) return null;

  if (!input.hasHistory) {
    // 되살릴 지난 운동이 없다. 챌린지 참가자는 창과 무관하게 인터벌로 보낸다 —
    // 이미 하겠다고 손 든 사람이라 "조용해지는" 규칙의 대상이 아니다.
    if (input.isInActiveChallenge) return "interval";
    return daysBetween(input.signedUpDayKey, input.todayKey) <
      NEW_USER_GRACE_DAYS
      ? "walk"
      : null;
  }

  // 지난 세션이 인터벌이면 주 제안이 인터벌이다 — 아니면 주·보조가 같은 것 둘이 된다.
  if (input.lastSessionWasInterval) return "interval";
  return "repeat";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/workout-suggestion.test.ts`
Expected: PASS (8건)

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/workout-suggestion.ts src/lib/domain/workout-suggestion.test.ts
git commit -m "feat(suggest): 계획 없는 날 무엇을 제안할지 정하는 pickSuggestionKind"
```

---

### Task 2: 보조 제안 `secondaryKind`

**Files:**
- Modify: `src/lib/domain/workout-suggestion.ts` (파일 끝에 추가)
- Test: `src/lib/domain/workout-suggestion.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`workout-suggestion.test.ts`의 import 줄을 바꾼다:

```ts
import {
  NEW_USER_GRACE_DAYS,
  pickSuggestionKind,
  secondaryKind,
} from "./workout-suggestion";
```

그리고 파일 **끝에** 추가:

```ts
describe("secondaryKind — 보조 제안", () => {
  it("지난 운동에는 4분 인터벌을 같이 낸다", () => {
    expect(secondaryKind("repeat")).toBe("interval");
  });

  /**
   * ⚠️ 인터벌이 주 제안일 때 보조로도 인터벌을 내면 **같은 버튼이 둘**이 된다.
   */
  it("인터벌이 주 제안이면 보조가 없다", () => {
    expect(secondaryKind("interval")).toBeNull();
  });

  /**
   * 신규에게는 걷기만 낸다 (사용자 지시 2026-08-16). 인터벌 4종
   * (맨몸 스쿼트·니 푸시업·데드버그·마운틴 클라이머)은 처음 온 사람에게
   * 걷기보다 부담이 크다.
   */
  it("걷기에는 보조가 없다", () => {
    expect(secondaryKind("walk")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/workout-suggestion.test.ts -t "보조 제안"`
Expected: FAIL — `does not provide an export named 'secondaryKind'`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/workout-suggestion.ts` 파일 **끝에** 추가:

```ts
/**
 * 주 제안에 딸리는 보조 제안. 없으면 `null`.
 *
 * ⚠️ 보조 버튼은 주 버튼과 **하는 일이 다르다** — 주 제안은 목록에 담고,
 * 인터벌은 4분 시트를 연다. `recommended-picker.tsx`의 `interval` 칸이 같은
 * 함정을 겪었다(담기만 하면 3세트 10회짜리 일반 운동이 되어 버린다). 그래서
 * 화면 문구도 `담기`가 아니라 **`시작`** 이어야 한다.
 */
export function secondaryKind(primary: SuggestionKind): SuggestionKind | null {
  return primary === "repeat" ? "interval" : null;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/workout-suggestion.test.ts`
Expected: PASS (11건)

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/workout-suggestion.ts src/lib/domain/workout-suggestion.test.ts
git commit -m "feat(suggest): 지난 운동에 4분 인터벌을 보조로 붙이는 secondaryKind"
```

---

### Task 3: 문구 `suggestionCopy` — 날짜마다 돈다

**왜 로테이션인가:** 기존 브리핑은 이미 `pickByDay`로 날짜마다 문구를 돌린다(`briefing.ts:61`). kind마다 문구를 하나로 고정하면 계획 없는 날이 이어질 때 같은 말이 매일 와서 **기존보다 후퇴한다.**

**Files:**
- Modify: `src/lib/domain/workout-suggestion.ts`
- Test: `src/lib/domain/workout-suggestion.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import 줄을 바꾼다:

```ts
import {
  NEW_USER_GRACE_DAYS,
  pickSuggestionKind,
  secondaryKind,
  SUGGESTION_PHILOSOPHY,
  suggestionCopy,
} from "./workout-suggestion";
```

파일 **끝에** 추가:

```ts
describe("suggestionCopy — 문구", () => {
  it("걷기는 10분을 말한다", () => {
    const copy = suggestionCopy("walk", "2026-08-16", 0);
    expect(copy.title).toContain("10분");
  });

  /**
   * 제목이 스트릭을 그대로 안고 간다. 브리핑이 하던 일을 뺏지 않고,
   * **지금 항상 null인 body를** 제안이 채운다.
   */
  it("지난 운동은 제목에 스트릭 일수를 싣는다", () => {
    const copy = suggestionCopy("repeat", "2026-08-16", 7);
    expect(copy.title).toContain("7");
  });

  it("인터벌은 4분을 말한다", () => {
    const copy = suggestionCopy("interval", "2026-08-16", 3);
    expect(copy.title).toContain("4분");
  });

  /**
   * ⚠️⚠️ **회귀선이다 (사용자 지시 2026-08-16).**
   *
   * "오래 하는 게 중요한 게 아니라 하루라도 빼먹지 않는 게 중요하다" —
   * 이 메시지가 이 기능의 존재 이유다. 문구를 다듬다가 이게 빠지면
   * 그냥 또 하나의 운동 권유 알림이 된다.
   */
  it("본문은 '빼먹지 않는 것'을 말한다", () => {
    for (const kind of ["walk", "interval"] as const) {
      const copy = suggestionCopy(kind, "2026-08-16", 0);
      expect(SUGGESTION_PHILOSOPHY).toContain(copy.body);
    }
  });

  it("지난 운동 본문은 4분이라도 하라고 말한다", () => {
    const copy = suggestionCopy("repeat", "2026-08-16", 5);
    expect(copy.body).toContain("4분");
  });

  /**
   * ⚠️⚠️ **로테이션의 회귀선이다.**
   *
   * 계획 없는 날이 이어지면 이 알림이 매일 온다. 문구가 고정이면 잔소리가
   * 되고, 그건 기존 브리핑(`pickByDay`로 이미 돌고 있다)보다 후퇴다.
   */
  it("같은 kind라도 날짜가 다르면 제목이 다르다", () => {
    const titles = new Set(
      ["2026-08-16", "2026-08-17", "2026-08-18"].map(
        (d) => suggestionCopy("walk", d, 0).title,
      ),
    );
    expect(titles.size).toBeGreaterThan(1);
  });

  it("같은 날짜에는 같은 문구가 나온다 — 렌더마다 바뀌면 안 된다", () => {
    const a = suggestionCopy("walk", "2026-08-16", 0);
    const b = suggestionCopy("walk", "2026-08-16", 0);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/workout-suggestion.test.ts -t "문구"`
Expected: FAIL — `does not provide an export named 'suggestionCopy'`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/workout-suggestion.ts`의 **맨 위 import에** 추가:

```ts
import { pickByDay } from "./streak-messages";
```

파일 **끝에** 추가:

```ts
export type SuggestionCopy = { title: string; body: string };

/**
 * 공통 철학문 — **이 기능의 존재 이유다** (사용자 지시 2026-08-16).
 *
 * "오래 하는 게 중요한 게 아니라 하루라도 빼먹지 않는 게 중요하다."
 * 알림 본문과 화면 카드가 **같은 말**을 하도록 한 곳에 둔다.
 */
// ⚠️ `readonly`를 붙이지 마라. `pickByDay<T>(variants: T[], …)`가 **가변 배열**을
//    받는다(`streak-messages.ts:118` 실측). `readonly string[]`을 넘기면
//    `Argument of type 'readonly string[]' is not assignable to 'string[]'`로 막힌다.
export const SUGGESTION_PHILOSOPHY: string[] = [
  "오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요",
  "길게 못 해도 괜찮아요 · 안 빼먹는 게 이겨요",
];

const WALK_TITLES: string[] = [
  "🚶 오늘은 10분 걷기부터",
  "🚶 딱 10분만 걸어볼까요?",
  "🚶 오늘의 한 걸음, 10분",
];

const INTERVAL_TITLES: string[] = [
  "⏱️ 딱 4분만 해볼까요?",
  "⏱️ 4분이면 충분해요",
  "⏱️ 오늘은 4분 인터벌 어때요?",
];

const REPEAT_TITLES: ((streak: number) => string)[] = [
  (n) => `🔥 ${n}일째 — 오늘이 아직 비어 있어요`,
  (n) => `🔥 ${n}일 이어왔어요, 오늘도 한 번?`,
  (n) => `🔥 오늘만 채우면 ${n + 1}일`,
];

const REPEAT_BODY = "지난번 그대로 담아 뒀어요 · 시간 없으면 4분만이라도";

/**
 * 알림과 화면 카드가 **같이 쓰는** 문구.
 *
 * ⚠️ 문구를 kind마다 하나로 고정하지 마라. 계획 없는 날이 이어지면 이 알림이
 * 매일 오는데, 같은 말이 반복되면 잔소리가 된다. 기존 브리핑이 `pickByDay`로
 * 이미 돌고 있어서(`briefing.ts`), 고정하면 **기존보다 후퇴**한다.
 *
 * ⚠️ 랜덤이 아니라 **날짜 기반 결정적 로테이션**이다. 렌더 중 랜덤은
 * 하이드레이션 불일치와 "재렌더마다 문구가 바뀜"을 만든다 —
 * `streak-messages.ts` 머리주석이 같은 이유를 적어 두고 있다.
 */
export function suggestionCopy(
  kind: SuggestionKind,
  todayKey: string,
  streak: number,
): SuggestionCopy {
  if (kind === "repeat") {
    return {
      title: pickByDay(REPEAT_TITLES, todayKey)(streak),
      body: REPEAT_BODY,
    };
  }
  return {
    title: pickByDay(kind === "walk" ? WALK_TITLES : INTERVAL_TITLES, todayKey),
    body: pickByDay(SUGGESTION_PHILOSOPHY, todayKey),
  };
}
```

⚠️ `pickByDay`가 `streak-messages.ts`에서 export되는지 확인한다. 안 되어 있으면 `export`를 붙인다(같은 `src/lib/domain/` 안이라 새 의존이 아니다).

- [ ] **Step 4: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/workout-suggestion.test.ts`
Expected: PASS (18건)

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/workout-suggestion.ts src/lib/domain/workout-suggestion.test.ts src/lib/domain/streak-messages.ts
git commit -m "feat(suggest): 날짜마다 도는 제안 문구 suggestionCopy"
```

---

### Task 4: 브리핑이 제안을 실어 나른다

⚠️⚠️ **`briefing.test.ts:39`가 `skipped`를 통째로 비교한다.** 스킵 사유를 늘리면 그 회귀선이 깨진다. `no_history`의 **뜻만** "기록 0건" → "기록 0건이고 제안도 없음"으로 넓힌다.

**Files:**
- Modify: `src/lib/domain/briefing.ts`
- Test: `src/lib/domain/briefing.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/briefing.test.ts`의 `user()` 픽스처에 기본값 세 개를 더한다. **기본 가입일을 창 밖(2026-06-01)으로 둔다** — 그래야 기존 `no_history` 단언이 그대로 성립한다:

```ts
function user(over: Partial<BriefingUser>): BriefingUser {
  return {
    userId: "me",
    timezone: TZ,
    completedAts: [kst("2026-07-14T19:00:00")], // 4일 전 → d1
    startedAts: [],
    morningBrief: true,
    // ── 2026-08-16 제안 파이프라인 ──
    // ⚠️ 가입일 기본값은 **창 밖**이다. 창 안으로 두면 위쪽
    //    "완료 세션 없으면 no_history" 단언이 제안 때문에 통과하게 되어 깨진다.
    signedUpAt: kst("2026-06-01T00:00:00"),
    hasPlanToday: false,
    isInActiveChallenge: false,
    lastSessionWasInterval: false,
    ...over,
  };
}
```

파일 **끝에** 추가:

```ts
/**
 * 2026-08-16 — 계획 없는 날 제안.
 * 설계: `docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md`
 */
describe("buildBriefings — 계획 없는 날 제안", () => {
  /**
   * ⚠️⚠️ **회귀선이다.** 이 게이트가 "신규에게 걷기"의 전부다.
   * 옛 코드는 `completedAts.length === 0`이면 무조건 스킵해서 신규 유저가
   * 알림을 **한 통도** 못 받았다.
   */
  it("가입 창 안의 신규 유저는 제안을 받는다", () => {
    const { briefings, skipped } = buildBriefings(
      [
        user({
          completedAts: [],
          signedUpAt: kst("2026-07-16T00:00:00"), // 2일 전 → 창 안
        }),
      ],
      new Map(),
      NOW,
    );
    expect(skipped).toHaveLength(0);
    expect(briefings).toHaveLength(1);
    expect(briefings[0].title).toContain("10분");
    expect(briefings[0].type).toBe("workout_suggestion");
    expect(briefings[0].body).not.toBeNull();
  });

  /**
   * 위와 한 쌍이다. 한쪽만 있으면 창을 통째로 열어도 통과한다.
   */
  it("가입 창이 지난 무기록 유저는 여전히 no_history다", () => {
    const { briefings, skipped } = buildBriefings(
      [user({ completedAts: [] })], // 기본 가입일 = 창 밖
      new Map(),
      NOW,
    );
    expect(briefings).toHaveLength(0);
    expect(skipped).toEqual([{ userId: "me", reason: "no_history" }]);
  });

  /**
   * ⚠️ opt-out은 제안보다 **앞**이다. 같은 채널이므로 똑같이 존중한다 —
   * 순서를 뒤집으면 "알림 껐는데 오네"가 된다.
   */
  it("morning_brief를 끈 사람은 제안이 있어도 안 받는다", () => {
    const { briefings, skipped } = buildBriefings(
      [
        user({
          completedAts: [],
          signedUpAt: kst("2026-07-16T00:00:00"),
          morningBrief: false,
        }),
      ],
      new Map(),
      NOW,
    );
    expect(briefings).toHaveLength(0);
    expect(skipped[0].reason).toBe("opted_out");
  });

  it("이력 있는 사람은 지난 운동 제안을 받는다", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].type).toBe("workout_suggestion");
    expect(briefings[0].body).toContain("4분");
  });

  /**
   * ⚠️⚠️ **기존 동작 보존의 회귀선이다.** 계획이 있는 날은 지금 그대로
   * 스트릭 브리핑이 나가야 한다. 제안이 그 자리를 뺏으면 안 된다.
   */
  it("오늘 계획이 있으면 지금 그대로 morning_briefing이다", () => {
    const { briefings } = buildBriefings(
      [user({ hasPlanToday: true })],
      new Map(),
      NOW,
    );
    expect(briefings[0].type).toBe("morning_briefing");
    expect(briefings[0].body).toBeNull();
  });

  /**
   * ⚠️⚠️ **전환일 두 통째 방지.** 유니크 인덱스가 `dedupe_key` 하나에만
   * 걸려 있어서(`notifications_dedupe_key_uidx`), 키를 바꾸면 이미 브리핑을
   * 받은 사람에게 제안이 **한 통 더** 뚫린다.
   */
  it("dedupe_key는 type과 무관하게 그대로다", () => {
    const withPlan = buildBriefings(
      [user({ hasPlanToday: true })], new Map(), NOW,
    ).briefings[0];
    const withSuggestion = buildBriefings([user({})], new Map(), NOW)
      .briefings[0];
    expect(withPlan.dedupeKey).toBe(withSuggestion.dedupeKey);
    expect(withPlan.dedupeKey).toContain("morning_briefing:");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/briefing.test.ts`
Expected: FAIL — `signedUpAt` 등이 `BriefingUser`에 없다는 타입 오류 + `type` 속성 없음

- [ ] **Step 3: 구현 — `BriefingUser`·`Briefing` 확장**

`src/lib/domain/briefing.ts`의 import에 추가:

```ts
import { dayKey, minuteOfDay } from "./time";
import { pickSuggestionKind, suggestionCopy } from "./workout-suggestion";
```

`BriefingUser` 타입 **끝에** 필드를 더한다:

```ts
export type BriefingUser = {
  userId: string;
  timezone: string;
  completedAts: Date[];
  startedAts: Date[];
  morningBrief: boolean;
  // ── 계획 없는 날 제안 (2026-08-16) ──
  /** 가입 시각 — 신규 걷기 창(`NEW_USER_GRACE_DAYS`) 판정 */
  signedUpAt: Date;
  /** 오늘(이 사람 타임존 기준) `workout_plans`에 행이 있나 */
  hasPlanToday: boolean;
  /** active 챌린지에 joined로 들어가 있나 */
  isInActiveChallenge: boolean;
  /** 가장 최근 완료 세션이 인터벌이었나 */
  lastSessionWasInterval: boolean;
};
```

`Briefing` 타입에 `type`을 더한다:

```ts
export type Briefing = {
  userId: string;
  /**
   * 알림 유형 (2026-08-16). 제안이 있는 날은 `workout_suggestion`이 되고,
   * 푸시 목적지가 `/record?suggest=1`로 바뀐다(`push.ts`).
   *
   * ⚠️ `dedupe_key`는 유형과 **무관하게** 그대로다 — 유니크 인덱스가 키 하나에만
   *    걸려 있어서, 키를 바꾸면 전환일에 두 통째가 뚫린다.
   */
  type: "morning_briefing" | "workout_suggestion";
  title: string;
  body: string | null;
  dedupeKey: string;
};
```

- [ ] **Step 4: 구현 — 게이트와 조립**

`buildBriefings`의 루프에서 `no_history` 게이트를 **뒤로 미루고** 제안을 계산한다. 루프 앞부분을 이렇게 바꾼다:

```ts
  for (const u of users) {
    // ⚠️ opt-out이 **가장 앞**이다. 제안도 같은 채널이므로 똑같이 존중한다 —
    //    순서를 뒤집으면 "알림 껐는데 오네"가 된다.
    if (!u.morningBrief) {
      skipped.push({ userId: u.userId, reason: "opted_out" });
      continue;
    }

    const todayKey = dayKey(now, u.timezone);
    const keys = workoutDayKeys(u.completedAts, u.timezone);
    const hasHistory = u.completedAts.length > 0;
    const kind = pickSuggestionKind({
      hasPlanToday: u.hasPlanToday,
      didWorkoutToday: keys.includes(todayKey),
      hasHistory,
      lastSessionWasInterval: u.lastSessionWasInterval,
      isInActiveChallenge: u.isInActiveChallenge,
      signedUpDayKey: dayKey(u.signedUpAt, u.timezone),
      todayKey,
    });

    /*
      ⚠️⚠️ **옛 코드는 여기서 무조건 스킵했다** — `completedAts.length === 0`이면
      `no_history`. 그래서 신규 유저는 알림을 **한 통도** 못 받았다(2026-08-16 실측).

      ⚠️ 스킵 **사유를 늘리지 마라.** `briefing.test.ts`가 `skipped`를 통째로
         비교한다. `no_history`의 뜻을 "기록 0건이고 제안도 없음"으로 넓힌다.
    */
    if (!hasHistory && kind === null) {
      skipped.push({ userId: u.userId, reason: "no_history" });
      continue;
    }
```

그 아래 기존 슬롯 판정은 그대로 두고(`notifyMinute`·`nowMinute`·`sameSlot`), **`todayKey`·`keys`를 다시 계산하는 줄은 지운다**(위로 올렸다). 마지막 `briefings.push`를 이렇게 바꾼다:

```ts
    const stage = streakStage(keys, todayKey);
    const streak = currentStreak(keys, todayKey);
    const copy = kind ? suggestionCopy(kind, todayKey, streak) : null;

    briefings.push({
      userId: u.userId,
      type: copy ? "workout_suggestion" : "morning_briefing",
      // 제안이 있으면 제안이 제목을 가져간다. 없으면 지금 그대로 스트릭 문구.
      title: copy ? copy.title : briefingTitle(stage, streak, todayKey),
      // 옛 코드는 `body`가 **항상 null**이었다(크루 집계 문구를 없앤 2026-07-28 이후).
      // 제안이 그 빈자리를 채운다.
      body: copy ? copy.body : null,
      // ⚠️ 유형이 달라져도 키는 그대로다 — 위 `Briefing.type` 주석 참조.
      dedupeKey: `morning_briefing:${u.userId}:${todayKey}`,
    });
```

⚠️ `hasHistory`가 false인 신규 유저는 `streakStage`·`currentStreak`가 각각 `none`·`0`을 준다. 제안이 제목을 가져가므로 `briefingTitle`은 불리지 않는다.

- [ ] **Step 5: 통과를 확인한다 — 기존 테스트까지 전부**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/briefing.test.ts`
Expected: PASS (기존 건수 + 6)

⚠️ 기존 `"완료 세션 없으면 no_history"`가 **여전히 통과**해야 한다. 깨지면 픽스처의 `signedUpAt` 기본값이 창 안으로 들어간 것이다.

- [ ] **Step 6: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/briefing.ts src/lib/domain/briefing.test.ts
git commit -m "feat(briefing): 계획 없는 날 제안을 실어 보내고 신규 유저 게이트를 연다"
```

---

### Task 5: 라우트가 제안 재료를 읽어 넘긴다

**Files:**
- Modify: `src/app/api/briefing/route.ts`

- [ ] **Step 1: 세션 조회에 `tabata_minutes`를 더한다**

`route.ts:148-152`의 `SessionRow`와 `select`를 바꾼다:

```ts
  type SessionRow = {
    user_id: string;
    completed_at: string;
    started_at: string | null;
    /** 인터벌 세션이면 코스 분수 (0019). 제안 분기의 `lastSessionWasInterval` 재료 */
    tabata_minutes: number | null;
  };
```

`select` 문자열도 바꾼다:

```ts
      .select("user_id, completed_at, started_at, tabata_minutes")
```

- [ ] **Step 2: 프로필에 `created_at`을 더한다**

`route.ts:171`을 바꾼다:

```ts
    admin.from("profiles").select("id, timezone, created_at"),
```

- [ ] **Step 3: 오늘 계획과 챌린지 참가를 읽는다**

`const [profilesRes, settingsRes] = await Promise.all([...])` **바로 아래**에 추가:

```ts
  /*
    오늘 계획이 있는 사람 — 있으면 제안하지 않는다.

    ⚠️ **전량 조회 금지.** 이 크론은 30분마다, 하루 48번 돈다. `plan_date`를
       어제~내일로 좁힌다 — ±1일은 유저 타임존 폭이다(UTC 기준 오늘 하루가
       누군가에겐 어제이고 누군가에겐 내일이다).
  */
  const utcToday = now.toISOString().slice(0, 10);
  const dayShift = (days: number) =>
    new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const { data: planRows, error: plansError } = await admin
    .from("workout_plans")
    .select("user_id, plan_date")
    .gte("plan_date", dayShift(-1))
    .lte("plan_date", dayShift(1));
  if (plansError) {
    return NextResponse.json({ error: plansError.message }, { status: 500 });
  }
  const planDaysByUser = new Map<string, Set<string>>();
  for (const row of planRows ?? []) {
    const set = planDaysByUser.get(row.user_id as string) ?? new Set<string>();
    set.add(row.plan_date as string);
    planDaysByUser.set(row.user_id as string, set);
  }

  /*
    active 챌린지에 joined로 들어간 사람 — 기록 0건이어도 인터벌을 제안한다.
    실패해도 브리핑을 죽이지 않는다: 챌린지를 못 읽었다고 전 사용자의 알림을
    잃으면 손해가 훨씬 크다(같은 파일의 `remindPendingBugReports`와 같은 규칙).
  */
  const challengeMembers = new Set<string>();
  try {
    const { data: activeRows } = await admin
      .from("challenges")
      .select("id")
      .eq("status", "active");
    const activeIds = (activeRows ?? []).map((r) => r.id as string);
    if (activeIds.length > 0) {
      const { data: partRows } = await admin
        .from("challenge_participants")
        .select("user_id")
        .eq("status", "joined")
        .in("challenge_id", activeIds);
      for (const r of partRows ?? []) challengeMembers.add(r.user_id as string);
    }
  } catch {
    // 챌린지를 못 읽으면 그 분기만 조용히 빠진다 — 알림 자체는 나간다
  }
  void utcToday;
```

⚠️ `void utcToday;`는 지운다 — 위 스니펫에서 쓰지 않는 변수다. `dayShift`만 남기고 `utcToday` 선언 줄을 삭제하라.

- [ ] **Step 4: 마지막 세션의 인터벌 여부를 모은다**

`completedAtsByUser`·`startedAtsByUser`를 채우는 루프(`route.ts:181-191`) **아래**에 추가:

```ts
  /*
    가장 최근 완료 세션이 인터벌이었나.

    ⚠️ `sessionRows`는 `completed_at` **오름차순**이다(위 order). 그래서 그냥
       덮어쓰면 마지막에 남는 것이 가장 최근이다 — 정렬을 바꾸면 여기가 뒤집힌다.
  */
  const lastWasIntervalByUser = new Map<string, boolean>();
  for (const row of sessionRows) {
    lastWasIntervalByUser.set(row.user_id, row.tabata_minutes !== null);
  }
```

- [ ] **Step 5: `users` 조립에 새 필드를 넘긴다**

`route.ts:197-203`의 `users` 매핑을 바꾼다:

```ts
  const users: BriefingUser[] = (profilesRes.data ?? []).map((p) => {
    const timezone = (p.timezone as string) || "Asia/Seoul";
    return {
      userId: p.id,
      timezone,
      completedAts: completedAtsByUser.get(p.id) ?? [],
      startedAts: startedAtsByUser.get(p.id) ?? [],
      morningBrief: settings.get(p.id) ?? true,
      // ── 계획 없는 날 제안 (2026-08-16) ──
      signedUpAt: new Date(p.created_at as string),
      // ⚠️ 오늘은 **이 사람 타임존 기준**이다. UTC 오늘로 재면 KST 사용자에게
      //    하루 어긋난다 — `dayKey`가 그 계산의 단일 원천이다.
      hasPlanToday: (planDaysByUser.get(p.id) ?? new Set()).has(
        dayKey(now, timezone),
      ),
      isInActiveChallenge: challengeMembers.has(p.id),
      lastSessionWasInterval: lastWasIntervalByUser.get(p.id) ?? false,
    };
  });
```

파일 맨 위 import에 `dayKey`를 더한다:

```ts
import { dayKey } from "@/lib/domain/time";
```

- [ ] **Step 6: 알림 INSERT가 유형을 쓰게 한다**

`route.ts:216-233`의 upsert에서 `type`을 하드코딩한 곳을 바꾼다:

```ts
        {
          user_id: b.userId,
          type: b.type,
          title: b.title,
          body: b.body,
          dedupe_key: b.dedupeKey,
        },
```

- [ ] **Step 7: 타입·린트**

Run: `cd /c/Users/SAMSUNG/workout-app && pnpm typecheck && pnpm lint`
Expected: 오류 0

- [ ] **Step 8: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/app/api/briefing/route.ts
git commit -m "feat(cron): 브리핑이 오늘 계획·가입일·챌린지를 읽어 제안을 정한다"
```

---

### Task 6: 알림 유형 배선 (마이그레이션 + 목적지 + 아이콘)

**Files:**
- Create: `supabase/migrations/0078_workout_suggestion_notification.sql`
- Modify: `src/lib/domain/push.ts`
- Modify: `src/lib/domain/push.test.ts`
- Modify: `src/lib/social.ts`
- Modify: `src/components/notification-bell.tsx`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/push.test.ts` **끝에** 추가:

```ts
/**
 * 2026-08-16 — 계획 없는 날 제안.
 *
 * ⚠️⚠️ `PUSH_URL_BY_TYPE`은 **exhaustive가 아니다**(`Record<string,string>`).
 * 유형을 늘려도 컴파일러가 안 잡고 `/home`으로 조용히 떨어진다. 그러면 알림은
 * "담아 뒀어요"라고 말하면서 홈으로 보내고, 사용자는 담긴 것을 못 찾는다.
 * (`TYPE_ICON`은 exhaustive라 타입 오류로 막힌다 — 여기만 손으로 챙겨야 한다.)
 */
describe("workout_suggestion — 계획 없는 날 제안", () => {
  it("기록 탭으로 보내고 제안 표식을 싣는다", () => {
    const payload = pushPayloadFor({
      type: "workout_suggestion",
      title: "🚶 오늘은 10분 걷기부터",
      body: "오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요",
    });
    expect(payload.url).toBe("/record?suggest=1");
  });

  it("홈으로 떨어지지 않는다", () => {
    const payload = pushPayloadFor({
      type: "workout_suggestion",
      title: "t",
      body: "b",
    });
    expect(payload.url).not.toBe("/home");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/push.test.ts -t "계획 없는 날 제안"`
Expected: FAIL — `expected '/home' to be '/record?suggest=1'`

- [ ] **Step 3: 목적지를 더한다**

`src/lib/domain/push.ts`의 `PUSH_URL_BY_TYPE`에서 `challenge_dropped: "/challenge",` **아래**에 추가:

```ts
  // 2026-08-16 — 계획 없는 날 제안. 기록 탭이 `?suggest`를 읽어 종목을 담고
  // 주소에서 지운다(`record/page.tsx`). 값 자체엔 의미가 없다 — 존재 플래그다.
  workout_suggestion: "/record?suggest=1",
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/push.test.ts`
Expected: PASS

- [ ] **Step 5: 알림 목록 타입과 아이콘**

`src/lib/social.ts`에서 `NotificationRow["type"]` 유니온을 찾아 `"workout_suggestion"`을 더한다. (`challenge_dropped` 옆에 둔다.)

`src/components/notification-bell.tsx`의 `TYPE_ICON`에 추가:

```ts
  workout_suggestion: "🚶",
```

⚠️ `TYPE_ICON`은 exhaustive라, 유니온만 늘리고 아이콘을 안 넣으면 **타입 오류로 막힌다.** 그게 의도된 가드다.

- [ ] **Step 6: 마이그레이션**

`supabase/migrations/0078_workout_suggestion_notification.sql` 신규 생성:

```sql
-- 0078: 계획 없는 날 운동 제안 알림 유형
-- 설계: docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md
-- 적용: Supabase SQL Editor에 전체 붙여넣기 → Run (1회만)
--
-- ⚠ notifications_type_check는 **허용목록** 방식이라 목록 **전체**를 다시 써야 한다.
--   0077의 목록을 그대로 베끼고 workout_suggestion 한 줄만 더했다.
--   하나라도 빠지면 그 유형의 알림이 조용히 죽는다.
--
-- ⚠ **지금 Run해도 안전하다.** 운영에 떠 있는 앱은 이 유형을 아직 안 쓰므로
--   아무 변화가 없다. CLAUDE.md의 "지금 돌려도 안전한 것" 쪽이다
--   (level_definitions UPDATE 같은 "배포 뒤에 돌려야 하는 것"이 아니다).
--
-- ⚠ 되돌릴 때는 **행을 먼저 지우고** 제약을 되돌린다. 순서를 뒤집으면
--   이미 저장된 workout_suggestion 행 때문에 제약 추가가 위반으로 실패한다.

begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
    'level_up', 'app_update',
    'crew_request', 'crew_accepted',                     -- 0038
    'challenge_invite',                                  -- 0042
    'bug_reported', 'bug_fixed',                         -- 0052
    'challenge_peek_unlocked',                           -- 0054
    'challenge_starting_soon', 'challenge_dropped',      -- 0077
    'workout_suggestion'                                 -- 0078
  ));

commit;
```

- [ ] **Step 7: 사용자에게 Run을 요청한다 — 여기서 멈춘다**

에이전트는 SQL을 실행할 수 없다. 사용자에게 `0078` 파일 전체를 SQL Editor에 붙여넣고 Run하도록 요청하고 **완료 확인을 받는다.**

⚠️ 이 배치는 `pnpm dev`가 운영 DB에 붙으므로(스테이징 없음), **Task 10의 개발 서버 확인 전에 Run이 끝나 있어야** 제안 알림 INSERT가 통과한다.

- [ ] **Step 8: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add supabase/migrations/0078_workout_suggestion_notification.sql src/lib/domain/push.ts src/lib/domain/push.test.ts src/lib/social.ts src/components/notification-bell.tsx
git commit -m "feat(notify): workout_suggestion 유형 배선 (0078 + 목적지 + 아이콘)"
```

---

### Task 7: draft v7 — 자정에 제안을 지운다

⚠️⚠️ **`loadDraft`의 승격 경로가 여섯 곳이다**(v1·v2·v3·v4·v5·v6 판정). `workout.ts:158`의 주석이 경고한다 — *"하나라도 옛 번호로 끝내면 그 draft는 통째로 버려진다 — 진행 중이던 운동이 날아간다."* **여섯 곳을 전부 고친다.**

**Files:**
- Modify: `src/lib/workout.ts:81-201`
- Test: `src/lib/domain/suggestion-draft.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/suggestion-draft.test.ts` 신규 생성:

```ts
import { describe, expect, it } from "vitest";
import { emptyDraft, expireStaleSuggestion, type WorkoutDraft } from "@/lib/workout";

const TODAY = "2026-08-16";
const YESTERDAY = "2026-08-15";

function draftWith(over: Partial<WorkoutDraft>): WorkoutDraft {
  return {
    ...emptyDraft(),
    exercises: [
      {
        key: "e1",
        name: "걷기",
        bodyPart: "유산소",
        exerciseType: "cardio",
        measure: null,
        isCustom: false,
        sets: [
          { key: "s1", weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0, done: false },
        ],
      },
    ],
    ...over,
  };
}

describe("expireStaleSuggestion — 자정에 제안을 지운다", () => {
  /**
   * ⚠️⚠️ **이 파일에서 가장 중요한 단언이다.**
   *
   * 스탬프가 없다는 것은 **사용자가 직접 담았다**는 뜻이다. 그걸 지우면
   * 어제 저녁에 짜 둔 운동이 아침에 사라진다. 제안만 지운다.
   */
  it("스탬프 없는 draft는 손대지 않는다", () => {
    const draft = draftWith({ suggestedForDayKey: null });
    expect(expireStaleSuggestion(draft, TODAY)).toBe(draft);
  });

  it("오늘 제안은 그대로 둔다", () => {
    const draft = draftWith({ suggestedForDayKey: TODAY });
    expect(expireStaleSuggestion(draft, TODAY)).toBe(draft);
  });

  it("어제 제안은 종목을 비운다", () => {
    const draft = draftWith({ suggestedForDayKey: YESTERDAY });
    const next = expireStaleSuggestion(draft, TODAY);
    expect(next.exercises).toHaveLength(0);
    expect(next.suggestedForDayKey).toBeNull();
  });

  /**
   * 운동 중에는 무슨 일이 있어도 손대지 않는다. 자정을 넘겨 운동하는 사람의
   * 세션이 진행 중인 채로 목록만 비면 화면과 서버가 어긋난다.
   */
  it("운동 중이면 어제 제안이라도 안 지운다", () => {
    const draft = draftWith({
      suggestedForDayKey: YESTERDAY,
      startedAtMs: 1_700_000_000_000,
    });
    expect(expireStaleSuggestion(draft, TODAY)).toBe(draft);
  });

  /**
   * ⚠️ `<` 비교가 아니라 `!==` 다. 기기 시계가 앞서 있거나 사용자가 타임존을
   * 옮기면 스탬프가 **미래**일 수 있는데, `<`면 그 draft가 영영 안 지워진다.
   */
  it("스탬프가 미래여도 오늘이 아니면 지운다", () => {
    const draft = draftWith({ suggestedForDayKey: "2026-08-20" });
    expect(expireStaleSuggestion(draft, TODAY).exercises).toHaveLength(0);
  });

  it("휴식 설정은 보존한다 — 제안과 무관한 사용자 설정이다", () => {
    const draft = draftWith({ suggestedForDayKey: YESTERDAY, restSeconds: 120 });
    expect(expireStaleSuggestion(draft, TODAY).restSeconds).toBe(120);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/suggestion-draft.test.ts`
Expected: FAIL — `does not provide an export named 'expireStaleSuggestion'`

- [ ] **Step 3: 타입을 v7로 올린다**

`src/lib/workout.ts`의 `WorkoutDraft`를 바꾼다 (`version: 6` → `7`, 필드 추가):

```ts
export type WorkoutDraft = {
  version: 7;
  sessionId: string | null;
  startedAtMs: number | null;
  scheduledPlanId: string | null;
  sourceSessionId: string | null;
  effortMessage: string | null;
  restSeconds: number;
  exercises: LocalExercise[];
  pausedSeconds: number;
  pausedAtMs: number | null;
  lastActivityMs: number | null;
  tabataMinutes: number | null;
  program: ProgramDraftMeta | null;
  /**
   * 이 draft를 **기계가 담아 준 날** (2026-08-16). 사용자가 직접 담았으면 `null`.
   *
   * ⚠️ 이 칸이 차 있다는 것은 "아직 제안 그대로"라는 뜻이다. 사용자가 종목을
   *    더하거나 빼는 **순간 `null`로 만든다** — 그때부터 본인 것이므로 다음 날
   *    지우면 안 된다.
   */
  suggestedForDayKey: string | null;
};
```

`SUGGESTION_DEFAULTS`를 `PROGRAM_DEFAULTS` 아래에 더한다:

```ts
/** 제안 필드의 초기값 — v6 이하 승격과 새 세션이 같이 쓴다 (2026-08-16) */
const SUGGESTION_DEFAULTS = { suggestedForDayKey: null } as const;
```

`emptyDraft`를 바꾼다 (`version: 7`, 스프레드 추가):

```ts
export function emptyDraft(restSeconds = DEFAULT_REST_SECONDS): WorkoutDraft {
  return {
    version: 7,
    sessionId: null,
    startedAtMs: null,
    scheduledPlanId: null,
    sourceSessionId: null,
    effortMessage: null,
    restSeconds,
    exercises: [],
    ...IDLE_DEFAULTS,
    ...PROGRAM_DEFAULTS,
    ...SUGGESTION_DEFAULTS,
  };
}
```

- [ ] **Step 4: 승격 경로 여섯 곳을 전부 v7로 끝낸다**

`loadDraft` 안에서 **모든** `version: 6`을 `version: 7`로 바꾸고 각 반환에 `...SUGGESTION_DEFAULTS`를 더한다. 타입 별칭도 고친다:

```ts
    type SuggestionFields = keyof typeof SUGGESTION_DEFAULTS;
    type LegacyDraft<V extends number, Missing extends keyof WorkoutDraft> = Omit<
      WorkoutDraft,
      "version" | Missing | IdleFields | ProgramFields | SuggestionFields
    > & { version: V };

    const parsed = JSON.parse(raw) as
      | WorkoutDraft
      | LegacyDraft<1, "scheduledPlanId" | "sourceSessionId" | "effortMessage">
      | LegacyDraft<2, "sourceSessionId" | "effortMessage">
      | LegacyDraft<3, "sourceSessionId">
      | LegacyDraft<4, never>
      | (Omit<WorkoutDraft, "version" | ProgramFields | SuggestionFields> & {
          version: 5;
        })
      | (Omit<WorkoutDraft, "version" | SuggestionFields> & { version: 6 });
    if (!parsed || !Array.isArray(parsed.exercises)) {
      return emptyDraft();
    }
    // ⚠️ 승격 경로는 **전부 v7에서 끝난다.** 하나라도 옛 번호로 끝내면 그 draft는
    //    `parsed.version !== 7`에 걸려 통째로 버려진다 — 진행 중이던 운동이 날아간다.
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 7,
        scheduledPlanId: null,
        sourceSessionId: null,
        effortMessage: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 2) {
      return {
        ...parsed,
        version: 7,
        sourceSessionId: null,
        effortMessage: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 3) {
      return {
        ...parsed,
        version: 7,
        sourceSessionId: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 4) {
      return {
        ...parsed,
        version: 7,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 5) {
      return {
        ...parsed,
        version: 7,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 6) {
      return { ...parsed, version: 7, ...SUGGESTION_DEFAULTS };
    }
    if (parsed.version !== 7) return emptyDraft();
    return parsed;
```

- [ ] **Step 5: 만료 함수를 더한다**

`src/lib/workout.ts`의 `clearDraft` **아래**에 추가:

```ts
/**
 * 어제 담긴 제안을 지운다 (2026-08-16) — **순수 함수다.**
 *
 * `loadDraft` 안에 넣지 않는 이유: 저장소 접근과 만료 규칙은 다른 일이고,
 * 규칙만 따로 있어야 테스트가 localStorage 없이 잡는다.
 *
 * ⚠️ **스탬프가 없으면 손대지 않는다.** 그건 사용자가 직접 담은 것이다 —
 *    지우면 어제 저녁에 짜 둔 운동이 아침에 사라진다.
 *
 * ⚠️ 판정은 `< todayKey`가 아니라 **`!== todayKey`** 다. 기기 시계가 앞서 있거나
 *    타임존을 옮기면 스탬프가 미래일 수 있는데, `<`면 그 draft가 영영 안 지워진다.
 *
 * ⚠️ 운동 중이면 어떤 경우에도 손대지 않는다. 세션이 진행 중인 채로 목록만 비면
 *    화면과 서버가 어긋난다.
 */
export function expireStaleSuggestion(
  draft: WorkoutDraft,
  todayKey: string,
): WorkoutDraft {
  if (draft.suggestedForDayKey === null) return draft;
  if (draft.suggestedForDayKey === todayKey) return draft;
  if (draft.startedAtMs !== null) return draft;
  return {
    ...emptyDraft(draft.restSeconds),
    suggestedForDayKey: null,
  };
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/suggestion-draft.test.ts`
Expected: PASS (6건)

- [ ] **Step 7: 전체 테스트 — 승격 경로를 빠뜨렸는지 여기서 드러난다**

Run: `cd /c/Users/SAMSUNG/workout-app && pnpm test && pnpm typecheck`
Expected: 전건 통과 · 타입 오류 0

⚠️ draft를 만드는 테스트가 여럿이라, `version: 7`을 빠뜨린 곳이 있으면 여기서 잡힌다.

- [ ] **Step 8: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/workout.ts src/lib/domain/suggestion-draft.test.ts
git commit -m "feat(record): draft v7 — 자정이 지난 제안을 지운다"
```

---

### Task 8: 기록 탭이 제안을 담는다

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: 만료를 draft 로드 직후에 건다**

`record/page.tsx`에서 `loadDraft(userId)`를 부르는 곳을 찾아, 결과를 `expireStaleSuggestion`으로 감싼다. import에 추가:

```ts
import { expireStaleSuggestion } from "@/lib/workout";
```

로드 지점을 이렇게 바꾼다 (기존 `loadDraft(userId)` 표현식을 감싼다):

```ts
        expireStaleSuggestion(
          loadDraft(userId),
          dayKey(
            new Date(),
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
          ),
        )
```

⚠️ `dayKey`와 타임존 표현은 **같은 파일의 `record/page.tsx:534-537`이 이미 쓰는 것과 글자까지 같게** 맞춘다. 두 곳이 다른 방식으로 오늘을 계산하면 하루가 어긋난다.

- [ ] **Step 2: 제안 상태를 계산한다**

`isEmpty`(`record/page.tsx:2015`) **아래**에 추가:

```ts
  /**
   * 오늘의 제안 (2026-08-16). 알림과 **같은 함수**로 정한다 —
   * 설계 §3: 함수를 공유해도 입력이 갈리면 소용없어서 입력도 1비트로 낮췄다.
   *
   * `todayIntervalPlan`·`hasHistory`·`challengeGoals`는 이 파일이 이미 갖고 있다.
   */
  const suggestionKind = useMemo(
    () =>
      pickSuggestionKind({
        hasPlanToday: todayPlanExists,
        didWorkoutToday,
        hasHistory,
        lastSessionWasInterval,
        isInActiveChallenge: challengeGoals !== null,
        signedUpDayKey,
        todayKey: dayKey(
          new Date(),
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
        ),
      }),
    [
      todayPlanExists,
      didWorkoutToday,
      hasHistory,
      lastSessionWasInterval,
      challengeGoals,
      signedUpDayKey,
    ],
  );
```

⚠️ `todayPlanExists`·`didWorkoutToday`·`lastSessionWasInterval`·`signedUpDayKey`는 이 파일에 **아직 없다.** 다음 스텝에서 만든다.

- [ ] **Step 3: 없는 재료 넷을 만든다**

`hasHistory` 상태(`record/page.tsx:350`) **아래**에 상태를 더한다:

```ts
  /** 오늘 `workout_plans`에 행이 있나 — 제안 분기용 (2026-08-16) */
  const [todayPlanExists, setTodayPlanExists] = useState(false);
  /** 오늘 이미 완료한 세션이 있나 */
  const [didWorkoutToday, setDidWorkoutToday] = useState(false);
  /** 가장 최근 완료 세션이 인터벌이었나 */
  const [lastSessionWasInterval, setLastSessionWasInterval] = useState(false);
  /** 가입일 (`"YYYY-MM-DD"`) — 신규 걷기 창 판정 */
  const [signedUpDayKey, setSignedUpDayKey] = useState("1970-01-01");
```

`hasCompletedHistory`를 부르는 effect(`record/page.tsx:595-608`) 안에서 나머지도 같이 채운다. **새 질의를 최소로 하기 위해** 한 번에 읽는다:

```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const has = await hasCompletedHistory(userId);
        if (!cancelled) setHasHistory(has);
      } catch {
        // 기록 자체는 막지 않는다
      }
      try {
        const facts = await getSuggestionFacts(userId);
        if (cancelled) return;
        setDidWorkoutToday(facts.didWorkoutToday);
        setLastSessionWasInterval(facts.lastSessionWasInterval);
        setSignedUpDayKey(facts.signedUpDayKey);
      } catch {
        // 못 읽으면 제안이 안 뜰 뿐이다 — 기록은 그대로 된다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

`todayPlanExists`는 **이미 도는** 계획 조회 effect(`record/page.tsx:559-577`) 안에서 채운다. `const todayPlan = plans.find(...)` 바로 아래에 한 줄:

```ts
        setTodayPlanExists(todayPlan !== undefined);
```

- [ ] **Step 4: `getSuggestionFacts`를 만든다**

`src/lib/workout.ts`의 `hasCompletedHistory` **아래**에 추가:

```ts
/**
 * 제안 분기에 필요한 세 가지를 **한 번에** 읽는다 (2026-08-16).
 *
 * ⚠️ 완료 **수**를 세지 않는다. 화면은 유무(`hasCompletedHistory`)만 알면 되고,
 *    수를 요구하면 서버(브리핑 라우트)와 입력이 갈릴 여지가 생긴다 —
 *    설계 §3이 막으려는 것이 정확히 그 갈림이다.
 */
export async function getSuggestionFacts(userId: string): Promise<{
  didWorkoutToday: boolean;
  lastSessionWasInterval: boolean;
  signedUpDayKey: string;
}> {
  const supabase = getSupabaseBrowserClient();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  const [lastRes, profileRes] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("completed_at, tabata_minutes")
      .eq("user_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("created_at").eq("id", userId).single(),
  ]);
  const last = lastRes.data;
  return {
    didWorkoutToday: last
      ? dayKey(new Date(last.completed_at as string), tz) ===
        dayKey(new Date(), tz)
      : false,
    lastSessionWasInterval: last ? last.tabata_minutes !== null : false,
    signedUpDayKey: profileRes.data
      ? dayKey(new Date(profileRes.data.created_at as string), tz)
      : "1970-01-01",
  };
}
```

⚠️ `src/lib/workout.ts`가 `dayKey`를 import하는지 확인하고, 없으면 `import { dayKey } from "@/lib/domain/time";`을 더한다.

- [ ] **Step 5: `?suggest`를 읽어 담는다**

`record/page.tsx`에 effect를 더한다 (계획 자동 담기 effect **아래**):

```ts
  /**
   * 푸시에서 온 `?suggest`를 읽어 오늘의 제안을 담는다 (2026-08-16).
   *
   * ⚠️⚠️ **`useSearchParams`를 쓰지 마라.** 이 저장소는 그 훅을 두 번 거부했다
   *    (`record-view.ts:8`, `auth/callback/page.tsx:50`) — Suspense 경계를 요구해
   *    빌드가 CSR로 떨어진다. 여기서는 `window.location.search`를 이펙트 안에서
   *    읽으므로 훅이 아니고, 경계도 필요 없다.
   *
   * ⚠️ `record-view.ts`의 모듈 변수 방식은 여기서 **쓸 수 없다.** 푸시는 앱을
   *    URL로 **새로** 열어서 그 모듈이 초기값(false)으로 평가된다.
   *
   * ⚠️ 읽는 즉시 주소에서 지운다. 안 지우면 새로고침마다 다시 담긴다.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("suggest")) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (suggestionKind === null) return;
    // 기존 자동 담기와 **같은 가드** — 사용자가 만든 상태를 덮지 않는다
    if (draftRef.current.exercises.length > 0) return;
    if (draftRef.current.startedAtMs !== null) return;
    void applySuggestion(suggestionKind);
  }, [suggestionKind]);
```

- [ ] **Step 6: `applySuggestion`을 만든다**

⚠️⚠️ **`handleScheduleFromPast`를 쓰면 안 된다.** 그 함수는 `Promise<WorkoutPlan>`을 돌려준다 — **`workout_plans`에 행을 만든다.** 그러면 달력에 `예정`이 찍혀서 이 설계의 전제("12시 지나면 달력에 안 남는다")가 무너진다. 지난 운동을 **draft에만** 병합하는 함수는 `addPastSession`(`record/page.tsx:955`)이다.

아래 이름은 **전부 실측했다**(2026-08-16):

| 쓰는 것 | 위치 | 시그니처 |
|---|---|---|
| `addExercises` | `:822` | `(items: CatalogExercise[]) => void` — ⚠️ `addCatalogExercises`가 **아니다** |
| `addPastSession` | `:955` | `(sessionId: string) => Promise<boolean>` |
| `openTabataSheet` | `:949` | `(prefill: TabataPrefill \| null) => Promise<void>` |
| `getCompletedSessions` | `workout.ts:1002` | `completed_at` **내림차순** → `[0]`이 최신 |

`openTabataSheet`(`record/page.tsx:949`) **아래**에 추가:

```ts
  /**
   * 제안을 실제로 담는다 (2026-08-16).
   *
   * ⚠️⚠️ **`handleScheduleFromPast`를 쓰지 마라.** 그건 `workout_plans`에 행을
   *    만든다 — 달력에 `예정`이 찍혀서 "제안은 자정에 사라진다"가 거짓이 된다.
   *    draft에만 담는 길은 `addPastSession`이다.
   *
   * ⚠️ **인터벌만 목록에 담지 않는다.** 담으면 음원도 코스도 없는 맨몸 4개가 된다
   *    (`tabata.ts`의 `tabataResumeFromSession` 주석에 그 옛 버그가 적혀 있다).
   */
  async function applySuggestion(kind: SuggestionKind): Promise<void> {
    const todayKey = dayKey(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
    );

    if (kind === "interval") {
      const picked = tabataPickFromNames(INTERVAL_SUGGESTION_NAMES, catalog);
      if (picked.length === 0) {
        showToast("인터벌 종목을 찾지 못했어요");
        return;
      }
      setSubTab("workout");
      await openTabataSheet({ picked, minutes: 4 });
      return;
    }

    if (kind === "walk") {
      const walk = catalog.find((item) => item.name === "걷기");
      if (!walk) return;
      addExercises([walk]);
      setDraft((current) => ({ ...current, suggestedForDayKey: todayKey }));
      return;
    }

    // repeat — 가장 최근 완료 세션을 draft에 병합한다.
    // ⚠️ `loadPastSessions()`는 상태만 채우고 값을 안 돌려준다(`:912`). 같은 틱에
    //    읽어야 하므로 직접 부른다.
    const sessions = await getCompletedSessions(userId);
    const recent = sessions[0];
    if (!recent) return;
    setPastSessions(sessions);
    setPastLoaded(true);
    const ok = await addPastSession(recent.id);
    if (ok) setDraft((current) => ({ ...current, suggestedForDayKey: todayKey }));
  }
```

⚠️ `addPastSession`은 `pastSessions` 상태를 클로저로 읽어 "지난 타바타면 시트로" 분기를 한다. 위에서 `setPastSessions`를 불러도 그 클로저는 **이번 틱에 갱신되지 않는다.** 그래도 안전하다 — 지난 세션이 인터벌이면 `pickSuggestionKind`가 애초에 `"interval"`을 주므로 `repeat` 경로에 인터벌 세션이 올 수 없다.

⚠️⚠️ **`INTERVAL_SUGGESTION_NAMES`를 `workout-suggestion.ts`에 두지 마라.** 그 상수의 원천인 `recommended-exercises.ts`가 `@/lib/challenge`를 import하고, 그게 다시 **`getSupabaseBrowserClient`**를 끌어온다(`supabase/client.ts:56`). `workout-suggestion.ts`는 **브리핑 서버 라우트가 import하는 모듈**이라, 거기에 넣으면 서버 번들이 브라우저 Supabase 클라이언트를 끌고 들어간다.

설계 §3이 *"서버는 종목을 알 필요가 없다"*고 못 박은 것이 정확히 이 경계다. 종목 이름은 **화면 쪽에만** 둔다. `record/page.tsx` 안, 컴포넌트 **밖**(모듈 최상단)에 선언한다:

```ts
/**
 * 4분 인터벌 구성 종목 — **상황별 추천의 `interval` 칸과 같은 목록을 쓴다.**
 * 두 벌로 적으면 한쪽만 고쳐져 "같은 인터벌인데 종목이 다르다"가 된다.
 *
 * ⚠️ 이걸 `workout-suggestion.ts`로 옮기지 마라. 그 모듈은 브리핑 **서버**
 *    라우트가 import한다 — `recommended-exercises`가 `@/lib/challenge`를 통해
 *    `getSupabaseBrowserClient`를 끌어오므로 서버가 브라우저 클라이언트를 안게 된다.
 */
const INTERVAL_SUGGESTION_NAMES: readonly string[] =
  SITUATIONS.find((s) => s.key === "interval")?.names ?? [];
```

`record/page.tsx` import에 `SITUATIONS`(`@/lib/domain/recommended-exercises`)와 `tabataPickFromNames`(`@/lib/domain/tabata`)를 더한다. `getCompletedSessions`가 이미 import돼 있는지 확인하고 없으면 더한다.

- [ ] **Step 7: 사용자가 편집하면 스탬프를 지운다**

세 곳이다 (실측):

| 함수 | 위치 |
|---|---|
| `addExercises` | `record/page.tsx:822` |
| `removeExercise` | `record/page.tsx:1487` |
| `replaceFocusedExercise` | `record/page.tsx:728` |

각 함수의 `setDraft` 반환 객체에 한 줄을 더한다:

```ts
      // 사용자가 목록을 건드렸다 — 이제 본인 것이므로 자정 만료 대상이 아니다
      suggestedForDayKey: null,
```

예를 들어 `addExercises`(`:834`)는 이렇게 된다:

```ts
    setDraft((d) => ({
      ...d,
      exercises: [...d.exercises, ...added],
      // 사용자가 목록을 건드렸다 — 이제 본인 것이므로 자정 만료 대상이 아니다
      suggestedForDayKey: null,
    }));
```

⚠️ **순서가 중요하다.** `applySuggestion`의 `walk` 분기가 `addExercises([walk])`를 부른 **다음에** 스탬프를 찍는다(Step 6). 그래서 여기서 지워도 제안 경로는 곧바로 다시 찍힌다. 반대로 두면 제안이 영영 만료되지 않는다.

- [ ] **Step 8: 타입·린트·테스트**

Run: `cd /c/Users/SAMSUNG/workout-app && pnpm typecheck && pnpm lint && pnpm test`
Expected: 오류 0 · 전건 통과

- [ ] **Step 9: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add "src/app/(tabs)/record/page.tsx" src/lib/workout.ts
git commit -m "feat(record): 알림에서 온 제안을 담고 주소에서 표식을 지운다"
```

---

### Task 9: 빈 화면 제안 카드 (C2)

**Files:**
- Modify: `src/components/record/record-empty-state.tsx`
- Modify: `src/components/record/record-empty-state.test.tsx`
- Modify: `src/app/(tabs)/record/page.tsx` (카드 배선)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/record/record-empty-state.test.tsx` **끝에** 추가:

```tsx
/**
 * 2026-08-16 — 계획 없는 날 제안 카드 (C2).
 *
 * ⚠️⚠️ 제안이 링크에만 살면 **앱 아이콘으로 들어온 사람은 아무것도 못 본다.**
 * 이 카드가 그 구멍을 막는다.
 */
describe("제안 카드", () => {
  it("걷기 제안이면 주 버튼과 철학문이 뜬다", () => {
    render(
      <RecordEmptyState
        hasHistory={false}
        onAdd={() => {}}
        onLoadRecent={() => {}}
        suggestionKind="walk"
        suggestionBody="오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요"
        onApplySuggestion={() => {}}
        onApplySecondary={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /10분 걷기 담기/ })).toBeTruthy();
    expect(screen.getByText(/빼먹지 않는 게 중요/)).toBeTruthy();
  });

  /**
   * ⚠️ 보조 버튼은 주 버튼과 **하는 일이 다르다** — 담는 게 아니라 시트를 연다.
   * `recommended-picker.tsx`가 같은 함정을 겪었다. 문구로 가른다.
   */
  it("지난 운동 제안에는 '4분 인터벌 시작'이 같이 뜬다", () => {
    render(
      <RecordEmptyState
        hasHistory
        onAdd={() => {}}
        onLoadRecent={() => {}}
        suggestionKind="repeat"
        suggestionBody="지난번 그대로 담아 뒀어요 · 시간 없으면 4분만이라도"
        onApplySuggestion={() => {}}
        onApplySecondary={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /지난번 그대로 담기/ })).toBeTruthy();
    const secondary = screen.getByRole("button", { name: /4분 인터벌/ });
    expect(secondary.textContent).toContain("시작");
    expect(secondary.textContent).not.toContain("담기");
  });

  it("제안이 없으면 카드가 안 뜬다", () => {
    render(
      <RecordEmptyState
        hasHistory
        onAdd={() => {}}
        onLoadRecent={() => {}}
        suggestionKind={null}
        suggestionBody=""
        onApplySuggestion={() => {}}
        onApplySecondary={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /담기/ })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/components/record/record-empty-state.test.tsx -t "제안 카드"`
Expected: FAIL — `suggestionKind` 등이 props에 없다는 타입 오류

- [ ] **Step 3: 구현**

`record-empty-state.tsx`의 props에 추가:

```tsx
  /**
   * 오늘의 제안 (2026-08-16). `null`이면 카드를 안 그린다.
   * 판정은 `pickSuggestionKind` — 알림과 **같은 함수**다.
   */
  suggestionKind?: SuggestionKind | null;
  /** 알림 본문과 **같은 말**이어야 한다 — `suggestionCopy`가 준다 */
  suggestionBody?: string;
  onApplySuggestion?: () => void;
  /** 보조 제안(4분 인터벌) — 담기가 아니라 **시작**이다 */
  onApplySecondary?: () => void;
```

import에 추가:

```tsx
import {
  secondaryKind,
  type SuggestionKind,
} from "@/lib/domain/workout-suggestion";
```

`<section>` 안, `data-testid="record-start-card"` 카드 **위에** 제안 카드를 그린다:

```tsx
      {suggestionKind && onApplySuggestion && (
        <div
          data-testid="suggestion-card"
          className="mb-3 rounded-card border border-accent/50 bg-accent-weak/30 p-4"
        >
          <p className="text-[13px] leading-5 text-text">{suggestionBody}</p>
          <button
            type="button"
            data-priority="primary"
            onClick={onApplySuggestion}
            className="mt-3 h-14 w-full rounded-card bg-accent text-[15px] font-extrabold text-accent-ink"
          >
            {suggestionKind === "walk"
              ? "10분 걷기 담기"
              : suggestionKind === "repeat"
                ? "지난번 그대로 담기"
                : "4분 인터벌 시작"}
          </button>
          {/* ⚠️ 보조는 **담기가 아니라 시작**이다 — 인터벌은 목록에 담으면
              음원도 코스도 없는 맨몸 4개가 된다(`tabata.ts` 주석). */}
          {secondaryKind(suggestionKind) === "interval" && onApplySecondary && (
            <button
              type="button"
              data-priority="secondary"
              onClick={onApplySecondary}
              className="mt-2 h-12 w-full rounded-card border border-accent/50 bg-transparent text-sm font-bold text-accent"
            >
              시간 없으면 · 4분 인터벌 시작
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 4: 기록 페이지에서 배선한다**

`record/page.tsx`의 `<RecordEmptyState .../>`(`:2350`)에 props를 더한다:

```tsx
        <RecordEmptyState
          hasHistory={hasHistory}
          onAdd={() => void openExercisePicker("hub")}
          onLoadRecent={() => void openExercisePicker("past")}
          onLoadRoutine={() => void openExercisePicker("routine")}
          routineCount={routines?.length ?? 0}
          suggestionKind={suggestionKind}
          suggestionBody={
            suggestionKind
              ? suggestionCopy(
                  suggestionKind,
                  dayKey(
                    new Date(),
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                      "Asia/Seoul",
                  ),
                  0,
                ).body
              : ""
          }
          onApplySuggestion={() => void applySuggestion(suggestionKind!)}
          onApplySecondary={() => void applySuggestion("interval")}
        />
```

import에 추가:

```ts
import {
  pickSuggestionKind,
  suggestionCopy,
  type SuggestionKind,
} from "@/lib/domain/workout-suggestion";
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/components/record/record-empty-state.test.tsx`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/components/record/record-empty-state.tsx src/components/record/record-empty-state.test.tsx "src/app/(tabs)/record/page.tsx"
git commit -m "feat(record): 계획 없는 날 빈 화면에 제안 카드를 낸다 (C2)"
```

---

### Task 10: 전체 게이트

**Files:** 없음 (검증만)

- [ ] **Step 1: 직전 기준선을 적어 둔다**

`PROGRESS.md` 최상단의 직전 건수는 **144 파일 / 2116건**(2026-08-14 2차 배포).
이번 배치로 최소 **+35건** 늘어야 한다(suggestion 18 · briefing 6 · push 2 · draft 6 · empty-state 3).

- [ ] **Step 2: 게이트를 순서대로 돌린다**

```bash
cd /c/Users/SAMSUNG/workout-app
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: lint 0 · typecheck 0 · **전건 통과** · build 성공

⚠️ 하나라도 실패하면 **여기서 멈추고** 고친 뒤 처음부터 다시 돌린다.
⚠️ 총 건수가 기준선보다 **줄면** 테스트를 지운 것이므로 원인을 찾는다.

- [ ] **Step 3: 회귀 스크립트**

```bash
cd /c/Users/SAMSUNG/workout-app
node scripts/rls-test.mjs
```
Expected: **128 / 0 failed** (`CLAUDE.md`의 기준선)

⚠️ 이 배치는 RLS를 안 건드리지만, `workout_plans`·`challenge_participants` 조회를 라우트에 더했으므로 한 번 돌려 기준선이 유지되는지 본다. 연달아 돌리면 익명 가입 rate limit(429)에 걸리므로 다른 스크립트와 1~2분 간격을 둔다.

---

### Task 11: 개발 서버에서 눈으로 본다 — 건너뛸 수 없다

⚠️⚠️ **`~/.claude/CLAUDE.md`의 최우선 규칙이다.** lint·typecheck·테스트·build가 전부 초록인데 사용자 폰에서 화면이 깨진 적이 두 번 있다(0044·0055). **이 태스크를 생략하고 배포로 넘어가지 마라.**

⚠️ **Task 6 Step 7(0078 Run)이 끝나 있어야 한다.** `pnpm dev`가 운영 DB에 붙으므로, 제약이 안 바뀐 상태에서 제안 알림을 INSERT하면 위반으로 실패한다.

**계정은 A 하나로 충분하다** — 이 기능은 상대가 없다(알림이 본인에게 온다).

- [ ] **Step 1: 개발 서버**

```bash
cd /c/Users/SAMSUNG/workout-app && pnpm dev
```

- [ ] **Step 2: 375×812로 직접 조작한다**

| # | 화면 | 조작 | 기대 |
|---|---|---|---|
| 1 | `/record` | 계획 없는 날 연다 | **제안 카드가 뜬다** — 주 버튼 + 철학문 한 줄 |
| 2 | 같은 화면 | 주 버튼을 누른다 | 종목이 담기고 `운동 시작`이 뜬다 |
| 3 | 같은 화면 | `4분 인터벌 시작` | **타바타 시트가 4분으로 열린다.** 목록에 맨몸 4개가 담기지 **않는다** |
| 4 | `/record?suggest=1` | 주소로 직접 연다 | 담긴 채로 열리고 **주소창에서 `?suggest`가 사라진다** |
| 5 | 같은 화면 | 새로고침 | **다시 담기지 않는다** (중복 없음) |
| 6 | `/record` 달력 탭 | 오늘 셀 | **`예정` 표시가 없다** ← 제거의 부정 확인 |
| 7 | 계획이 있는 날 | `/record` | 계획이 자동으로 담기고 **제안 카드가 안 뜬다** |
| 8 | 운동 완료 후 | `/record` | 제안 카드가 **안 뜬다** |

- [ ] **Step 3: 자정 만료를 실측한다 — 시계를 못 돌리므로**

브라우저 DevTools → Application → Local Storage → `gnd-workout-draft:{userId}`

1. `suggestedForDayKey`를 **어제 날짜로 고치고** 새로고침 → **종목이 비어야 한다**
2. 종목을 다시 담고 `suggestedForDayKey`를 **`null`로** 두고 새로고침 → **안 비워져야 한다**

⚠️ 2번이 "사용자가 직접 담은 건 안 지운다"의 실측이다. 1번만 보면 절반만 본 것이다.

- [ ] **Step 4: 알림 실물**

⚠️ 각자 슬롯이 달라 그냥 기다리면 안 온다. `?hour=N` 오버라이드로 강제한다(`route.ts:94` — 수동 검증 전용).

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/briefing?hour=9" | jq
```

확인할 것:
- `sent`가 1 이상
- `notifications`에 `type='workout_suggestion'` 행이 생겼는가
- 본문이 제안 문구인가
- **2차 호출이 `alreadySent`로 떨어지는가** (멱등 — 0077 때 `{"sent":1}` → `{"sent":0}`으로 확인한 것과 같은 방식)

⚠️ **검증으로 만든 알림 행은 지운다.**

- [ ] **Step 5: 브라우저 조작 수단이 없으면 — 멈춘다**

위 표를 사용자에게 그대로 내고 **답을 기다린다.** 배포하고 폰 확인으로 미루지 않는다.

- [ ] **Step 6: 이상이 있으면 배포하지 않고 고친다**

고친 뒤 Task 10부터 다시 돌린다.

---

### Task 12: 배포 — 사용자 승인 뒤에만

⚠️ **Task 11이 초록이고 사용자가 승인하기 전에는 시작하지 않는다.**

- [ ] **Step 1: 릴리스 노트 항목**

`src/lib/domain/release-notes.data.json`에 항목을 더한다. ⚠️ **발송하지 않는다** — `--send`는 사용자가 지시할 때 사용자가 Run한다.

- [ ] **Step 2: 사용자 승인**

Task 11 실측 결과를 보고하고 배포 여부를 묻는다.

- [ ] **Step 3: `main`에 병합**

```bash
cd /c/Users/SAMSUNG/workout-app
git checkout main
git merge --no-ff feat/empty-day-workout-suggestion
```

- [ ] **Step 4: `.git` 없는 복사본에서 배포**

⚠️ **`--scope gnd4`가 없으면 `Not authorized`다** — 프로젝트가 팀 소속이다.

```bash
cd /c/Users/SAMSUNG/workout-app
git worktree add --detach /tmp/deploy-main main
cp .env.local /tmp/deploy-main/ && cp -r .vercel /tmp/deploy-main/
cd /tmp/deploy-main && npm install && npm run build
npx vercel@latest --prod --yes --scope gnd4
```

- [ ] **Step 5: 프로덕션 실물 확인**

"배포 명령이 성공했다"는 배포 검증이 아니다. 번들에서 새 문구를 찾는다:

```bash
curl -s https://gnd-one.vercel.app/record \
  | grep -oE '/_next/static/chunks/[a-zA-Z0-9._-]+\.js' | sort -u \
  | while read c; do curl -s "https://gnd-one.vercel.app$c" | grep -o "빼먹지 않는 게 중요"; done
```
Expected: 1건 이상

`workout_suggestion:"/record?suggest=1"`도 같은 방식으로 찾는다 — **없으면 푸시가 `/home`으로 샌다.**

- [ ] **Step 6: `PROGRESS.md` 최상단에 기록**

무엇을 왜 바꿨는지, 검증 결과, `[미검증]`으로 남은 것.

⚠️ `[미검증]`으로 남을 것: **실기기에서 푸시를 눌렀을 때 `/record?suggest=1`로 실제로 이동하는가.** 개발 서버는 서비스워커 푸시를 재현할 수 없다 — 사용자 폰 확인으로 받는다.

---

## 되돌리는 법

| 언제 | 무엇을 |
|---|---|
| 개발 중 한 태스크가 틀렸다 | `git reset --hard HEAD~1` |
| 배치 전체를 접는다 (병합 전) | `git checkout main && git branch -D feat/empty-day-workout-suggestion` |
| 병합했는데 배포 전에 접는다 | `git reset --hard <병합 직전 커밋>` — `git reflog`로 찾는다 |
| **배포 후 문제 발견** | `npx vercel@latest rollback --scope gnd4` |
| 0078을 되돌린다 | ⚠️ **행을 먼저 지운다.** `delete from notifications where type='workout_suggestion';` → 그다음 제약을 0077 목록으로 되돌린다. 순서를 뒤집으면 위반으로 실패한다 |

⚠️ **localStorage draft v7은 되돌릴 것이 없다.** 배포를 롤백하면 옛 코드가 `parsed.version !== 6`에 걸려 v7 draft를 **버린다** — 운동 중이던 사람은 목록을 잃는다. 롤백은 그 위험을 안고 하는 것이니, 진행 중 세션이 적은 시간대에 한다.

---

## Self-Review

**1. Spec coverage**

| 설계 요구 | 담당 |
|---|---|
| §3 분기 (신규 7일 창·챌린지·인터벌 우선) | Task 1 |
| §3 보조 제안 | Task 2 |
| §4 문구 + 날짜 로테이션 | Task 3 |
| §5 브리핑 바꿔 끼기 · opt-out 순서 · dedupe 보존 | Task 4 |
| §5 신규 게이트 열기 | Task 4 Step 4 |
| §5 새 알림 유형 + 목적지 + 아이콘 | Task 6 |
| §6 `?suggest` 읽기 (`useSearchParams` 금지) | Task 8 Step 5 |
| §6 인터벌은 담지 않고 시트를 연다 | Task 8 Step 6 |
| §7 draft v7 만료 | Task 7 |
| §8 빈 화면 카드 (C2) | Task 9 |
| §9 라우트 조회 (좁힌 범위) | Task 5 |
| §10 마이그레이션·되돌리기 | Task 6 Step 6 · 되돌리는 법 |
| §11 회귀선 전량 | Task 1·2·3·4·6·7·9의 테스트 |
| §12 개발 서버 실측 | Task 11 |

빠진 것 없음.

**2. Placeholder scan**

1판에 미확인 이름이 셋 있었고 **전부 실측해서 고쳤다.** 그 과정에서 설계를 깨는 것을 하나 잡았다:

| 1판 | 실측 | 결과 |
|---|---|---|
| `addCatalogExercises` | **없다.** `addExercises`(`:822`) | 이름 정정 |
| `pastSessionsRef` | **없다.** `draftRef`만 있다 | `getCompletedSessions`를 직접 부르도록 재작성 |
| `beginTabata(4)` | `beginTabata(picked, minutes)` — 종목을 받는다 | `openTabataSheet({picked, minutes:4})`로 교체 |
| `handleScheduleFromPast` | **`Promise<WorkoutPlan>`을 돌려준다 — `workout_plans`에 행을 만든다** | ⚠️ **설계 위반.** 달력에 `예정`이 찍힌다. `addPastSession`(`:955`)으로 교체 |
| `pickByDay(readonly T[])` | 시그니처가 `T[]` — 가변 배열만 받는다 | 상수에서 `readonly` 제거 |

⚠️ 네 번째가 그냥 넘어갔으면 **"12시 지나면 달력에 안 남게"라는 사용자 요구가 조용히 깨진 채로 배포됐다.**

Task 5 Step 3의 `void utcToday;`는 **의도적으로 남긴 지시**다 — 스니펫을 그대로 붙였을 때 lint가 잡도록 두되, 실행자가 `utcToday` 선언과 `void` 줄을 **둘 다 지운다.**

남은 placeholder 없음.

**3. Type consistency**

- `SuggestionKind` — Task 1 정의 → Task 2·3·8·9 사용 ✅
- `pickSuggestionKind(input)` 입력 7개 — Task 1 정의 → Task 4(서버)·Task 8(화면) 동일 ✅
- `secondaryKind(primary)` — Task 2 정의 → Task 9 사용 ✅
- `suggestionCopy(kind, todayKey, streak)` → `{title, body}` — Task 3 정의 → Task 4·9 사용 ✅
- `Briefing.type: "morning_briefing" | "workout_suggestion"` — Task 4 정의 → Task 5 Step 6에서 `b.type` 사용 ✅
- `BriefingUser` 새 필드 4개 — Task 4 정의 → Task 5 Step 5에서 전부 채움 ✅
- `expireStaleSuggestion(draft, todayKey)` — Task 7 정의 → Task 8 Step 1 사용 ✅
- `getSuggestionFacts(userId)` → 3필드 — Task 8 Step 4 정의 → Step 3에서 전부 사용 ✅
- `WorkoutDraft.suggestedForDayKey` — Task 7 정의 → Task 8 Step 6·7, Task 11 Step 3 사용 ✅
