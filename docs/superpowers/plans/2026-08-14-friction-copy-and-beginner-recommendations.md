# 챌린지 시작 안내 정정 + 초보자 추천 재배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 배포된 자동 시작(`autostart_due_challenges`)을 화면이 말하게 하고, 「처음 운동해요」 추천이 헬스장 기구만 권하지 않게 한다.

**Architecture:** 화면 문구 조립을 **순수 함수로 내려** 테스트가 글자를 직접 잡게 한다 (`viewing-pass.ts`의 `challengePassCopy`가 같은 이유로 이미 그렇게 되어 있다 — 화면은 비동기 조회 뒤에 그려져 서버 렌더로는 문구를 검증할 수 없다). 로직·DB·점수는 **한 줄도 건드리지 않는다.** 마이그레이션 없음.

**Tech Stack:** Next.js 16 App Router · TypeScript · Vitest + Testing Library · Tailwind

**범위 밖 (다음 배치):** C2(계획 빈 날 유산소 제안) · C3(챌린지 참가자에게 지난 운동 제안) · A2(시작 전 리마인드 알림) · 첫 열람권 무료.

---

## 착수 전 실측 (2026-08-14 확인 완료)

계획이 전제로 삼은 것을 **전부 열어서 확인했다.** 추측이 하나도 안 남게 한다.

| 전제 | 실측 결과 |
|---|---|
| `pnpm lint` 스크립트 | `eslint` — **`next lint --dir src`가 아니다** |
| `pnpm typecheck` / `test` / `build` | `tsc --noEmit` / `vitest run` / `next build` ✅ |
| `UiIcon name="calendar"` | ❌ **`public/ui-icons/calendar.webp`가 없다.** 쓰면 깨진 이미지가 조용히 뜬다 → **아이콘 없이 글자만 둔다** |
| `scripts/dev-fixture.mjs` | 있음 ✅ |
| 현재 브랜치 | **`main`** — 작업 브랜치를 먼저 판다 |
| 작업 트리 | 무관한 미커밋 변경 다수 → **`git add`에 경로를 명시**한다. `git add -A` 금지 |
| `challenge/page.test.tsx` 렌더 방식 | `render(<ChallengePage />)` 한 줄. mock은 `beforeEach`가 전부 세운다 ✅ |
| 그 픽스처의 setup 상태 | `oldChallenge`: `status:"setup"` · `start_date:"2026-08-01"`(**과거**) · 목표 1개 · 승인 1명 → **`allSet`·`allApproved` 둘 다 true** |
| `걷기`·`맨몸 스쿼트`·`푸시업` 카탈로그 | 전부 시드에 있음(`0004:56-59`) + `EXERCISE_NOTES`에 설명 있음(58·39·28줄) ✅ |

⚠️ **마지막 줄이 중요하다.** 기존 픽스처는 전원이 목표를 세우고 전원이 동의한 상태다.
그래서 Task 4의 화면 테스트에서 시작 버튼은 **눌리는 상태**(enabled)로 떠야 한다.
"disabled를 확인한다"고 쓰면 그 테스트는 틀린다.

---

## 배경 — 왜 이 작업인가

`autostart_due_challenges()`(`docs/db-current-schema.sql:415`)가 이미 이렇게 돈다:

1. `status='setup'` + `start_date <= 오늘(KST)`인 챌린지를 찾는다
2. 목표가 없는 참가자만 `dropped`로 뺀다 (남을 막지 않는다)
3. 미응답 초대(`invited`)를 지운다 → `status='active'`
4. **남은 참가자 전원**에게 `challenge_started` 알림

동의 게이트를 **거치지 않는다.** `consent_incomplete` 검사는 수동 `start_challenge`(`0045`)에만 있다.
트리거는 두 곳 — 크론(`api/briefing/route.ts:122`)과 **챌린지 탭 진입**(`challenge/page.tsx:294`).

그런데 화면은 자물쇠와 함께 `전원 KPI 설정 + 전원 동의 시 챌린지가 시작돼요`라고만 적는다
(`challenge/page.tsx:909-911`). **안 막혀 있는데 막혔다고 읽힌다.**

그리고 「처음 운동해요」가 `체스트프레스 머신 · 랫풀다운 · 레그프레스 · 숄더프레스` —
**넷 다 헬스장 기구**다(`recommended-exercises.ts:152`).

---

## File Structure

| 파일 | 무엇을 맡나 | 신규/수정 |
|---|---|---|
| `src/lib/domain/challenge-time.ts` | `"YYYY-MM-DD"` 날짜 산수 — **표시용 포맷**과 **시작 안내 조립**을 더한다 | 수정 |
| `src/lib/domain/challenge-time.test.ts` | 위 두 함수의 단위 테스트 | 신규 |
| `src/app/(tabs)/challenge/page.test.tsx` | 화면에 자동 시작 안내가 뜨는지 회귀 고정 | 수정 |
| `src/app/(tabs)/challenge/page.tsx` | setup 구간 안내문·버튼 교체 | 수정 |
| `src/lib/domain/recommended-exercises.test.ts` | 걷기가 맨 앞이라는 의도 고정 | 수정 |
| `src/lib/domain/recommended-exercises.ts` | `beginner` 종목 순서 | 수정 |

**왜 `challenge-time.ts`인가:** 그 파일 머리에 이미 경고가 있다 — *"날짜 산수를 여기 밖에서
다시 짜지 마라. 2026-08-13에 실측했더니 `challenge/page.tsx`가 같은 계산을 지역 함수로
한 벌 더 갖고 있었다."* 화면 안에서 `new Date(start_date).toLocaleDateString()`을 쓰면
**타임존이 다시 끼어들어** `2026-08-20`이 기기에 따라 `8월 19일`이 된다.

---

### Task 0: 작업 브랜치를 판다

**Files:** 없음

- [ ] **Step 1: 브랜치 생성**

현재 `main`이다. 기본 브랜치에서 바로 커밋하지 않는다.

```bash
cd /c/Users/SAMSUNG/workout-app
git checkout -b fix/challenge-start-copy-and-beginner-picks
git branch --show-current
```
Expected: `fix/challenge-start-copy-and-beginner-picks`

⚠️ 작업 트리에 이 작업과 **무관한 미커밋 변경**이 여럿 있다(`.gitignore`, 스펙 문서,
추적되지 않는 자산 폴더들). 그대로 둔다. 아래 모든 커밋은 **경로를 명시해서** `git add`한다 —
`git add -A`나 `git add .`를 쓰면 남의 작업이 딸려 들어간다.

---

### Task 1: 시작일을 한국어로 표시하는 `formatMonthDay`

**Files:**
- Modify: `src/lib/domain/challenge-time.ts` (파일 끝에 추가)
- Test: `src/lib/domain/challenge-time.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/challenge-time.test.ts` 신규 생성:

```ts
import { describe, expect, it } from "vitest";
import { formatMonthDay } from "./challenge-time";

describe("formatMonthDay — 시작일 표시", () => {
  it("앞의 0을 떼고 한국어로 적는다", () => {
    expect(formatMonthDay("2026-08-01")).toBe("8월 1일");
    expect(formatMonthDay("2026-12-25")).toBe("12월 25일");
  });

  /**
   * ⚠️ 이 파일의 다른 함수와 같은 이유로 `Date`를 쓰지 않는다.
   * `new Date("2026-08-20")`은 UTC 자정으로 읽히고, KST보다 뒤인 기기에서는
   * `8월 19일`이 된다. 문자열을 그대로 쪼개면 그 문제가 아예 없다.
   *
   * `TZ`는 프로세스 시작 때 읽히므로 이 테스트가 진짜 다른 타임존을 흉내내지는
   * 못한다. 그래도 **구현이 `Date`를 쓰기 시작하면** 이 단언이 존재하는 이유를
   * 읽고 멈추게 된다 — 주석이 곧 회귀선이다.
   */
  it("연도가 달라도 월·일만 적는다", () => {
    expect(formatMonthDay("2099-01-09")).toBe("1월 9일");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/challenge-time.test.ts`
Expected: FAIL — `does not provide an export named 'formatMonthDay'`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/challenge-time.ts` 파일 **끝에** 추가:

```ts
/**
 * `"2026-08-20"` → `"8월 20일"`.
 *
 * ⚠️ **`Date`를 쓰지 마라.** `new Date("2026-08-20")`은 UTC 자정으로 읽히고,
 * KST보다 뒤인 기기(미주 등)에서는 `8월 19일`로 표시된다. 이 파일의 다른
 * 함수들이 `Date`를 안 받는 것과 같은 이유다 — 문자열을 그대로 쪼갠다.
 */
export function formatMonthDay(dayKey: string): string {
  const [, month, date] = dayKey.split("-").map(Number);
  return `${month}월 ${date}일`;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/challenge-time.test.ts`
Expected: PASS (2건)

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/challenge-time.ts src/lib/domain/challenge-time.test.ts
git commit -m "feat(challenge): 시작일을 타임존 없이 한국어로 적는 formatMonthDay"
```

---

### Task 2: 시작 안내를 조립하는 `challengeStartHint`

**왜 순수 함수로 빼나:** `viewing-pass.ts`의 `challengePassCopy`가 같은 이유로 이미 그렇게
되어 있다 — *"카드는 useEffect 안에서 비동기로 데이터를 받아 조립하느라 서버 렌더로는
문구를 검증할 수 없다. 화면에 무슨 글자가 뜨는지를 테스트로 잡으려면 조립을 여기로 내려야 한다."*

**Files:**
- Modify: `src/lib/domain/challenge-time.ts`
- Test: `src/lib/domain/challenge-time.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/challenge-time.test.ts`의 import 줄을 바꾼다:

```ts
import { challengeStartHint, formatMonthDay } from "./challenge-time";
```

그리고 파일 **끝에** 추가:

```ts
describe("challengeStartHint — 자동 시작이 주인공이다", () => {
  const base = {
    startDateKey: "2026-08-20",
    todayKey: "2026-08-14",
    allSet: false,
    allApproved: false,
    approvedCount: 0,
    memberCount: 4,
  };

  /**
   * ⚠️⚠️ **이 파일에서 가장 중요한 단언이다.**
   *
   * `autostart_due_challenges()`가 시작일에 동의 없이 챌린지를 연다
   * (`docs/db-current-schema.sql:415`). 그런데 화면은 2026-08-14까지
   * `전원 KPI 설정 + 전원 동의 시 챌린지가 시작돼요`라고만 적어서,
   * 안 막혀 있는데 막혔다고 읽혔다. 이 단언이 그 회귀선이다.
   */
  it("시작일이 아직이면 그 날짜에 자동으로 시작된다고 말한다", () => {
    const hint = challengeStartHint(base);
    expect(hint.notice).toContain("8월 20일");
    expect(hint.notice).toContain("자동");
    expect(hint.notice).not.toContain("전원 동의 시");
  });

  it("목표를 안 세우면 본인만 빠진다는 것도 함께 알린다", () => {
    // autostart는 목표 없는 참가자를 dropped로 빼고, 그 사람은 시작 알림도
    // 못 받는다. 최소한 시작 전에는 말해 줘야 한다.
    expect(challengeStartHint(base).notice).toContain("빠져요");
  });

  it("시작일 당일이면 곧 시작된다고 말한다", () => {
    const hint = challengeStartHint({ ...base, todayKey: "2026-08-20" });
    expect(hint.notice).toContain("곧");
    expect(hint.notice).not.toContain("8월 20일에 자동으로");
  });

  it("시작일이 지났어도 막다른 길로 말하지 않는다", () => {
    const hint = challengeStartHint({ ...base, todayKey: "2026-08-25" });
    expect(hint.notice).toContain("곧");
  });

  describe("수동 시작 버튼 — 유일한 문이 아니라 지름길이다", () => {
    it("전원이 목표를 세우기 전에는 무엇이 남았는지 적는다", () => {
      const hint = challengeStartHint(base);
      expect(hint.buttonLabel).toContain("지금 바로 시작");
      expect(hint.buttonLabel).toContain("목표");
      expect(hint.canStartNow).toBe(false);
      // 옛 라벨 `전원 목표 세팅 대기 중…`은 기다리는 것 말고 할 일이 없어
      // 보였다. 되돌아가면 잡힌다.
      expect(hint.buttonLabel).not.toBe("전원 목표 세팅 대기 중…");
    });

    it("동의만 남았으면 진행 수를 보여준다", () => {
      const hint = challengeStartHint({
        ...base,
        allSet: true,
        approvedCount: 2,
      });
      expect(hint.buttonLabel).toContain("2/4");
      expect(hint.canStartNow).toBe(false);
    });

    it("전원이 마치면 누를 수 있다", () => {
      const hint = challengeStartHint({
        ...base,
        allSet: true,
        allApproved: true,
        approvedCount: 4,
      });
      expect(hint.buttonLabel).toBe("지금 바로 시작하기");
      expect(hint.canStartNow).toBe(true);
    });

    /**
     * 참가자가 0명이면 `allSet`이 false다(`challenge/page.tsx:445` —
     * `members.length > 0 &&`). 정상 경로에선 `create_challenge_room`이 방장을
     * 넣으므로 1 이상이지만, 조회가 아직 안 왔을 때 이 상태가 한 프레임 스친다.
     * 그때 "누를 수 있다"고 하면 안 된다.
     */
    it("참가자를 아직 모를 때는 누를 수 없다", () => {
      const hint = challengeStartHint({ ...base, memberCount: 0 });
      expect(hint.canStartNow).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/challenge-time.test.ts`
Expected: FAIL — `does not provide an export named 'challengeStartHint'`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/challenge-time.ts` 파일 **끝에** 추가:

```ts
export type ChallengeStartHint = {
  /** 안내문 — **자동 시작이 주인공이다** */
  notice: string;
  /** 수동 시작 버튼 라벨 */
  buttonLabel: string;
  /** 수동 시작 버튼을 지금 누를 수 있는가 */
  canStartNow: boolean;
};

/**
 * setup 상태 챌린지의 시작 안내 (2026-08-14).
 *
 * ⚠️⚠️ **자동 시작이 주인공이고 수동 시작은 지름길이다.** 옛 화면은 자물쇠와
 * 함께 `전원 KPI 설정 + 전원 동의 시 챌린지가 시작돼요`라고만 적었는데,
 * `autostart_due_challenges()`가 시작일에 **동의 없이** 챌린지를 연다
 * (`docs/db-current-schema.sql:415`). 화면이 사실과 반대로 말하고 있었고,
 * 사용자는 안 막힌 문 앞에서 남을 기다렸다.
 *
 * ⚠️ 수동 경로를 **지우지 않는다.** 시작일을 앞당기고 싶을 때 쓰는 길이
 * 사라지면 기능이 준다. 이름과 자리만 조연으로 내린다.
 *
 * ⚠️ 문구 조립을 화면이 아니라 여기서 하는 이유는 `viewing-pass.ts`의
 * `challengePassCopy`와 같다 — 화면은 비동기 조회 뒤에 그려져서 글자를
 * 테스트로 잡으려면 조립이 도메인에 있어야 한다.
 */
export function challengeStartHint(input: {
  startDateKey: string;
  todayKey: string;
  allSet: boolean;
  allApproved: boolean;
  approvedCount: number;
  memberCount: number;
}): ChallengeStartHint {
  const { startDateKey, todayKey, allSet, allApproved } = input;

  // 시작일이 아직 안 왔을 때만 날짜를 적는다. 이미 도래했으면 autostart가
  // 곧 처리하므로(크론 + 탭 진입) 날짜를 말하면 지난 날을 가리키게 된다.
  const notice =
    startDateKey > todayKey
      ? `${formatMonthDay(startDateKey)}에 자동으로 시작돼요 · 그때까지 목표를 세우지 않으면 이번 챌린지에선 빠져요`
      : "시작일이 됐어요 · 곧 자동으로 시작돼요";

  const buttonLabel = !allSet
    ? "지금 바로 시작하기 (전원 목표 설정 필요)"
    : !allApproved
      ? `지금 바로 시작하기 (동의 ${input.approvedCount}/${input.memberCount})`
      : "지금 바로 시작하기";

  return { notice, buttonLabel, canStartNow: allSet && allApproved };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/challenge-time.test.ts`
Expected: PASS (10건 — formatMonthDay 2 + challengeStartHint 8)

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/challenge-time.ts src/lib/domain/challenge-time.test.ts
git commit -m "feat(challenge): 자동 시작을 주인공으로 말하는 challengeStartHint"
```

---

### Task 3: 화면 회귀 테스트를 **먼저** 쓴다 (실패 확인 포함)

⚠️ **이 태스크가 Task 4(구현)보다 앞이다.** 구현을 먼저 하면 "일부러 고장 내서
테스트가 진짜 잡는지" 확인할 방법이 없다 — 이미 커밋한 뒤라 `git stash`로는
되돌려지지 않는다.

**Files:**
- Modify: `src/app/(tabs)/challenge/page.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/app/(tabs)/challenge/page.test.tsx` 파일 **맨 끝에** 추가.
mock은 `beforeEach`가 전부 세우므로 렌더는 `render(<ChallengePage />)` 한 줄이다.

```tsx
describe("setup 화면 — 자동 시작을 말한다 (2026-08-14)", () => {
  /**
   * ⚠️⚠️ **회귀선이다. 지우지 마라.**
   *
   * `autostart_due_challenges()`가 시작일에 동의 없이 챌린지를 연다.
   * 그런데 화면은 자물쇠와 함께 "전원 KPI 설정 + 전원 동의 시 시작돼요"라고만
   * 적어서, 안 막혀 있는데 막혔다고 읽혔다. 옛 문구로 되돌아가면 여기서 잡힌다.
   *
   * 픽스처 `oldChallenge`는 `start_date: "2026-08-01"`(과거)이라 "곧" 분기다.
   */
  it("시작일이 지난 setup 챌린지는 '곧 자동으로 시작'이라고 적는다", async () => {
    render(<ChallengePage />);

    await screen.findByText(/곧 자동으로 시작돼요/);
    expect(
      screen.queryByText(/전원 동의 시 챌린지가 시작돼요/),
    ).toBeNull();
    expect(screen.queryByText("전원 목표 세팅 대기 중…")).toBeNull();
  });

  it("시작일이 아직이면 그 날짜를 적는다", async () => {
    mocks.getMyChallenges.mockResolvedValue([
      { ...oldChallenge, start_date: "2099-01-09" },
      newChallenge,
    ]);

    render(<ChallengePage />);

    await screen.findByText(/1월 9일에 자동으로 시작돼요/);
  });

  /**
   * 수동 시작 경로를 **지우지 않았다**는 회귀선이다.
   *
   * ⚠️ 픽스처는 목표 1개 + 승인 1명이라 `allSet`·`allApproved`가 둘 다 true다.
   *    그래서 이 버튼은 **눌리는 상태**로 떠야 한다 — `toBeDisabled()`를 쓰면
   *    이 테스트가 틀린다(착수 전 실측에서 확인).
   */
  it("수동 시작 버튼은 지름길로 남는다", async () => {
    render(<ChallengePage />);

    const button = await screen.findByRole("button", {
      name: /지금 바로 시작하기/,
    });
    expect(button).toBeEnabled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다 — 이게 이 태스크의 핵심이다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run "src/app/(tabs)/challenge/page.test.tsx" -t "자동 시작을 말한다"`
Expected: **FAIL 3건.** 아직 화면에 `자동으로 시작`이라는 글자가 없고,
`지금 바로 시작하기` 버튼도 없다.

⚠️ 여기서 통과가 나오면 테스트가 아무것도 안 잡고 있다는 뜻이다. 멈추고 원인을 찾는다.

- [ ] **Step 3: 커밋 (실패하는 테스트를 그대로 남긴다)**

```bash
cd /c/Users/SAMSUNG/workout-app
git add "src/app/(tabs)/challenge/page.test.tsx"
git commit -m "test(challenge): 자동 시작 안내 회귀선 (아직 실패)"
```

---

### Task 4: 챌린지 화면에 붙인다 (자물쇠 제거 · 버튼 강등)

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx` — import · 455줄 부근 · 909-911 · 935-945

- [ ] **Step 1: import에 `challengeStartHint`를 더한다**

`challenge/page.tsx:23`이 현재 이렇다 (착수 전 실측):

```ts
import { challengeDday, inclusiveDays } from "@/lib/domain/challenge-time";
```

이렇게 바꾼다:

```ts
import {
  challengeDday,
  challengeStartHint,
  inclusiveDays,
} from "@/lib/domain/challenge-time";
```

⚠️ 바로 위 20-22줄의 주석(`periodDays`를 여기로 옮긴 이유)은 **그대로 둔다.**

- [ ] **Step 2: `startHint`를 계산한다**

`challenge/page.tsx:453-455`(`todayKey`·`endedByDate`·`dday`) **바로 아래**에 추가한다.
`allSet`·`allApproved`·`approvedCount`는 445-451에, `members`는 그 위에 이미 있다.

```ts
  // setup 구간의 안내문·버튼 라벨. 조립은 도메인에서 한다 — 이유는
  // `challengeStartHint` 주석 참조(화면은 비동기 조회 뒤라 글자를 테스트로 못 잡는다).
  const startHint = challenge
    ? challengeStartHint({
        startDateKey: challenge.start_date,
        todayKey,
        allSet,
        allApproved,
        approvedCount,
        memberCount: members.length,
      })
    : null;
```

- [ ] **Step 3: 안내문에서 자물쇠를 떼고 문구를 갈아 끼운다**

`challenge/page.tsx:909-911`을 찾는다:

```tsx
            <p className="mt-2 text-[11px] text-muted">
              <UiIcon name="lock" /> <b>전원 KPI 설정 + 전원 동의</b> 시 챌린지가 시작돼요.
            </p>
```

이렇게 바꾼다:

```tsx
            {/* ⚠️⚠️ **옛 문구는 자물쇠 + `전원 KPI 설정 + 전원 동의 시 챌린지가
                시작돼요`였고, 그건 사실이 아니었다.** `autostart_due_challenges()`가
                시작일에 동의 없이 챌린지를 연다(`docs/db-current-schema.sql:415`).
                화면만 옛말을 해서 사용자는 안 막힌 문 앞에서 남을 기다렸다.

                ⚠️ 자물쇠를 떼면서 **아이콘을 다른 것으로 바꾸지 않았다.**
                `public/ui-icons/`에 달력 그림이 없다 — 없는 이름을 주면
                `UiIcon`이 `/ui-icons/<name>.webp`를 그대로 요청해서
                **깨진 이미지가 조용히 뜬다.** 글자만으로 충분하다. */}
            <p className="mt-2 text-[11px] text-muted">{startHint?.notice}</p>
```

- [ ] **Step 4: 시작 버튼을 지름길로 강등한다**

`challenge/page.tsx:935-945`를 찾는다:

```tsx
          <button
            onClick={handleStart}
            disabled={busy || !allSet || !allApproved}
            className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
          >
            {!allSet
              ? "전원 목표 세팅 대기 중…"
              : !allApproved
                ? `전원 동의 대기 중… (${approvedCount}/${members.length})`
                : <>챌린지 시작 <UiIcon name="finish" /></>}
          </button>
```

이렇게 바꾼다:

```tsx
          {/* ⚠️ **금색 채움에서 테두리형으로 내렸다** (2026-08-14). 이 버튼은
              시작하는 **유일한 문이 아니라 지름길**이다 — 시작일이 오면
              autostart가 알아서 연다. 금색으로 채워 두면 "이걸 눌러야만
              시작된다"로 읽히고, 그게 이번에 고친 오해의 절반이었다.
              라벨 조립은 `challengeStartHint`가 한다.
              색 조합은 위 `＋ 챌린지 추가하기`와 같다 — 같은 무게의 보조 행동이다. */}
          <button
            onClick={handleStart}
            disabled={busy || !startHint?.canStartNow}
            className="h-12 rounded-card border border-accent/40 bg-accent-weak text-sm font-extrabold text-accent disabled:opacity-50"
          >
            {startHint?.buttonLabel}
          </button>
```

⚠️ `UiIcon name="finish"`가 이 버튼에서 빠진다. **`UiIcon` import는 지우지 마라** —
같은 파일의 `trophy`·`camera`·`goal`·`thumbsup`이 여전히 쓴다.

- [ ] **Step 5: Task 3의 테스트가 초록으로 바뀌는지 본다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run "src/app/(tabs)/challenge/page.test.tsx"`
Expected: **PASS** — Task 3의 3건이 빨강에서 초록으로 바뀌고, 기존 건도 전부 통과

- [ ] **Step 6: 타입·린트**

Run: `cd /c/Users/SAMSUNG/workout-app && pnpm typecheck && pnpm lint`
Expected: 오류 0

⚠️ `pnpm lint`는 `eslint`다(`next lint --dir src`가 아니다 — 실측 확인).

- [ ] **Step 7: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add "src/app/(tabs)/challenge/page.tsx"
git commit -m "fix(challenge): setup 화면이 자동 시작을 말하게 하고 자물쇠를 뗀다"
```

---

### Task 5: 「처음 운동해요」에 걷기·맨몸을 앞으로 (C1)

⚠️⚠️ **기존 테스트가 이 목록에 의존한다.** `recommended-exercises.test.ts:223-227`이
`resolveSituation("beginner", …)`에서 **`체스트프레스 머신`을 찾아** 부위별 설명과
같은지 비교한다. 목록에서 빼면 `fromSituation`이 `undefined`가 되어 그 테스트가 깨진다.
**그래서 지우지 않고 뒤로 민다.**

**Files:**
- Modify: `src/lib/domain/recommended-exercises.test.ts`
- Modify: `src/lib/domain/recommended-exercises.ts:146-153`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`recommended-exercises.test.ts`의 `describe("상황별 추천", …)` 안,
`it("전신 인터벌 칸이 '집에서 할래요' 자리를 대신한다", …)` **아래에** 추가:

```ts
  /**
   * ⚠️⚠️ **회귀선이다 (2026-08-14 사용자 지적).**
   *
   * 옛 목록은 `["체스트프레스 머신", "랫풀다운", "레그프레스", "숄더프레스"]` —
   * **넷 다 헬스장 기구**였다. 「처음 운동해요」는 신규 사용자가 자기에게 맞다고
   * 믿고 누르는 칸인데, 헬스장에 등록 안 했거나 오늘 집에 있는 사람은 탭을 다
   * 지나온 뒤 **못 하는 것을 권유받고** 멈췄다.
   *
   * 맨 앞이 걷기인 이유: **담을 때 정할 것이 하나도 없다.**
   * `defaultSetupPlan`이 유산소에 `{sets:1, amount:0, weightKg:0}`을 준다 —
   * 세 유형 중 유일하게 무게도 횟수도 안 묻는다.
   */
  it("'처음 운동해요'는 기구 없이 되는 것부터 권한다", () => {
    const names = resolveSituation("beginner", FULL_CATALOG).map(
      (r) => r.item.name,
    );
    expect(names[0]).toBe("걷기");
    expect(names.indexOf("맨몸 스쿼트")).toBeLessThan(
      names.indexOf("체스트프레스 머신"),
    );
    expect(names.indexOf("푸시업")).toBeLessThan(
      names.indexOf("체스트프레스 머신"),
    );
  });

  /**
   * 기구를 **지우지는 않는다.** 헬스장에 다니는 사람에게는 여전히 맞고,
   * 이 파일 아래쪽 "설명은 이름당 한 곳에만 있다"가 `체스트프레스 머신`이
   * 이 목록에 있다고 전제한다.
   */
  it("기구 종목을 지우지는 않는다 — 뒤로 밀 뿐이다", () => {
    const names = resolveSituation("beginner", FULL_CATALOG).map(
      (r) => r.item.name,
    );
    expect(names).toContain("체스트프레스 머신");
    expect(names).toContain("랫풀다운");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/recommended-exercises.test.ts -t "기구 없이 되는 것부터"`
Expected: FAIL — `expected '체스트프레스 머신' to be '걷기'`

- [ ] **Step 3: 목록을 바꾼다**

`src/lib/domain/recommended-exercises.ts:146-153`을 찾는다:

```ts
  {
    key: "beginner",
    label: "처음 운동해요",
    sub: "기본부터 천천히",
    iconSrc: "/ui-icons/situ-beginner.webp",
    names: ["체스트프레스 머신", "랫풀다운", "레그프레스", "숄더프레스"],
  },
```

이렇게 바꾼다:

```ts
  {
    key: "beginner",
    label: "처음 운동해요",
    sub: "기본부터 천천히",
    iconSrc: "/ui-icons/situ-beginner.webp",
    /*
      ⚠️ **옛 목록은 넷 다 헬스장 기구였다** (2026-08-14 사용자 지적).
      「처음 운동해요」는 신규 사용자가 자기에게 맞다고 믿고 누르는 칸인데,
      헬스장에 등록 안 했거나 오늘 집에 있는 사람은 여기서 막다른 길을 만났다.

      맨 앞이 걷기인 이유: **담을 때 정할 것이 하나도 없다.**
      `defaultSetupPlan`이 유산소에 `{sets:1, amount:0, weightKg:0}`을 준다 —
      세 유형 중 유일하게 무게도 횟수도 안 묻는다.

      ⚠️ 기구를 **지우지는 않는다.** 헬스장에 다니는 사람에게는 여전히 맞고,
      이 파일의 테스트 "설명은 이름당 한 곳에만 있다"가 `체스트프레스 머신`이
      이 목록에 있다고 전제한다. 순서만 바꾼다 — 위 주석대로
      **순서가 곧 추천 순위**다.
    */
    names: ["걷기", "맨몸 스쿼트", "푸시업", "체스트프레스 머신", "랫풀다운"],
  },
```

- [ ] **Step 4: 통과를 확인한다 — 기존 테스트까지 전부**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/recommended-exercises.test.ts`
Expected: PASS (기존 건수 + 2)

특히 이 셋이 **여전히** 통과해야 한다:
- `"추천에 쓰이는 모든 이름에 설명이 있다"` — `걷기`·`맨몸 스쿼트`·`푸시업` 모두
  `EXERCISE_NOTES`에 이미 있다(58·39·28줄, 착수 전 실측에서 확인)
- `"설명은 이름당 한 곳에만 있다"` — `체스트프레스 머신`을 남겼으므로 통과
- `"챌린지를 뺀 나머지 상황은 전부 종목을 갖고 있다"`(`>= 3`) — 5개라 통과

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/recommended-exercises.ts src/lib/domain/recommended-exercises.test.ts
git commit -m "fix(record): '처음 운동해요'가 기구 없이 되는 것부터 권한다"
```

---

### Task 6: 전체 게이트

**Files:** 없음 (검증만)

- [ ] **Step 1: 직전 기준선을 먼저 적어 둔다**

Run: `cd /c/Users/SAMSUNG/workout-app && git stash list && git log --oneline -6`

`PROGRESS.md` 최상단의 직전 테스트 건수를 확인한다(2026-08-14 기준 **144 파일 / 2084건**).
이번 배치로 **최소 +5건**(challenge-time 10 신규 파일, page 3, recommended 2 → 실제로는 +15)이 는다.

- [ ] **Step 2: 게이트를 순서대로 돌린다**

```bash
cd /c/Users/SAMSUNG/workout-app
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: lint 0 · typecheck 0 · **테스트 전건 통과** · build 성공

⚠️ 하나라도 실패하면 **여기서 멈추고** 고친 뒤 처음부터 다시 돌린다.
⚠️ 총 건수가 기준선보다 **줄면** 테스트를 지운 것이므로 원인을 찾는다.

---

### Task 7: 개발 서버에서 눈으로 본다 — 건너뛸 수 없다

⚠️⚠️ **`~/.claude/CLAUDE.md`의 최우선 규칙이다.** lint·typecheck·테스트·build가 전부
초록인데 사용자 폰에서 화면이 깨진 적이 두 번 있다(GND 0044·0055).
**이 태스크를 생략하고 배포로 넘어가지 마라.**

**Files:** 없음 (실측만)

- [ ] **Step 1: 개발 서버를 띄운다**

```bash
cd /c/Users/SAMSUNG/workout-app && pnpm dev
```

- [ ] **Step 2: 375×812(폰 크기)로 아래를 직접 조작한다**

| # | 화면 | 조작 | 기대 |
|---|---|---|---|
| 1 | `/record` | 빈 상태 → `운동 계획하기` → `운동 직접 고르기` → `상황별 추천` → **`처음 운동해요`** | **첫 칸이 `걷기`**, 설명 `가장 부담 없이 시작할 수 있는 유산소예요` |
| 2 | 같은 화면 | 목록을 **끝까지 내린다** | `체스트프레스 머신`·`랫풀다운`이 **아래에 남아 있다** |
| 3 | 같은 화면 | `걷기`를 골라 `추가` | 요약이 **`1세트 · 거리·시간 운동 중 입력`** — 무게·횟수를 안 묻는다 |
| 4 | `/challenge` | `setup` 상태 챌린지를 연다 (**시작일을 미래로**) | 안내문이 **`N월 N일에 자동으로 시작돼요 · …빠져요`**. **자물쇠가 없다** |
| 5 | 같은 화면 | 시작 버튼을 본다 | 라벨 **`지금 바로 시작하기 (…)`**, **테두리형**(금색 채움 아님) |
| 6 | 같은 화면 | 옛 문구를 찾는다 | **`전원 목표 세팅 대기 중…`·`전원 동의 시 챌린지가 시작돼요`가 없다** |
| 7 | 같은 화면 | 안내문 자리에 **깨진 이미지가 없는지** 본다 | 아이콘을 아예 안 넣었으므로 글자만 보여야 한다 |

⚠️ 4~7을 보려면 `setup` 상태 챌린지가 필요하다:
`node scripts/dev-fixture.mjs create` → 로그인 → `/challenge` → `＋ 새 챌린지 만들기` →
**시작일을 미래로** 잡는다(오늘로 잡으면 탭 진입 즉시 autostart가 `active`로 바꿔 4번을 못 본다).

- [ ] **Step 3: 브라우저를 조작할 수단이 이 세션에 없으면 — 멈춘다**

Playwright·chrome-devtools MCP가 없다면 **"확인했다"고 말하지 않는다.**
위 표를 사용자에게 그대로 내고 **답을 기다린다.** 배포하고 폰 확인으로 미루지 않는다.

- [ ] **Step 4: 이상이 있으면 배포하지 않고 고친다**

고친 뒤 Task 6부터 다시 돌린다.

---

### Task 8: 배포 — 사용자 승인 뒤에만

⚠️ **Task 7이 초록이고 사용자가 승인하기 전에는 시작하지 않는다.**

- [ ] **Step 1: 사용자 승인을 받는다**

Task 7 실측 결과를 보고하고 배포 여부를 묻는다.

- [ ] **Step 2: `main`에 병합한다**

```bash
cd /c/Users/SAMSUNG/workout-app
git checkout main
git merge --no-ff fix/challenge-start-copy-and-beginner-picks
```

- [ ] **Step 3: `.git` 없는 복사본에서 배포한다**

⚠️ Vercel이 커밋 이메일을 GitHub 계정에 매칭하지 못해 `Blocked`가 된다.
⚠️ **`--scope gnd4`가 없으면 `Not authorized`다** — 프로젝트가 팀 소속이다.

```bash
cd /c/Users/SAMSUNG/workout-app
git worktree add --detach /tmp/deploy-main main
cp .env.local /tmp/deploy-main/ && cp -r .vercel /tmp/deploy-main/
cd /tmp/deploy-main && npm install && npm run build
npx vercel@latest --prod --yes --scope gnd4
```

- [ ] **Step 4: 프로덕션 실물을 확인한다**

"배포 명령이 성공했다"는 배포 검증이 아니다.

```bash
# 새 문구가 들어갔는가
curl -s https://gnd-one.vercel.app/challenge | grep -c "자동으로 시작"
# 옛 문구가 사라졌는가 — 제거는 부정 확인이 증거다
curl -s https://gnd-one.vercel.app/challenge | grep -c "전원 동의 시 챌린지가 시작돼요"
```
Expected: 첫째 1 이상 · **둘째 0**

⚠️ 클라이언트 컴포넌트라 서버 렌더 HTML에 안 잡힐 수 있다. 그때는 번들 JS를 받아
같은 grep을 하고, 그래도 안 잡히면 빌드 시각 갱신 + 커밋 확인의 사슬로 대체한 뒤
**화면 확인은 사용자 폰**으로 받는다.

- [ ] **Step 5: `PROGRESS.md` 최상단에 기록한다**

무엇을 왜 바꿨는지, 검증 결과, 남은 것.

⚠️ **릴리스 공지는 발송하지 않는다.** 릴리스 노트 항목 추가와 DRY RUN까지만 한다
(`~/.claude/CLAUDE.md` — `--send`는 사용자가 지시할 때 사용자가 Run).

---

## 되돌리는 법

작업 브랜치를 따로 팠으므로(Task 0) 되돌리기가 싸다. 상황별로:

| 언제 | 무엇을 한다 |
|---|---|
| 개발 중 한 태스크가 틀렸다 | `git reset --hard HEAD~1` (해당 커밋만) |
| 배치 전체를 접는다 (병합 전) | `git checkout main && git branch -D fix/challenge-start-copy-and-beginner-picks` |
| 병합했는데 배포 전에 접는다 | `git reset --hard <병합 직전 커밋>` — `git reflog`로 찾는다 |
| **배포 후 문제 발견** | 이전 배포로 되돌린다: `npx vercel@latest rollback --scope gnd4` |

⚠️ **DB는 되돌릴 것이 없다.** 이번 배치는 마이그레이션이 없고 RPC도 안 건드린다 —
화면 문구와 추천 목록뿐이다. 그래서 배포 롤백만으로 완전히 원상 복구된다.
**이것이 이 배치를 첫 번째로 고른 이유이기도 하다.**

---

## Self-Review

**1. Spec coverage**

| 요구 | 담당 |
|---|---|
| 자물쇠 제거 | Task 4 Step 3 |
| 안내문을 자동 시작 중심으로 | Task 1·2·4 |
| 동의 버튼을 지우지 않고 지름길로 | Task 2(라벨) · Task 4 Step 4(스타일) |
| 「처음 운동해요」에 걷기·맨몸을 앞으로 | Task 5 |
| 기구를 지우지 않음 | Task 5 Step 3 + 회귀 테스트 |
| 로직·DB·점수 무변경 | 전 태스크 — 마이그레이션 없음 |
| 개발 서버 실측 | Task 7 |
| 배포는 승인 뒤 | Task 8 |

**2. Placeholder scan** — 없음. Task 3의 렌더 코드는 실제 파일의 `beforeEach`를 읽고
`render(<ChallengePage />)` 한 줄로 확정했다(1판에는 `(본떠서 쓴다)` placeholder가 있었다).

**3. Type consistency**
- `formatMonthDay(dayKey: string): string` — Task 1 정의 → Task 2 사용 ✅
- `challengeStartHint(input): ChallengeStartHint` — Task 2 정의 → Task 4 사용 ✅
- `notice`·`buttonLabel`·`canStartNow` — 테스트·구현·화면 전부 일치 ✅
- `startHint`는 `challenge`가 없으면 `null` → Task 4에서 `?.` 접근 ✅

**4. TDD 순서** — 모든 태스크가 실패 확인 → 구현 → 통과 확인 순이다.
화면 테스트(Task 3)가 화면 구현(Task 4)보다 **앞**이라, 테스트가 진짜 잡는지를
`git stash` 같은 요령 없이 확인한다.
