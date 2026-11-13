# '내 성장' v2.1 — 레벨 진입 기준선 대비 성장률 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** '내 성장'을 "처음 3번 vs 최근 3번(전 기간)"에서 "**현재 레벨에 진입하기 직전 60일의 기준선** vs **현재 레벨에서의 기록**"으로 바꾸고, 인터벌 라운드 수·유산소 시간이 성장률에 섞이지 않게 한다.

**Architecture:** 산식은 순수 TS 모듈 하나(`src/lib/domain/level-growth.ts`)에만 둔다. DB에는 ① 레벨 진입 이력(`user_level_history`, `user_progress` 트리거가 기록 — `apply_xp_and_progress`는 건드리지 않는다) ② 기준선 스냅샷(`level_growth_baselines`, 클라이언트가 계산한 값을 `freeze_level_baselines` RPC가 한 번만 받아 고정)을 추가한다. 화면은 `NEXT_PUBLIC_GROWTH_V2=1`일 때만 새 카드를 그리고, 끄면 기존 화면 그대로다.

**Tech Stack:** Next.js(App Router) · TypeScript · Supabase(Postgres 17, RLS, plpgsql) · Vitest · pnpm

**작성일:** 2026-11-13 · **기준 커밋:** `main` `ae4ac8b` · **지시서:** 'GND 내 성장 로직 v2.1 구현 작업지시서'

---

## 0. 현황 검토 결과 (2026-11-13 실측, 운영 DB 읽기 전용)

### 0.1 코드 위치

⚠️ 지시서가 지목한 파일은 **`main`에만 있다.** `C:\Users\SAMSUNG\workout-app`의 현재 브랜치 `feat/posthog-funnel`에는 `evolution*.ts`가 하나도 없다. **반드시 `main`에서 새 브랜치를 딴다** (Task 0).

| 파일 | 지금 하는 일 |
|---|---|
| `src/lib/domain/evolution-growth.ts` | `computeGrowth()` — 종목별 **전 기간** 첫 3일 vs 최근 3일 중앙값, 6일 이상이어야 측정, ±30% 캡 후 중앙값 |
| `src/lib/evolution.ts` | `getMyEvolutionStatus()` — 본인 완료 세션 전량(limit 2000)을 읽어 위 함수에 넘긴다 |
| `src/lib/domain/evolution.ts` | `evaluateEvolution()` — XP·운동일·경과 주·성장률·최근 활동을 "다음 진화 조건"으로 **표시만** 한다 |
| `src/lib/domain/evolution-guidance.ts` | 성장률 부족분을 "다음엔 64kg 8번" 지침으로 |
| `src/components/profile/evolution-status-card.tsx` | 진화 현황 카드. ③ '내 성장 · 얼마나 세졌나' |
| `src/lib/domain/tabata.ts` | `isIntervalBlockIndex()` — **인터벌 블록 판정이 이미 있다.** 기록 비교·AI 코치는 쓰는데 성장률만 안 쓴다 |

### 0.2 지시서와 현행의 차이

| # | 지시서 요구 | 현행 | 판정 |
|---|---|---|---|
| 1 | 레벨 진입 시점 기준선 | 전 기간 첫 3일이 영구 기준 | **신규 개발** |
| 2 | 인터벌 블록 `reps` 제외 | `tabata_minutes`·`sort_order`를 조회조차 안 한다 → 라운드 수(2·4회)가 맨몸 반복으로 집계 | **버그.** `isIntervalBlockIndex` 재사용으로 해결 |
| 3 | 유산소 시간은 성장으로 보지 않음 | `exercise_type`을 안 읽어 **트레드밀 시간이 '시간 유지' 종목으로 집계**된다 | **버그** (지시서에 없던 발견) |
| 4 | 레벨 진입 이력 | 테이블 없음. `user_progress.last_level_up_at` 하나뿐 | **신규 테이블** |
| 5 | 성장률은 진화 조건 아님 | 서버(`apply_xp_and_progress`)는 XP만 본다. 그런데 카드는 "아래 3가지를 **모두 채우면 진화**"라고 쓴다 | **문구가 실제 규칙과 다르다.** 분리 필요 |
| 6 | 무게 0 중량 종목 | 밴드 종목이 `weight_kg=0, reps=4`로 저장된다(인터벌 블록) — 현행은 맨몸 반복으로 집계 | 블록 제외 + 무게 0 중량 종목 제외 |

### 0.3 XP 원장으로 레벨 이력을 복원할 수 있는가 — **가능**

- `user_progress` 7명 **전원** `sum(xp_transactions.amount) = total_xp`, 원장으로 다시 계산한 레벨 = `current_level`.
- 원장 구성: `earn/workout` 251건 · `admin_adjustment/xp_bonus_backfill` 7건(전부 양수 10~20) · `earn/demo_video` 1건(1,840 XP, 한 번에 여러 레벨 통과).
- `created_at` 순 누적으로 복원한 오뎅끼데스까 Lv.19 진입 = `2026-11-09 08:22:08 KST` = `user_progress.last_level_up_at`과 **마이크로초까지 일치.** Lv.18 = `2026-10-29 07:14:25 KST`. 지시서 §12의 날짜와 같다.
- 한 거래가 여러 레벨을 넘는 경우(데모 1,840 XP)가 실제로 있다 → 통과한 레벨마다 같은 `entered_at`으로 한 행씩 만든다.

### 0.4 경계 규칙 — 레벨업을 일으킨 세션은 **기준선**이다

`daily_workout` 거래 152건 중 151건이 `workout_sessions.completed_at = xp_transactions.created_at`(같은 트랜잭션의 `now()`)이고, 세션이 거래보다 늦은 경우는 0건이다. 따라서:

- `completed_at <= entered_at` → **기준선** (그 운동은 이전 레벨에서 한 것이다)
- `completed_at > entered_at` → **현재 레벨 기록**

⚠️ 지시서 §12는 "Lv.19 일반 운동 3회"라고 했지만, 이 규칙으로는 **11/13 하루뿐**이다(11/9는 레벨업을 일으킨 세션 = 기준선, 11/10~12는 인터벌).

### 0.5 ⚠️ 가장 중요한 발견 — "확정 성장률"은 실데이터에서 거의 나오지 않는다

지시서 산식(기준선 3일 + **현재 레벨에서 같은 종목 3일**)을 실사용자 5명의 과거 레벨 구간 54개에 그대로 돌렸다.

| 사용자 | 레벨 구간 | 확정 종목이 1개라도 나온 구간 | 종합 확정(2종목 이상) |
|---|---:|---:|---:|
| 오뎅끼데스까 | 18 | 1 (Lv.16, 1종목) | **0** |
| 스칼레또 | 10 | 2 | 1 (Lv.11) |
| 헬스장주주 | 9 | 0 | 0 |
| 낭만송곳니 | 8 | 0 | 0 |
| 근육은퇴근중 | 10 | 0 | 0 |

원인: 레벨 하나가 7~12일인데(Lv.19→20은 800 XP) 같은 종목은 주 1회꼴이라, 한 레벨 안에서 같은 종목을 3일 하는 일이 거의 없다. 오뎅끼데스까는 지금 9,000 XP라 **200 XP(운동 2번) 뒤 Lv.20**이 되어 Lv.19 기록은 1일로 끝난다.

**지시서대로만 만들면 카드는 거의 항상 '측정 준비 중'이다.** 이 계획은 지시서의 확정 기준(3일·2종목)을 상수로 그대로 구현하되, 확정이 없을 때 **잠정 수치를 '참고' 표시로 카드에 보여 준다**(지시서 §5.2 "참고용 수치를 별도 표시할 수 있다"). 임계값을 낮출지는 사용자 결정 사항이라 상수(`CONFIRM_DAYS`)만 바꾸면 되게 해 둔다.

### 0.6 오뎅끼데스까 Lv.19 예상 결과 (손계산, Task 10에서 코드로 재현)

기준선 창 = 2026-09-10 08:22 ~ 11-09 08:22 KST. 반복 1~30회 세트만 추정 1RM에 쓴다.

| 종목 | 기준선 3일 (하루 최고 e1RM) | 기준 | 현재(11/13) | 성장률 | 상태 |
|---|---|---:|---:|---:|---|
| 덤벨 숄더 프레스 | 10/16 23.33 · 10/24 23.33 · 11/7 21.87 | 23.33 | 25.07 (16kg×17) | **+7.4%** | 잠정 1일 |
| 덤벨 레터럴 레이즈 | 10/16 12.00 · 10/24 13.33 · 11/7 13.33 | 13.33 | 13.87 (8kg×22) | **+4.0%** | 잠정 1일 |
| 아이소 레터럴 인클라인 프레스 머신 | 10/9 57.33 · 10/16 50.67 · 11/7 52.00 | 52.00 | 52.00 (40kg×9) | **0.0%** | 잠정 1일 |
| 케이블 푸시다운 | 10/16 · 10/24 (2일뿐) | — | 71.67 | — | 기준선 미확보 |
| 덤벨 벤치프레스 | 없음 | — | 16.80 | — | 신규 종목 · 비교 불가 |

→ 확정 0종목 = **'측정 준비 중'**, 참고(잠정) 중앙값 **+4.0%**. 기존 화면의 +2.5%는 전 기간 비교에 인터벌 라운드 수(마운틴 클라이머 2→4회 등)와 트레드밀 시간이 섞인 값이다.

지시서 §5.1 예시(+14.6% / +4.0% / 0.0%)는 직전 **하루**(11/7)와 비교한 값이라 숄더 프레스만 다르다(21.87→25.07 = +14.6%). 3일 중앙값 기준으로는 +7.4%다.

### 0.7 이 계획이 지시서와 다르게 정한 것 (전부 상수·문구라 되돌리기 쉽다)

| 항목 | 결정 | 이유 |
|---|---|---|
| 기준선 계산 위치 | 클라이언트 TS가 계산 → RPC가 1회 고정 | 산식을 SQL에 또 쓰면 "같은 사실이 두 곳"이 된다. 성장률은 아무것도 해금하지 않으므로(§8) 위조 유인이 없다. **나중에 진화 조건으로 쓰게 되면 서버 계산으로 옮겨야 한다** |
| 기준선 고정 시점 | 레벨업 순간이 아니라 **그 레벨에서 카드를 처음 볼 때** | `entered_at` 이전 기록만 쓰므로 결과는 같다. 레벨업 트랜잭션(운동 완료)에 무거운 계산을 넣지 않는다 |
| "직전 레벨 우선, 모자라면 더 오래된 기록" | "진입 전 60일 안의 **최근 3개 운동일**" 하나로 구현 | 직전 레벨 기록이 곧 가장 최근 기록이라 결과가 같다. 문구는 항상 'Lv.N 진입 전 기준 기록' |
| 추정 1RM 유효 반복 | 1~30회 | 자기 자신과의 비교라 고반복 오차가 양쪽에 같이 들어간다. 31회 이상(밴드 5kg×45 등)은 제외 |
| 과거 레벨의 기준선 | 이력(`user_level_history`)만 전 레벨 복원, 기준선은 **현재 레벨부터** 쌓는다 | 과거 레벨 기준선은 화면에서 쓰지 않는다 (YAGNI) |
| 인터벌·유산소 별도 성과(§3.4) | **이번 범위에서 제외** | 근력·맨몸 성장률에서 빼는 것까지만. 별도 성과 화면은 별개 기획이다 |

---

## File Structure

| 파일 | 책임 |
|---|---|
| Create `src/lib/domain/level-growth.ts` | 순수 산식: 세션 → 지표 점, 기준선, 레벨 성장률, 종합 |
| Create `src/lib/domain/level-growth.test.ts` | 지시서 §10 계산·필터 테스트 |
| Create `src/lib/domain/level-growth-copy.ts` | 표시 문구(성장률 서식·종목 한 줄 안내·세트 표기) |
| Create `src/lib/domain/level-growth-copy.test.ts` | 문구 테스트 |
| Create `src/lib/level-growth.ts` | Supabase 조회 + 기준선 고정 RPC 호출 |
| Create `src/lib/level-growth.test.ts` | 본인 필터·고정 1회·이력 없음 처리 |
| Create `src/lib/flags.ts` | `GROWTH_V2` 플래그 |
| Create `src/components/profile/level-growth-card.tsx` | '내 성장 · Lv.N' 카드 + 종목별 상세 |
| Create `src/components/profile/level-growth-card.test.tsx` | 카드 렌더 테스트 |
| Modify `src/lib/domain/evolution.ts` | `includeGrowth: false`면 성장 조건·대체 경로를 빼낸다 |
| Modify `src/lib/evolution.ts` | 플래그가 켜지면 `includeGrowth: false` |
| Modify `src/components/profile/evolution-status-card.tsx` | 플래그가 켜지면 "모두 채우면 진화" 문구를 XP 기준으로 |
| Modify `src/components/profile/growth-hub.tsx` | 진화 카드 아래에 새 카드 |
| Create `supabase/migrations/0131_level_history_and_growth_baselines.sql` | 테이블 2개 · RLS · 트리거 · RPC (지금 돌려도 안전) |
| Create `supabase/migrations/0132_backfill_level_history.sql` | 원장으로 과거 레벨 진입 이력 복원 (새 테이블에 insert만) |
| Create `scripts/level-history-parity-check.mjs` | 이력 ↔ 원장 ↔ `user_progress` 전원 대조 (readonly) |
| Create `src/lib/domain/level-growth.live.test.ts` | §12 검증: 닉네임 하나의 기존/신규 비교표 출력 (환경변수 없으면 skip) |

기존 `evolution-growth.ts`·`evolution-guidance.ts`는 **지우지 않는다.** 플래그를 끄면 그대로 쓰인다(롤백 경로).

---

### Task 0: 작업 브랜치

**Files:** 없음

- [ ] **Step 1: `main`에서 워크트리를 딴다**

```bash
cd /c/Users/SAMSUNG/workout-app
git fetch origin --prune
git rev-list --left-right --count origin/main...main
git worktree add .worktrees/level-growth-v2 -b feat/level-growth-v2 main
cp .env.local .worktrees/level-growth-v2/
cd .worktrees/level-growth-v2 && pnpm install
```

Expected: `rev-list`가 `0 0`. 이후 모든 명령은 `.worktrees/level-growth-v2`에서 실행한다.

- [ ] **Step 2: 대상 파일이 있는지 확인**

Run: `ls src/lib/domain/evolution-growth.ts src/lib/domain/tabata.ts supabase/migrations | tail -3`
Expected: 두 파일이 있고 마지막 마이그레이션이 `0130_nov_challenge_cycle_goal.sql`. **0131 이상이 이미 있으면 이 계획의 0131·0132를 다음 빈 번호로 바꾼다.**

- [ ] **Step 3: 기준선 테스트 통과 확인**

Run: `pnpm test src/lib/domain/evolution.test.ts src/lib/domain/tabata.test.ts`
Expected: PASS

---

### Task 1: 세션 → 지표 점 (인터벌·유산소·미완료 필터)

**Files:**
- Create: `src/lib/domain/level-growth.ts`
- Test: `src/lib/domain/level-growth.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/level-growth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toMetricPoints, type RawSession, type RawSet } from "./level-growth";

/** 그 날 09:00 KST에 끝난 세션 */
export function sess(
  day: string,
  exercises: {
    name: string;
    type?: string | null;
    sets: Partial<RawSet>[];
    order?: number | null;
  }[],
  tabataMinutes: number | null = null,
): RawSession {
  return {
    completed_at: `${day}T00:00:00.000Z`,
    tabata_minutes: tabataMinutes,
    workout_exercises: exercises.map((e, i) => ({
      exercise_name: e.name,
      exercise_type: e.type === undefined ? "weight" : e.type,
      sort_order: e.order === undefined ? i : e.order,
      workout_sets: e.sets.map((s) => ({
        weight_kg: null,
        reps: null,
        duration_seconds: null,
        is_completed: true,
        ...s,
      })),
    })),
  };
}

describe("toMetricPoints — 무엇을 성장 지표로 치는가", () => {
  it("중량 종목은 하루 최고 추정 1RM = 무게 × (1 + 반복/30)", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "벤치", sets: [{ weight_kg: 60, reps: 6 }, { weight_kg: 60, reps: 9 }] }]),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ exerciseKey: "벤치", kind: "w", day: "2026-11-01" });
    expect(p[0].value).toBeCloseTo(60 * (1 + 9 / 30), 6);
    expect(p[0].best).toEqual({ weight: 60, reps: 9, seconds: null });
  });

  it("인터벌 블록(sort_order 0~3)의 반복은 라운드 수라 버린다", () => {
    const p = toMetricPoints([
      sess(
        "2026-11-01",
        [
          { name: "마운틴 클라이머", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "점핑잭", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "버드독", type: "bodyweight", sets: [{ reps: 4 }] },
        ],
        8,
      ),
    ]);
    expect(p).toEqual([]);
  });

  it("인터벌 뒤에 이어서 한 일반 운동(sort_order 4~)은 넣는다", () => {
    const p = toMetricPoints([
      sess(
        "2026-11-01",
        [
          { name: "a", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "b", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "c", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "d", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "풀업", type: "bodyweight", sets: [{ reps: 5 }, { reps: 4 }] },
        ],
        8,
      ),
    ]);
    expect(p.map((x) => x.exerciseKey)).toEqual(["풀업"]);
    expect(p[0]).toMatchObject({ kind: "r", value: 5 });
  });

  it("인터벌 세션에서 자리(sort_order)를 모르면 블록으로 보고 뺀다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "푸시업", type: "bodyweight", sets: [{ reps: 30 }], order: null }], 4),
    ]);
    expect(p).toEqual([]);
  });

  it("유산소(트레드밀)는 시간이 길어도 지표가 아니다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "트레드밀", type: "cardio", sets: [{ duration_seconds: 2040 }] }]),
    ]);
    expect(p).toEqual([]);
  });

  it("시간 유지 운동(플랭크)은 하루 최장 시간", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [
        { name: "플랭크", type: "bodyweight", sets: [{ duration_seconds: 60 }, { duration_seconds: 75 }] },
      ]),
    ]);
    expect(p[0]).toMatchObject({ kind: "t", value: 75 });
  });

  it("미완료 세트는 뺀다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "벤치", sets: [{ weight_kg: 100, reps: 5, is_completed: false }] }]),
    ]);
    expect(p).toEqual([]);
  });

  it("추정 1RM은 반복 1~30회 세트만 쓴다 (31회 이상은 제외)", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "밴드 레터럴", sets: [{ weight_kg: 5, reps: 45 }, { weight_kg: 5, reps: 30 }] }]),
    ]);
    expect(p[0].best).toEqual({ weight: 5, reps: 30, seconds: null });
  });

  it("무게 0으로 적힌 중량 종목(밴드)은 맨몸 반복으로 치지 않는다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "밴드 스쿼트", type: "weight", sets: [{ weight_kg: 0, reps: 25 }] }]),
    ]);
    expect(p).toEqual([]);
  });

  it("이름 앞뒤 공백만 다른 종목은 같고, 다른 이름은 합치지 않는다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [
        { name: " 벤치 ", sets: [{ weight_kg: 60, reps: 5 }] },
        { name: "인클라인 벤치", sets: [{ weight_kg: 40, reps: 5 }] },
      ]),
    ]);
    expect(p.map((x) => x.exerciseKey)).toEqual(["벤치", "인클라인 벤치"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/domain/level-growth.test.ts`
Expected: FAIL — `Cannot find module './level-growth'` 류

- [ ] **Step 3: 구현**

`src/lib/domain/level-growth.ts`:

```ts
/**
 * '내 성장' v2.1 — 레벨 진입 기준선 대비 성장률 (순수 계산 · 읽기 전용).
 *
 * 원칙: **현재 레벨에 들어오기 직전의 나**와 비교한다.
 *   기준선 = 레벨 진입 전 60일 안, 같은 종목 최근 3개 운동일의 중앙값 (진입 후 고정)
 *   현재   = 현재 레벨에서 같은 종목 최근 3개 운동일의 중앙값
 *   성장률 = (현재 - 기준선) / 기준선 × 100
 *
 * 지표(종목마다 하나):
 *   w 중량+반복 → 추정 1RM = 무게 × (1 + 반복/30), 반복 1~30회 세트만
 *   r 맨몸 반복 → 하루 최대 반복 수
 *   t 시간 유지 → 하루 최장 시간(초)
 *
 * 넣지 않는 것 (0%가 아니라 "비교 불가"다):
 *   - 인터벌 블록(인터벌 세션의 sort_order 0~3). 그 `reps`는 라운드 수다 (tabata.ts)
 *   - 유산소(exercise_type = cardio). 오래 뛴 것이 세진 것은 아니다
 *   - 미완료 세트, 무게 0으로 적힌 중량 종목
 *
 * ⚠️ 이 값은 **아무것도 해금하지 않는다.** 진화는 서버가 XP로만 판정한다.
 *    성장률을 진화 조건으로 쓰게 되면 기준선 계산을 서버로 옮겨야 한다
 *    (지금은 클라이언트가 계산한 값을 freeze_level_baselines RPC가 받아 고정한다).
 */
import { isIntervalBlockIndex } from "./tabata";
import { DEFAULT_TIMEZONE, dayKey } from "./time";

/** 산식을 바꾸면 올린다 — 기준선 행의 고유키에 들어간다 */
export const METRIC_VERSION = "growth_v2.1";
export const BASELINE_WINDOW_DAYS = 60;
/** 기준선·현재값에 쓰는 운동일 수 */
export const SAMPLE_DAYS = 3;
/** 현재 레벨에서 이만큼 기록해야 확정 */
export const CONFIRM_DAYS = 3;
/** 종합 성장률을 확정하려면 확정 종목이 최소 이만큼 */
export const MIN_CONFIRMED_EXERCISES = 2;
/** 종합(중앙값)에 넣을 때만 적용하는 상·하한. 상세에는 실제 값을 보여 준다 */
export const GROWTH_CAP_PCT = 30;
export const E1RM_MIN_REPS = 1;
export const E1RM_MAX_REPS = 30;

const DAY_MS = 86_400_000;

export type MetricKind = "w" | "r" | "t";

export type RawSet = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  is_completed: boolean | null;
};
export type RawExercise = {
  exercise_name: string;
  exercise_type: string | null;
  sort_order: number | null;
  workout_sets: RawSet[] | null;
};
export type RawSession = {
  completed_at: string;
  tabata_minutes: number | null;
  workout_exercises: RawExercise[] | null;
};

export type BestSet = { weight: number | null; reps: number | null; seconds: number | null };
/** 하루의 대표 수행능력 */
export type DaySample = { day: string; value: number; best: BestSet };
/** 세션 하나에서 종목 하나가 낸 지표 */
export type MetricPoint = DaySample & {
  exerciseKey: string;
  kind: MetricKind;
  completedAtMs: number;
};

/** 한 종목에 지표가 둘 이상 잡히면 이 순서로 하나만 쓴다 */
const KIND_PRIORITY: MetricKind[] = ["w", "r", "t"];

function setMetric(
  s: RawSet,
  exerciseType: string | null,
): { kind: MetricKind; value: number; best: BestSet } | null {
  if (s.is_completed === false) return null;
  if (exerciseType === "cardio") return null;
  const w = Number(s.weight_kg ?? 0);
  const r = s.reps ?? 0;
  const d = s.duration_seconds ?? 0;
  if (w > 0) {
    if (r < E1RM_MIN_REPS || r > E1RM_MAX_REPS) return null;
    return { kind: "w", value: w * (1 + r / 30), best: { weight: w, reps: r, seconds: null } };
  }
  // 무게 0으로 적힌 중량 종목(밴드 등)은 부하를 몰라 비교할 수 없다
  if (exerciseType === "weight") return null;
  if (r > 0) return { kind: "r", value: r, best: { weight: null, reps: r, seconds: null } };
  if (d > 0) return { kind: "t", value: d, best: { weight: null, reps: null, seconds: d } };
  return null;
}

export function toMetricPoints(
  sessions: readonly RawSession[],
  timeZone: string = DEFAULT_TIMEZONE,
): MetricPoint[] {
  const points: MetricPoint[] = [];
  for (const s of sessions) {
    const at = Date.parse(s.completed_at);
    if (!Number.isFinite(at)) continue;
    const day = dayKey(new Date(at), timeZone);
    for (const ex of s.workout_exercises ?? []) {
      if (isIntervalBlockIndex(s.tabata_minutes, ex.sort_order)) continue;
      const exerciseKey = ex.exercise_name.trim();
      if (!exerciseKey) continue;
      const bestByKind = new Map<MetricKind, { value: number; best: BestSet }>();
      for (const set of ex.workout_sets ?? []) {
        const m = setMetric(set, ex.exercise_type);
        if (!m) continue;
        const prev = bestByKind.get(m.kind);
        if (!prev || m.value > prev.value) bestByKind.set(m.kind, { value: m.value, best: m.best });
      }
      const kind = KIND_PRIORITY.find((k) => bestByKind.has(k));
      if (!kind) continue;
      const top = bestByKind.get(kind) as { value: number; best: BestSet };
      points.push({ exerciseKey, kind, day, completedAtMs: at, value: top.value, best: top.best });
    }
  }
  return points;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/domain/level-growth.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/level-growth.ts src/lib/domain/level-growth.test.ts
git commit -m "feat(growth): 세션을 성장 지표로 바꾸는 필터 (인터벌 블록·유산소·미완료 제외)"
```

---

### Task 2: 레벨 진입 기준선

**Files:**
- Modify: `src/lib/domain/level-growth.ts` (파일 끝에 추가)
- Test: `src/lib/domain/level-growth.test.ts` (파일 끝에 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`level-growth.test.ts` 맨 위 import를 아래로 바꾸고, 파일 끝에 describe를 추가한다.

```ts
import {
  computeBaselines,
  toMetricPoints,
  type RawSession,
  type RawSet,
} from "./level-growth";
```

```ts
const ENTERED = Date.parse("2026-11-09T00:00:00.000Z");
const bench = (day: string, kg: number, reps = 10) =>
  sess(day, [{ name: "벤치", sets: [{ weight_kg: kg, reps }] }]);
const e1 = (kg: number, reps = 10) => kg * (1 + reps / 30);

describe("computeBaselines — 레벨 진입 전 기준선", () => {
  it("진입 전 최근 3개 운동일의 중앙값이다", () => {
    const b = computeBaselines(
      toMetricPoints([
        bench("2026-10-01", 50),
        bench("2026-10-10", 60),
        bench("2026-10-20", 62),
        bench("2026-11-01", 58),
      ]),
      ENTERED,
    );
    expect(b).toHaveLength(1);
    expect(b[0].samples.map((s) => s.day)).toEqual(["2026-10-10", "2026-10-20", "2026-11-01"]);
    expect(b[0].value).toBeCloseTo(e1(60), 6);
  });

  it("3일 미만이면 기준선을 만들지 않는다", () => {
    const b = computeBaselines(toMetricPoints([bench("2026-10-20", 60), bench("2026-11-01", 60)]), ENTERED);
    expect(b).toEqual([]);
  });

  it("같은 날 두 번 한 것은 1일이고 그날 최고 기록을 쓴다", () => {
    const b = computeBaselines(
      toMetricPoints([
        bench("2026-10-20", 60),
        bench("2026-10-20", 70),
        bench("2026-11-01", 60),
      ]),
      ENTERED,
    );
    expect(b).toEqual([]);
  });

  it("60일보다 오래된 기록은 쓰지 않는다 (창을 늘리지 않는다)", () => {
    const b = computeBaselines(
      toMetricPoints([bench("2026-08-01", 60), bench("2026-10-20", 60), bench("2026-11-01", 60)]),
      ENTERED,
    );
    expect(b).toEqual([]);
  });

  it("레벨업을 일으킨 세션(완료 시각 = 진입 시각)은 기준선에 든다", () => {
    const b = computeBaselines(
      toMetricPoints([bench("2026-10-20", 60), bench("2026-11-01", 60), bench("2026-11-09", 66)]),
      ENTERED,
    );
    expect(b[0].samples.map((s) => s.day)).toContain("2026-11-09");
  });

  it("진입 뒤 기록은 기준선을 바꾸지 않는다", () => {
    const before = [bench("2026-10-10", 60), bench("2026-10-20", 60), bench("2026-11-01", 60)];
    const a = computeBaselines(toMetricPoints(before), ENTERED);
    const b = computeBaselines(toMetricPoints([...before, bench("2026-11-12", 90)]), ENTERED);
    expect(b).toEqual(a);
  });

  it("다음 레벨에 들어가면 그 시점 기준으로 새 기준선이 나온다", () => {
    const all = toMetricPoints([
      bench("2026-10-10", 60),
      bench("2026-10-20", 60),
      bench("2026-11-01", 60),
      bench("2026-11-12", 66),
      bench("2026-11-15", 66),
    ]);
    const next = computeBaselines(all, Date.parse("2026-11-16T00:00:00.000Z"));
    expect(next[0].value).toBeCloseTo(e1(66), 6);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/domain/level-growth.test.ts`
Expected: FAIL — `computeBaselines is not a function`

- [ ] **Step 3: 구현 (level-growth.ts 끝에 추가)**

```ts
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Group = { exerciseKey: string; kind: MetricKind; days: DaySample[] };

/** 종목+지표별로 묶고, 같은 날은 최고 기록 하나로 접어 날짜 오름차순으로 돌려준다 */
function groupByExercise(points: readonly MetricPoint[]): Map<string, Group> {
  const byDay = new Map<string, { exerciseKey: string; kind: MetricKind; days: Map<string, DaySample> }>();
  for (const p of points) {
    const key = `${p.exerciseKey}::${p.kind}`;
    const g = byDay.get(key) ?? { exerciseKey: p.exerciseKey, kind: p.kind, days: new Map() };
    const prev = g.days.get(p.day);
    if (!prev || p.value > prev.value) g.days.set(p.day, { day: p.day, value: p.value, best: p.best });
    byDay.set(key, g);
  }
  const out = new Map<string, Group>();
  for (const [key, g] of byDay) {
    out.set(key, {
      exerciseKey: g.exerciseKey,
      kind: g.kind,
      days: [...g.days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    });
  }
  return out;
}

export type Baseline = {
  exerciseKey: string;
  kind: MetricKind;
  /** 기준 수행능력 — 반올림하지 않은 값 */
  value: number;
  /** 기준으로 쓴 운동일 3개 (날짜 오름차순) */
  samples: DaySample[];
};

export function baselineKey(b: { exerciseKey: string; kind: MetricKind }): string {
  return `${b.exerciseKey}::${b.kind}`;
}

/**
 * 레벨 진입 시점의 기준선. `completedAt <= enteredAt`인 기록만 본다 —
 * 레벨업을 일으킨 운동은 이전 레벨에서 한 것이라 기준선이다.
 */
export function computeBaselines(points: readonly MetricPoint[], enteredAtMs: number): Baseline[] {
  const from = enteredAtMs - BASELINE_WINDOW_DAYS * DAY_MS;
  const inWindow = points.filter((p) => p.completedAtMs <= enteredAtMs && p.completedAtMs > from);
  const out: Baseline[] = [];
  for (const g of groupByExercise(inWindow).values()) {
    if (g.days.length < SAMPLE_DAYS) continue;
    const samples = g.days.slice(-SAMPLE_DAYS);
    out.push({
      exerciseKey: g.exerciseKey,
      kind: g.kind,
      value: median(samples.map((s) => s.value)),
      samples,
    });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/domain/level-growth.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/level-growth.ts src/lib/domain/level-growth.test.ts
git commit -m "feat(growth): 레벨 진입 전 60일·최근 3일 중앙값 기준선"
```

---

### Task 3: 레벨 성장률과 종합

**Files:**
- Modify: `src/lib/domain/level-growth.ts` (끝에 추가)
- Test: `src/lib/domain/level-growth.test.ts` (끝에 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

import에 `computeLevelGrowth`를 추가하고 파일 끝에:

```ts
const squat = (day: string, kg: number) =>
  sess(day, [{ name: "스쿼트", sets: [{ weight_kg: kg, reps: 10 }] }]);
const BEFORE = [
  bench("2026-10-10", 60), bench("2026-10-20", 60), bench("2026-11-01", 60),
  squat("2026-10-11", 100), squat("2026-10-21", 100), squat("2026-11-02", 100),
];
function grow(after: RawSession[]) {
  const points = toMetricPoints([...BEFORE, ...after]);
  return computeLevelGrowth({
    baselines: computeBaselines(points, ENTERED),
    points,
    enteredAtMs: ENTERED,
  });
}
const of = (g: ReturnType<typeof grow>, name: string) =>
  g.exercises.find((e) => e.exerciseKey === name)!;

describe("computeLevelGrowth — 기준선 대비 성장률", () => {
  it("같으면 0%, +10%는 +10%, -10%는 -10%", () => {
    expect(of(grow([bench("2026-11-10", 60)]), "벤치").growthPct).toBeCloseTo(0, 6);
    expect(of(grow([bench("2026-11-10", 66)]), "벤치").growthPct).toBeCloseTo(10, 6);
    expect(of(grow([bench("2026-11-10", 54)]), "벤치").growthPct).toBeCloseTo(-10, 6);
  });

  it("현재 레벨 기록이 없으면 0%가 아니라 null(대기)", () => {
    const e = of(grow([]), "벤치");
    expect(e.status).toBe("waiting");
    expect(e.growthPct).toBeNull();
    expect(e.current).toBeNull();
  });

  it("1~2일은 잠정, 3일부터 확정", () => {
    expect(of(grow([bench("2026-11-10", 66)]), "벤치").status).toBe("provisional");
    expect(of(grow([bench("2026-11-10", 66), bench("2026-11-11", 66)]), "벤치").status).toBe("provisional");
    expect(
      of(grow([bench("2026-11-10", 66), bench("2026-11-11", 66), bench("2026-11-12", 66)]), "벤치").status,
    ).toBe("confirmed");
  });

  it("현재값은 현재 레벨의 최근 3일 중앙값이다", () => {
    const e = of(
      grow([bench("2026-11-10", 50), bench("2026-11-11", 66), bench("2026-11-12", 66), bench("2026-11-13", 72)]),
      "벤치",
    );
    expect(e.currentSamples.map((s) => s.day)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(e.growthPct).toBeCloseTo(10, 6);
    expect(e.currentDayCount).toBe(4);
  });

  it("확정 종목이 2개 미만이면 종합은 null, 잠정 참고값은 따로 준다", () => {
    const g = grow([bench("2026-11-10", 66), squat("2026-11-10", 104)]);
    expect(g.value).toBeNull();
    expect(g.confirmedCount).toBe(0);
    expect(g.provisionalValue).toBeCloseTo(7, 6); // median(+10, +4)
    expect(g.provisionalCount).toBe(2);
  });

  it("확정 2종목 이상이면 종합 = 확정 종목만의 중앙값 (0%·음수도 포함)", () => {
    const three = (f: (d: string) => RawSession) => ["2026-11-10", "2026-11-11", "2026-11-12"].map(f);
    const g = grow([...three((d) => bench(d, 60)), ...three((d) => squat(d, 90))]);
    expect(g.confirmedCount).toBe(2);
    expect(g.value).toBeCloseTo(-5, 6); // median(0, -10)
    expect(g.provisionalValue).toBeNull();
  });

  it("종합에는 ±30% 상한을 걸지만 종목 상세는 실제 값이다", () => {
    const three = (f: (d: string) => RawSession) => ["2026-11-10", "2026-11-11", "2026-11-12"].map(f);
    const g = grow([...three((d) => bench(d, 120)), ...three((d) => squat(d, 200))]);
    expect(of(g, "벤치").growthPct).toBeCloseTo(100, 6);
    expect(g.value).toBeCloseTo(30, 6);
  });

  it("기준선이 없는 종목은 0%가 아니라 비교 불가 목록에 든다", () => {
    const g = grow([sess("2026-11-10", [{ name: "덤벨 벤치프레스", sets: [{ weight_kg: 12, reps: 12 }] }])]);
    expect(g.exercises.find((e) => e.exerciseKey === "덤벨 벤치프레스")).toBeUndefined();
    expect(g.unmatched).toEqual([{ exerciseKey: "덤벨 벤치프레스", kind: "w", currentDayCount: 1 }]);
  });

  it("현재 레벨의 인터벌 블록은 성장률을 만들지 않는다", () => {
    const g = grow([
      sess(
        "2026-11-10",
        [
          { name: "벤치", type: "weight", sets: [{ weight_kg: 0, reps: 4 }] },
          { name: "b", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "c", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "d", type: "bodyweight", sets: [{ reps: 4 }] },
        ],
        8,
      ),
    ]);
    expect(of(g, "벤치").status).toBe("waiting");
    expect(g.unmatched).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/domain/level-growth.test.ts`
Expected: FAIL — `computeLevelGrowth is not a function`

- [ ] **Step 3: 구현 (level-growth.ts 끝에 추가)**

```ts
export type GrowthStatus = "waiting" | "provisional" | "confirmed";

export type ExerciseLevelGrowth = {
  exerciseKey: string;
  kind: MetricKind;
  baseline: number;
  baselineSamples: DaySample[];
  /** 현재 레벨 기록이 없으면 null */
  current: number | null;
  /** 현재값에 쓴 운동일 (최대 3개, 날짜 오름차순) */
  currentSamples: DaySample[];
  /** 현재 레벨에서 이 종목을 기록한 날 수 */
  currentDayCount: number;
  /** 상한 없는 실제 %. 현재 기록이 없으면 null — 0이 아니다 */
  growthPct: number | null;
  status: GrowthStatus;
};

export type LevelGrowthSummary = {
  /** 기준선이 있는 종목 전부 (현재 기록이 없어도 든다) */
  exercises: ExerciseLevelGrowth[];
  confirmedCount: number;
  /** 확정 종목 성장률(±30% 캡)의 중앙값. 확정 종목이 2개 미만이면 null = "측정 준비 중" */
  value: number | null;
  /** 성장률이 나온(1일 이상) 종목 수 — 잠정 포함 */
  provisionalCount: number;
  /** `value`가 없을 때만 주는 참고값. 확정 수치와 섞어 쓰지 않는다 */
  provisionalValue: number | null;
  /** 현재 레벨에서 했지만 기준선이 없어 비교할 수 없는 종목 */
  unmatched: { exerciseKey: string; kind: MetricKind; currentDayCount: number }[];
};

function capped(pct: number): number {
  return Math.max(-GROWTH_CAP_PCT, Math.min(GROWTH_CAP_PCT, pct));
}

export function computeLevelGrowth(input: {
  baselines: readonly Baseline[];
  points: readonly MetricPoint[];
  enteredAtMs: number;
}): LevelGrowthSummary {
  const current = groupByExercise(input.points.filter((p) => p.completedAtMs > input.enteredAtMs));
  const known = new Set(input.baselines.map(baselineKey));

  const exercises: ExerciseLevelGrowth[] = input.baselines.map((b) => {
    const g = current.get(baselineKey(b));
    const dayCount = g?.days.length ?? 0;
    const samples = g ? g.days.slice(-SAMPLE_DAYS) : [];
    const cur = samples.length > 0 ? median(samples.map((s) => s.value)) : null;
    return {
      exerciseKey: b.exerciseKey,
      kind: b.kind,
      baseline: b.value,
      baselineSamples: b.samples,
      current: cur,
      currentSamples: samples,
      currentDayCount: dayCount,
      growthPct: cur !== null && b.value > 0 ? ((cur - b.value) / b.value) * 100 : null,
      status: dayCount >= CONFIRM_DAYS ? "confirmed" : dayCount > 0 ? "provisional" : "waiting",
    };
  });

  const measured = exercises.filter((e) => e.growthPct !== null);
  const confirmed = measured.filter((e) => e.status === "confirmed");
  const value =
    confirmed.length >= MIN_CONFIRMED_EXERCISES
      ? median(confirmed.map((e) => capped(e.growthPct as number)))
      : null;

  return {
    exercises,
    confirmedCount: confirmed.length,
    value,
    provisionalCount: measured.length,
    provisionalValue:
      value === null && measured.length >= MIN_CONFIRMED_EXERCISES
        ? median(measured.map((e) => capped(e.growthPct as number)))
        : null,
    unmatched: [...current.entries()]
      .filter(([key]) => !known.has(key))
      .map(([, g]) => ({ exerciseKey: g.exerciseKey, kind: g.kind, currentDayCount: g.days.length })),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/domain/level-growth.test.ts`
Expected: PASS (26 tests)

- [ ] **Step 5: 가짜 통과가 아닌지 확인** (CLAUDE.md §테스트가 진짜 테스트인지)

`computeLevelGrowth`의 `p.completedAtMs > input.enteredAtMs`를 `>=`로 잠깐 바꾸고 `pnpm test src/lib/domain/level-growth.test.ts`를 돌린다.
Expected: 아무것도 안 깨지면(현재 테스트는 경계 시각을 현재 쪽에서 안 찌른다) 아래 테스트를 `computeLevelGrowth` describe에 추가하고, `>=`에서 FAIL · `>`에서 PASS인지 본 뒤 `>`로 되돌린다.

```ts
  it("진입 시각과 같은 순간에 끝난 세션은 현재 기록이 아니다", () => {
    const g = grow([bench("2026-11-09", 90)]);
    expect(of(g, "벤치").currentDayCount).toBe(0);
  });
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/level-growth.ts src/lib/domain/level-growth.test.ts
git commit -m "feat(growth): 레벨 기준선 대비 성장률 — 잠정/확정, 종합 중앙값, 비교 불가 분리"
```

---

### Task 4: 표시 문구

**Files:**
- Create: `src/lib/domain/level-growth-copy.ts`
- Test: `src/lib/domain/level-growth-copy.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { exerciseLine, fmtGrowthPct, fmtSample, statusLabel } from "./level-growth-copy";
import type { ExerciseLevelGrowth } from "./level-growth";

const base: ExerciseLevelGrowth = {
  exerciseKey: "덤벨 숄더 프레스",
  kind: "w",
  baseline: 20,
  baselineSamples: [],
  current: 20,
  currentSamples: [],
  currentDayCount: 3,
  growthPct: 0,
  status: "confirmed",
};

describe("level-growth-copy", () => {
  it("성장률은 부호와 소수 첫째 자리까지", () => {
    expect(fmtGrowthPct(7.44)).toBe("+7.4%");
    expect(fmtGrowthPct(0)).toBe("0.0%");
    expect(fmtGrowthPct(-10)).toBe("-10.0%");
    expect(fmtGrowthPct(-0.04)).toBe("0.0%");
  });

  it("세트는 사람이 아는 단위로", () => {
    expect(fmtSample("w", { weight: 16, reps: 17, seconds: null })).toBe("16kg × 17회");
    expect(fmtSample("w", { weight: 12.5, reps: 8, seconds: null })).toBe("12.5kg × 8회");
    expect(fmtSample("r", { weight: null, reps: 18, seconds: null })).toBe("18회");
    expect(fmtSample("t", { weight: null, reps: null, seconds: 75 })).toBe("75초");
  });

  it("기록이 모자라면 며칠 더 필요한지 말한다", () => {
    expect(exerciseLine({ ...base, status: "provisional", currentDayCount: 1 })).toBe(
      "2일 더 기록하면 성장률을 확정할 수 있어요.",
    );
    expect(exerciseLine({ ...base, status: "waiting", currentDayCount: 0, growthPct: null, current: null })).toBe(
      "3일 더 기록하면 성장률을 확정할 수 있어요.",
    );
  });

  it("확정이면 같음·향상·하락을 말한다 — 중량을 올리라고 재촉하지 않는다", () => {
    expect(exerciseLine(base)).toBe("이전 레벨과 같은 수준을 유지하고 있어요.");
    expect(exerciseLine({ ...base, growthPct: 5 })).toBe("이전 레벨보다 더 무거운 중량을 들어 올렸어요.");
    expect(exerciseLine({ ...base, kind: "r", growthPct: 5 })).toBe("이전 레벨보다 더 많이 반복했어요.");
    expect(exerciseLine({ ...base, kind: "t", growthPct: 5 })).toBe("이전 레벨보다 더 오래 버텼어요.");
    expect(exerciseLine({ ...base, growthPct: -5 })).toBe(
      "최근 기록이 기준보다 낮아요. 다음 운동에서 다시 비교해 보세요.",
    );
  });

  it("상태 이름", () => {
    expect(statusLabel("confirmed")).toBe("확정");
    expect(statusLabel("provisional")).toBe("잠정");
    expect(statusLabel("waiting")).toBe("기록 대기");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/domain/level-growth-copy.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/domain/level-growth-copy.ts`:

```ts
/**
 * '내 성장' v2.1 표시 문구. 숫자를 올리라고 재촉하는 말은 쓰지 않는다 —
 * 성장률을 높이려고 무리하게 중량을 올리게 만들면 안 된다 (작업지시서 §7.3).
 */
import {
  CONFIRM_DAYS,
  type BestSet,
  type ExerciseLevelGrowth,
  type GrowthStatus,
  type MetricKind,
} from "./level-growth";

/** 화면에서 0.0%로 보이는 범위는 "같다"로 친다 */
const SAME_BAND_PCT = 0.05;

export function fmtGrowthPct(pct: number): string {
  if (Math.abs(pct) < SAME_BAND_PCT) return "0.0%";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function fmtSample(kind: MetricKind, best: BestSet): string {
  if (kind === "w") return `${fmtNum(best.weight ?? 0)}kg × ${best.reps ?? 0}회`;
  if (kind === "r") return `${best.reps ?? 0}회`;
  return `${best.seconds ?? 0}초`;
}

export function statusLabel(status: GrowthStatus): string {
  return status === "confirmed" ? "확정" : status === "provisional" ? "잠정" : "기록 대기";
}

const UP: Record<MetricKind, string> = {
  w: "이전 레벨보다 더 무거운 중량을 들어 올렸어요.",
  r: "이전 레벨보다 더 많이 반복했어요.",
  t: "이전 레벨보다 더 오래 버텼어요.",
};

export function exerciseLine(e: ExerciseLevelGrowth): string {
  if (e.status !== "confirmed" || e.growthPct === null) {
    return `${CONFIRM_DAYS - e.currentDayCount}일 더 기록하면 성장률을 확정할 수 있어요.`;
  }
  if (Math.abs(e.growthPct) < SAME_BAND_PCT) return "이전 레벨과 같은 수준을 유지하고 있어요.";
  if (e.growthPct > 0) return UP[e.kind];
  return "최근 기록이 기준보다 낮아요. 다음 운동에서 다시 비교해 보세요.";
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/domain/level-growth-copy.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/level-growth-copy.ts src/lib/domain/level-growth-copy.test.ts
git commit -m "feat(growth): 레벨 성장 표시 문구"
```

---

### Task 5: DB — 레벨 진입 이력 · 기준선 · 트리거 · RPC (0131)

**Files:**
- Create: `supabase/migrations/0131_level_history_and_growth_baselines.sql`

전부 **새 객체**라 CLAUDE.md 표의 "그냥 실행한다" 쪽이다. 단 트리거가 `user_progress`(운동 완료 트랜잭션)에 걸리므로 **pg_temp 리허설을 먼저 한다.**

- [ ] **Step 1: 사전 조회 — 이름이 비어 있는지, 컬럼이 맞는지**

Supabase MCP `execute_sql` (project `cjdskubyxlnojwzhwbfx`):

```sql
select to_regclass('public.user_level_history') h, to_regclass('public.level_growth_baselines') b,
       (select count(*) from pg_proc where proname in ('record_level_entry','freeze_level_baselines')) fn,
       (select count(*) from information_schema.triggers where event_object_table = 'user_progress') trg,
       (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
         where table_schema='public' and table_name='user_progress') cols;
```

Expected: `h`·`b` null, `fn` 0, `trg` 0, `cols`에 `user_id,total_xp,current_level` 포함. 다르면 멈추고 보고한다.

- [ ] **Step 2: 마이그레이션 파일 작성**

`supabase/migrations/0131_level_history_and_growth_baselines.sql`:

```sql
-- 0131 — '내 성장' v2.1: 레벨 진입 이력 + 레벨별 성장 기준선
--
-- 지금 돌려도 안전하다: 전부 새 객체이고, 운영에 떠 있는 앱은 이것들을 읽지 않는다.
-- apply_xp_and_progress는 고치지 않는다 — 레벨 변화는 user_progress 트리거가 받아 적는다.
--
-- ⚠️ 트리거 본문은 exception으로 감싼다. 이력 기록이 실패해도 운동 완료·XP 지급은
--    절대 롤백되면 안 된다. 실패는 warning으로 남고 scripts/level-history-parity-check.mjs가 잡는다.

create table public.user_level_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level smallint not null check (level between 2 and 35),
  entered_at timestamptz not null,
  entry_xp integer not null,
  source_transaction_id uuid references public.xp_transactions(id) on delete set null,
  history_source text not null check (history_source in ('actual', 'reconstructed')),
  -- 이 레벨의 기준선을 고정한 시각. null이면 아직 아무도 계산하지 않았다
  baseline_frozen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, level)
);

create table public.level_growth_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_level smallint not null check (target_level between 2 and 35),
  exercise_key text not null check (char_length(exercise_key) between 1 and 120),
  metric_type text not null check (metric_type in ('w', 'r', 't')),
  baseline_value numeric not null check (baseline_value > 0),
  sample_count smallint not null check (sample_count = 3),
  -- [{ day, value, best: { weight, reps, seconds } }] — 상세 화면의 "기준으로 쓴 기록 3개"
  samples jsonb not null,
  baseline_window_start timestamptz not null,
  baseline_window_end timestamptz not null,
  level_entered_at timestamptz not null,
  metric_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_level, exercise_key, metric_type, metric_version)
);

alter table public.user_level_history enable row level security;
alter table public.level_growth_baselines enable row level security;

-- 본인 것만 읽는다. insert/update/delete 정책은 만들지 않는다 —
-- 쓰기는 트리거(이력)와 freeze_level_baselines(기준선)만 한다.
create policy user_level_history_own_select on public.user_level_history
  for select using (user_id = auth.uid());
create policy level_growth_baselines_own_select on public.level_growth_baselines
  for select using (user_id = auth.uid());

create or replace function public.record_level_entry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx uuid;
begin
  if new.current_level > old.current_level then
    begin
      select id into v_tx from xp_transactions
      where user_id = new.user_id
      order by created_at desc, id desc limit 1;

      -- 한 번에 여러 레벨을 넘으면 통과한 레벨마다 한 행 (같은 entered_at)
      insert into user_level_history
        (user_id, level, entered_at, entry_xp, source_transaction_id, history_source)
      select new.user_id, g, now(), new.total_xp, v_tx, 'actual'
      from generate_series(old.current_level + 1, new.current_level) g
      on conflict (user_id, level) do nothing;
    exception when others then
      raise warning 'record_level_entry failed for %: %', new.user_id, sqlerrm;
    end;
  end if;
  return new;
end $function$;

create trigger trg_record_level_entry
  after update of current_level on public.user_progress
  for each row execute function public.record_level_entry();

-- 기준선 고정: 레벨마다 한 번만 받는다. 두 번째 호출부터는 0을 돌려주고 아무것도 안 바꾼다.
create or replace function public.freeze_level_baselines(
  p_level integer,
  p_metric_version text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_hist user_level_history;
  v_n integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_hist from user_level_history
  where user_id = v_uid and level = p_level for update;
  if not found then raise exception 'level_entry_not_found'; end if;
  if v_hist.baseline_frozen_at is not null then return 0; end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'invalid_rows';
  end if;

  insert into level_growth_baselines
    (user_id, target_level, exercise_key, metric_type, baseline_value, sample_count, samples,
     baseline_window_start, baseline_window_end, level_entered_at, metric_version)
  select v_uid, p_level, r->>'exercise_key', r->>'metric_type',
         (r->>'baseline_value')::numeric, jsonb_array_length(r->'samples'), r->'samples',
         v_hist.entered_at - interval '60 days', v_hist.entered_at, v_hist.entered_at,
         p_metric_version
  from jsonb_array_elements(p_rows) r
  on conflict (user_id, target_level, exercise_key, metric_type, metric_version) do nothing;
  get diagnostics v_n = row_count;

  update user_level_history set baseline_frozen_at = now() where id = v_hist.id;
  return v_n;
end $function$;

-- 새로 만든 함수의 기본 실행 권한만 좁힌다 (기존 객체의 권한은 건드리지 않는다)
revoke all on function public.freeze_level_baselines(integer, text, jsonb) from public, anon;
grant execute on function public.freeze_level_baselines(integer, text, jsonb) to authenticated;
revoke all on function public.record_level_entry() from public, anon, authenticated;
```

- [ ] **Step 3: pg_temp 리허설 — 운영 스키마를 건드리지 않고 트리거 동작 확인**

`execute_sql` 한 번에 실행한다(임시 객체는 세션이 끝나면 사라진다):

```sql
create temp table t_progress (user_id uuid primary key, total_xp int, current_level smallint);
create temp table t_history (
  user_id uuid, level smallint, entered_at timestamptz, entry_xp int,
  history_source text, unique (user_id, level));
create function pg_temp.rec() returns trigger language plpgsql as $$
begin
  if new.current_level > old.current_level then
    begin
      insert into t_history (user_id, level, entered_at, entry_xp, history_source)
      select new.user_id, g, now(), new.total_xp, 'actual'
      from generate_series(old.current_level + 1, new.current_level) g
      on conflict (user_id, level) do nothing;
    exception when others then
      raise warning 'failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
create trigger t_trg after update of current_level on t_progress
  for each row execute function pg_temp.rec();

insert into t_progress values ('00000000-0000-0000-0000-000000000001', 0, 1);
update t_progress set total_xp = 250, current_level = 2;   -- 1 → 2
update t_progress set total_xp = 260, current_level = 2;   -- 레벨 그대로
update t_progress set total_xp = 1900, current_level = 8;  -- 2 → 8 (6레벨 통과)
select count(*) n, min(level) lo, max(level) hi,
       count(*) filter (where entry_xp = 1900) at_1900 from t_history;
```

Expected: `n=7, lo=2, hi=8, at_1900=6`. 다르면 트리거 본문을 고치고 다시 리허설한다.

- [ ] **Step 4: 운영 적용**

Supabase MCP `apply_migration`(name `0131_level_history_and_growth_baselines`)에 Step 2 파일 내용을 그대로 넣는다.

- [ ] **Step 5: 객체로 검증** ("명령이 성공했다"는 확인이 아니다)

```sql
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='user_level_history') h_cols,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='level_growth_baselines') b_cols,
  (select string_agg(policyname || ':' || cmd, ', ' order by policyname) from pg_policies
     where tablename in ('user_level_history','level_growth_baselines')) policies,
  (select relrowsecurity from pg_class where oid = 'public.user_level_history'::regclass) h_rls,
  (select relrowsecurity from pg_class where oid = 'public.level_growth_baselines'::regclass) b_rls,
  (select string_agg(trigger_name || ':' || event_manipulation, ', ') from information_schema.triggers
     where event_object_table = 'user_progress') triggers,
  has_function_privilege('anon', 'public.freeze_level_baselines(integer,text,jsonb)', 'execute') anon_can,
  has_function_privilege('authenticated', 'public.freeze_level_baselines(integer,text,jsonb)', 'execute') auth_can;
```

Expected: `h_cols=9, b_cols=13`, 정책 2개 모두 `SELECT`, `h_rls=b_rls=true`, `triggers = trg_record_level_entry:UPDATE`, `anon_can=false`, `auth_can=true`.

- [ ] **Step 6: 운동 완료가 여전히 되는지 — 회귀**

Run: `pnpm verify:regression --only xp-test`
Expected: `0 failed`, passed가 기준선과 같다. (이 스크립트는 운영에 익명 계정을 만든다 — 끝난 뒤 `node scripts/dev-fixture.mjs status`로 남은 프로필이 없는지 센다.)

그다음 트리거가 실제로 적었는지 본다:

```sql
select history_source, count(*) from user_level_history group by 1;
```

Expected: `xp-test`가 레벨업을 만들었다면 `actual` 행이 생겼다가 계정 삭제(cascade)로 0이 된다. 0행이어도 정상이다 — 실계정의 `actual` 행은 Task 7의 대조 스크립트가 계속 감시한다.

- [ ] **Step 7: 스냅샷 갱신 + Commit**

```bash
pnpm db:snapshot
git add supabase/migrations/0131_level_history_and_growth_baselines.sql docs/db-current-schema.sql
git commit -m "feat(db): 레벨 진입 이력·성장 기준선 테이블, 진입 기록 트리거, 기준선 고정 RPC (0131)"
```

---

### Task 6: DB — 과거 레벨 진입 이력 복원 (0132)

**Files:**
- Create: `supabase/migrations/0132_backfill_level_history.sql`

새 테이블에 **insert만** 한다(기존 행을 바꾸지 않는다). 그래도 먼저 읽기 전용으로 시뮬레이션한다.

- [ ] **Step 1: 읽기 전용 시뮬레이션 — 원장·진행도 대조**

```sql
with t as (
  select x.user_id, x.id, x.created_at,
         sum(x.amount) over (partition by x.user_id order by x.created_at, x.id) cum
  from xp_transactions x
), lv as (
  select t.*, (select level from level_definitions
               where required_total_xp <= t.cum order by required_total_xp desc limit 1) lvl
  from t
), e as (
  select *, lag(lvl, 1, 1::smallint) over (partition by user_id order by created_at, id) prev from lv
), ent as (
  select e.user_id, g.level, e.created_at entered_at
  from e, generate_series(e.prev + 1, e.lvl) g(level) where e.lvl > e.prev
)
select p.nickname, up.total_xp, up.current_level,
       (select coalesce(sum(amount), 0) from xp_transactions where user_id = up.user_id) ledger_xp,
       (select count(*) from ent where ent.user_id = up.user_id) rows_to_insert,
       (select max(entered_at) from ent where ent.user_id = up.user_id) = up.last_level_up_at last_matches
from user_progress up left join profiles p on p.id = up.user_id
order by up.total_xp desc;
```

Expected (전 사용자): `ledger_xp = total_xp`, `rows_to_insert = current_level - 1`, `last_matches`가 `true` 또는 null(Lv.1). **한 명이라도 어긋나면 멈추고 그 사용자의 원장을 조사한다 — 원인을 알기 전에는 적용하지 않는다** (지시서 §6.1). 2026-11-13 실측은 7명 전원 일치였다.

- [ ] **Step 2: 마이그레이션 파일 작성**

`supabase/migrations/0132_backfill_level_history.sql`:

```sql
-- 0132 — XP 원장으로 과거 레벨 진입 시점을 복원한다 (history_source = 'reconstructed').
--
-- 0131 뒤에 돌린다. 새 테이블에 insert만 하고 기존 행은 건드리지 않는다.
-- 원장 순서(created_at, id)의 누적 XP가 레벨 컷을 넘는 거래의 created_at이 진입 시각이다.
-- 관리자 조정(admin_adjustment)·데모 지급도 같은 원장에 있어 그대로 누적된다.
-- 트리거가 이미 적은 'actual' 행은 on conflict로 지킨다.
with t as (
  select x.user_id, x.id, x.created_at,
         sum(x.amount) over (partition by x.user_id order by x.created_at, x.id) cum
  from public.xp_transactions x
), lv as (
  select t.*, (select level from public.level_definitions
               where required_total_xp <= t.cum order by required_total_xp desc limit 1) lvl
  from t
), e as (
  select *, lag(lvl, 1, 1::smallint) over (partition by user_id order by created_at, id) prev from lv
)
insert into public.user_level_history
  (user_id, level, entered_at, entry_xp, source_transaction_id, history_source)
select e.user_id, g.level, e.created_at, e.cum, e.id, 'reconstructed'
from e, generate_series(e.prev + 1, e.lvl) g(level)
where e.lvl > e.prev
on conflict (user_id, level) do nothing;
```

- [ ] **Step 3: 적용 후 검증**

`apply_migration`(name `0132_backfill_level_history`)으로 적용하고:

```sql
select p.nickname, up.current_level, count(h.*) rows, max(h.level) max_level,
       max(h.entered_at) filter (where h.level = up.current_level) = up.last_level_up_at entered_matches
from user_progress up
left join profiles p on p.id = up.user_id
left join user_level_history h on h.user_id = up.user_id
group by 1, 2, up.last_level_up_at order by 2 desc;
```

Expected: 전원 `rows = current_level - 1`, `max_level = current_level`(Lv.1은 null), `entered_matches = true`. 오뎅끼데스까는 `rows=18`이고 Lv.19 `entered_at = 2026-11-08 23:22:08.259476+00`.

- [ ] **Step 4: Commit**

```bash
pnpm db:snapshot
git add supabase/migrations/0132_backfill_level_history.sql docs/db-current-schema.sql
git commit -m "feat(db): XP 원장으로 과거 레벨 진입 이력 복원 (0132)"
```

---

### Task 7: 회귀 스크립트 — 이력 ↔ 원장 ↔ 진행도 대조

트리거는 실패해도 운동 완료를 막지 않게 만들었으므로, **조용히 빠진 이력**을 잡을 감시가 따로 있어야 한다.

**Files:**
- Create: `scripts/level-history-parity-check.mjs`
- Modify: `scripts/regression-baselines.json`

- [ ] **Step 1: 스크립트 작성**

```js
// 레벨 진입 이력: user_level_history ↔ user_progress ↔ xp_transactions 전원 대조 (읽기 전용)
// 실행: node scripts/level-history-parity-check.mjs
// 사전조건: 0131·0132 적용.
//
// 이력 트리거(record_level_entry)는 실패해도 운동 완료를 막지 않는다. 그래서 빠진 이력은
// 아무 화면에도 에러로 안 뜨고 '내 성장' 카드만 "측정 준비 중"에 머문다 — 여기서만 잡힌다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => {
  const res = await fetch(`${URL}${p}`, { headers: h });
  if (!res.ok) throw new Error(`${p} → ${res.status} ${await res.text()}`);
  return res.json();
};

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  FAIL ${name} — ${detail}`);
  }
}

const progress = await get("/rest/v1/user_progress?select=user_id,total_xp,current_level,last_level_up_at");
const history = await get("/rest/v1/user_level_history?select=user_id,level,entered_at,entry_xp&limit=10000");
const cuts = await get("/rest/v1/level_definitions?select=level,required_total_xp&order=level.asc");
const cutOf = new Map(cuts.map((c) => [c.level, c.required_total_xp]));

// 단언 0건으로 통과하는 일을 막는다 — 레벨업한 사용자가 한 명도 없으면 검사할 것이 없다
const leveled = progress.filter((p) => p.current_level > 1);
check("레벨업한 사용자가 있다", leveled.length > 0, `user_progress ${progress.length}행 중 Lv.2 이상 0명`);

const byUser = new Map();
for (const r of history) {
  const list = byUser.get(r.user_id) ?? [];
  list.push(r);
  byUser.set(r.user_id, list);
}

for (const p of leveled) {
  const rows = (byUser.get(p.user_id) ?? []).sort((a, b) => a.level - b.level);
  const id = p.user_id.slice(0, 8);
  check(
    `${id} 이력 행 수 = 레벨 - 1`,
    rows.length === p.current_level - 1,
    `이력 ${rows.length}행 / Lv.${p.current_level}`,
  );
  check(
    `${id} 레벨이 2부터 빠짐없이 이어진다`,
    rows.every((r, i) => r.level === i + 2),
    rows.map((r) => r.level).join(","),
  );
  check(
    `${id} 진입 시각이 뒤로 가지 않는다`,
    rows.every((r, i) => i === 0 || Date.parse(r.entered_at) >= Date.parse(rows[i - 1].entered_at)),
    "entered_at 역전",
  );
  check(
    `${id} 진입 XP가 그 레벨 컷 이상이다`,
    rows.every((r) => r.entry_xp >= cutOf.get(r.level)),
    rows.filter((r) => r.entry_xp < cutOf.get(r.level)).map((r) => `Lv.${r.level}@${r.entry_xp}`).join(","),
  );
  const last = rows.at(-1);
  check(
    `${id} 현재 레벨 진입 시각 = last_level_up_at`,
    Boolean(last) && Date.parse(last.entered_at) === Date.parse(p.last_level_up_at),
    `${last?.entered_at} vs ${p.last_level_up_at}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: 실행**

Run: `node scripts/level-history-parity-check.mjs`
Expected: `26 passed, 0 failed` (레벨업한 사용자 5명 × 5단언 + 1). 숫자가 다르면 실제 출력으로 기준선을 잡는다.

- [ ] **Step 3: 일부러 고장 내서 실패하는지 확인**

스크립트의 `rows.length === p.current_level - 1`을 `rows.length === p.current_level`로 잠깐 바꿔 돌린다.
Expected: `FAIL … 이력 행 수 = 레벨 - 1` 5건, exit 1. 확인 후 되돌린다.

- [ ] **Step 4: 기준선 등록**

`scripts/regression-baselines.json`에서 `"streak-parity-check": {` 항목 **바로 위**에 추가한다(같은 객체 안, 들여쓰기 4칸):

```json
    "level-history-parity-check": {
      "assertions": 26,
      "source": "measured",
      "tier": "readonly",
      "core": false,
      "what": "레벨 진입 이력(user_level_history) ↔ user_progress ↔ 레벨 컷 전원 대조. 이력 트리거가 조용히 실패한 것을 잡는다."
    },
```

`assertions`는 Step 2의 실제 passed 값으로 적는다.

Run: `pnpm verify:regression --only level-history-parity-check`
Expected: 통과, 경고 없음.

- [ ] **Step 5: Commit**

```bash
git add scripts/level-history-parity-check.mjs scripts/regression-baselines.json
git commit -m "test(scripts): 레벨 진입 이력 대조 회귀 (readonly)"
```

---

### Task 8: 데이터 계층 — 조회와 기준선 고정

**Files:**
- Create: `src/lib/level-growth.ts`
- Test: `src/lib/level-growth.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { getMyLevelGrowth } from "./level-growth";

type Call = { method: string; args: unknown[] };

/** 어떤 메서드로 끝나든 같은 결과를 주는 체인 */
function builder(result: unknown) {
  const calls: Call[] = [];
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "gt"]) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  for (const end of ["limit", "maybeSingle"]) {
    b[end] = (...args: unknown[]) => {
      calls.push({ method: end, args });
      return Promise.resolve({ data: result, error: null });
    };
  }
  return { b, calls };
}

const ENTERED = "2026-11-09T00:00:00.000Z";
const set = (kg: number) => ({ weight_kg: kg, reps: 10, duration_seconds: null, is_completed: true });
const session = (day: string, kg: number) => ({
  completed_at: `${day}T00:00:00.000Z`,
  tabata_minutes: null,
  workout_exercises: [
    { exercise_name: "벤치", exercise_type: "weight", sort_order: 0, workout_sets: [set(kg)] },
  ],
});
const SESSIONS = [
  session("2026-10-10", 60),
  session("2026-10-20", 60),
  session("2026-11-01", 60),
  session("2026-11-10", 66),
];

function wire(entry: unknown, baselines: unknown[] = []) {
  const tables: Record<string, ReturnType<typeof builder>> = {
    user_level_history: builder(entry),
    workout_sessions: builder(SESSIONS),
    level_growth_baselines: builder(baselines),
  };
  mocks.from.mockImplementation((name: string) => tables[name].b);
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  return tables;
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.rpc.mockReset();
});

describe("getMyLevelGrowth", () => {
  it("레벨 진입 이력이 없으면 no_entry — 수치를 지어내지 않는다", async () => {
    wire(null);
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(r).toEqual({ state: "no_entry", level: 19 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("세션은 반드시 본인 id로 거르고, 진입 60일 전부터만 읽는다", async () => {
    const t = wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    await getMyLevelGrowth({ userId: "me", level: 19 });
    const calls = t.workout_sessions.calls;
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "me"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "completed"] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
    expect(calls).toContainEqual({ method: "gt", args: ["completed_at", "2026-09-10T00:00:00.000Z"] });
  });

  it("아직 고정 전이면 계산한 기준선을 RPC로 한 번 고정한다", async () => {
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("freeze_level_baselines");
    expect(args.p_level).toBe(19);
    expect(args.p_metric_version).toBe("growth_v2.1");
    expect(args.p_rows).toHaveLength(1);
    expect(args.p_rows[0]).toMatchObject({ exercise_key: "벤치", metric_type: "w", baseline_value: 80 });
    expect(args.p_rows[0].samples).toHaveLength(3);
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].growthPct).toBeCloseTo(10, 6);
  });

  it("이미 고정됐으면 저장된 기준선을 쓰고 다시 고정하지 않는다", async () => {
    // 저장된 기준이 100이면 (지금 기록으로 다시 계산한 80이 아니라) 100과 비교해야 한다
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: "2026-11-09T01:00:00.000Z" }, [
      { exercise_key: "벤치", metric_type: "w", baseline_value: 100, samples: [] },
    ]);
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].baseline).toBe(100);
    expect(r.summary.exercises[0].growthPct).toBeCloseTo(-12, 6); // 88 vs 100
  });

  it("고정 RPC가 실패해도 화면은 계산값으로 그린다", async () => {
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(r.state).toBe("ready");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/level-growth.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/level-growth.ts`:

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BASELINE_WINDOW_DAYS,
  METRIC_VERSION,
  computeBaselines,
  computeLevelGrowth,
  toMetricPoints,
  type Baseline,
  type DaySample,
  type LevelGrowthSummary,
  type MetricKind,
  type RawSession,
} from "@/lib/domain/level-growth";

const DAY_MS = 86_400_000;

export type LevelGrowthResult =
  | {
      state: "ready";
      level: number;
      /** 이 레벨에 들어온 시각 (ISO) */
      enteredAt: string;
      summary: LevelGrowthSummary;
    }
  /** 레벨 진입 이력이 없다 (Lv.1이거나 이력 기록이 빠졌다) — 수치를 만들지 않는다 */
  | { state: "no_entry"; level: number };

type EntryRow = { level: number; entered_at: string; baseline_frozen_at: string | null };
type BaselineRow = {
  exercise_key: string;
  metric_type: MetricKind;
  baseline_value: number;
  samples: DaySample[] | null;
};

/**
 * 현재 레벨의 '내 성장' — 본인 기록만 읽는다.
 *
 * 기준선은 레벨마다 **한 번만** 고정된다. 아직 고정 전이면 진입 전 60일 기록으로 계산해
 * `freeze_level_baselines`에 넘기고, 그 뒤로는 저장된 값만 쓴다(원본 기록을 나중에 고쳐도
 * 기준선은 조용히 바뀌지 않는다).
 */
export async function getMyLevelGrowth(input: {
  /**
   * ⚠️ **반드시 본인 id로 거른다.** RLS는 크루 친구의 공개 세션도 읽게 열어 두어서,
   * 필터가 없으면 친구의 종목이 내 성장률에 섞인다 (evolution.ts와 같은 이유).
   */
  userId: string;
  level: number;
}): Promise<LevelGrowthResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: entry, error: entryError } = await supabase
    .from("user_level_history")
    .select("level, entered_at, baseline_frozen_at")
    .eq("user_id", input.userId)
    .eq("level", input.level)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) return { state: "no_entry", level: input.level };

  const row = entry as EntryRow;
  const enteredAtMs = Date.parse(row.entered_at);
  const since = new Date(enteredAtMs - BASELINE_WINDOW_DAYS * DAY_MS).toISOString();

  const { data: sessions, error: sessionError } = await supabase
    .from("workout_sessions")
    .select(
      "completed_at, tabata_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, is_completed))",
    )
    .eq("user_id", input.userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gt("completed_at", since)
    .limit(1000);
  if (sessionError) throw sessionError;

  const points = toMetricPoints((sessions ?? []) as unknown as RawSession[]);

  let baselines: Baseline[];
  if (row.baseline_frozen_at) {
    const { data: stored, error: baselineError } = await supabase
      .from("level_growth_baselines")
      .select("exercise_key, metric_type, baseline_value, samples")
      .eq("user_id", input.userId)
      .eq("target_level", input.level)
      .eq("metric_version", METRIC_VERSION)
      .limit(500);
    if (baselineError) throw baselineError;
    baselines = ((stored ?? []) as BaselineRow[]).map((b) => ({
      exerciseKey: b.exercise_key,
      kind: b.metric_type,
      value: Number(b.baseline_value),
      samples: b.samples ?? [],
    }));
  } else {
    baselines = computeBaselines(points, enteredAtMs);
    // 고정은 최선 노력이다. 실패해도 화면은 계산값으로 그리고, 다음에 열 때 다시 시도한다.
    await supabase.rpc("freeze_level_baselines", {
      p_level: input.level,
      p_metric_version: METRIC_VERSION,
      p_rows: baselines.map((b) => ({
        exercise_key: b.exerciseKey,
        metric_type: b.kind,
        baseline_value: b.value,
        samples: b.samples,
      })),
    });
  }

  return {
    state: "ready",
    level: input.level,
    enteredAt: row.entered_at,
    summary: computeLevelGrowth({ baselines, points, enteredAtMs }),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/level-growth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/level-growth.ts src/lib/level-growth.test.ts
git commit -m "feat(growth): 레벨 성장 조회 — 본인 기록만, 기준선은 레벨당 한 번 고정"
```

---

### Task 9: '내 성장 · Lv.N' 카드

**Files:**
- Create: `src/components/profile/level-growth-card.tsx`
- Test: `src/components/profile/level-growth-card.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelGrowthView } from "./level-growth-card";
import type { ExerciseLevelGrowth, LevelGrowthSummary } from "@/lib/domain/level-growth";

const day = (d: string, value: number) => ({ day: d, value, best: { weight: 16, reps: 12, seconds: null } });
const ex = (over: Partial<ExerciseLevelGrowth>): ExerciseLevelGrowth => ({
  exerciseKey: "덤벨 숄더 프레스",
  kind: "w",
  baseline: 23.33,
  baselineSamples: [day("2026-10-16", 23.33), day("2026-10-24", 23.33), day("2026-11-07", 21.87)],
  current: 25.07,
  currentSamples: [day("2026-11-13", 25.07)],
  currentDayCount: 1,
  growthPct: 7.44,
  status: "provisional",
  ...over,
});
const summary = (over: Partial<LevelGrowthSummary>): LevelGrowthSummary => ({
  exercises: [],
  confirmedCount: 0,
  value: null,
  provisionalCount: 0,
  provisionalValue: null,
  unmatched: [],
  ...over,
});
const html = (s: LevelGrowthSummary, open = false) =>
  renderToStaticMarkup(
    <LevelGrowthView result={{ state: "ready", level: 19, enteredAt: "2026-11-08T23:22:08Z", summary: s }} defaultOpen={open} />,
  );

describe("LevelGrowthView", () => {
  it("확정 수치가 있으면 그 값과 비교 종목 수를 보여 준다", () => {
    const out = html(summary({ value: 5.04, confirmedCount: 3 }));
    expect(out).toContain("내 성장 · Lv.19");
    expect(out).toContain("+5.0%");
    expect(out).toContain("기준: Lv.19 진입 전 운동 기록");
    expect(out).toContain("비교한 운동: 3종목");
    expect(out).not.toContain("측정 준비 중");
  });

  it("확정이 없으면 '측정 준비 중'이고, 잠정값은 참고라고 밝힌다", () => {
    const out = html(summary({ provisionalValue: 4.0, provisionalCount: 3 }));
    expect(out).toContain("측정 준비 중");
    expect(out).toContain("참고");
    expect(out).toContain("+4.0%");
  });

  it("잠정값도 없으면 숫자를 하나도 쓰지 않는다", () => {
    const out = html(summary({}));
    expect(out).toContain("측정 준비 중");
    expect(out).not.toMatch(/[+-]?\d+\.\d%/);
  });

  it("옛 문구(얼마나 세졌나)는 없다", () => {
    expect(html(summary({ value: 5, confirmedCount: 2 }))).not.toContain("얼마나 세졌나");
  });

  it("펼치면 종목별 기준·현재·날짜·상태가 보인다", () => {
    const out = html(summary({ exercises: [ex({})], provisionalCount: 1 }), true);
    expect(out).toContain("덤벨 숄더 프레스");
    expect(out).toContain("잠정");
    expect(out).toContain("+7.4%");
    expect(out).toContain("10/16");
    expect(out).toContain("11/13");
    expect(out).toContain("2일 더 기록하면 성장률을 확정할 수 있어요.");
  });

  it("기준선이 없는 새 종목은 0%가 아니라 비교 불가로 적는다", () => {
    const out = html(
      summary({ unmatched: [{ exerciseKey: "덤벨 벤치프레스", kind: "w", currentDayCount: 1 }] }),
      true,
    );
    expect(out).toContain("덤벨 벤치프레스");
    expect(out).toContain("아직 비교할 기준 기록이 없어요");
  });

  it("레벨 진입 이력이 없으면 준비 중만 보인다", () => {
    const out = renderToStaticMarkup(<LevelGrowthView result={{ state: "no_entry", level: 1 }} />);
    expect(out).toContain("측정 준비 중");
    expect(out).toContain("레벨이 오르면");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/components/profile/level-growth-card.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/components/profile/level-growth-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { DaySample, ExerciseLevelGrowth, MetricKind } from "@/lib/domain/level-growth";
import {
  exerciseLine,
  fmtGrowthPct,
  fmtSample,
  statusLabel,
} from "@/lib/domain/level-growth-copy";
import { getMyLevelGrowth, type LevelGrowthResult } from "@/lib/level-growth";

/** `2026-10-16` → `10/16` */
function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function SampleList({ label, kind, samples }: { label: string; kind: MetricKind; samples: DaySample[] }) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-bold text-muted">{label}</p>
      {samples.length === 0 ? (
        <p className="text-[12px] text-muted">아직 기록이 없어요</p>
      ) : (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {samples.map((s) => (
            <li key={s.day} className="flex justify-between text-[12px] tabular-nums">
              <span className="text-muted">{shortDay(s.day)}</span>
              <span className="font-bold">{fmtSample(kind, s.best)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExerciseRow({ e, level }: { e: ExerciseLevelGrowth; level: number }) {
  return (
    <li className="rounded-2xl border border-line bg-surface-2/50 p-3" data-testid="growth-exercise">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{e.exerciseKey}</p>
        <span
          className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
            e.status === "confirmed" ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
          }`}
        >
          {statusLabel(e.status)}
        </span>
        <span className="flex-none text-[13px] font-black tabular-nums">
          {e.growthPct === null ? "—" : fmtGrowthPct(e.growthPct)}
        </span>
      </div>
      <SampleList label={`Lv.${level} 진입 전 기준 기록`} kind={e.kind} samples={e.baselineSamples} />
      <SampleList label={`Lv.${level}에서 한 기록`} kind={e.kind} samples={e.currentSamples} />
      <p className="mt-2 text-[11.5px] leading-snug text-muted">{exerciseLine(e)}</p>
    </li>
  );
}

/** 표시 전용 (데이터는 부모가 준다) */
export function LevelGrowthView({
  result,
  defaultOpen = false,
}: {
  result: LevelGrowthResult;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const level = result.level;

  if (result.state === "no_entry") {
    return (
      <section aria-label="내 성장" className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">내 성장 · Lv.{level}</h2>
        <p className="mt-2 text-[18px] font-black text-muted">측정 준비 중</p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          레벨이 오르면 그때의 운동 기록을 기준으로 삼아, 얼마나 좋아졌는지 알려 드려요.
        </p>
      </section>
    );
  }

  const s = result.summary;
  // 측정된 종목 먼저, 그 안에서는 확정 먼저
  const order = { confirmed: 0, provisional: 1, waiting: 2 } as const;
  const rows = [...s.exercises].sort((a, b) => order[a.status] - order[b.status]);
  const detailCount = rows.length + s.unmatched.length;

  return (
    <section aria-label="내 성장" className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
      <h2 className="text-[15px] font-extrabold">내 성장 · Lv.{level}</h2>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        이전 레벨업 때보다 운동 능력이 얼마나 좋아졌을까요?
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold text-muted">운동 수행능력</span>
        {s.value !== null ? (
          <span className="text-[22px] font-black tabular-nums text-accent" data-testid="growth-value">
            {fmtGrowthPct(s.value)}
          </span>
        ) : (
          <span className="text-[18px] font-black text-muted" data-testid="growth-preparing">
            측정 준비 중
          </span>
        )}
      </div>

      {s.value === null && s.provisionalValue !== null && (
        <p className="mt-1 text-right text-[11.5px] text-muted" data-testid="growth-provisional">
          참고: 지금까지 기록으로는 {fmtGrowthPct(s.provisionalValue)} ({s.provisionalCount}종목 · 아직 확정 전)
        </p>
      )}

      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        기준: Lv.{level} 진입 전 운동 기록
        {s.value !== null && <> · 비교한 운동: {s.confirmedCount}종목</>}
      </p>
      {s.value === null && (
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          같은 운동을 이 레벨에서 3일 기록한 종목이 2개 이상이면 수치가 확정돼요.
        </p>
      )}

      {detailCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="growth-toggle"
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong text-[13px] font-extrabold"
        >
          <Icon name="ranking" size={16} />
          {open ? "운동별 성장 기록 접기" : "운동별 성장 기록 보기"}
        </button>
      )}

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((e) => (
            <ExerciseRow key={`${e.exerciseKey}::${e.kind}`} e={e} level={level} />
          ))}
          {s.unmatched.map((u) => (
            <li
              key={`${u.exerciseKey}::${u.kind}`}
              className="rounded-2xl border border-line bg-surface-2/50 p-3"
              data-testid="growth-unmatched"
            >
              <p className="text-[13px] font-extrabold">{u.exerciseKey}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                아직 비교할 기준 기록이 없어요. 다음 레벨부터 비교해 드려요.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 성장 허브용 — 본인 기록을 읽어 현재 레벨의 성장을 그린다 */
export function LevelGrowthCard({ userId, level }: { userId: string; level: number }) {
  const [result, setResult] = useState<LevelGrowthResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyLevelGrowth({ userId, level })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, level]);

  if (failed) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">내 성장 · Lv.{level}</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          내 성장을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. 운동 기록은 그대로 안전해요.
        </p>
      </section>
    );
  }
  if (!result) {
    return (
      <section
        aria-busy="true"
        className="h-36 animate-pulse rounded-card border border-line bg-surface shadow-card"
      />
    );
  }
  return <LevelGrowthView result={result} />;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/components/profile/level-growth-card.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/level-growth-card.tsx src/components/profile/level-growth-card.test.tsx
git commit -m "feat(profile): '내 성장 · Lv.N' 카드와 종목별 비교 근거"
```

---

### Task 10: 플래그로 배선 — 진화 카드에서 성장 조건을 떼어 낸다

지시서 §8: 실제 진화는 XP만 본다. 플래그가 켜지면 진화 카드는 "모두 채우면 진화"라고 하지 않고, 성장은 새 카드가 맡는다. 플래그가 꺼지면 **한 글자도 달라지지 않는다.**

**Files:**
- Create: `src/lib/flags.ts`
- Modify: `src/lib/domain/evolution.ts` (`EvolutionInput`, `evaluateEvolution`)
- Modify: `src/lib/evolution.ts`
- Modify: `src/components/profile/evolution-status-card.tsx`
- Modify: `src/components/profile/growth-hub.tsx:193`
- Test: `src/lib/domain/evolution.test.ts`, `src/components/profile/evolution-status-card.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/domain/evolution.test.ts` 끝에 (파일 상단에 이미 `evaluateEvolution` import가 있다):

```ts
describe("evaluateEvolution — includeGrowth: false (내 성장 v2 분리)", () => {
  const input = {
    totalXp: 8500, // Lv.19
    currentStage: 4,
    today: "2026-11-13",
    workoutDays: ["2026-07-26", "2026-11-13"],
    growth: { measuredCount: 0, baselineCount: 0, value: null },
  };

  it("성장 조건이 목록에서 빠진다", () => {
    const s = evaluateEvolution({ ...input, includeGrowth: false });
    expect(s.conditions.map((c) => c.key)).toEqual(["xp", "days", "weeks"]);
  });

  it("성장을 못 재도 운동일 1.5배 대체 경로가 붙지 않는다", () => {
    const s = evaluateEvolution({ ...input, includeGrowth: false });
    const days = s.conditions.find((c) => c.key === "days")!;
    expect(days.required).toBe(60);
    expect(days.altPath).toBe(false);
  });

  it("옵션을 안 주면 예전 그대로다 (성장 조건 + 대체 경로 90일)", () => {
    const s = evaluateEvolution(input);
    expect(s.conditions.map((c) => c.key)).toContain("growth");
    expect(s.conditions.find((c) => c.key === "days")!.required).toBe(90);
  });
});
```

`src/components/profile/evolution-status-card.test.tsx` 끝에:

```tsx
describe("EvolutionStatusView — separateGrowth (내 성장 v2)", () => {
  const status = evaluateEvolution({
    totalXp: 8500, currentStage: 4, today: TODAY, workoutDays: days(42, 125), growth: g(null),
    includeGrowth: false,
  });

  it("'모두 채우면 진화'라고 하지 않고 경험치 레벨이 정한다고 말한다", () => {
    const html = renderToStaticMarkup(<EvolutionStatusView status={status} separateGrowth />);
    expect(html).toContain("진화는 경험치 레벨로 정해져요");
    expect(html).not.toContain("모두 채우면 진화할 수 있어요");
    expect(html).not.toContain("얼마나 세졌나");
    expect(html).toContain("활동 목표");
  });

  it("남은 조건에는 레벨만 나온다", () => {
    const html = renderToStaticMarkup(<EvolutionStatusView status={status} separateGrowth />);
    expect(html).toContain("레벨을 2개 더 올려요");
    expect(html).not.toContain("일 더 해요");
  });

  it("separateGrowth를 안 주면 예전 문구 그대로다", () => {
    const legacy = evaluateEvolution({
      totalXp: 8500, currentStage: 4, today: TODAY, workoutDays: days(42, 125), growth: g(5.1),
    });
    const html = renderToStaticMarkup(<EvolutionStatusView status={legacy} />);
    expect(html).toContain("가지를 모두 채우면 진화할 수 있어요");
    expect(html).toContain("얼마나 세졌나");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/domain/evolution.test.ts src/components/profile/evolution-status-card.test.tsx`
Expected: FAIL — `includeGrowth`·`separateGrowth`가 타입에 없다 / 조건 목록에 growth가 있다

- [ ] **Step 3: `evaluateEvolution`에 옵션 추가**

`src/lib/domain/evolution.ts`의 `EvolutionInput`에 필드를 추가한다:

```ts
  growth: GrowthSummary;
  /**
   * false면 성장 조건과 대체 경로(운동일 1.5배)를 **빼고** 판정한다 — '내 성장' v2가
   * 켜졌을 때 쓴다. 성장은 레벨 기준 카드(level-growth-card)가 따로 보여 주고,
   * 실제 진화는 서버가 XP로만 정한다. 기본(생략)은 예전 그대로다.
   */
  includeGrowth?: boolean;
```

같은 파일 `evaluateEvolution` 안의 한 줄을 바꾼다:

```ts
  // 변경 전
  const needsGrowth = req.growthPct !== null;
  // 변경 후
  const needsGrowth = input.includeGrowth !== false && req.growthPct !== null;
```

- [ ] **Step 4: 플래그와 조회 배선**

`src/lib/flags.ts`:

```ts
/**
 * '내 성장' v2.1 (레벨 진입 기준선 대비 성장률).
 *
 * 켜기: 환경변수 `NEXT_PUBLIC_GROWTH_V2=1` (빌드 시점에 굳는다).
 * 끄기(롤백): 변수를 지우고 다시 배포하거나, Vercel에서 직전 배포로 되돌린다.
 * 꺼져 있으면 화면은 v1 그대로다 — DB의 이력·기준선은 남아 있어도 아무도 읽지 않는다.
 */
export const GROWTH_V2 = process.env.NEXT_PUBLIC_GROWTH_V2 === "1";
```

`src/lib/evolution.ts` — import를 추가하고 반환부를 바꾼다:

```ts
import { GROWTH_V2 } from "@/lib/flags";
```

```ts
  return evaluateEvolution({
    totalXp: input.totalXp,
    currentStage: input.currentStage,
    workoutDays,
    today: dayKey(new Date(), DEFAULT_TIMEZONE),
    growth: computeGrowth(records),
    includeGrowth: !GROWTH_V2,
  });
```

- [ ] **Step 5: 진화 카드 문구 분기**

`src/components/profile/evolution-status-card.tsx`:

(a) `EvolutionStatusView`의 props에 추가:

```tsx
export function EvolutionStatusView({
  status,
  variant = "male",
  separateGrowth = false,
}: {
  status: EvolutionStatus;
  /** 단계 얼굴 이미지의 남·여 — 없으면 남성 */
  variant?: CharacterVariant;
  /**
   * '내 성장' v2: 실제 진화는 경험치 레벨만 본다고 말하고, 운동 습관은 활동 목표로만
   * 보여 준다. 남은 조건·목표 칩에도 레벨만 남긴다.
   */
  separateGrowth?: boolean;
}) {
```

(b) `const items = remainingItems(status);` 한 줄을 아래로 바꾼다:

```tsx
  // 서버는 XP로만 진화시킨다 — 분리 모드에서는 "남은 조건"·칩에 레벨만 남긴다
  const gate: EvolutionStatus = separateGrowth
    ? { ...status, conditions: status.conditions.filter((c) => c.key === "xp") }
    : status;
  const items = remainingItems(gate);
```

(c) `{targetChips(status).map((chip) => (` → `{targetChips(gate).map((chip) => (`

(d) "다음엔 이렇게 진화해요" 아래 문단을 바꾼다:

```tsx
        <p className="mt-0.5 text-[11.5px] text-muted">
          {separateGrowth
            ? "진화는 경험치 레벨로 정해져요. 운동 습관은 함께 챙기는 활동 목표예요."
            : `아래 ${cardCount}가지를 모두 채우면 진화할 수 있어요.`}
        </p>
```

(e) 운동 습관 카드 머리:

```tsx
            <CardHead
              icon="calendar"
              title="운동 습관"
              note={separateGrowth ? "활동 목표" : "꾸준함"}
              met={habitMet}
            />
```

(f) 마지막 섹션의 안내 문단:

```tsx
        <p className="mt-3 border-t border-line/60 pt-2.5 text-[11px] leading-snug text-muted">
          {separateGrowth
            ? "진화는 경험치 레벨이 정해요. 얼마나 좋아졌는지는 아래 '내 성장'에서 따로 봐요. "
            : "경험치는 입장권이에요. 꾸준히 운동하고, 예전의 내가 더 세지면 진화해요! "}
          한번 진화한 모습은 운동을 쉬어도 그대로예요.
        </p>
```

(g) 파일 끝 `EvolutionStatusCard`의 마지막 줄 — import에 `import { GROWTH_V2 } from "@/lib/flags";`를 추가하고:

```tsx
  return <EvolutionStatusView status={status} variant={variant} separateGrowth={GROWTH_V2} />;
```

- [ ] **Step 6: 성장 허브에 새 카드**

`src/components/profile/growth-hub.tsx` — import 추가:

```tsx
import { LevelGrowthCard } from "@/components/profile/level-growth-card";
import { getLevelFromTotalXp } from "@/lib/domain/progression";
import { GROWTH_V2 } from "@/lib/flags";
```

(`getLevelFromTotalXp`가 이미 import돼 있으면 중복해서 넣지 않는다.)

`<EvolutionStatusCard … />` 블록 **바로 아래**에:

```tsx
      {GROWTH_V2 && (
        <LevelGrowthCard
          userId={userId as string}
          level={getLevelFromTotalXp(summary.totalXp).level}
        />
      )}
```

- [ ] **Step 7: 통과 확인 — 기존 테스트 포함**

Run: `pnpm test src/lib/domain/evolution.test.ts src/components/profile src/lib/evolution.test.ts src/components/crew`
Expected: 전부 PASS. 기존 테스트가 하나라도 깨지면 플래그가 꺼진 경로를 건드린 것이다 — 고친다.

- [ ] **Step 8: Commit**

```bash
git add src/lib/flags.ts src/lib/domain/evolution.ts src/lib/evolution.ts \
  src/components/profile/evolution-status-card.tsx src/components/profile/growth-hub.tsx \
  src/lib/domain/evolution.test.ts src/components/profile/evolution-status-card.test.tsx
git commit -m "feat(profile): GROWTH_V2 플래그 — 진화는 XP 기준으로 말하고 성장은 레벨 기준 카드로 분리"
```

---

### Task 11: 실데이터 비교표 (지시서 §12)

**Files:**
- Create: `src/lib/domain/level-growth.live.test.ts`

Vitest로 돌리는 이유: `scripts/*.mjs`는 `@/` 별칭과 TS 모듈을 못 읽는다. 환경변수가 없으면 skip이라 `pnpm test`에는 영향이 없다. **읽기 전용이다.**

- [ ] **Step 1: 작성**

```ts
/**
 * 실데이터 검증 (작업지시서 §12) — 닉네임 하나의 기존(v1)·신규(v2.1) 성장률을 나란히 찍는다.
 *
 * 실행: GROWTH_LIVE_NICK=오뎅끼데스까 pnpm vitest run src/lib/domain/level-growth.live.test.ts
 * 환경변수가 없으면 건너뛴다. 운영 DB를 **읽기만** 한다(service role, .env.local).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeGrowth, type GrowthRecord } from "./evolution-growth";
import { computeBaselines, computeLevelGrowth, toMetricPoints, type RawSession } from "./level-growth";
import { fmtGrowthPct, statusLabel } from "./level-growth-copy";
import { DEFAULT_TIMEZONE, dayKey } from "./time";

const NICK = process.env.GROWTH_LIVE_NICK;

describe.skipIf(!NICK)("level-growth 실데이터 비교", () => {
  it("기존/신규 비교표를 출력하고, XP·세션 수가 그대로인지 본다", async () => {
    const env = Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
    const base = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const get = async (path: string) => {
      const res = await fetch(`${base}${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(`${path} → ${res.status}`);
      return res.json();
    };

    const [profile] = await get(`/rest/v1/profiles?select=id&nickname=eq.${encodeURIComponent(NICK as string)}`);
    expect(profile, `닉네임 ${NICK} 없음`).toBeTruthy();
    const uid = profile.id as string;

    const [progress] = await get(`/rest/v1/user_progress?select=total_xp,current_level&user_id=eq.${uid}`);
    const [entry] = await get(
      `/rest/v1/user_level_history?select=entered_at&user_id=eq.${uid}&level=eq.${progress.current_level}`,
    );
    expect(entry, "현재 레벨 진입 이력 없음 — 0132를 먼저 적용한다").toBeTruthy();

    const sessions: RawSession[] = await get(
      `/rest/v1/workout_sessions?select=completed_at,tabata_minutes,workout_exercises(exercise_name,exercise_type,sort_order,workout_sets(weight_kg,reps,duration_seconds,is_completed))&user_id=eq.${uid}&status=eq.completed&deleted_at=is.null&completed_at=not.is.null&limit=2000`,
    );
    expect(sessions.length).toBeGreaterThan(0);

    // v1 — src/lib/evolution.ts가 하는 그대로
    const records: GrowthRecord[] = [];
    for (const s of sessions) {
      const day = dayKey(new Date(s.completed_at), DEFAULT_TIMEZONE);
      for (const ex of s.workout_exercises ?? []) {
        const sets = (ex.workout_sets ?? []).filter((x) => x.is_completed !== false);
        if (sets.length > 0) records.push({ exercise: ex.exercise_name, day, sets });
      }
    }
    const v1 = computeGrowth(records);

    // v2.1
    const enteredAtMs = Date.parse(entry.entered_at);
    const points = toMetricPoints(sessions);
    const baselines = computeBaselines(points, enteredAtMs);
    const v2 = computeLevelGrowth({ baselines, points, enteredAtMs });

    const v1Of = new Map((v1.exercises ?? []).map((e) => [e.exercise, e.growthPct]));
    const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtGrowthPct(v));

    console.log(`\n${NICK} · Lv.${progress.current_level} · ${progress.total_xp} XP · 진입 ${entry.entered_at}`);
    console.log(`v1 전체(전 기간 처음3 vs 최근3): ${pct(v1.value)} · 측정 ${v1.measuredCount}종목`);
    console.log(
      `v2.1 확정: ${pct(v2.value)} (${v2.confirmedCount}종목) · 잠정 참고: ${pct(v2.provisionalValue)} (${v2.provisionalCount}종목) · 기준선 ${baselines.length}종목`,
    );
    console.table(
      v2.exercises
        .filter((e) => e.currentDayCount > 0)
        .map((e) => ({
          종목: e.exerciseKey,
          기준: e.baseline.toFixed(2),
          현재: e.current?.toFixed(2) ?? "—",
          "v2.1": pct(e.growthPct),
          상태: `${statusLabel(e.status)} ${e.currentDayCount}일`,
          v1: pct(v1Of.get(e.exerciseKey)),
        })),
    );
    console.log("기준선 없음(비교 불가):", v2.unmatched.map((u) => u.exerciseKey).join(", ") || "없음");
    const intervalOnly = (v1.exercises ?? [])
      .map((e) => e.exercise)
      .filter((name) => !points.some((p) => p.exerciseKey === name.trim()));
    console.log("v1에만 있던 종목(인터벌 라운드·유산소 시간 등):", intervalOnly.join(", ") || "없음");

    // 계산은 읽기만 한다 — 돌린 뒤에도 XP와 세션 수가 같아야 한다
    const [after] = await get(`/rest/v1/user_progress?select=total_xp,current_level&user_id=eq.${uid}`);
    expect(after).toEqual(progress);
  }, 60_000);
});
```

- [ ] **Step 2: 평소에는 skip인지 확인**

Run: `pnpm test src/lib/domain/level-growth.live.test.ts`
Expected: `1 skipped`

- [ ] **Step 3: 오뎅끼데스까로 실행하고 §0.6 표와 대조**

Run: `GROWTH_LIVE_NICK=오뎅끼데스까 pnpm vitest run src/lib/domain/level-growth.live.test.ts`

Expected (2026-11-13 기록 기준 — 그 뒤 운동이 추가되면 현재값·상태는 달라진다):

| 종목 | 기준 | 현재 | v2.1 | 상태 |
|---|---:|---:|---:|---|
| 덤벨 숄더 프레스 | 23.33 | 25.07 | +7.4% | 잠정 1일 |
| 덤벨 레터럴 레이즈 | 13.33 | 13.87 | +4.0% | 잠정 1일 |
| 아이소 레터럴 인클라인 프레스 머신 | 52.00 | 52.00 | 0.0% | 잠정 1일 |

- `v2.1 확정: —`, `잠정 참고: +4.0% (3종목)`
- `기준선 없음`에 `케이블 푸시다운`, `덤벨 벤치프레스`
- `v1에만 있던 종목`에 `마운틴 클라이머`, `점핑잭`, `트레드밀` 등이 나온다 — 이것이 가짜 성장률의 출처다

⚠️ **이미 Lv.20이 됐다면**(9,200 XP) 표는 Lv.20 기준으로 나온다. 그때는 숫자 대신 구조를 본다: 인터벌·유산소 종목이 v2.1 표에 **없어야** 하고, 기준 3일이 진입 시각 **이전**이어야 한다.

출력 전체를 `docs/superpowers/plans/2026-11-13-level-growth-v2.md` 맨 아래 "## 검증 기록" 절에 붙인다 — 이것이 지시서의 '기존/신규 계산 비교표' 산출물이다.

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain/level-growth.live.test.ts docs/superpowers/plans/2026-11-13-level-growth-v2.md
git commit -m "test(growth): 실데이터 v1/v2.1 비교표 (환경변수 없으면 skip)"
```

---

### Task 12: 개발 서버 화면 확인 → 전체 검증 → 배포 승인 요청

**Files:**
- Modify: `.env.local` (gitignore 대상 — 커밋하지 않는다)
- Modify: `PROGRESS.md`, `src/lib/release-notes.data.json` (위치는 `git grep -l "release-notes.data.json"`로 확인)

- [ ] **Step 1: 플래그를 켜고 개발 서버를 띄운다**

`.env.local`에 `NEXT_PUBLIC_GROWTH_V2=1` 한 줄을 추가하고 `preview_start`(`.claude/launch.json`의 dev 구성)로 띄운다. Bash로 `pnpm dev`를 돌리지 않는다.

- [ ] **Step 2: 픽스처 A로 직접 조작한다** (한 계정이면 충분 — 사회적 기능이 아니다)

`/login`에서 `dev-fixture-a@gnd.local`로 로그인 → 내 정보 → 성장 허브.

| 조작 | 기대 결과 |
|---|---|
| 성장 허브를 연다 | 진화 현황 카드 **아래**에 '내 성장 · Lv.10' 카드가 **1개** 있다 |
| 진화 현황 카드를 읽는다 | "진화는 경험치 레벨로 정해져요"가 있고 "모두 채우면 진화"·"얼마나 세졌나"가 **없다**. 카드 ③(내 성장)이 사라져 조건 카드가 2개다 |
| 새 카드의 큰 글씨 | 확정이면 `+N.N%`, 아니면 '측정 준비 중'. **'0.0%'가 근거 없이 뜨지 않는다** |
| [운동별 성장 기록 보기]를 누른다 | 목록이 펼쳐지고 버튼이 '접기'로 바뀐다. 다시 누르면 접힌다 |
| 펼친 목록의 종목 수를 센다 | Step 3의 SQL 결과(기준선 행 수 + 비교 불가 종목 수)와 **같다** |
| 종목 하나의 기준 기록 날짜 3개 | 전부 Lv.10 진입 시각보다 **이전**이다 |
| 인터벌로만 한 종목(마운틴 클라이머 등) | 목록에 **없다** (부정 확인) |
| 트레드밀 | 목록에 **없다** (부정 확인) |
| 페이지를 새로고침한다 | 같은 숫자가 다시 나온다 |

- [ ] **Step 3: 기준선이 한 번만 고정됐는지 DB로 확인**

```sql
select h.level, h.baseline_frozen_at, count(b.*) baselines
from user_level_history h
left join level_growth_baselines b on b.user_id = h.user_id and b.target_level = h.level
where h.user_id = (select id from auth.users where email = 'dev-fixture-a@gnd.local')
  and h.level = (select current_level from user_progress
                 where user_id = (select id from auth.users where email = 'dev-fixture-a@gnd.local'))
group by 1, 2;
```

Expected: `baseline_frozen_at`이 채워져 있고, 새로고침을 여러 번 해도 **시각과 행 수가 그대로**다(멱등).

- [ ] **Step 4: 남의 기준선이 안 읽히는지 확인**

RLS는 SQL로 직접 본다:

```sql
select policyname, cmd, qual from pg_policies
where tablename in ('user_level_history', 'level_growth_baselines');
```

Expected: 두 테이블 모두 정책이 `SELECT / (user_id = auth.uid())` 하나뿐이다. insert·update·delete 정책이 **없다**.

Run: `pnpm verify:regression --only rls-test`
Expected: `0 failed`.

- [ ] **Step 5: 플래그를 끄고 예전 화면 그대로인지 확인 (롤백 경로)**

`.env.local`에서 `NEXT_PUBLIC_GROWTH_V2=1`을 지우고 개발 서버를 다시 띄운다.

| 조작 | 기대 결과 |
|---|---|
| 성장 허브를 연다 | '내 성장 · Lv.N' 카드가 **없다** |
| 진화 현황 카드 | "아래 3가지를 모두 채우면 진화할 수 있어요"와 ③ '내 성장 · 얼마나 세졌나'가 **있다** |

확인 후 다시 `=1`로 켠다.

- [ ] **Step 6: 지시서 §10 '기존 기능 보호' — 변동이 없는지**

작업 시작 전·후로 같은 쿼리를 돌려 비교한다(이 계획의 마이그레이션은 아래 테이블을 건드리지 않는다):

```sql
select
  (select count(*) from workout_sessions) sessions,
  (select count(*) from workout_sets) sets,
  (select count(*) from xp_transactions) xp_tx,
  (select coalesce(sum(amount), 0) from xp_transactions) xp_sum,
  (select coalesce(sum(total_xp), 0) from user_progress) progress_sum,
  (select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('apply_xp_and_progress', 'complete_workout_v2')) fn_hash;
```

Expected: `fn_hash`가 0131 적용 **전** 값과 같다(XP 지급 함수 본문 불변). 나머지 숫자는 그 사이 실사용자가 운동한 만큼만 늘 수 있다 — 줄면 안 된다.

- [ ] **Step 7: 전체 검증**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:regression --tier readonly
```

Expected: 전부 통과, `verify:regression`은 `0 failed`. (`readonly`와 `accounts` 티어를 동시에 돌리지 않는다.)

- [ ] **Step 8: 문서**

- `PROGRESS.md`: '내 성장 v2.1' 항목 — 무엇이 바뀌었나, 플래그 이름, 0131·0132, 대조 스크립트 이름.
- `release-notes.data.json`: 배포 **전에** 항목을 넣는다(빌드 때 `/whats-new`로 굳는다). 문구 예: "내 성장이 '레벨업했을 때의 나'와 비교하도록 바뀌었어요. 인터벌 라운드 수는 더 이상 성장률에 섞이지 않아요." **발송(`--send`)은 사용자가 지시할 때만.**

```bash
git add PROGRESS.md src/lib/release-notes.data.json
git commit -m "docs: 내 성장 v2.1 진행 기록·릴리스 노트"
```

- [ ] **Step 9: 배포 승인 요청 — 여기서 멈춘다**

사용자에게 보고한다: 개발 서버에서 확인한 흐름(Step 2 표의 결과), Task 11 비교표, 전체 검증 결과, `[미검증]` 항목(실기기 화면).

승인을 받으면 CLAUDE.md §배포 절차 그대로:
1. `feat/level-growth-v2`를 로컬 `main`에 병합
2. `git push origin main` (배포 승인에 포함 — 따로 묻지 않는다) → `git fetch && git rev-list --left-right --count origin/main...main`이 `0 0`
3. Vercel 운영 환경변수에 `NEXT_PUBLIC_GROWTH_V2=1` 추가 (`npx vercel@latest env add NEXT_PUBLIC_GROWTH_V2 production --scope gnd4`)
4. `main`의 깨끗한 워크트리에서 `npx vercel@latest --prod --yes --scope gnd4`
5. 프로덕션 번들에서 **새 문구가 있고**(`진화는 경험치 레벨로 정해져요`) **옛 문구가 그 경로에서 안 쓰이는지** 확인하고, 실계정으로 성장 허브를 연다

**롤백:** Vercel에서 `NEXT_PUBLIC_GROWTH_V2`를 지우고 재배포(또는 직전 배포 promote). DB는 되돌릴 필요가 없다 — 새 테이블은 플래그가 꺼지면 아무도 읽지 않고, 트리거는 이력만 계속 쌓는다.

---

## 운영 절차 메모

**기준선을 다시 계산해야 할 때** (원본 기록을 고쳤거나 산식을 바꿨을 때): 저장된 기준선을 덮어쓰지 않는다.
1. `METRIC_VERSION`을 올린다(`growth_v2.2`) → 옛 행은 고유키가 달라 그대로 남는다(변경 이력).
2. `baseline_frozen_at`을 null로 되돌리는 것은 **기존 행 UPDATE**라 사용자 승인 후에 한다. 범위(전원/한 사람/한 레벨)를 SQL과 함께 보여 준다.
3. 다음에 카드를 열 때 새 버전으로 다시 고정된다.

**성장률을 진화 조건으로 쓰게 되면**: 지금 구조(클라이언트 계산 → RPC 고정)는 위조할 수 있다. 그때는 기준선·성장률 계산을 서버(SQL 또는 Edge Function)로 옮기고 별도 승인을 받는다(지시서 §8).

## 이번 범위 밖

- 인터벌·유산소의 별도 성과 화면(§3.4) — 누적 시간·세션 수·페이스
- `workout_sets`에 "실제 반복 수"와 "인터벌 라운드 수"를 나누는 스키마 변경(§4.2 "향후")
- 과거 레벨들의 기준선 일괄 생성 — 이력만 복원하고 기준선은 현재 레벨부터 쌓는다
- 크루원 프로필 시트의 성장 카드 — 본인 성장 허브에만 붙인다

## 검증 기록

(Task 11 Step 3의 출력을 여기에 붙인다)


## 2026-11-13 설계 변경 (v3)

위 v2.1(60일 창·3일 중앙값·잠정/확정·기준선 고정 테이블)은 너무 복잡해 폐기하고 아래 규칙으로 대체한다.

- 단계(stage) = 레벨 5개 = 캐릭터 형태 하나. 진화는 새 단계 진입(Lv.6·11·16·21·26·31) 때 일어난다.
- 기준선 = 현재 단계 첫 레벨 진입 시각(`user_level_history.entered_at`) **이하**의 종목별 최고 기록. 기간 제한·최소 일수 없음.
- 현재 = 진입 **이후** 종목별 최고 기록. 현재 > 기준선일 때만 **성장 기록**(성장률 = (현재-기준)/기준×100, 표시만 소수 1자리).
- 같거나 낮으면 기록을 만들지 않고 "변함없음"으로만 센다. 진입 전 기록이 없던 종목은 "비교 불가"(0%가 아니다).
- 종합 %는 만들지 않는다(오른 종목만 골라 평균 내면 부풀려진다). 성장한 종목 목록을 성장률 큰 순으로 보여 준다.
- 기준선은 단계 안에서 고정이고, 다음 단계 진입 때 그 시점 최고 기록으로 다시 잡는다. 1단계·진입 이력 없음은 "측정 준비 중".
- 종목 지표(추정 1RM·맨몸 반복·유지 시간)와 제외 규칙(인터벌 블록·유산소·미완료·무게 0)은 `toMetricPoints` 그대로.
- `previousStageExerciseCount`(이전 단계 구간에서 기록한 서로 다른 종목 수)는 나중에 진화 조건에 쓸 자료로 계산만 해 둔다.
- 조회는 `getMyStageGrowth` 하나(본인 진입 이력 + 본인 세션 두 쿼리). 계산은 `computeStageGrowth`.
- DB의 `level_growth_baselines` 테이블과 `freeze_level_baselines` RPC는 더 이상 쓰지 않는다(삭제는 별도 승인 단계).
- 위 Task들 중 기준선 계산·고정·확정 판정에 관한 부분은 이 절로 대체된다.
