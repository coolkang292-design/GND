# 챌린지 방 0042 (추가만) 구현 계획

> **에이전트 작업자에게:** 필수 하위 스킬 — `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 실행. 각 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 챌린지가 직접 참가자를 갖는 구조(`challenge_participants`)와 초대·수락 RPC를 **추가만** 한다. 적용해도 앱 동작은 지금과 똑같다.

**설계:** `docs/superpowers/specs/2026-07-29-challenge-rooms-design.md` (§3·§4·§7의 0042 부분)

**아키텍처:** 이 저장소에서 검증된 "추가 → 전환 → 정리" 3단계 중 **첫 단계**다. 0042는 새 테이블·RPC·백필만 넣고 기존 경로를 하나도 건드리지 않는다. 앱은 여전히 `groups`/`group_members`를 읽으므로 적용 후에도 동작이 변하지 않고, 문제가 생기면 브랜치를 버리면 된다. 전환(0043)과 정리(0044)는 별도 계획서로 뺀다 — 0042를 실기기로 확인한 뒤 써야 나중에 안 고친다.

**기술 스택:** Supabase(Postgres + PostgREST), TypeScript, vitest(node 환경), 검증은 `scripts/*.mjs` 통합 스크립트.

---

## 이 계획의 범위 — 무엇을 하지 않는가

**0042에서 하는 것**

- `challenge_participants` 테이블 + RLS
- 알림 유형 `challenge_invite` 추가
- RPC 6개: 생성·초대·수락·거절·자동시작·자동종료
- 기존 챌린지의 `group_members`를 참가자로 백필
- 순수 도메인 함수 3개 (대표 챌린지 선택, 목표 하한선, 부위조건 환산) + 단위 테스트
- **버그 수정 2건** — `weight_days` 집계 기준(부위→종목), 타바타 분수가 `bodyweight_time`에 미반영
- 통합 검증 스크립트

**0042에서 하지 않는 것** — 착수하지 말 것

| 미룬 것 | 어디서 |
|---|---|
| `challenges_one_live` 인덱스 드롭 | 0043 |
| 집계·랭킹을 참가자 기준으로 교체 | 0043 |
| `get_challenge_ranking` 정의자 RPC | 0043 |
| `challenge_goal_approvals`(전원 동의) 제거 | 0043 |
| 완료 목표 보너스 +3 → +9 | 0043 (앱 코드) |
| 화면 변경 일체 (챌린지 탭 목록화·홈 대표 챌린지) | 0043 |
| `groups`·`group_members`·`group_id` 드롭 | 0044 |

**0042 적용 후에도 앱은 지금과 동일하게 돌아야 한다 — 딱 하나만 빼고.** 그게 이 단계의 성공 기준이다.

**의도한 유일한 예외: Task 2B·2C의 버그 수정.** 진행 중인 챌린지가 지금 잘못 채점되고 있어 함께 고친다.

| 무엇 | 지금 | 수정 후 |
|---|---|---|
| `weight_days` 집계 | 하루 **부위** 수 | 하루 **종목** 수 |
| 타바타 분수 | 버려짐 | `bodyweight_time`에 더해짐 |

**그 둘 외에 화면에서 뭔가 달라 보이면 잘못 만든 것이다.**

---

## 시작 전에 읽을 것

### 이 저장소의 규칙

1. **마이그레이션 파일은 수정 금지.** `0001`~`0041`은 이미 DB에 적용됐다. 고쳐도 아무 일도 안 일어난다. 항상 새 번호 파일을 만든다.
2. **함수의 현행 정의는 "가장 나중에 덮어쓴 파일"에 있다.** 0042는 기존 함수를 하나도 고치지 않으므로 이번엔 해당 없지만, 값을 참조할 때는 최신 파일을 봐야 한다. 예: `user_goals.goal_type`의 현행 CHECK는 `0006`이 아니라 **`0019:17`** 이다.
3. **마이그레이션 적용은 사용자가 한다.** Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run. 에이전트는 SQL을 실행할 수 없다.
4. **검증 스크립트는 프로덕션에 붙는다.** 스테이징이 없다. 삭제는 `scripts/_safe-delete.mjs`의 가드를 반드시 경유한다 (§검증 참조).

### 현행 스키마 — 계획에 쓰인 값의 출처

```
challenges (0006:10)
  id uuid pk · group_id uuid not null → groups · name text(1~40)
  start_date date · end_date date · status text
  status ∈ ('setup','active','ended','cancelled')
  created_by uuid not null default auth.uid() → auth.users
  photo_required boolean  (0018에서 추가)
  check (start_date <= end_date)

user_goals (0006:28)
  id · user_id → auth.users · challenge_id → challenges · group_id → groups
  goal_type text · target_value numeric(10,1) check (> 0) · unit text
  planned_days int default 5 check (1~7) · qualifier int  (0008에서 추가)
  unique (user_id, challenge_id, goal_type)   ← 동일 KPI 중복이 이미 DB에서 막힌다

goal_type 현행 CHECK (0019:17)
  'weight_reps','weight_days','cardio_distance','cardio_time',
  'bodyweight_reps','bodyweight_time','bodyweight_days','tabata_count','volume'

group_members (0001:27)  unique (group_id, user_id)
crew_links (0038:35)     pk (user_a, user_b), check (user_a < user_b)
```

**설계서 §5.2(동일 KPI 중복 금지)는 DB에 이미 있다.** `user_goals`의 `unique (user_id, challenge_id, goal_type)`가 그것이다. 설계서가 "서버 쪽이 없다"고 적은 것은 `saveMyGoals`가 delete-then-insert를 하기 때문인데, 유니크 제약 자체는 존재한다. 0042에서 추가로 만들 것은 없고, 0043에서 화면 문구만 정리한다.

### `notify` 헬퍼

```sql
notify(p_user_id uuid, p_actor_id uuid, p_type text,
       p_reference_id uuid, p_title text, p_body text) returns void
```

`0011:183` 정의. `revoke ... from anon, authenticated, public` 되어 있어 **security definer 함수 안에서만** 부를 수 있다.

⚠ **알림 발송은 반드시 `begin/exception when others then null; end;`로 감싼다.** 0029에서 알림 insert 하나가 운동 완료 트랜잭션을 통째로 롤백시킨 전례가 있고, 0038이 그래서 감싸기 시작했다 (`0038:196`).

---

## 파일 구조

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `supabase/migrations/0042_challenge_participants.sql` | 테이블·RLS·알림유형·RPC 6개·백필 | 신규 |
| `src/lib/domain/challenge-room.ts` | 순수 계산 — 대표 챌린지 선택, 목표 하한선 | 신규 |
| `src/lib/domain/challenge-room.test.ts` | 위 함수 테스트 | 신규 |
| `scripts/challenge-room-check.mjs` | 통합 검증 | 신규 |
| `src/lib/challenge.ts` | `weight_days` 집계 기준·타바타 분수 (Task 2B·2C) | 수정 |
| `src/lib/challenge.test.ts` | 위 두 수정의 테스트 | 수정 |
| `src/components/challenge/setup-sheet.tsx` | 부위→종목 라벨 (Task 2B) | 수정 |

**도메인 함수 3개(Task 1·2)는 0043이 쓸 재료를 미리 TDD로 굳혀 두는 것이다.** 순수 함수라 지금 만들어도 기존 동작에 영향이 없다.

**`challenge.ts`와 `setup-sheet.tsx`를 건드리는 것은 Task 2B·2C뿐이고, 그건 버그 수정이다.** 화면 구조(챌린지 탭 목록화·홈 대표 챌린지)는 0043 몫으로 그대로 남긴다.

---

## Task 1: 대표 챌린지 선택 순수 함수

설계서 §6.2 — 홈에 보여줄 챌린지 하나를 고르는 규칙이다. 0043의 홈 화면이 쓴다.

**규칙:** 종료일이 가장 임박한 `active` → 없으면 시작일이 가장 가까운 `setup` → 동률이면 먼저 만들어진 것(`createdAt` 오름차순).

**동률 규칙이 없으면 조회할 때마다 대표가 바뀌어 열람권 대상이 흔들린다.**

**파일:**
- 생성: `src/lib/domain/challenge-room.ts`
- 테스트: `src/lib/domain/challenge-room.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/challenge-room.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickPrimaryChallenge, type ChallengeLike } from "./challenge-room";

const ch = (
  id: string,
  status: ChallengeLike["status"],
  startDate: string,
  endDate: string,
  createdAt: string,
): ChallengeLike => ({ id, status, startDate, endDate, createdAt });

describe("pickPrimaryChallenge", () => {
  it("없으면 null", () => {
    expect(pickPrimaryChallenge([])).toBeNull();
  });

  it("active가 하나면 그것", () => {
    const a = ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a])?.id).toBe("a");
  });

  it("active 여러 개면 종료일이 가장 임박한 것", () => {
    const a = ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T00:00:00Z");
    const b = ch("b", "active", "2026-08-01", "2026-08-10", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
  });

  it("active가 없으면 시작일이 가장 가까운 setup", () => {
    const a = ch("a", "setup", "2026-09-01", "2026-09-28", "2026-07-30T00:00:00Z");
    const b = ch("b", "setup", "2026-08-05", "2026-09-01", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
  });

  it("active가 하나라도 있으면 setup보다 우선", () => {
    const a = ch("a", "setup", "2026-08-01", "2026-08-05", "2026-07-30T00:00:00Z");
    const b = ch("b", "active", "2026-07-01", "2026-12-31", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
  });

  it("종료일이 같으면 먼저 만들어진 것 — 조회마다 대표가 바뀌면 안 된다", () => {
    const a = ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T09:00:00Z");
    const b = ch("b", "active", "2026-08-01", "2026-08-28", "2026-07-30T08:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
    // 입력 순서를 뒤집어도 같은 답이어야 한다
    expect(pickPrimaryChallenge([b, a])?.id).toBe("b");
  });

  it("ended·cancelled는 대표가 될 수 없다", () => {
    const a = ch("a", "ended", "2026-07-01", "2026-07-28", "2026-07-30T00:00:00Z");
    const b = ch("b", "cancelled", "2026-07-01", "2026-07-28", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])).toBeNull();
  });

  it("입력 배열을 변형하지 않는다", () => {
    const list = [
      ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T00:00:00Z"),
      ch("b", "active", "2026-08-01", "2026-08-10", "2026-07-30T00:00:00Z"),
    ];
    const before = list.map((c) => c.id).join(",");
    pickPrimaryChallenge(list);
    expect(list.map((c) => c.id).join(",")).toBe(before);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run src/lib/domain/challenge-room.test.ts
```

기대: FAIL — `Failed to resolve import "./challenge-room"`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/challenge-room.ts`:

```ts
/**
 * 챌린지 방 순수 계산 (설계 2026-07-29 §5.3·§6.2).
 *
 * 여기 있는 함수는 0043이 화면·RPC에서 쓴다. 0042 단계에서는 아무도 부르지
 * 않지만, 규칙을 먼저 테스트로 굳혀 두면 전환 단계에서 화면과 서버가 서로
 * 다른 계산을 하는 일이 없다.
 */

export type ChallengeStatus = "setup" | "active" | "ended" | "cancelled";

export type ChallengeLike = {
  id: string;
  status: ChallengeStatus;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  createdAt: string; // ISO
};

/**
 * 홈에 보여줄 대표 챌린지 하나.
 *
 * 종료일이 가장 임박한 active → 없으면 시작일이 가장 가까운 setup.
 * 동률이면 먼저 만들어진 것 — 규칙이 없으면 조회할 때마다 대표가 바뀌어
 * 열람권(challenge_peek_picks) 대상이 흔들린다.
 */
export function pickPrimaryChallenge<T extends ChallengeLike>(
  list: T[],
): T | null {
  const pickBy = (status: ChallengeStatus, key: "endDate" | "startDate") => {
    const candidates = list.filter((c) => c.status === status);
    if (candidates.length === 0) return null;
    // 원본을 건드리지 않으려고 복사 후 정렬한다.
    return [...candidates].sort(
      (a, b) => a[key].localeCompare(b[key]) || a.createdAt.localeCompare(b.createdAt),
    )[0];
  };
  return pickBy("active", "endDate") ?? pickBy("setup", "startDate");
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/domain/challenge-room.test.ts
```

기대: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/challenge-room.ts src/lib/domain/challenge-room.test.ts
git commit -m "feat: 대표 챌린지 선택 순수 함수 (0043 준비)"
```

---

## Task 2: 목표 하한선 순수 함수

설계서 §5.3 — 최근 28일 실적을 챌린지 기간에 맞춰 환산한 값이 목표의 하한이다.

```
하한 = (직전 28일 해당 유형 실적) × (챌린지 기간 ÷ 28)
```

**28일의 기준점은 "목표를 저장하는 시점"이다** — 챌린지 시작일이 아니다. 시작일 기준이면 미래 구간이 섞여 설정 시점에 계산할 수 없다.

**올림 단위는 KPI 유형별로 다르다.** 근거는 두 가지 — `user_goals.target_value`가 `numeric(10,1)`이고(`0006:35`), 입력 UI가 `round1`(소수 첫째 자리)로 값을 다듬는다(`setup-sheet.tsx:77`). 항상 **올림**한다. 내림하면 하한이 실적보다 낮아져 장치가 무력해진다.

| KPI 유형 | 단위 | 올림 단위 |
|---|---|---|
| `weight_reps` · `bodyweight_reps` · `tabata_count` | 회 | 1 (정수) |
| `weight_days` · `bodyweight_days` | 일 | 1 (정수) |
| `cardio_distance` | km | 0.1 |
| `cardio_time` · `bodyweight_time` | 분 | 0.1 |

`volume`(kg)은 레거시 표시 전용이라 신규 설정 대상이 아니다(`setup-sheet.tsx:19`의 `CATEGORY_TYPES`에 없음). 하한선 계산에서 제외한다.

**파일:**
- 수정: `src/lib/domain/challenge-room.ts`
- 테스트: `src/lib/domain/challenge-room.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/challenge-room.test.ts` 끝에 이어 붙인다:

```ts
import { goalFloor, daysMeetingQualifier, FLOOR_BASELINE_DAYS } from "./challenge-room";

describe("goalFloor", () => {
  it("기준일과 같은 기간이면 실적이 그대로 하한", () => {
    expect(goalFloor("weight_days", 14, 28)).toBe(14);
  });

  it("기간이 짧으면 비례로 줄고 올림된다 — 설계서 §5.3 예시", () => {
    // 13일 × 21 ÷ 28 = 9.75 → 10일
    expect(goalFloor("weight_days", 13, 21)).toBe(10);
  });

  it("기간이 길면 비례로 늘어난다", () => {
    // 10일 × 56 ÷ 28 = 20
    expect(goalFloor("weight_days", 10, 56)).toBe(20);
  });

  it("횟수형은 정수로 올림", () => {
    // 301 × 21 ÷ 28 = 225.75 → 226
    expect(goalFloor("weight_reps", 301, 21)).toBe(226);
  });

  it("거리는 0.1 단위로 올림 — 설계서 §5.3 예시", () => {
    // 42.3 × 21 ÷ 28 = 31.725 → 31.8
    expect(goalFloor("cardio_distance", 42.3, 21)).toBe(31.8);
  });

  it("시간도 0.1 단위로 올림", () => {
    // 100.04 × 28 ÷ 28 = 100.04 → 100.1
    expect(goalFloor("cardio_time", 100.04, 28)).toBe(100.1);
  });

  it("맨몸 시간도 0.1 단위", () => {
    expect(goalFloor("bodyweight_time", 33.31, 28)).toBe(33.4);
  });

  it("이미 0.1 배수면 올리지 않는다", () => {
    expect(goalFloor("cardio_distance", 20, 28)).toBe(20);
  });

  it("실적이 0이면 하한도 0 — 통과시킨다는 뜻", () => {
    expect(goalFloor("weight_days", 0, 28)).toBe(0);
  });

  it("레거시 volume은 하한을 걸지 않는다 (0 반환)", () => {
    expect(goalFloor("volume", 5000, 28)).toBe(0);
  });

  it("기간이 0 이하면 0 — 0 나눗셈 방지", () => {
    expect(goalFloor("weight_days", 14, 0)).toBe(0);
  });

  it("기준 구간은 28일", () => {
    expect(FLOOR_BASELINE_DAYS).toBe(28);
  });
});

// ── *_days 유형의 부위 조건 (2026-07-30 실측으로 드러난 구멍) ────────
//
// weight_days·bodyweight_days는 "하루 N부위 이상 한 날"을 센다. 그래서 같은
// 과거 데이터라도 N이 몇이냐에 따라 실적이 달라진다. 실측 예: 스칼레또님의
// 최근 웨이트는 하루 최대 3부위였는데 목표를 qualifier=4로 세워서, 19일
// 목표가 영구히 0일이 됐다.
//
// baselineActual을 qualifier 없이 계산해 넘기면 하한선이 이 경우를 못 잡는다.
// 아래 헬퍼가 "이 qualifier로 세면 과거에 며칠이었나"를 돌려주고, 호출부는
// **사용자가 지금 고른 qualifier로** 과거를 다시 세어 넘겨야 한다.
describe("daysMeetingQualifier", () => {
  const partsByDay = {
    "2026-07-27": 1,
    "2026-07-28": 3,
    "2026-07-29": 1,
  };

  it("조건을 만족한 날만 센다", () => {
    expect(daysMeetingQualifier(partsByDay, 1)).toBe(3);
    expect(daysMeetingQualifier(partsByDay, 3)).toBe(1);
  });

  it("아무 날도 못 만족하면 0 — 목표가 불가능해지는 지점", () => {
    expect(daysMeetingQualifier(partsByDay, 4)).toBe(0);
  });

  it("qualifier가 없으면 1부위로 본다 (actualForGoal과 같은 기본값)", () => {
    expect(daysMeetingQualifier(partsByDay, null)).toBe(3);
    expect(daysMeetingQualifier(partsByDay, undefined)).toBe(3);
  });

  it("빈 기록은 0", () => {
    expect(daysMeetingQualifier({}, 3)).toBe(0);
  });

  it("하한선과 함께 쓰면 qualifier가 하한을 바꾼다", () => {
    // 같은 과거 데이터인데 qualifier에 따라 하한이 달라져야 한다.
    const days3 = daysMeetingQualifier(partsByDay, 3); // 1일
    const days4 = daysMeetingQualifier(partsByDay, 4); // 0일
    expect(goalFloor("weight_days", days3, 28)).toBe(1);
    expect(goalFloor("weight_days", days4, 28)).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run src/lib/domain/challenge-room.test.ts
```

기대: FAIL — `goalFloor is not a function`

- [ ] **Step 3: 구현 추가**

`src/lib/domain/challenge-room.ts` 끝에 이어 붙인다:

```ts
import type { GoalType } from "./goal-score";

/** 하한선 기준 구간 (일). 설계 §5.3 — "최근 4주". */
export const FLOOR_BASELINE_DAYS = 28;

/**
 * KPI 유형별 올림 단위. 앱이 실제로 저장·표시하는 최소 단위를 그대로 쓴다
 * (target_value는 numeric(10,1), 입력 UI는 round1). 새 단위를 만들지 않는다.
 *
 * volume은 레거시 표시 전용이라 신규 설정 대상이 아니므로 하한을 걸지 않는다.
 */
const FLOOR_STEP: Record<GoalType, number> = {
  weight_reps: 1,
  weight_days: 1,
  bodyweight_reps: 1,
  bodyweight_days: 1,
  tabata_count: 1,
  cardio_distance: 0.1,
  cardio_time: 0.1,
  bodyweight_time: 0.1,
  volume: 0, // 하한 없음
};

/**
 * 목표 하한선 — 직전 28일 실적을 챌린지 기간에 맞춰 환산한 값.
 *
 * 항상 올림한다. 내림하면 하한이 실적보다 낮아져 장치가 무력해진다.
 * 실적이 없으면 0을 돌려주므로 호출부에서 "통과"로 다뤄진다 — 실적 없는
 * 유형을 어떻게 다룰지는 완료 목표 보너스 쪽에서 정한다(설계 D13).
 */
export function goalFloor(
  type: GoalType,
  baselineActual: number,
  periodDays: number,
): number {
  const step = FLOOR_STEP[type];
  if (step <= 0 || periodDays <= 0 || baselineActual <= 0) return 0;
  const raw = (baselineActual * periodDays) / FLOOR_BASELINE_DAYS;
  // 0.1 단위 올림에서 부동소수 오차로 한 칸 더 올라가는 것을 막는다
  // (예: 31.725/0.1 = 317.2499...가 되는 경우).
  const units = Math.ceil(Number((raw / step).toFixed(6)));
  return Number((units * step).toFixed(1));
}

/**
 * *_days 유형의 과거 실적 — "하루 N부위/종목 이상 한 날" 수.
 *
 * weight_days·bodyweight_days는 qualifier에 따라 **같은 과거 데이터의 실적이
 * 달라진다**. 2026-07-30 실측에서 이게 실제로 문제가 됐다: 최근 웨이트가 하루
 * 최대 3부위였던 사용자가 목표를 qualifier=4로 세워서 19일 목표가 영구히
 * 0일이 됐고, 화면은 아무 경고도 하지 않았다.
 *
 * 그래서 goalFloor에 넘길 baselineActual은 **사용자가 지금 고른 qualifier로**
 * 다시 센 값이어야 한다. qualifier를 무시하고 센 값을 넘기면 하한선이
 * *_days에서 무의미해진다.
 *
 * 기본값 1은 actualForGoal(`challenge.ts:372`)의 `qualifier ?? 1`과 같다.
 */
export function daysMeetingQualifier(
  countByDay: Record<string, number>,
  qualifier: number | null | undefined,
): number {
  const min = qualifier ?? 1;
  return Object.values(countByDay).filter((n) => n >= min).length;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/domain/challenge-room.test.ts
```

기대: PASS (25 tests — Task 1의 8건 + 하한선 12건 + 부위조건 5건)

- [ ] **Step 5: 전체 테스트·타입 확인**

```bash
npm test
```

기대: 전체 PASS

```bash
npx tsc --noEmit
```

기대: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/lib/domain/challenge-room.ts src/lib/domain/challenge-room.test.ts
git commit -m "feat: 목표 하한선 순수 함수 — 유형별 올림 단위 (0043 준비)"
```

---

## Task 2B: `weight_days`를 부위 대신 종목 수로 (버그 수정)

2026-07-30 실측에서 드러난 문제다. 진행 중 챌린지에서 **웨이트 5종목·13세트를 한 날이 0일로 집계**됐다.

```
스칼레또 7/28 (KST): 힙어브덕션(하체) 이너따이(하체) 덤벨(팔) 랫풀다운(등) 스쿼트(하체)
  → 종목 5개, 부위 3개
  → weight_days qualifier=4 → 부위 3 < 4 → 인정 안 됨 → 0일
```

`weight_days`는 "하루 N**부위** 이상"을 세는데, 하체를 집중적으로 하는 사람은 종목을 아무리 늘려도 부위가 안 늘어난다. 결과적으로 목표가 **영구히 도달 불가**가 되고 화면은 아무 경고도 하지 않는다.

**결정(사용자):** 부위 대신 **종목 수**로 센다. `bodyweight_days`가 이미 종목 수로 세므로(`challenge.ts:336`) 두 유형의 규칙이 일치하는 부수 효과도 있다.

⚠ **이것은 0042에서 의도적으로 만드는 유일한 동작 변화다.** 0042의 기본 원칙은 "아무것도 달라지지 않는다"인데, 이 건은 진행 중인 챌린지가 지금 잘못 채점되고 있어 예외로 둔다. Task 8 실기기 확인에서 이 변화만은 **보여야** 한다.

**파일:**
- 수정: `src/lib/challenge.ts` (`PeriodStats` 필드명·`foldPeriodStats`·`actualForGoal`·`goalLabel`)
- 수정: `src/lib/challenge.test.ts`
- 수정: `src/components/challenge/setup-sheet.tsx` (라벨)
- 수정: `src/lib/domain/goal-score.ts:10` · `src/lib/types.ts:25` (주석)

- [ ] **Step 1: 실패하는 테스트로 바꾼다**

`src/lib/challenge.test.ts:117`의 단언을 종목 기준으로 바꾼다. 현재:

```ts
    expect(s.weightPartsByDay["2026-07-01"]).toBe(1); // 가슴 1부위
```

이것으로:

```ts
    expect(s.weightKindsByDay["2026-07-01"]).toBe(1); // 벤치프레스 1종목
```

같은 파일 27행의 픽스처 필드명도 바꾼다. 현재:

```ts
  weightPartsByDay: { "2026-07-01": 3, "2026-07-02": 1, "2026-07-03": 4 },
```

이것으로:

```ts
  weightKindsByDay: { "2026-07-01": 3, "2026-07-02": 1, "2026-07-03": 4 },
```

그리고 파일 끝에 **부위가 같아도 종목이 다르면 따로 센다**를 고정하는 테스트를 추가한다. 이게 이번 수정의 본질이다.

```ts
describe("foldPeriodStats — weight_days는 종목 수로 센다 (2026-07-30 수정)", () => {
  // 실측 재현: 하체 3종목 + 팔 1종목 + 등 1종목 = 종목 5개, 부위 3개.
  // 부위로 세면 3, 종목으로 세면 5다. qualifier=4를 만족해야 한다.
  const row = {
    userId: "u1",
    completedAt: "2026-07-28T13:05:00Z",
    exercises: [
      ["힙 어브덕션", "하체"],
      ["이너따이", "하체"],
      ["스쿼트", "하체"],
      ["덤벨", "팔"],
      ["랫풀다운", "등"],
    ].map(([exerciseName, bodyPart]) => ({
      exerciseType: "weight" as const,
      exerciseName,
      bodyPart,
      sets: [
        {
          weightKg: 10,
          reps: 25,
          distanceMeters: null,
          durationSeconds: null,
          isCompleted: true,
        },
      ],
    })),
  };

  it("같은 부위의 다른 종목을 각각 센다", () => {
    const s = foldPeriodStats([row], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.weightKindsByDay["2026-07-28"]).toBe(5);
  });

  it("qualifier 4를 만족한다 — 부위로 셌을 때 0이던 것이 1이 된다", () => {
    const s = foldPeriodStats([row], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(actualForGoal(s, "weight_days", 4)).toBe(1);
    expect(actualForGoal(s, "weight_days", 6)).toBe(0);
  });

  it("완료되지 않은 세트만 있는 종목은 세지 않는다", () => {
    const incomplete = {
      ...row,
      exercises: row.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((st) => ({ ...st, isCompleted: false })),
      })),
    };
    const s = foldPeriodStats([incomplete], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.weightKindsByDay["2026-07-28"] ?? 0).toBe(0);
  });
});
```

`foldPeriodStats`·`actualForGoal`이 이 테스트 파일에 이미 import돼 있는지 확인하고, 없으면 추가한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run src/lib/challenge.test.ts
```

기대: FAIL — `weightKindsByDay` 필드가 없어 `undefined`. 그리고 `actualForGoal(s, "weight_days", 4)`가 부위 3개 기준으로 `0`이 나온다.

- [ ] **Step 3: `PeriodStats` 필드명 변경**

`src/lib/challenge.ts:244-245`. 현재:

```ts
  /** 날짜별 웨이트 완료 부위 수 — weight_days 판정 */
  weightPartsByDay: Record<string, number>;
```

이것으로:

```ts
  /**
   * 날짜별 웨이트 완료 **종목** 수 — weight_days 판정.
   *
   * 2026-07-30까지는 부위 수였다. 하체를 집중적으로 하는 사람이 종목을
   * 아무리 늘려도 부위가 안 늘어나서, 5종목·13세트를 한 날이 qualifier=4에
   * 걸려 0일로 집계됐다. bodyweight_days가 이미 종목 수로 세므로 두 유형의
   * 규칙도 이제 일치한다.
   */
  weightKindsByDay: Record<string, number>;
```

- [ ] **Step 4: 나머지 필드명·집계 기준 변경**

`src/lib/challenge.ts` 안에서 순서대로 고친다.

**(a) `EMPTY_STATS` (260행)** — `weightPartsByDay: {},` → `weightKindsByDay: {},`

**(b) `Acc` 타입 (293행)** — `weightParts: Map<string, Set<string>>;` → `weightKinds: Map<string, Set<string>>;`

**(c) 초기화 (304·307행)**

```ts
      weightPartsByDay: {},
      ...
      weightParts: new Map<string, Set<string>>(),
```

→

```ts
      weightKindsByDay: {},
      ...
      weightKinds: new Map<string, Set<string>>(),
```

**(d) 집계 (330~333행) — 여기가 실제 수정이다**

```ts
      if (ex.exerciseType === "weight") {
        const parts = entry.weightParts.get(key) ?? new Set<string>();
        parts.add(ex.bodyPart ?? ex.exerciseType);
        entry.weightParts.set(key, parts);
      } else if (ex.exerciseType === "bodyweight") {
```

→

```ts
      if (ex.exerciseType === "weight") {
        // 부위(bodyPart)가 아니라 종목명으로 센다 — 2026-07-30 수정.
        // 바로 아래 bodyweight 쪽과 같은 기준이다.
        const kinds = entry.weightKinds.get(key) ?? new Set<string>();
        kinds.add(ex.exerciseName);
        entry.weightKinds.set(key, kinds);
      } else if (ex.exerciseType === "bodyweight") {
```

**(e) 결과 조립 (345~346·359행)**

```ts
    const weightPartsByDay: Record<string, number> = {};
    for (const [day, parts] of e.weightParts) weightPartsByDay[day] = parts.size;
```

→

```ts
    const weightKindsByDay: Record<string, number> = {};
    for (const [day, kinds] of e.weightKinds) weightKindsByDay[day] = kinds.size;
```

그리고 359행의 `weightPartsByDay,` → `weightKindsByDay,`

**(f) `actualForGoal` (380행)** — `return daysAtLeast(stats.weightPartsByDay);` → `return daysAtLeast(stats.weightKindsByDay);`

**(g) `actualForGoal` 주석 (366행)**

```ts
/** 목표 유형별 실적 값 (frequency는 qualifier=하루 최소 부위 수 조건) */
```

→

```ts
/** 목표 유형별 실적 값 (*_days는 qualifier=하루 최소 종목 수 조건) */
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run src/lib/challenge.test.ts
```

기대: PASS

- [ ] **Step 6: 화면 문구를 종목으로 바꾼다**

**(a) `src/lib/challenge.ts:41`**

```ts
  if (type === "weight_days") return `${base}(하루 ${qualifier ?? 1}부위+)`;
```

→

```ts
  if (type === "weight_days") return `${base}(하루 ${qualifier ?? 1}종목+)`;
```

**(b) `src/lib/challenge.ts:34`** — `/** *_days: 하루 최소 부위/종목 수 (기본 3) */` → `/** *_days: 하루 최소 종목 수 (기본 3) */`

**(c) `src/components/challenge/setup-sheet.tsx:28`** — `weight_days: "운동일(부위)",` → `weight_days: "운동일(종목)",`

**(d) `src/components/challenge/setup-sheet.tsx:65`** — `qualifier: number; // 일수형: 하루 최소 부위/종목 수` → `qualifier: number; // 일수형: 하루 최소 종목 수`

**(e) `src/components/challenge/setup-sheet.tsx:487-489`** — 현재:

```tsx
                        {row.type === "weight_days"
                          ? "하루 최소 부위 수 — 이만큼 웨이트를 완료한 날만 인정"
                          : "하루 최소 종목 수 — 이만큼 맨몸을 완료한 날만 인정"}
```

→

```tsx
                        {row.type === "weight_days"
                          ? "하루 최소 종목 수 — 이만큼 웨이트를 완료한 날만 인정"
                          : "하루 최소 종목 수 — 이만큼 맨몸을 완료한 날만 인정"}
```

**(f) `src/components/challenge/setup-sheet.tsx:508`** — 두 분기가 같아지므로 삼항을 없앤다. 현재:

```tsx
                            {row.type === "weight_days" ? "부위+" : "종목+"}
```

→

```tsx
                            종목+
```

**(g) `src/lib/domain/goal-score.ts:10`** — `| "weight_days" // 웨이트 운동일 (하루 N부위+)` → `| "weight_days" // 웨이트 운동일 (하루 N종목+)`

**(h) `src/lib/types.ts:25`** — `qualifier: number | null; // frequency: 하루 최소 웨이트 부위 수` → `qualifier: number | null; // *_days: 하루 최소 종목 수`

- [ ] **Step 7: 전체 확인**

```bash
grep -rn "weightPartsByDay\|weightParts\b" src/
```

기대: 출력 없음 (전부 `weightKinds`로 바뀜)

```bash
npx tsc --noEmit
```

기대: 오류 없음

```bash
npm test
```

기대: 전체 PASS

```bash
npm run lint
```

기대: 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add src/lib/challenge.ts src/lib/challenge.test.ts src/components/challenge/setup-sheet.tsx src/lib/domain/goal-score.ts src/lib/types.ts
git commit -m "fix: weight_days를 부위 대신 종목 수로 집계"
```

---

## Task 2C: 타바타 시간을 `bodyweight_time`에 반영 (버그 수정)

2026-07-30 실측에서 드러난 두 번째 문제다.

타바타 세션의 맨몸 세트는 `reps=0`, `duration_seconds=null`로 저장되고 **분수는 세션의 `tabata_minutes`에만** 있다. 그런데 `foldPeriodStats`는 그 값을 타바타 횟수 세는 데만 쓴다 (`challenge.ts:311`).

```ts
if (row.tabataMinutes) entry.tabataCount += 1;   // 분수는 버려진다
```

`bodyweightTimeMin`은 세트의 `durationSeconds`만 더하므로, **타바타를 아무리 해도 `bodyweight_time` 목표는 0**이다. 실측에서 한 참가자의 `bodyweight_time` 56.6분 목표가 정확히 이 경우였다.

**파일:**
- 수정: `src/lib/challenge.ts:311`
- 수정: `src/lib/challenge.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/challenge.test.ts` 끝에 추가한다:

```ts
describe("foldPeriodStats — 타바타 분수가 맨몸 시간에 들어간다 (2026-07-30 수정)", () => {
  // 실측 재현: 타바타 세트는 reps=0·durationSeconds=null이고 분수는
  // 세션의 tabataMinutes에만 있다.
  const tabataRow = {
    userId: "u1",
    completedAt: "2026-07-29T07:06:00Z",
    tabataMinutes: 8,
    exercises: ["점프 스쿼트", "마운틴 클라이머"].map((exerciseName) => ({
      exerciseType: "bodyweight" as const,
      exerciseName,
      bodyPart: "하체",
      sets: [
        {
          weightKg: null,
          reps: 0,
          distanceMeters: null,
          durationSeconds: null,
          isCompleted: true,
        },
      ],
    })),
  };

  it("타바타 분수가 bodyweightTimeMin에 더해진다", () => {
    const s = foldPeriodStats([tabataRow], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.bodyweightTimeMin).toBe(8);
  });

  it("bodyweight_time 목표에 반영된다", () => {
    const s = foldPeriodStats([tabataRow], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(actualForGoal(s, "bodyweight_time")).toBe(8);
  });

  it("타바타 횟수는 그대로 1회 — 분수를 더해도 중복 집계되지 않는다", () => {
    const s = foldPeriodStats([tabataRow], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.tabataCount).toBe(1);
  });

  it("세트에 durationSeconds가 있으면 그것과 함께 더해진다", () => {
    const mixed = {
      ...tabataRow,
      tabataMinutes: 4,
      exercises: [
        {
          ...tabataRow.exercises[0],
          sets: [{ ...tabataRow.exercises[0].sets[0], durationSeconds: 120 }],
        },
      ],
    };
    const s = foldPeriodStats([mixed], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.bodyweightTimeMin).toBe(6); // 타바타 4분 + 세트 120초
  });

  it("타바타가 아닌 세션은 영향 없다", () => {
    const plain = { ...tabataRow, tabataMinutes: null };
    const s = foldPeriodStats([plain], "2026-07-27", "2026-09-30", "Asia/Seoul").get("u1")!;
    expect(s.bodyweightTimeMin).toBe(0);
    expect(s.tabataCount).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run src/lib/challenge.test.ts
```

기대: FAIL — `expected 0 to be 8` (타바타 분수가 버려지고 있다)

- [ ] **Step 3: 구현**

`src/lib/challenge.ts:311`. 현재:

```ts
    if (row.tabataMinutes) entry.tabataCount += 1;
```

이것으로:

```ts
    if (row.tabataMinutes) {
      entry.tabataCount += 1;
      // 타바타 세트는 reps=0·durationSeconds=null로 저장되고 분수는 여기에만
      // 있다. 이 줄이 없으면 타바타를 아무리 해도 bodyweight_time 목표가
      // 영구히 0이다 (2026-07-30 수정).
      entry.bodyweightTimeMin += row.tabataMinutes;
    }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/challenge.test.ts
```

기대: PASS

```bash
npm test
```

기대: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge.ts src/lib/challenge.test.ts
git commit -m "fix: 타바타 분수를 bodyweight_time 목표에 반영"
```

---

## Task 3: 마이그레이션 0042 — 테이블·RLS·알림유형

**파일:**
- 생성: `supabase/migrations/0042_challenge_participants.sql`

이 태스크는 파일의 **앞부분만** 만든다. RPC는 Task 4, 백필은 Task 5에서 같은 파일에 이어 붙인다.

- [ ] **Step 1: 파일 생성**

`supabase/migrations/0042_challenge_participants.sql`:

```sql
-- 0042: 챌린지 방 (1/3 · 추가만) — 참가자 테이블 · 초대 RPC · 백필
-- 설계: docs/superpowers/specs/2026-07-29-challenge-rooms-design.md
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0042.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0041은 수정 금지.
--
-- 이 파일은 테이블·RPC·백필을 "추가"만 한다. 기존 challenges·user_goals·
-- groups 경로는 한 줄도 건드리지 않으므로, 적용 직후에도 앱은 지금과 똑같이
-- 돈다. 실제 전환은 0043이다.
--
-- 순서를 나눈 이유: 0042만 적용된 상태로 실기기 확인을 한 뒤 0043으로 넘어가야
-- 문제가 생겨도 되돌릴 지점이 있다. 0038→0039에서 검증된 방식이다.
--
-- 되돌리기: challenge_participants를 drop하고 알림유형에서 challenge_invite를
--   빼면 된다. 앱이 이 테이블을 읽지 않으므로 위험이 없다.

begin;

-- ── 1. 참가자 테이블 ────────────────────────────────────────
-- groups/group_members가 하던 "명단" 역할을 챌린지가 직접 한다.
--
-- status 세 값의 뜻:
--   invited — 초대됐고 아직 응답 없음
--   joined  — 수락함. 목표까지 세우면 참가 확정
--   dropped — 시작 시점에 목표가 없어 명단에서 빠짐 (§4.2)
--
-- dropped를 두는 이유: 행을 지우면 수락 때 맺어진 crew_links의 근거가 사라져
-- "왜 이 사람이 내 크루지"를 설명할 수 없다. 랭킹·집계에서는 빠지지만 이력은
-- 남긴다.
create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'joined', 'dropped')),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- "내가 낀 챌린지" 조회용 (RLS 정책과 화면 목록이 둘 다 이 방향으로 탄다)
create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, status);

-- 챌린지당 host는 1명 — 취소 권한이 갈리면 안 된다
create unique index if not exists challenge_participants_one_host
  on public.challenge_participants (challenge_id) where role = 'host';

-- ── 2. RLS — 읽기만 열고 쓰기는 RPC로만 ─────────────────────
-- 0038과 같은 방식이다. 직접 insert를 허용하면 초대 없이 남의 챌린지에
-- 참가자로 끼어들 수 있다.
alter table public.challenge_participants enable row level security;
revoke all on public.challenge_participants from anon, authenticated;
grant select on public.challenge_participants to authenticated;

-- 판정 함수를 먼저 만든다. 정책 안에서 같은 테이블을 서브쿼리로 읽으면
-- 무한 재귀(42P17)가 된다 — security definer 함수로 우회한다.
create or replace function public.is_challenge_participant(cid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.challenge_participants
    where challenge_id = cid and user_id = uid
  )
$$;
-- ⚠ revoke하지 않는다. RLS 정책이 부르는 판정 함수는 호출자 권한으로 평가되므로
--    revoke하면 anon 요청이 0행이 아니라 42501로 죽는다 (0038의 is_crew_with와
--    같은 이유 — 0038:64 주석 참조).

drop policy if exists "challenge_participants_select_member" on public.challenge_participants;
create policy "challenge_participants_select_member" on public.challenge_participants
  for select to authenticated
  using (public.is_challenge_participant(challenge_id, auth.uid()));

-- ── 3. 알림 유형 challenge_invite 추가 ──────────────────────
-- ⚠ 기존 15종을 하나도 빠뜨리면 안 된다. 빠뜨리면 그 유형을 쓰는 기존 알림이
--    조용히 죽는다. 아래 목록은 현행(0038:77)에 challenge_invite만 더한 것이다.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started', 'cheer_received', 'poke', 'reaction_received',
  'rank_change', 'record_viewed', 'morning_briefing',
  'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
  'level_up', 'app_update',
  'crew_request', 'crew_accepted',
  'challenge_invite'                                   -- 0042
));

commit;

-- 적용 확인 (SQL Editor에서 따로 실행):
--   select count(*) from public.challenge_participants;
--   → 0 (백필은 Task 5에서 이어 붙인다)
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'notifications_type_check';
--   → 16종. challenge_invite 포함, 기존 15종 전부 살아 있어야 한다.
```

- [ ] **Step 2: 기존 알림 유형이 하나도 빠지지 않았는지 대조**

```bash
sed -n '76,84p' supabase/migrations/0038_crew_link_graph.sql
```

위 출력의 15개 값이 새 CHECK에 **전부** 있는지 눈으로 확인한다. 하나라도 빠지면 그 유형의 알림이 조용히 죽는다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0042_challenge_participants.sql
git commit -m "feat(0042): challenge_participants 테이블·RLS·알림유형"
```

---

## Task 4: 마이그레이션 0042 — RPC 6개

**파일:**
- 수정: `supabase/migrations/0042_challenge_participants.sql`

Task 3의 `commit;` **앞에** 이어 붙인다 (한 트랜잭션 안에 있어야 한다).

### RPC 6개의 역할

| RPC | 하는 일 |
|---|---|
| `create_challenge_room` | 챌린지 생성 + 방장을 `host`·`joined`로 (한 트랜잭션) |
| `invite_to_challenge` | `invited` 행 + `challenge_invite` 알림. `setup`에서만 |
| `accept_challenge_invite` | `joined` 전환 + **기존 joined 참가자 전원과 `crew_links`** |
| `decline_challenge_invite` | 행 삭제 |
| `autostart_due_challenges` | 시작일 도래분 `setup`→`active` + 명단 확정. 멱등 |
| `autofinalize_due_challenges` | 종료일 지난 `active`→`ended`. 멱등 |

- [ ] **Step 1: RPC 블록 추가**

`commit;` 앞에 넣는다:

```sql
-- ── 4. RPC — 생성·초대·수락·거절 ────────────────────────────
-- 전부 security definer다. 쓰기를 RPC로만 열었으므로(§2) 여기가 유일한 입구다.

-- 4.1 생성 — 방장을 host·joined로 함께 넣는다.
-- 두 단계로 나누면 "참가자 없는 챌린지"가 생길 수 있다. 취소할 사람이 없어진다.
create or replace function public.create_challenge_room(
  p_name text, p_start_date date, p_end_date date,
  p_photo_required boolean default true
) returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_group uuid;
  c challenges;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_start_date > p_end_date then raise exception 'invalid_period'; end if;

  -- 0042는 challenges.group_id를 아직 못 지운다(not null). 0044에서 드롭할
  -- 때까지는 방장의 그룹을 그대로 채워 둔다 — 혼자모드 유저는 그룹이 없으므로
  -- 그때는 생성이 막힌다. 그 제약이 풀리는 건 0043·0044다.
  select gm.group_id into v_group
  from group_members gm where gm.user_id = v_me
  order by gm.created_at limit 1;
  if v_group is null then raise exception 'no_group_yet'; end if;

  insert into challenges (group_id, name, start_date, end_date, photo_required, created_by)
  values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me)
  returning * into c;

  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'host', 'joined', now());

  return c;
end $$;
revoke all on function public.create_challenge_room(text, date, date, boolean) from public, anon;
grant execute on function public.create_challenge_room(text, date, date, boolean) to authenticated;

-- 4.2 초대 — setup 단계에서만, 방장만.
create or replace function public.invite_to_challenge(
  p_challenge_id uuid, p_target_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_nick text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_invite'; end if;

  select * into c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  if not exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = v_me and role = 'host'
  ) then
    raise exception 'not_host';
  end if;

  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;

  -- 이미 초대했거나 참가 중이면 알린다. 조용히 넘기면 화면이 "보냈어요"를
  -- 두 번 띄우고 사용자는 상대가 왜 안 들어오는지 모른다.
  if exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = p_target_id
  ) then
    raise exception 'already_invited';
  end if;

  insert into challenge_participants (challenge_id, user_id, role, status, invited_by)
  values (p_challenge_id, p_target_id, 'member', 'invited', v_me);

  select nickname into v_nick from profiles where id = v_me;
  -- 알림 실패가 초대를 되돌리면 안 된다. 초대가 본체고 알림은 곁가지다.
  -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 롤백시킨 전례가 있다.)
  begin
    perform notify(
      p_target_id, v_me, 'challenge_invite', p_challenge_id,
      coalesce(v_nick, '크루원') || '님이 챌린지에 초대했어요 🏆',
      c.name || ' · ' || to_char(c.start_date, 'MM/DD') || '~' || to_char(c.end_date, 'MM/DD')
    );
  exception when others then null;
  end;

  return jsonb_build_object('status', 'invited');
end $$;
revoke all on function public.invite_to_challenge(uuid, uuid) from public, anon;
grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

-- 4.3 수락 — joined 전환 + 기존 joined 참가자 전원과 crew_links (설계 D5)
--
-- 완전 연결이어야 하는 이유: A가 B와 C를 초대했을 때 A-B·A-C만 만들면 B는
-- 랭킹판에서 C의 닉네임을 못 읽는다(profiles SELECT가 크루 기준이다).
create or replace function public.accept_challenge_invite(p_challenge_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_row challenge_participants;
  v_linked int := 0;
  v_peer uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 챌린지 단위 직렬화. 두 사람이 동시에 수락하면 서로를 "기존 참가자"로
  -- 못 보고 crew_links가 한쪽만 생기거나, 락 순서가 엇갈려 데드락이 난다.
  perform pg_advisory_xact_lock(hashtext(p_challenge_id::text));

  select * into c from challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me for update;
  if not found then raise exception 'not_invited'; end if;
  if v_row.status = 'joined' then raise exception 'already_joined'; end if;
  if v_row.status = 'dropped' then raise exception 'dropped'; end if;

  -- 크루 연결을 먼저 만든다. 내 status를 joined로 바꾼 뒤에 돌면 자기 자신이
  -- 목록에 들어와 crew_links_not_self 위반이 된다.
  for v_peer in
    select user_id from challenge_participants
    where challenge_id = p_challenge_id and status = 'joined' and user_id <> v_me
  loop
    insert into crew_links (user_a, user_b)
    values (least(v_me, v_peer), greatest(v_me, v_peer))
    on conflict do nothing;
    v_linked := v_linked + 1;
  end loop;

  update challenge_participants
     set status = 'joined', joined_at = now()
   where challenge_id = p_challenge_id and user_id = v_me;

  return jsonb_build_object('status', 'joined', 'crewLinked', v_linked);
end $$;
revoke all on function public.accept_challenge_invite(uuid) from public, anon;
grant execute on function public.accept_challenge_invite(uuid) to authenticated;

-- 4.4 거절 — 행을 지운다. 나중에 다시 초대할 수 있어야 한다.
create or replace function public.decline_challenge_invite(p_challenge_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_row from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me for update;
  if not found then raise exception 'not_invited'; end if;
  if v_row.status <> 'invited' then raise exception 'not_invited'; end if;

  delete from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me;

  return jsonb_build_object('status', 'declined');
end $$;
revoke all on function public.decline_challenge_invite(uuid) from public, anon;
grant execute on function public.decline_challenge_invite(uuid) to authenticated;

-- ── 5. 자동 시작·종료 (설계 §4.1) ───────────────────────────
-- 크론(09:00 KST 브리핑에 얹음)과 화면 진입 시 지연 전환이 둘 다 부른다.
-- 그래서 멱등해야 한다 — 두 번 불러도 결과가 같아야 한다.
--
-- ⚠ 정각 전환이 아니다. "시작일 00:00 KST가 지난 뒤, 첫 화면 진입과 09:00
--   크론 중 먼저 실행되는 경로"에서 바뀐다. 자정 크론을 새로 만들지 않는다 —
--   집계는 start_date 기준이라 전환이 몇 시간 늦어도 운동이 누락되지 않는다.
create or replace function public.autostart_due_challenges()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_started int := 0;
  v_dropped int := 0;
  v_dropped_now int := 0;
  c record;
begin
  for c in
    select ch.id from challenges ch
    where ch.status = 'setup' and ch.start_date <= v_today
    order by ch.start_date
    for update
  loop
    -- 목표 0개인 joined는 명단에서 뺀다 (§4.2). 행은 남긴다 — 지우면
    -- 수락 때 맺어진 crew_links의 근거가 사라진다.
    update challenge_participants cp
       set status = 'dropped'
     where cp.challenge_id = c.id
       and cp.status = 'joined'
       and not exists (
         select 1 from user_goals ug
         where ug.challenge_id = c.id and ug.user_id = cp.user_id
       );
    -- ⚠ 이번 update가 바꾼 행 수만 더한다. select count(*)로 세면 이미
    --    dropped였던 행까지 매 루프마다 다시 더해져 과다 집계된다.
    --    ROW_COUNT는 **직전 문장**의 값이므로 update 바로 뒤에서 읽어야 한다.
    get diagnostics v_dropped_now = row_count;
    v_dropped := v_dropped + v_dropped_now;

    -- 미응답 초대는 만료시킨다
    delete from challenge_participants
    where challenge_id = c.id and status = 'invited';

    update challenges set status = 'active' where id = c.id;
    v_started := v_started + 1;

    -- 참가자 전원에게 시작 알림
    begin
      perform notify(
        cp.user_id, null, 'challenge_started', c.id,
        '🏁 챌린지가 시작됐어요', '오늘부터 기록이 반영돼요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('started', v_started, 'dropped', v_dropped);
end $$;
revoke all on function public.autostart_due_challenges() from public, anon;
grant execute on function public.autostart_due_challenges() to authenticated;

-- 종료도 자동이다. 지금은 누군가 "결과 발표하기"를 눌러야 ended가 되는데,
-- 챌린지가 여러 개면 아무도 안 누른 채 방치되는 게 확실하다.
create or replace function public.autofinalize_due_challenges()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_ended int := 0;
  c record;
begin
  for c in
    select ch.id from challenges ch
    where ch.status = 'active' and ch.end_date < v_today
    order by ch.end_date
    for update
  loop
    update challenges set status = 'ended' where id = c.id;
    v_ended := v_ended + 1;
    begin
      perform notify(
        cp.user_id, null, 'challenge_ended', c.id,
        '🏆 결과가 나왔어요', '챌린지 탭에서 최종 순위를 확인하세요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('ended', v_ended);
end $$;
revoke all on function public.autofinalize_due_challenges() from public, anon;
grant execute on function public.autofinalize_due_challenges() to authenticated;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0042_challenge_participants.sql
git commit -m "feat(0042): 챌린지 방 RPC 6개 — 생성·초대·수락·거절·자동시작·자동종료"
```

---

## Task 5: 마이그레이션 0042 — 백필

**파일:**
- 수정: `supabase/migrations/0042_challenge_participants.sql`

Task 4가 넣은 블록 뒤, `commit;` **앞에** 이어 붙인다.

### 챌린지 단위 가드를 쓰지 않는 이유

0038은 `where not exists (select 1 from crew_links)`라는 **테이블 단위** 가드를 썼다. 여기에 같은 방식(챌린지 단위 `where not exists`)을 쓰면 **부분 실패 후 복구를 막는다** — 참가자 3명 중 1명만 들어간 상태에서 재실행하면 "이미 행이 있으니 통째로 건너뜀"이 되어 나머지 2명이 영영 안 들어온다.

**행 단위 `on conflict do nothing`으로 간다.** `do update`를 쓰면 `dropped`를 되살린다.

**순서가 중요하다.** `created_by`를 먼저 넣어야 `host`가 유지된다. 반대로 넣으면 방장이 `member`로 먼저 들어가고 `do nothing`에 막혀 `host`가 못 된다.

- [ ] **Step 1: 백필 블록 추가**

```sql
-- ── 6. 기존 챌린지 백필 ──────────────────────────────────────
-- 재실행 안전성: 행 단위 on conflict do nothing이다.
--
-- ⚠ 챌린지 단위 where not exists 가드를 쓰지 않는다. 참가자 3명 중 1명만
--    들어간 상태에서 재실행하면 "이미 행이 있으니 통째로 건너뜀"이 되어
--    나머지 2명이 영영 안 들어온다. 행 단위여야 부분 실패를 복구한다.
--
-- ⚠ do update를 쓰면 안 된다. dropped를 joined로 되살린다.

-- 6.1 방장 먼저 — created_by를 group_members 조인이 아니라 challenges에서
--     직접 뽑는다. 방장이 그룹을 나갔어도 host로 들어가야 한다. 방장 없는
--     챌린지가 생기면 취소할 사람이 없어진다.
--
-- ⚠ 순서가 중요하다. member를 먼저 넣으면 방장이 member로 들어가고
--    do nothing에 막혀 host가 못 된다.
insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
select ch.id, ch.created_by, 'host', 'joined', ch.created_at
from challenges ch
where exists (select 1 from profiles p where p.id = ch.created_by)
on conflict (challenge_id, user_id) do nothing;

-- 6.2 나머지 그룹원
insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
select ch.id, gm.user_id, 'member', 'joined', ch.created_at
from challenges ch
join group_members gm on gm.group_id = ch.group_id
where exists (select 1 from profiles p where p.id = gm.user_id)
on conflict (challenge_id, user_id) do nothing;
```

- [ ] **Step 2: 파일 전체 구조 확인**

```bash
grep -n "^begin;\|^commit;\|^-- ── " supabase/migrations/0042_challenge_participants.sql
```

기대 순서: `begin;` → 1~6절 → `commit;`. `commit;`이 **마지막 절 뒤**에 하나만 있어야 한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0042_challenge_participants.sql
git commit -m "feat(0042): 기존 챌린지 참가자 백필 — 행 단위 재실행 안전"
```

---

## Task 6: 검증 스크립트

**파일:**
- 생성: `scripts/challenge-room-check.mjs`

### 반드시 알아야 할 제약

**① 삭제는 가드를 경유한다.** `scripts/_safe-delete.mjs`의 `createDeleteGuard`를 쓴다. 이 스크립트는 **프로덕션**에 붙는다(스테이징 없음). 가드는 실행 시작 시점 스냅샷에 있는 계정을 절대 지우지 않는다. **가드 생성은 첫 `anonUser()`보다 앞에 와야 한다** — 뒤에 오면 이 실행의 픽스처가 "기존 계정"으로 잡혀 정리가 통째로 거부된다.

**② `process.exit`를 `finally` 안에 두지 않는다.** 즉시 종료하면서 예외를 삼켜, 아무것도 검증 못 한 실행이 exit 0으로 "정상"이라 보고된다.

**③ `create_challenge_room`은 그룹이 필요하다.** 0042 단계에서는 `challenges.group_id`가 아직 `not null`이다. 픽스처에서 `create_group`으로 그룹을 만들고 참가자를 넣어야 한다.

**④ 익명 가입에 rate limit이 있다.** 짧은 시간에 여러 스크립트를 연달아 돌리면 429가 난다. 이 스크립트는 계정 4개만 만든다.

**⑤ RPC 인자 이름을 짐작하지 않는다.** `create_group(p_name)`, `join_group_with_code(p_code)`, `send_crew_request(p_target_id)`, `accept_crew_request(p_request_id)`.

**⑥ 그룹을 유저보다 먼저 지운다.** `groups.owner_id`는 `on delete cascade`가 **아니다**. 그룹이 남아 있으면 그 방장 계정 삭제가 500으로 실패하고 테스트 계정이 프로덕션 auth에 떠돌이로 남는다. 2026-07-30 실행에서 실제로 2개가 남았다. `rls-test.mjs:524`가 같은 이유로 그룹을 먼저 지운다.

**⑦ 컬럼명을 스키마에서 확인하고 쓴다.** 0042가 `create_challenge_room`에서 `order by gm.created_at`을 썼는데 `group_members`에는 그 컬럼이 없다 — 실제 이름은 `joined_at`이다(`0001:32`). 챌린지 생성이 `42703`으로 통째로 실패했고, 그 함수를 쓰는 후속 단언 20여 개가 `chId=undefined`로 연쇄 실패했다. **0043이 이것만 고친다.**

이런 종류는 SQL을 적용해 보기 전엔 안 드러난다. 계획서 SQL을 쓸 때 참조하는 테이블의 컬럼을 실제로 조회해 대조하는 편이 싸다:

```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name in ('group_members','challenges','user_goals')
order by table_name, ordinal_position;
```

**⑧ PostgREST는 오류 시 배열이 아니라 에러 객체를 준다.** 테이블이 없거나 권한이 없으면 `{code, message}`가 온다. 그걸 그대로 `.some()`에 넘기면 `ps.some is not a function`으로 실행이 통째로 죽는다 — 적용 전 실행에서 실제로 그랬다. 배열 반환 헬퍼는 `Array.isArray(r.json) ? r.json : []`로 감싼다.

- [ ] **Step 1: 스크립트 작성**

`scripts/challenge-room-check.mjs`:

```js
// 0042 검증: 챌린지 방 — 참가자·초대·수락·완전연결·자동시작·백필·직접쓰기 차단.
// 실행: node scripts/challenge-room-check.mjs
// 사전조건: 0042가 적용되어 있어야 한다.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

// ⚠ 첫 anonUser()보다 앞에서 만든다. 뒤에서 만들면 이 실행의 픽스처까지
//   "기존 계정"으로 잡혀 정리가 통째로 거부된다.
const guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });

const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: res.status, json };
}

const rpc = (token, name, args) =>
  api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});

const hasCode = (r, code) =>
  r.status >= 400 && JSON.stringify(r.json ?? {}).includes(code);

async function anonUser(tag) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`익명 가입 실패(${tag}): ${JSON.stringify(json)}`);
  }
  const user = { id: json.user.id, token: json.access_token, nickname: `방${RUN}${tag}` };
  const created = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: user.nickname,
    avatar_url: "🏆",
    weekly_goal: 3,
  });
  if (created.status >= 400) {
    throw new Error(`프로필 생성 실패(${tag}): ${JSON.stringify(created.json)}`);
  }
  guard.register(user.id);
  return user;
}

/** KST 오늘 날짜 (SQL의 (now() at time zone 'Asia/Seoul')::date와 같은 값). */
const kstDay = (offsetMs = 0) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetMs).toISOString().slice(0, 10);

/** 참가자 행 조회 (service_role — RLS 우회해서 실제 상태를 본다). */
async function participants(challengeId) {
  const r = await api(
    SERVICE_KEY,
    "GET",
    `/rest/v1/challenge_participants?challenge_id=eq.${challengeId}&select=user_id,role,status`,
  );
  return r.json ?? [];
}

/** 목표 하나 심기 (service_role — setup RLS를 우회해 픽스처만 만든다). */
const seedGoal = (challengeId, groupId, userId) =>
  api(SERVICE_KEY, "POST", "/rest/v1/user_goals", {
    user_id: userId,
    challenge_id: challengeId,
    group_id: groupId,
    goal_type: "weight_days",
    target_value: 12,
    unit: "일",
    planned_days: 5,
    qualifier: 3,
  });

try {
  const a = await anonUser("a"); // 방장
  const b = await anonUser("b"); // 초대받아 수락
  const c = await anonUser("c"); // 초대받아 수락 (b와 서로 크루가 아님)
  const d = await anonUser("d"); // 초대 안 받은 외부인

  // 픽스처: 그룹 (0042 단계에서 challenges.group_id가 아직 not null)
  const g = await rpc(a.token, "create_group", { p_name: `방테스트-${RUN}` });
  const groupId = (Array.isArray(g.json) ? g.json[0] : g.json)?.id;
  const code = (Array.isArray(g.json) ? g.json[0] : g.json)?.invite_code;
  check("픽스처: 그룹 생성", Boolean(groupId), JSON.stringify(g.json));

  // ── 생성 ──
  const start = kstDay(2 * 86_400_000);
  const end = kstDay(29 * 86_400_000);
  let r = await rpc(a.token, "create_challenge_room", {
    p_name: `9월 챌린지-${RUN}`,
    p_start_date: start,
    p_end_date: end,
  });
  const chId = r.json?.id;
  check("[1] 생성 성공", r.status === 200 && Boolean(chId), JSON.stringify(r.json));

  let ps = await participants(chId);
  check(
    "[2] 방장이 host·joined로 들어간다",
    ps.length === 1 && ps[0].user_id === a.id && ps[0].role === "host" && ps[0].status === "joined",
    JSON.stringify(ps),
  );

  r = await rpc(a.token, "create_challenge_room", {
    p_name: "역순기간",
    p_start_date: end,
    p_end_date: start,
  });
  check("[3] 시작일 > 종료일은 invalid_period", hasCode(r, "invalid_period"));

  // ── 초대 ──
  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: b.id });
  check("[4] 초대 성공", r.status === 200 && r.json?.status === "invited", JSON.stringify(r.json));

  ps = await participants(chId);
  check(
    "[5] invited 행이 생긴다",
    ps.some((p) => p.user_id === b.id && p.status === "invited"),
    JSON.stringify(ps),
  );

  const inv = await api(
    b.token,
    "GET",
    "/rest/v1/notifications?type=eq.challenge_invite&select=reference_id",
  );
  check("[6] challenge_invite 알림 도달", (inv.json ?? []).length === 1, JSON.stringify(inv.json));

  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: b.id });
  check("[7] 중복 초대는 already_invited", hasCode(r, "already_invited"));

  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: a.id });
  check("[8] 자기 자신 초대는 self_invite", hasCode(r, "self_invite"));

  r = await rpc(b.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: d.id });
  check("[9] 방장 아닌 사람의 초대는 not_host", hasCode(r, "not_host"));

  // ── 수락 · 완전 연결 ──
  r = await rpc(b.token, "accept_challenge_invite", { p_challenge_id: chId });
  check(
    "[10] 수락 → joined, 기존 참가자 1명과 연결",
    r.json?.status === "joined" && r.json?.crewLinked === 1,
    JSON.stringify(r.json),
  );

  const linksB = await api(b.token, "GET", "/rest/v1/crew_links?select=user_a,user_b");
  check("[11] a-b 크루 연결 생성", (linksB.json ?? []).length === 1, JSON.stringify(linksB.json));

  // c가 들어오면 a·b **둘 다**와 연결돼야 한다 (설계 D5 완전 연결)
  await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: c.id });
  r = await rpc(c.token, "accept_challenge_invite", { p_challenge_id: chId });
  check(
    "[12] 두 번째 수락자는 기존 참가자 2명 전원과 연결",
    r.json?.crewLinked === 2,
    JSON.stringify(r.json),
  );

  const linksC = await api(c.token, "GET", "/rest/v1/crew_links?select=user_a,user_b");
  check("[13] c는 a·b 양쪽과 크루", (linksC.json ?? []).length === 2, JSON.stringify(linksC.json));

  r = await rpc(c.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("[14] 재수락은 already_joined", hasCode(r, "already_joined"));

  r = await rpc(d.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("[15] 초대 안 받은 사람은 not_invited", hasCode(r, "not_invited"));

  // ── 거절 ──
  await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: d.id });
  r = await rpc(d.token, "decline_challenge_invite", { p_challenge_id: chId });
  check("[16] 거절 성공", r.json?.status === "declined", JSON.stringify(r.json));
  ps = await participants(chId);
  check("[17] 거절하면 행이 사라진다", !ps.some((p) => p.user_id === d.id), JSON.stringify(ps));

  // ── RLS ──
  const seen = await api(
    d.token,
    "GET",
    `/rest/v1/challenge_participants?challenge_id=eq.${chId}&select=user_id`,
  );
  check("[18] 비참가자는 참가자 목록을 못 읽는다", (seen.json ?? []).length === 0, JSON.stringify(seen.json));

  const seenB = await api(
    b.token,
    "GET",
    `/rest/v1/challenge_participants?challenge_id=eq.${chId}&select=user_id`,
  );
  check("[19] 참가자는 목록을 읽는다", (seenB.json ?? []).length === 3, JSON.stringify(seenB.json));

  const direct = await api(d.token, "POST", "/rest/v1/challenge_participants", {
    challenge_id: chId,
    user_id: d.id,
    role: "member",
    status: "joined",
  });
  check("[20] 직접 insert 차단", direct.status >= 400, `${direct.status}`);

  // ── 동시 챌린지 (설계 D1 — 여러 챌린지 동시 보유) ──
  // 0042는 challenges_one_live를 아직 안 지웠으므로 두 번째 setup 생성은
  // 막히는 게 정상이다. 그 제약이 풀리는 건 0043이다.
  r = await rpc(a.token, "create_challenge_room", {
    p_name: `두번째-${RUN}`,
    p_start_date: start,
    p_end_date: end,
  });
  check(
    "[21] 0042 단계에서는 두 번째 챌린지가 challenges_one_live로 막힌다 (0043에서 풀림)",
    r.status >= 400,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 자동 시작 ──
  // 시작일을 어제로 당겨 도래분으로 만든다.
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/challenges?id=eq.${chId}`,
    { start_date: kstDay(-86_400_000) },
    "return=minimal",
  );
  // a·b만 목표를 세운다 — c는 목표 없이 두고 dropped 되는지 본다.
  await seedGoal(chId, groupId, a.id);
  await seedGoal(chId, groupId, b.id);

  r = await rpc(a.token, "autostart_due_challenges", {});
  check("[22] 자동 시작 1건", r.json?.started === 1, JSON.stringify(r.json));

  const ch = await api(SERVICE_KEY, "GET", `/rest/v1/challenges?id=eq.${chId}&select=status`);
  check("[23] status가 active", ch.json?.[0]?.status === "active", JSON.stringify(ch.json));

  ps = await participants(chId);
  check(
    "[24] 목표 없는 참가자는 dropped (행은 남는다)",
    ps.find((p) => p.user_id === c.id)?.status === "dropped",
    JSON.stringify(ps),
  );
  check(
    "[25] 목표 있는 참가자는 joined 유지",
    ps.filter((p) => p.status === "joined").length === 2,
    JSON.stringify(ps),
  );

  r = await rpc(a.token, "autostart_due_challenges", {});
  check("[26] 두 번 호출해도 결과 같음 (멱등)", r.json?.started === 0, JSON.stringify(r.json));

  r = await rpc(c.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("[27] active 챌린지는 수락 불가 (중도 합류 차단)", hasCode(r, "invalid_status"));

  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: d.id });
  check("[28] active 챌린지는 초대 불가", hasCode(r, "invalid_status"));

  // ── 자동 종료 ──
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/challenges?id=eq.${chId}`,
    { end_date: kstDay(-86_400_000) },
    "return=minimal",
  );
  r = await rpc(a.token, "autofinalize_due_challenges", {});
  check("[29] 자동 종료 1건", r.json?.ended === 1, JSON.stringify(r.json));
  r = await rpc(a.token, "autofinalize_due_challenges", {});
  check("[30] 두 번 호출해도 결과 같음 (멱등)", r.json?.ended === 0, JSON.stringify(r.json));

  // ── 백필 (재실행 안전성) ──
  // service_role로 참가자 행을 지운 뒤 백필 SQL과 같은 결과가 나오는지 본다.
  // 백필 자체는 마이그레이션 안에 있으므로 여기서는 "행 단위 복구"만 확인한다.
  await api(
    SERVICE_KEY,
    "DELETE",
    `/rest/v1/challenge_participants?challenge_id=eq.${chId}&user_id=eq.${b.id}`,
    undefined,
    "return=minimal",
  );
  const afterDel = await participants(chId);
  check(
    "[31] 부분 삭제 상태를 만들 수 있다 (백필 재실행 검증 준비)",
    afterDel.length === 2,
    JSON.stringify(afterDel),
  );
  console.log(
    "  ⚠ [32] 백필 재실행(부분 실패 복구·dropped 미부활)은 이 스크립트가 검증하지 않는다.",
  );
  console.log("     0042의 6절 insert 두 개를 SQL Editor에서 다시 실행한 뒤");
  console.log(`     challenge_id=${chId}의 행이 3개로 복구되고 c가 dropped를`);
  console.log("     유지하는지 확인할 것 (계획서 Task 7 Step 4).");
} catch (e) {
  console.error("\n실행 중단:", e.message);
  failed++;
} finally {
  // ⚠ 정리만 한다. process.exit을 여기 두면 try에서 올라오던 예외를 삼켜,
  //   아무것도 검증 못 한 실행이 exit 0으로 "정상"이라 보고된다.
  await guard.cleanup();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: 0042 적용 전이므로 실패하는지 확인**

```bash
node scripts/challenge-room-check.mjs
```

기대: `[1] 생성 성공` FAIL — `create_challenge_room` 함수가 아직 없어 404가 난다. 그 뒤로 연쇄 실패한다.

이 실패가 확인되면 스크립트가 실제로 새 동작을 보고 있다는 뜻이다.

- [ ] **Step 3: 문법·정리 확인**

```bash
node --check scripts/challenge-room-check.mjs
```

기대: 출력 없음

가드가 이 실행이 만든 계정 4개를 정리했다는 로그(`🛡 삭제 가드: 이번 실행이 만든 4개를 정리했습니다`)가 보여야 한다.

- [ ] **Step 4: 커밋**

```bash
git add scripts/challenge-room-check.mjs
git commit -m "test: 챌린지 방 0042 검증 스크립트 (적용 전이라 실패 상태)"
```

---

## Task 7: 0042 적용 및 검증

**이 태스크는 사용자가 수행한다.** 에이전트는 SQL을 실행할 수 없다.

- [ ] **Step 1: 적용 전 현황 기록**

SQL Editor에서 실행해 값을 적어 둔다. 백필이 몇 행을 만들어야 하는지 계산하는 데 쓴다.

```sql
select count(*) as challenges from public.challenges;
select count(*) as expected_participants
from public.challenges ch
join public.group_members gm on gm.group_id = ch.group_id;
```

- [ ] **Step 2: 적용**

`supabase/migrations/0042_challenge_participants.sql` **전체**를 SQL Editor에 붙여넣고 Run.

**부분 선택 실행 금지.** 파일이 `begin;`~`commit;`으로 감싸여 있어 조각을 실행하면 커밋되지 않거나 `commit;`에서 에러가 난다.

- [ ] **Step 3: 적용 확인**

```sql
select count(*) from public.challenge_participants;
```

기대: Step 1의 `expected_participants`와 같거나 그보다 작다 (방장이 그룹을 나간 챌린지가 있으면 방장 몫이 더해져 클 수도 있다).

```sql
select role, status, count(*) from public.challenge_participants group by 1, 2;
```

기대: 전부 `joined`. `host`는 챌린지 수와 같아야 한다.

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conname = 'notifications_type_check';
```

기대: **16종.** `challenge_invite`가 있고 기존 15종이 전부 살아 있어야 한다. 하나라도 빠지면 그 유형의 알림이 조용히 죽는다.

- [ ] **Step 4: 백필 재실행 안전성 확인 ([32])**

검증 스크립트가 자동화하지 않은 항목이다. 0042의 6절 `insert` 두 개를 **그대로 다시 실행**한다.

```sql
-- 6.1과 6.2를 다시 실행한 뒤
select role, status, count(*) from public.challenge_participants group by 1, 2;
```

기대: **Step 3과 완전히 같다.** 행이 늘거나 `dropped`가 `joined`로 바뀌면 `on conflict do nothing`이 아니라 `do update`가 들어간 것이므로 Task 5로 돌아간다.

- [ ] **Step 5: 검증 스크립트 실행**

```bash
node scripts/challenge-room-check.mjs
```

기대: `0 failed` (`[32]`는 위 Step 4의 수동 절차)

- [ ] **Step 6: 기존 회귀 확인 — 여기가 이 단계의 핵심 게이트**

**0042는 앱 동작을 하나도 바꾸지 않아야 한다.**

```bash
node scripts/rls-test.mjs
```

기대: **응원 7건 전부 ✅, 그리고 기존 실패 6건 그대로.** `0 failed`가 아니다 — 2026-07-29 실측이 `103 통과 / 6 실패`이고, 그 6건은 0025·0028을 스크립트가 따라가지 못한 **기존** 실패다 (찌르기 3건 `poke_requires_workout`, 챌린지 3건 `consent_incomplete`).

**실패가 6건을 넘으면 0042가 뭔가를 망가뜨린 것이므로 멈추고 원인을 찾는다.**

```bash
node scripts/challenge-consent-test.mjs
```

기대: `20 통과 / 0 실패`. 기존 챌린지 흐름이 그대로 도는지 보는 것이다.

```bash
node scripts/challenge-peek-check.mjs
```

기대: `0 failed`

⚠ 스크립트를 연달아 돌리면 익명 가입 rate limit(429)에 걸린다. 사이에 1~2분 둔다.

- [ ] **Step 7: 빌드**

```bash
npm run build
```

기대: 성공

---

## Task 8: 실기기 확인 게이트 🚦

**사용자가 폰에서 직접 확인한다. 이 확인 전에는 `main`에 머지하지 않는다.**

0042의 성공 기준은 "새 기능이 보인다"가 아니라 **"버그 수정 두 건만 달라졌다"** 다.

- [ ] **Step 1: 달라져야 하는 것 — Task 2B·2C 확인**

**A. `weight_days`가 종목 수로 센다 (Task 2B)**

챌린지 탭에서 목표 라벨이 `웨이트 운동일(하루 N종목+)`으로 보인다 (`부위+`가 아니다).

그리고 **하체만 여러 종목 한 날이 운동일로 인정된다.** 2026-07-30 실측으로 확인한 값이다 — 스칼레또님의
7/28(5종목·하체3+팔1+등1)이 `weight_days` qualifier=4를 만족해 **0일 → 1일(0% → 5%)** 로 올라간다.
스칼레또님 화면에서 웨이트 운동일 진행률이 0%가 아니게 되는 것이 이 수정의 유일한 눈에 보이는 결과다.

**B. 타바타가 맨몸 시간에 잡힌다 (Task 2C) — 현재 데이터로는 확인 불가**

2026-07-30 실측 결과 **이 수정은 지금 화면에서 드러나지 않는다.** 확인을 시도하지 말 것.

- `bodyweight_time` 목표를 가진 참가자(낭만송곳니님, 56.6분)는 **기간 내 운동 기록이 아예 없다** — 유일한 세션이 7/26 KST로 챌린지 시작(7/27) 하루 전이다
- 타바타를 하는 참가자(오뎅끼데스까님)의 목표는 `cardio_time`·`tabata_count`·`weight_days`로 `bodyweight_time`이 없다

즉 **"타바타를 한 사람 ∩ bodyweight_time 목표를 가진 사람"이 현재 0명**이다. 수정 자체는 단위 테스트 5건으로
고정돼 있으니(`challenge.test.ts`의 "타바타 분수가 맨몸 시간에 들어간다"), 앞으로 그 조합이 생기면 자동으로 맞게 나온다.

⚠ A·B 둘 다 **기간 내(7/27 이후) 기록만** 반영된다. 7/26 이전 세션은 챌린지 시작 전이라 잡히지 않는다.
오뎅끼데스까님의 웨이트 5종목·유산소 36분 세션이 7/26 KST라 `weight_days`·`cardio_time`이 계속 0인 것은
버그가 아니라 기간 문제다.

- [ ] **Step 2: 달라지지 않아야 하는 것**

1. 챌린지 탭이 **지금과 똑같이** 보인다 (진행 중 챌린지 하나, 목록 아님)
2. 홈 화면이 **지금과 똑같다** (성과 카드·꾸준왕 카드)
3. 운동을 시작·완료할 수 있고 XP·포인트가 정상 지급된다
4. 피드에 크루 운동이 보이고 **응원이 정상 동작한다** (0041 회귀)
5. 알림이 정상 도착한다 (운동 시작·응원)
6. 크루 화면이 정상이다

**Step 2의 6개 중 하나라도 달라 보이면 0042가 잘못 만들어진 것이다.** Task 2B·2C 외에는 추가만 하는 단계이므로 그 밖의 화면 변화는 그 자체로 결함이다.

- [ ] **Step 3: 사용자 확인 대기**

Step 1의 두 건이 **달라졌고**, Step 2의 여섯 건이 **그대로**인 것이 모두 확인될 때까지 진행하지 않는다.

- [ ] **Step 4: main 머지**

```bash
git checkout main
git merge --no-ff feat/challenge-rooms-0042
git push
```

- [ ] **Step 5: 다음 단계 계획서 작성**

0043(전환) 계획서를 쓴다. 0042를 실기기로 확인한 뒤에 써야 나중에 안 고친다.

---

## 자체 점검 결과

**스펙 커버리지 (0042 범위만)**

| 설계서 | 태스크 |
|---|---|
| §3.1 `challenge_participants` 테이블 | Task 3 |
| §3.1 RLS (`revoke all` + `grant select`) | Task 3 |
| §4.2 `dropped` 상태 | Task 3 (스키마) · Task 4 (`autostart`) · Task 6 [24] |
| §3.4 `create_challenge_with_goals` | Task 4 — **이름을 `create_challenge_room`으로 바꿨다** (아래 참조) |
| §3.4 `invite_to_challenge` | Task 4 · Task 6 [4][7][8][9][28] |
| §3.4 `accept_challenge_invite` + 완전 연결 | Task 4 · Task 6 [10]~[15] |
| §3.4 `decline_challenge_invite` | Task 4 · Task 6 [16][17] |
| §3.4 `autostart_due_challenges` | Task 4 · Task 6 [22]~[27] |
| §3.4 `autofinalize_due_challenges` | Task 4 · Task 6 [29][30] |
| §4.1 자동 시작 (정각 아님) | Task 4 주석 — 크론 연결은 0043 |
| §5.3 목표 하한선 | Task 2 |
| §6.2 대표 챌린지 선택 | Task 1 |
| §7 0042 백필 (행 단위·host 우선) | Task 5 · Task 7 Step 4 |
| §8 검증 | Task 6 · Task 7 |
| `challenge_invite` 알림 유형 | Task 3 · Task 6 [6] |
| §5.2 `*_days` 부위조건 → 종목조건 (실측 버그) | Task 2B |
| 타바타 분수 → `bodyweight_time` (실측 버그) | Task 2C |

**설계서와 의도적으로 다르게 한 것 두 가지**

1. **`create_challenge_with_goals` → `create_challenge_room`.** 설계서는 "챌린지 생성 + 방장 KPI 저장"을 한 RPC로 묶었는데, KPI 저장은 기존 `saveMyGoals`(RLS로 `setup`에서만 허용)가 이미 하고 있고 0042는 기존 경로를 건드리지 않는 단계다. 목표까지 넣으면 `user_goals` 쓰기 경로가 둘이 되어 0043에서 어느 쪽을 남길지 다시 정해야 한다. 생성만 하고 KPI는 기존 경로에 맡긴다.

2. **§5.2 동일 KPI 중복 금지 — 만들 것이 없다.** `user_goals`에 `unique (user_id, challenge_id, goal_type)`가 `0006:41`부터 있다. 설계서가 "서버 쪽이 없다"고 본 것은 `saveMyGoals`의 delete-then-insert 때문인데, 제약 자체는 존재한다. 0043에서 화면 문구만 정리한다.

**0042 범위 밖으로 미룬 설계 항목** — §7의 0043·0044 목록과 같다. 이 계획서 앞부분의 표를 참조.

**플레이스홀더 스캔** — 없음. 모든 SQL·TS·검증 코드가 전문으로 들어 있다.

**타입 일관성**

- `ChallengeLike { id, status, startDate, endDate, createdAt }` — Task 1 정의, Task 1 테스트에서만 사용 (0043이 화면에서 쓴다)
- `pickPrimaryChallenge<T extends ChallengeLike>(list: T[]): T | null` — Task 1
- `goalFloor(type: GoalType, baselineActual: number, periodDays: number): number` — Task 2. `GoalType`은 `./goal-score`에서 가져온다(신규 정의 아님)
- `FLOOR_BASELINE_DAYS = 28` — Task 2 정의, Task 2 테스트에서 검증
- RPC 반환 모양 — `create_challenge_room`은 `public.challenges` 행, 나머지는 `jsonb`. Task 6이 그 모양대로 읽는다 (`r.json?.id` vs `r.json?.status`)
