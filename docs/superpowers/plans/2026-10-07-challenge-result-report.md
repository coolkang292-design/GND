# 챌린지 결과 화면 (챌린지 종료! · 나의 챌린지 결과) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 종료된 챌린지 상세를 사용자 시안(2026-10-07 첨부 두 화면)과 **최대한 같은 배치·그래프**로 바꾼다. 사용자 지시: "이미지는 제외하고 그래프나 UI는 공유한 이미지 컨텐츠를 최대한 비슷하게."

**Architecture:** 화면 두 장 — A `챌린지 종료!`(상세를 열면 바로), B `나의 챌린지 결과`(A의 레벨 카드 `>`로 들어가고 `<`로 돌아온다). 점수·순위는 지금처럼 `rankParticipants`/`scoreParticipant` 한 곳에서만 나온다. 그래프 재료는 이미 받는 `get_challenge_period_sessions` 행을 버리지 않고 남겨서 새 순수 모듈 `lib/domain/challenge-report.ts`가 계산한다. 레벨·XP·보상 칸은 **이미 쌓이고 있는 본인 장부**(`user_progress`·`xp_transactions`·`point_transactions`·`user_badges`, RLS 본인 행)에서 챌린지 기간 몫만 잘라 보여 준다 — 새 지급은 없다. DB 변경은 RPC에 `duration_minutes`를 더하는 0117 하나다.

**Tech Stack:** Next.js App Router · React 19 · Tailwind 토큰(`globals.css`) · Vitest + Testing Library · Supabase RPC(plpgsql). 차트 라이브러리 없이 SVG.

## 시안 → 구현 대응표

"이미지 제외" = 시안의 캐릭터·코인·상자 일러스트는 그리지 않는다. 그 자리는 실제 참가자 아바타(기존 시상대) 또는 기존 SVG 아이콘(`components/ui/icon.tsx`)이다.

**화면 A — 챌린지 종료!**

| 시안 | 구현 | 데이터 |
|---|---|---|
| `<` · `GND 9월 챌린지` · `챌린지 종료!` · `28일간, 정말 수고했어요! 🔥` · 공유 아이콘 | 같은 배치. 🔥는 `flame` 아이콘, `종료!`는 라임 | 챌린지 이름·기간 일수 |
| 시상대 2·1·3 (캐릭터, 점수, 🕐 21일, 📅 37%) | 기존 `RankingPodium`(아바타·왕관·받침대) + 아래 줄 `clock 21일 · calendar 37%` | 운동일 · 평균 달성률 |
| (시안에 없음) 4위 이하 | 시상대 카드 안 아래에 한 줄씩 `4위 닉네임 점수` | 순위표 |
| `Lv.2 산책러 +1 레벨 업` · XP 막대 · `1,250 / 2,000 XP` · `>` | 같은 배치. 표기는 앱 규칙 `단계명 Lv.N`(2026-10-06 결정) | 영구 레벨: 챌린지 시작 시점 → 종료 시점 XP |
| 2×2 카드 (운동 횟수 28회 / 목표 30회 / 93% 링 …) | 같은 2×2. **내 목표**를 앞에서부터 최대 4장, 모자라면 기간 기록(운동 횟수·운동 시간·유산소 거리·총 볼륨)으로 채움 — 목표 없는 카드는 링 없이 `기간 기록` | 목표 실적 / 기간 합계 |
| 주간 달성 히트맵 (주마다 상자, 체크 원, 가로로 넘김 `>`) | 같은 배치. 상자당 원 = 주간 목표 횟수(`planned_days`), 운동한 날만큼 라임 체크, 넘치면 `+N` | 기간 운동일 |
| 획득한 보상 (코인 +200 · 뱃지 NEW · 랜덤 상자) | 같은 3칸, **일러스트 대신 아이콘**: `GND 포인트 +N` · `배지 N개`(새로 얻었으면 NEW) · `경험치 +N XP` | 기간 중 실제로 쌓인 포인트·배지·XP |
| `결과 공유하기` (라임 버튼) | 같은 버튼 | 공유 문구 |

**화면 B — 나의 챌린지 결과**

| 시안 | 구현 | 데이터 |
|---|---|---|
| `<` · `나의 챌린지 결과` · 공유 | 같은 배치 | |
| 히어로: `1위` · `종합 점수 83.2점` · `👑 상위 12%` · 말풍선 `잘했다! 계속 가자!` · `Lv.2 산책러` 배지 · XP 막대 | 같은 배치(캐릭터 자리 없음, 말풍선은 텍스트) | 순위표 · `상위 N%` = round(순위/인원×100) |
| 목표 달성률 링 3개 · `목표 3개 중 2개 달성! 👍` · 100% 넘으면 왕관 | 같은 배치, 링 수 = 내 목표 수, 👍는 `thumbsup` 아이콘 | 목표 실적 |
| 일별 활동: 날마다 회색(계획)·라임(실제) 막대 쌍, 범례, 말풍선 `10/8 · 계획 1회 · 실제 1회` | 같은 배치. 막대 높이 = 세트 수(계획 세트 / 완료 세트), 말풍선 = 그날 계획 개수 · 운동 횟수. 처음엔 마지막 운동일이 선택돼 있음 | 내 계획 · 세션 행 |
| 주요 기록 4칸 (최다 운동일 연속 12일 · 최대 운동 시간(일) 92분 9/14(일) · 최대 유산소 거리(일) · 최대 볼륨(일)) | 같은 4칸 가로 줄, 값 없으면 `-` | 세션 행 |
| 나의 성장: 선 그래프, 말풍선 `챌린지 전 23.9점` → `챌린지 후 83.2점`, x축 시작·1주…4주 | 같은 배치. 점 = **주차 끝까지의 누적 종합점수**, 시작 말풍선은 `챌린지 시작 0점` | `myScoreTrend` — 마지막 점 = 순위표 점수 |
| `다음 챌린지에서 더 높은 산을 함께 가요! 🚀` + `다음 챌린지 신청하기 >` | 같은 문구(🚀 대신 `arrow` 아이콘) + 버튼 → 기존 만들기 흐름 | |

**확인할 것 (기본값으로 계획을 짰다 — 다르면 해당 Task만 바꾼다)**

| # | 질문 | 기본값 |
|---|---|---|
| D1 | `다음 챌린지 신청하기`는 실제로 **새 챌린지 만들기**를 연다. 문구를 시안대로 둘까, `다음 챌린지 만들기`로 바꿀까 | 시안 문구 유지 |
| D2 | 시안에 없는 옛 참가자별 상세 카드(목표별 실적·참여율)는 없애고 4위 이하는 한 줄 목록으로 | 없앤다 |
| D3 | `챌린지 전` 점수 — 이번 챌린지 시작(0점)으로 할까, 지난 챌린지 점수로 할까 | 시작 0점(`챌린지 시작`) |
| D4 | 공유는 텍스트 공유로 시작, 결과 이미지 카드는 다음 단계 | 텍스트 |
| D5 | 0117 적용(RPC에 운동 시간 추가, 비파괴) | 적용 |

---

## File Structure

| 파일 | 역할 | |
|---|---|---|
| `supabase/migrations/0117_challenge_period_sessions_duration.sql` | RPC에 `duration_minutes` | 신규 |
| `src/lib/challenge.ts` | `PeriodSessionRow.durationMinutes`, 정규화, `myScoreTrend` | 수정 |
| `src/lib/challenge.test.ts` | 위 테스트 | 수정 |
| `src/lib/domain/challenge-report.ts` | 일별 합계·막대·주간 달성·주요 기록·주차·보상 요약·표기 (순수) | 신규 |
| `src/lib/domain/challenge-report.test.ts` | 위 테스트 | 신규 |
| `src/lib/challenge-rewards.ts` | 본인 XP·포인트·배지 장부 조회 | 신규 |
| `src/components/ui/icon.tsx` | `share` 아이콘 | 수정 |
| `src/components/challenge/ranking-podium.tsx` | 선택 prop `metaOf` (카드 아래 아이콘 줄) | 수정 |
| `src/components/challenge/result/*.tsx` | 부품: 머리·링·통계 카드·레벨 카드·주간 달성·보상·일별 막대·주요 기록·성장 선 | 신규 |
| `src/components/challenge/result/result-summary.tsx` | 화면 A | 신규 |
| `src/components/challenge/result/my-result-report.tsx` | 화면 B | 신규 |
| `src/components/challenge/challenge-result.tsx` | `ResultView` = 재료 계산 + A/B 전환 + 공유 | 전면 교체 |
| `src/components/challenge/challenge-result.test.tsx` | 화면 테스트 | 신규 |
| `src/components/challenge/challenge-detail.tsx` | 종료면 결과 화면만 그린다(머리 포함) | 수정 |
| `src/app/(tabs)/challenge/page.tsx` | 종료면 세션 행·내 계획을 남김 | 수정 |
| `src/app/challenge-result-qa/page.tsx` | 개발 전용 예시 데이터 화면 | 신규 |

---

### Task 1: 0117 — 기간 세션 RPC에 운동 시간 싣기

**Files:** Create `supabase/migrations/0117_challenge_period_sessions_duration.sql`

- [ ] **Step 1: 현행 정의 확인** — `docs/db-current-schema.sql`의 `-- ── get_challenge_period_sessions ──` 블록이 현행이다(0051에서 베끼지 않는다). 아래는 2026-10-07 스냅샷 본문에 `'duration_minutes', s.duration_minutes,` **한 줄만** 더한 것이다. 스냅샷과 다른 줄이 보이면 스냅샷을 따른다.

- [ ] **Step 2: 작성**

```sql
-- 0117: 챌린지 결과 화면(2026-10-07)의 '운동 시간' 재료.
-- get_challenge_period_sessions 행에 duration_minutes(서버가 완료 때 계산)를 더한다.
-- 나머지 본문·권한·필터(사진 인증·기간창·참가 상태)는 현행 그대로. 비파괴.
create or replace function public.get_challenge_period_sessions(p_challenge_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.challenges;
  v_rows jsonb;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.shares_challenge_with(p_challenge_id, (select auth.uid())) then
    raise exception 'challenge_not_found';
  end if;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'user_id', s.user_id,
      'completed_at', s.completed_at,
      'duration_minutes', s.duration_minutes,
      'tabata_minutes', s.tabata_minutes,
      'workout_exercises', coalesce((
        select jsonb_agg(jsonb_build_object(
          'exercise_type', we.exercise_type,
          'exercise_name', we.exercise_name,
          'body_part', we.body_part,
          'workout_sets', coalesce((
            select jsonb_agg(jsonb_build_object(
              'weight_kg', ws.weight_kg,
              'reps', ws.reps,
              'distance_meters', ws.distance_meters,
              'duration_seconds', ws.duration_seconds,
              'is_completed', ws.is_completed
            ))
            from public.workout_sets ws where ws.workout_exercise_id = we.id
          ), '[]'::jsonb)
        ))
        from public.workout_exercises we where we.session_id = s.id
      ), '[]'::jsonb)
    ) as row
    from public.workout_sessions s
    join public.challenge_participants cp
      on cp.user_id = s.user_id
     and cp.challenge_id = p_challenge_id
     and cp.status in ('joined', 'dropped')
    where s.status = 'completed'
      and s.deleted_at is null
      and s.completed_at >= (c.start_date - 1)::timestamptz
      and s.completed_at <  (c.end_date + 2)::timestamptz
      and (
        not c.photo_required
        or exists (select 1 from public.workout_images wi where wi.session_id = s.id)
      )
  ) t;

  return v_rows;
end $$;

revoke all on function public.get_challenge_period_sessions(uuid) from public, anon;
grant execute on function public.get_challenge_period_sessions(uuid) to authenticated, service_role;
```

- [ ] **Step 3: 적용(Supabase MCP 세션만) 후 재조회**

```sql
select position('duration_minutes' in pg_get_functiondef('public.get_challenge_period_sessions(uuid)'::regprocedure)) > 0 as has_duration,
       (select proconfig from pg_proc where oid = 'public.get_challenge_period_sessions(uuid)'::regprocedure) as cfg;
```
Expected: `has_duration = true`, `cfg = {search_path=public, pg_temp}`. 이어서 `pnpm db:snapshot`. MCP가 없으면 파일만 남기고 멈춰서 보고한다 — 화면은 적용 전에도 깨지지 않는다(운동 시간 값이 `-`로 보일 뿐).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0117_challenge_period_sessions_duration.sql docs/db-current-schema.sql
git commit -m "feat(db): 챌린지 기간 세션 RPC에 운동 시간을 싣는다 (0117)"
```

---

### Task 2: 세션 행에 `durationMinutes` 받기

**Files:** Modify `src/lib/challenge.ts` (`PeriodSessionRow` ~879, `ChallengePeriodSessionRpcRow` ~955, `normalizeChallengePeriodSessions` ~979) · Test `src/lib/challenge.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
describe("normalizeChallengePeriodSessions — duration_minutes (0117)", () => {
  const base = { user_id: "u1", completed_at: "2026-09-02T01:00:00Z", tabata_minutes: null, workout_exercises: [] };

  it("RPC가 준 운동 시간을 싣는다", () => {
    expect(normalizeChallengePeriodSessions([{ ...base, duration_minutes: 42 }])[0].durationMinutes).toBe(42);
  });

  it("0117 적용 전 응답(키 없음)도 받는다", () => {
    expect(normalizeChallengePeriodSessions([base])[0].durationMinutes).toBeUndefined();
  });

  it("숫자가 아니면 거절한다", () => {
    expect(() => normalizeChallengePeriodSessions([{ ...base, duration_minutes: "42" }])).toThrow(
      "invalid_challenge_period_sessions",
    );
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run src/lib/challenge.test.ts -t "duration_minutes"` → FAIL

- [ ] **Step 3: 구현**

`PeriodSessionRow`에 (`completedAt` 아래):

```ts
  /**
   * 세션 운동 시간(분, 서버가 완료 때 계산) — 결과 화면 재료 (0117).
   * 0117 전 응답·로컬 draft 변환에는 없다. **점수 계산에 쓰지 않는다.**
   */
  durationMinutes?: number | null;
```

`ChallengePeriodSessionRpcRow`에 `duration_minutes?: number | null;`

행 검사(`!isNullableNumber(row.tabata_minutes) ||` 아래)에:

```ts
      (row.duration_minutes !== undefined && !isNullableNumber(row.duration_minutes)) ||
```

반환 객체(`completedAt` 아래) — 키를 항상 넣으면 기존 `toEqual` 단언이 `null`과 부딪친다:

```ts
      ...(validRow.duration_minutes !== undefined ? { durationMinutes: validRow.duration_minutes } : {}),
```

- [ ] **Step 4: 통과 확인** — `pnpm vitest run src/lib/challenge.test.ts` → 전부 PASS

- [ ] **Step 5: Commit** — `git add src/lib/challenge.ts src/lib/challenge.test.ts && git commit -m "feat(challenge): 기간 세션 행에 운동 시간을 받는다"`

---

### Task 3: 결과 도메인 `challenge-report.ts`

**Files:** Create `src/lib/domain/challenge-report.ts` · Test `src/lib/domain/challenge-report.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, expect, it } from "vitest";
import {
  bestRecords,
  cheerCopy,
  dailyBars,
  dailyTotals,
  formatShortDay,
  periodRewards,
  resultShareText,
  topPercent,
  weekCutoffs,
  weeklyAchievement,
  type ReportSessionInput,
} from "./challenge-report";

const TZ = "Asia/Seoul";
const S = "2026-09-01";
const E = "2026-09-28";

function session(
  completedAt: string,
  o: Partial<{ minutes: number | null; kg: number; reps: number; km: number; done: boolean }> = {},
): ReportSessionInput {
  const done = o.done ?? true;
  return {
    completedAt,
    durationMinutes: o.minutes ?? null,
    exercises: [
      { exerciseType: "weight", sets: [{ weightKg: o.kg ?? 0, reps: o.reps ?? 0, distanceMeters: null, isCompleted: done }] },
      { exerciseType: "cardio", sets: [{ weightKg: null, reps: null, distanceMeters: (o.km ?? 0) * 1000, isCompleted: done }] },
    ],
  };
}

describe("dailyTotals", () => {
  it("날짜는 사용자 시간대로 자른다 — foldPeriodStats와 같은 자", () => {
    const m = dailyTotals([session("2026-09-01T15:30:00Z", { minutes: 30 })], S, E, TZ);
    expect([...m.keys()]).toEqual(["2026-09-02"]);
  });

  it("같은 날은 더하고 기간 밖은 버린다", () => {
    const m = dailyTotals(
      [
        session("2026-09-02T01:00:00Z", { minutes: 30, kg: 50, reps: 10, km: 2 }),
        session("2026-09-02T10:00:00Z", { minutes: 15, kg: 20, reps: 5, km: 1.5 }),
        session("2026-08-30T01:00:00Z", { minutes: 99 }),
      ],
      S, E, TZ,
    );
    expect(m.get("2026-09-02")).toEqual({
      dayKey: "2026-09-02", sessions: 2, completedSets: 4, minutes: 45, cardioKm: 3.5, volumeKg: 600,
    });
    expect(m.has("2026-08-30")).toBe(false);
  });

  it("운동 시간이 없으면 null — 0분과 다르다(0117 전)", () => {
    expect(dailyTotals([session("2026-09-02T01:00:00Z")], S, E, TZ).get("2026-09-02")?.minutes).toBeNull();
  });

  it("완료 안 한 세트는 합계에 없지만 그날은 운동한 날이다(참여율과 같은 규칙)", () => {
    const t = dailyTotals([session("2026-09-02T01:00:00Z", { kg: 50, reps: 10, km: 2, done: false })], S, E, TZ).get("2026-09-02");
    expect(t).toEqual({ dayKey: "2026-09-02", sessions: 1, completedSets: 0, minutes: null, cardioKm: 0, volumeKg: 0 });
  });
});

describe("dailyBars", () => {
  it("기간 일수만큼, 계획은 같은 날끼리 더한다, 기간 밖 계획은 버린다", () => {
    const totals = dailyTotals([session("2026-09-03T01:00:00Z", { minutes: 40 })], S, "2026-09-07", TZ);
    const bars = dailyBars(
      totals,
      [
        { planDate: "2026-09-03", setCount: 6 },
        { planDate: "2026-09-03", setCount: 4 },
        { planDate: "2026-09-05", setCount: 8 },
        { planDate: "2026-08-31", setCount: 9 },
      ],
      S, "2026-09-07",
    );
    expect(bars).toHaveLength(7);
    expect(bars[2]).toEqual({ dayKey: "2026-09-03", day: 3, planCount: 2, planSets: 10, actualCount: 1, actualSets: 2, minutes: 40 });
    expect(bars[4]).toEqual({ dayKey: "2026-09-05", day: 5, planCount: 1, planSets: 8, actualCount: 0, actualSets: 0, minutes: null });
  });
});

describe("weeklyAchievement", () => {
  it("주마다 목표 횟수 칸, 넘친 날은 extra", () => {
    const keys = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-09"];
    expect(weeklyAchievement(keys, S, "2026-09-14", 4)).toEqual([
      { week: 1, target: 4, done: 4, extra: 1 },
      { week: 2, target: 4, done: 1, extra: 0 },
    ]);
  });

  it("마지막 주가 짧으면 목표도 그 일수까지만", () => {
    const w = weeklyAchievement([], S, "2026-09-09", 5);
    expect(w[1]).toEqual({ week: 2, target: 2, done: 0, extra: 0 });
  });
});

describe("bestRecords", () => {
  it("하루 최대값과 날짜, 동률이면 이른 날", () => {
    const totals = dailyTotals(
      [
        session("2026-09-02T01:00:00Z", { minutes: 50, kg: 100, reps: 10, km: 3 }),
        session("2026-09-03T01:00:00Z", { minutes: 92, kg: 50, reps: 10, km: 3 }),
        session("2026-09-04T01:00:00Z", { minutes: 20 }),
      ],
      S, E, TZ,
    );
    expect(bestRecords(totals)).toEqual({
      longestStreak: 3,
      maxMinutes: { value: 92, dayKey: "2026-09-03" },
      maxCardioKm: { value: 3, dayKey: "2026-09-02" },
      maxVolumeKg: { value: 1000, dayKey: "2026-09-02" },
    });
  });

  it("값이 없으면 null", () => {
    const r = bestRecords(dailyTotals([session("2026-09-02T01:00:00Z")], S, E, TZ));
    expect([r.maxMinutes, r.maxCardioKm, r.maxVolumeKg]).toEqual([null, null, null]);
    expect(r.longestStreak).toBe(1);
  });
});

describe("weekCutoffs", () => {
  it("주차 끝 날짜, 마지막 주는 종료일", () => {
    expect(weekCutoffs(S, "2026-09-10")).toEqual([
      { label: "1주", endKey: "2026-09-07" },
      { label: "2주", endKey: "2026-09-10" },
    ]);
  });
});

describe("periodRewards", () => {
  const xp = (amount: number, createdAt: string, transactionType = "earn") => ({ amount, transactionType, createdAt });

  it("기간 XP·포인트·배지, 종료 뒤에 쌓인 XP는 빼고 종료 시점 레벨을 잰다", () => {
    const r = periodRewards({
      currentTotalXp: 1400,
      xpRows: [
        xp(300, "2026-09-02T01:00:00Z"),
        xp(250, "2026-09-20T01:00:00Z"),
        xp(-50, "2026-09-21T01:00:00Z", "reverse"),
        xp(200, "2026-10-02T01:00:00Z"), // 종료 뒤
      ],
      pointRows: [
        xp(120, "2026-09-05T01:00:00Z"),
        xp(80, "2026-09-06T01:00:00Z"),
        xp(500, "2026-09-07T01:00:00Z", "spend"),
        xp(30, "2026-10-03T01:00:00Z"),
      ],
      badgeEarnedAts: ["2026-09-10T01:00:00Z", "2026-10-03T01:00:00Z"],
      startDate: S,
      endDate: E,
      timeZone: TZ,
    });
    expect(r.xpGained).toBe(500); // 300 + 250 - 50
    expect(r.totalXpAtEnd).toBe(1200); // 1400 - 200
    expect(r.levelAtStart).toBe(4); // 700 XP → Lv.4 (600 이상 800 미만)
    expect(r.levelAtEnd).toBe(6); // 1200 XP → Lv.6 (1000 이상 1400 미만)
    expect(r.nextLevelXp).toBe(1400);
    expect(r.pointsEarned).toBe(200);
    expect(r.badgeCount).toBe(1);
  });

  it("reverse 금액의 부호와 상관없이 빼기로 센다", () => {
    const a = periodRewards({ currentTotalXp: 100, xpRows: [xp(100, "2026-09-02T01:00:00Z"), xp(-30, "2026-09-03T01:00:00Z", "reverse")], pointRows: [], badgeEarnedAts: [], startDate: S, endDate: E, timeZone: TZ });
    const b = periodRewards({ currentTotalXp: 100, xpRows: [xp(100, "2026-09-02T01:00:00Z"), xp(30, "2026-09-03T01:00:00Z", "reverse")], pointRows: [], badgeEarnedAts: [], startDate: S, endDate: E, timeZone: TZ });
    expect(a.xpGained).toBe(70);
    expect(b.xpGained).toBe(70);
  });
});

describe("표기", () => {
  it("formatShortDay — 9/14(월)", () => {
    expect(formatShortDay("2026-09-14")).toBe("9/14(월)");
    expect(formatShortDay("2026-09-18")).toBe("9/18(금)");
  });

  it("topPercent — 순위/인원, 최소 1%", () => {
    expect(topPercent(1, 3)).toBe(33);
    expect(topPercent(1, 200)).toBe(1);
    expect(topPercent(3, 3)).toBe(100);
  });

  it("cheerCopy — 1위는 시안 문구", () => {
    expect(cheerCopy(1)).toEqual(["잘했다!", "계속 가자!"]);
  });

  it("resultShareText", () => {
    expect(
      resultShareText({ challengeName: "9월 챌린지", rank: 1, total: 3, overall: 83.24, workoutDays: 20, periodDays: 28 }),
    ).toBe("GND 「9월 챌린지」 결과\n3명 중 1위 · 종합 83.2점\n28일 중 20일 운동했어요");
  });
});
```

(레벨 기준값은 `domain/progression.ts`의 `CUTS`: Lv.4 = 600, Lv.5 = 800, Lv.6 = 1000, Lv.7 = 1400.)

- [ ] **Step 2: 실패 확인** — `pnpm vitest run src/lib/domain/challenge-report.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```ts
/**
 * 챌린지 결과 화면 도메인 (2026-10-07 사용자 시안).
 *
 * I/O 없음. 재료는 `get_challenge_period_sessions` 행(점수와 같은 원천), 내 계획,
 * 본인 XP·포인트·배지 장부뿐이다.
 *
 * ⚠️ 종합점수를 여기서 만들지 않는다 — `scoreParticipant`만 만든다(주차 추세도 `myScoreTrend`가 그 길을 지난다).
 * ⚠️ 날짜는 `foldPeriodStats`와 같은 `dayKey(…, timeZone)`로 자른다. 다르게 자르면 화면의 운동일과
 *    점수의 참여율이 서로 다른 말을 한다.
 * ⚠️ 주차는 달력 주가 아니라 **시작일부터 7일씩**이다(`challengeLevel` 블록과 같은 자).
 * ⚠️ 보상 칸은 새 지급이 아니다. 기간 동안 원래 쌓인 장부를 잘라 보여 줄 뿐이다.
 */
import { longestConsecutiveDays } from "./challenge-milestones";
import { inclusiveDays } from "./challenge-time";
import { getLevelFromTotalXp, getLevelProgress } from "./progression";
import { dayKey } from "./time";
import { addDaysToDateKey } from "./workout-plan";

/** `PeriodSessionRow`가 그대로 들어온다 */
export type ReportSessionInput = {
  completedAt: string;
  durationMinutes?: number | null;
  exercises: readonly {
    exerciseType: "weight" | "bodyweight" | "cardio";
    sets: readonly { weightKg: number | null; reps: number | null; distanceMeters: number | null; isCompleted: boolean }[];
  }[];
};

export type DayTotals = {
  dayKey: string;
  sessions: number;
  completedSets: number;
  /** 운동 시간 합(분). 시간이 기록된 세션이 없으면 null — 0분과 다르다 */
  minutes: number | null;
  cardioKm: number;
  volumeKg: number;
};

export function dailyTotals(
  sessions: readonly ReportSessionInput[],
  startDate: string,
  endDate: string,
  timeZone: string,
): Map<string, DayTotals> {
  const out = new Map<string, DayTotals>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.completedAt), timeZone);
    if (key < startDate || key > endDate) continue;
    const t = out.get(key) ?? { dayKey: key, sessions: 0, completedSets: 0, minutes: null, cardioKm: 0, volumeKg: 0 };
    t.sessions += 1;
    if (s.durationMinutes != null && s.durationMinutes > 0) t.minutes = (t.minutes ?? 0) + s.durationMinutes;
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (!set.isCompleted) continue;
        t.completedSets += 1;
        if (ex.exerciseType === "weight") t.volumeKg += Number(set.weightKg ?? 0) * (set.reps ?? 0);
        else if (ex.exerciseType === "cardio") t.cardioKm += Number(set.distanceMeters ?? 0) / 1000;
      }
    }
    out.set(key, t);
  }
  return out;
}

export type PlanInput = { planDate: string; setCount: number };

export type DailyBar = {
  dayKey: string;
  /** 1부터 — x축 */
  day: number;
  planCount: number;
  planSets: number;
  actualCount: number;
  actualSets: number;
  minutes: number | null;
};

export function dailyBars(
  totals: ReadonlyMap<string, DayTotals>,
  plans: readonly PlanInput[],
  startDate: string,
  endDate: string,
): DailyBar[] {
  const planByDay = new Map<string, { count: number; sets: number }>();
  for (const p of plans) {
    if (p.planDate < startDate || p.planDate > endDate) continue;
    const v = planByDay.get(p.planDate) ?? { count: 0, sets: 0 };
    v.count += 1;
    v.sets += p.setCount;
    planByDay.set(p.planDate, v);
  }
  const n = Math.max(0, inclusiveDays(startDate, endDate));
  return Array.from({ length: n }, (_, i) => {
    const key = addDaysToDateKey(startDate, i);
    const t = totals.get(key);
    const p = planByDay.get(key);
    return {
      dayKey: key,
      day: i + 1,
      planCount: p?.count ?? 0,
      planSets: p?.sets ?? 0,
      actualCount: t?.sessions ?? 0,
      actualSets: t?.completedSets ?? 0,
      minutes: t?.minutes ?? null,
    };
  });
}

export type WeekAchievement = { week: number; target: number; done: number; extra: number };

/** 시안 `주간 달성 히트맵` — 주마다 목표 횟수만큼 칸, 운동한 날만큼 채움 */
export function weeklyAchievement(
  workoutDayKeys: readonly string[],
  startDate: string,
  endDate: string,
  weeklyTarget: number,
): WeekAchievement[] {
  const days = new Set(workoutDayKeys);
  const n = Math.max(0, inclusiveDays(startDate, endDate));
  const out: WeekAchievement[] = [];
  for (let w = 0; w * 7 < n; w++) {
    const len = Math.min(7, n - w * 7);
    let count = 0;
    for (let d = 0; d < len; d++) if (days.has(addDaysToDateKey(startDate, w * 7 + d))) count++;
    const target = Math.max(1, Math.min(weeklyTarget, len));
    out.push({ week: w + 1, target, done: Math.min(count, target), extra: Math.max(0, count - target) });
  }
  return out;
}

export type BestRecord = { value: number; dayKey: string } | null;
export type BestRecords = {
  longestStreak: number;
  maxMinutes: BestRecord;
  maxCardioKm: BestRecord;
  maxVolumeKg: BestRecord;
};

function maxBy(totals: ReadonlyMap<string, DayTotals>, pick: (t: DayTotals) => number | null): BestRecord {
  let best: BestRecord = null;
  for (const t of [...totals.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey))) {
    const v = pick(t);
    if (v == null || v <= 0) continue;
    if (best === null || v > best.value) best = { value: v, dayKey: t.dayKey };
  }
  return best;
}

export function bestRecords(totals: ReadonlyMap<string, DayTotals>): BestRecords {
  return {
    // 마일스톤과 같은 함수 — 달력상 하루도 안 빠진 날 수(앱 스트릭 5일 유예와 다르다)
    longestStreak: longestConsecutiveDays([...totals.keys()]),
    maxMinutes: maxBy(totals, (t) => t.minutes),
    maxCardioKm: maxBy(totals, (t) => t.cardioKm),
    maxVolumeKg: maxBy(totals, (t) => t.volumeKg),
  };
}

export function weekCutoffs(startDate: string, endDate: string): { label: string; endKey: string }[] {
  const n = Math.max(0, inclusiveDays(startDate, endDate));
  const out: { label: string; endKey: string }[] = [];
  for (let w = 1; (w - 1) * 7 < n; w++) {
    out.push({ label: `${w}주`, endKey: addDaysToDateKey(startDate, Math.min(w * 7, n) - 1) });
  }
  return out;
}

export type LedgerRow = { amount: number; transactionType: string; createdAt: string };

export type PeriodRewards = {
  xpGained: number;
  pointsEarned: number;
  badgeCount: number;
  levelAtStart: number;
  levelAtEnd: number;
  stageNameAtEnd: string;
  totalXpAtEnd: number;
  /** 다음 레벨 누적 XP. 최고 레벨이면 null */
  nextLevelXp: number | null;
  /** 0~100 */
  percentAtEnd: number;
};

/**
 * 시안 `Lv.2 산책러 +1 레벨 업 · 1,250 / 2,000 XP`와 `획득한 보상`.
 * 장부에는 **지금까지** 행이 있으므로, 종료 뒤에 쌓인 XP를 빼서 종료 시점 값을 만든다.
 * reverse(회수)는 금액 부호와 상관없이 뺀다 — 장부 부호 규칙에 묶이지 않게.
 */
export function periodRewards(input: {
  currentTotalXp: number;
  xpRows: readonly LedgerRow[];
  pointRows: readonly LedgerRow[];
  badgeEarnedAts: readonly string[];
  startDate: string;
  endDate: string;
  timeZone: string;
}): PeriodRewards {
  const keyOf = (iso: string) => dayKey(new Date(iso), input.timeZone);
  const net = (r: LedgerRow) => (r.transactionType === "reverse" ? -Math.abs(r.amount) : r.amount);
  let afterEnd = 0;
  let inPeriod = 0;
  for (const r of input.xpRows) {
    const k = keyOf(r.createdAt);
    if (k > input.endDate) afterEnd += net(r);
    else if (k >= input.startDate) inPeriod += net(r);
  }
  const totalXpAtEnd = Math.max(0, input.currentTotalXp - afterEnd);
  const totalXpAtStart = Math.max(0, totalXpAtEnd - inPeriod);
  const end = getLevelProgress(totalXpAtEnd);
  const inRange = (iso: string) => {
    const k = keyOf(iso);
    return k >= input.startDate && k <= input.endDate;
  };
  return {
    xpGained: inPeriod,
    pointsEarned: input.pointRows
      .filter((r) => r.transactionType === "earn" && inRange(r.createdAt))
      .reduce((s, r) => s + r.amount, 0),
    badgeCount: input.badgeEarnedAts.filter(inRange).length,
    levelAtStart: getLevelFromTotalXp(totalXpAtStart).level,
    levelAtEnd: end.currentLevel,
    stageNameAtEnd: end.stageName,
    totalXpAtEnd,
    nextLevelXp: end.nextLevelRequiredXp,
    percentAtEnd: end.percent,
  };
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 시안 표기 `9/14(일)` */
export function formatShortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** 시안 `상위 12%` — 순위/인원, 최소 1% */
export function topPercent(rank: number, total: number): number {
  if (total <= 0) return 100;
  return Math.max(1, Math.round((rank / total) * 100));
}

/** 시안 말풍선 두 줄 */
export function cheerCopy(rank: number): [string, string] {
  if (rank === 1) return ["잘했다!", "계속 가자!"];
  if (rank <= 3) return ["좋았어!", "한 칸만 더!"];
  return ["수고했어!", "다음엔 더 위로!"];
}

export function resultShareText(input: {
  challengeName: string;
  rank: number;
  total: number;
  overall: number;
  workoutDays: number;
  periodDays: number;
}): string {
  return [
    `GND 「${input.challengeName}」 결과`,
    `${input.total}명 중 ${input.rank}위 · 종합 ${input.overall.toFixed(1)}점`,
    `${input.periodDays}일 중 ${input.workoutDays}일 운동했어요`,
  ].join("\n");
}
```

- [ ] **Step 4: 통과 확인** — `pnpm vitest run src/lib/domain/challenge-report.test.ts` → PASS

- [ ] **Step 5: Commit** — `git add src/lib/domain/challenge-report.ts src/lib/domain/challenge-report.test.ts && git commit -m "feat(challenge): 결과 화면 도메인 — 일별 활동·주간 달성·주요 기록·기간 보상"`

---

### Task 4: 주차별 누적 점수 `myScoreTrend`

**Files:** Modify `src/lib/challenge.ts` (`buildParticipantInput` 아래, import `weekCutoffs`) · Test `src/lib/challenge.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
describe("myScoreTrend", () => {
  const goal = { id: "g1", user_id: "u1", goal_type: "workout_days", target_value: 4, qualifier: null, planned_days: 2, unit: "일" } as unknown as UserGoal;
  const row = (iso: string, userId = "u1"): PeriodSessionRow => ({ userId, completedAt: iso, exercises: [] });
  const rows = [row("2026-09-01T01:00:00Z"), row("2026-09-03T01:00:00Z"), row("2026-09-09T01:00:00Z"), row("2026-09-10T01:00:00Z")];
  const args = { userId: "u1", goals: [goal], startDate: "2026-09-01", endDate: "2026-09-14", timeZone: "Asia/Seoul" };

  it("시작 0점 → 주차 누적, 마지막 점 = 순위표 점수", () => {
    const trend = myScoreTrend({ rows, ...args });
    expect(trend.map((p) => p.label)).toEqual(["시작", "1주", "2주"]);
    expect(trend[0].overall).toBe(0);
    expect(trend[1].overall).toBeLessThan(trend[2].overall);
    const stats = foldPeriodStats(rows, "2026-09-01", "2026-09-14", "Asia/Seoul").get("u1")!;
    const [ranked] = rankParticipants([buildParticipantInput({ userId: "u1", goals: [goal], stats, periodDays: 14 })]);
    expect(trend[2].overall).toBeCloseTo(ranked.overall, 9);
  });

  it("남의 세션은 안 들어간다", () => {
    expect(myScoreTrend({ rows: [...rows, row("2026-09-02T01:00:00Z", "u2")], ...args })).toEqual(myScoreTrend({ rows, ...args }));
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run src/lib/challenge.test.ts -t "myScoreTrend"` → FAIL

- [ ] **Step 3: 구현**

```ts
/**
 * 결과 화면 「나의 성장」 — 주차 끝마다 그때까지의 기록으로 잰 종합점수 (2026-10-07).
 *
 * ⚠️ 점수를 따로 조립하지 않는다. `foldPeriodStats` → `buildParticipantInput` → `scoreParticipant`,
 *    순위표와 같은 길이다. 그래서 마지막 점이 시상대 점수와 같다(테스트가 묶는다).
 *    기간 일수는 **전체 기간** — 1주차 점수는 "4주 목표 중 1주 치"로 잰다.
 */
export function myScoreTrend(input: {
  rows: readonly PeriodSessionRow[];
  userId: string;
  goals: UserGoal[];
  startDate: string;
  endDate: string;
  timeZone: string;
}): { label: string; overall: number }[] {
  const mine = input.rows.filter((r) => r.userId === input.userId);
  const periodDays = inclusiveDays(input.startDate, input.endDate);
  const scoreUntil = (endKey: string) =>
    scoreParticipant(
      buildParticipantInput({
        userId: input.userId,
        goals: input.goals,
        stats: foldPeriodStats(mine, input.startDate, endKey, input.timeZone).get(input.userId) ?? EMPTY_STATS,
        periodDays,
      }),
    ).overall;
  return [
    { label: "시작", overall: 0 },
    ...weekCutoffs(input.startDate, input.endDate).map((c) => ({ label: c.label, overall: scoreUntil(c.endKey) })),
  ];
}
```

- [ ] **Step 4: 통과** — `pnpm vitest run src/lib/challenge.test.ts` → PASS

- [ ] **Step 5: Commit** — `git commit -am "feat(challenge): 주차별 누적 종합점수 — 순위표와 같은 길로 잰다"` (변경 파일 두 개만 staged인지 `git status`로 먼저 확인)

---

### Task 5: 본인 장부 조회 `challenge-rewards.ts`

**Files:** Create `src/lib/challenge-rewards.ts`

- [ ] **Step 1: 작성** (I/O만, 계산은 `periodRewards`)

```ts
/**
 * 결과 화면 레벨·보상 칸 재료 — 본인 XP·포인트·배지 장부 (2026-10-07).
 *
 * RLS가 본인 행만 준다(`getRecentXpTransactions`·`getMyBadges`와 같은 전제). 남의 보상은 안 본다.
 * 시작 하루 전부터 **지금까지** 받는다 — 종료 뒤에 쌓인 XP를 빼야 종료 시점 레벨이 나온다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LedgerRow } from "@/lib/domain/challenge-report";
import { addDaysToDateKey } from "@/lib/domain/workout-plan";

export type MyRewardLedgers = {
  currentTotalXp: number;
  xpRows: LedgerRow[];
  pointRows: LedgerRow[];
  badgeEarnedAts: string[];
};

type Raw = { amount: number; transaction_type: string; created_at: string };
const toLedger = (r: Raw): LedgerRow => ({ amount: r.amount, transactionType: r.transaction_type, createdAt: r.created_at });

export async function getMyRewardLedgers(startDate: string): Promise<MyRewardLedgers> {
  const supabase = getSupabaseBrowserClient();
  const since = `${addDaysToDateKey(startDate, -1)}T00:00:00Z`;
  const [progress, xp, pt, badges] = await Promise.all([
    supabase.from("user_progress").select("total_xp").maybeSingle(),
    supabase.from("xp_transactions").select("amount, transaction_type, created_at").gte("created_at", since),
    supabase.from("point_transactions").select("amount, transaction_type, created_at").gte("created_at", since),
    supabase.from("user_badges").select("earned_at").gte("earned_at", since),
  ]);
  if (progress.error) throw progress.error;
  if (xp.error) throw xp.error;
  if (pt.error) throw pt.error;
  if (badges.error) throw badges.error;
  return {
    currentTotalXp: progress.data?.total_xp ?? 0,
    xpRows: ((xp.data ?? []) as Raw[]).map(toLedger),
    pointRows: ((pt.data ?? []) as Raw[]).map(toLedger),
    badgeEarnedAts: (badges.data ?? []).map((b) => b.earned_at as string),
  };
}
```

- [ ] **Step 2:** `pnpm typecheck` → 이 파일 오류 0
- [ ] **Step 3: Commit** — `git add src/lib/challenge-rewards.ts && git commit -m "feat(challenge): 결과 화면용 본인 XP·포인트·배지 장부 조회"`

---

### Task 6: 아이콘 · 시상대 아래 줄

**Files:** Modify `src/components/ui/icon.tsx` (`EXTRA`), `src/components/challenge/ranking-podium.tsx`

- [ ] **Step 1:** `EXTRA`에 `share: "M12 3V15 M7 8L12 3L17 8 M5 12V21H19V12",` (24×24·1.8px 규칙, 결과 공유 2026-10-07)

- [ ] **Step 2:** `RankingPodium` props에 선택 prop 추가 — 진행 중 실시간 랭킹은 안 넘기므로 그대로다

```ts
  /** 점수 아래 아이콘 줄(결과 화면의 `🕐 21일 · 📅 37%`). 없으면 안 그린다 */
  metaOf?: (userId: string) => React.ReactNode;
```

`{secondary && …}` 줄 바로 아래:

```tsx
                {metaOf?.(r.userId)}
```

(`import type React from "react"` 또는 `import type { ReactNode } from "react"`로 타입 맞춤)

- [ ] **Step 3:** `pnpm vitest run src/components/challenge && pnpm typecheck` → 기존 PASS
- [ ] **Step 4: Commit** — `git add src/components/ui/icon.tsx src/components/challenge/ranking-podium.tsx && git commit -m "feat(challenge): 공유 아이콘·시상대 아래 줄 자리"`

---

### Task 7: 부품 (시안 배치 그대로)

**Files:** Create `src/components/challenge/result/` 아래 파일들

공통: 색은 토큰만(`accent` 실제, `faint`/`surface-3` 계획·빈칸, `gold` 1위·보상 숫자). 막대 끝 둥글게, 선 2px, 점 8px. 시리즈 2개는 범례 필수. 값은 말풍선으로(모든 막대에 숫자를 찍지 않는다).

- [ ] **Step 1: `result-header.tsx`**

```tsx
import { Icon } from "@/components/ui/icon";

export function ResultHeader({ title, onBack, onShare }: { title: string; onBack: () => void; onShare: () => void }) {
  return (
    <header className="flex h-11 items-center">
      <button type="button" onClick={onBack} aria-label="뒤로" className="grid h-10 w-10 place-items-center rounded-full">
        <Icon name="back" size={22} />
      </button>
      <p className="min-w-0 flex-1 truncate text-center text-[15px] font-extrabold">{title}</p>
      <button type="button" onClick={onShare} aria-label="결과 공유" className="grid h-10 w-10 place-items-center rounded-full">
        <Icon name="share" size={21} />
      </button>
    </header>
  );
}
```

- [ ] **Step 2: `goal-ring.tsx`**

```tsx
/** 달성률 링 — 100%를 넘으면 링은 꽉 찬 데서 멈추고 숫자는 실제 %를 말한다 */
export function GoalRing({ rate, size = 72, stroke = 7 }: { rate: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const pct = Math.round(rate * 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`달성률 ${pct}%`} className="flex-none">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * Math.min(Math.max(rate, 0), 1)} ${c}`} transform={`rotate(-90 ${mid} ${mid})`} />
      <text x={mid} y={mid} textAnchor="middle" dominantBaseline="central" fill="var(--text)"
        fontSize={size >= 70 ? 16 : 13} fontWeight={800} className="font-mono">
        {pct}%
      </text>
    </svg>
  );
}
```

- [ ] **Step 3: `stat-card.tsx`** (화면 A 2×2)

```tsx
import { Icon } from "@/components/ui/icon";
import { GoalRing } from "./goal-ring";

type IconName = Parameters<typeof Icon>[0]["name"];
export type StatCardData = { key: string; icon: IconName; label: string; value: string; unit: string; sub: string; rate: number | null };

export function StatCard({ s }: { s: StatCardData }) {
  return (
    <div data-testid="stat-card" className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-3.5 shadow-card">
      <div className="min-w-0">
        <p className="flex items-center gap-1 truncate text-[12px] font-bold text-muted">
          <Icon name={s.icon} size={15} className="flex-none text-accent" />{s.label}
        </p>
        <p className="mt-1.5 font-mono text-[24px] font-black leading-none">
          {s.value}<span className="ml-0.5 text-[13px] font-bold">{s.unit}</span>
        </p>
        <p className="mt-1 truncate text-[11px] text-muted">{s.sub}</p>
      </div>
      {s.rate !== null && <GoalRing rate={s.rate} size={58} stroke={6} />}
    </div>
  );
}
```

- [ ] **Step 4: `level-card.tsx`** (화면 A 레벨 줄 · 화면 B 히어로 오른쪽)

```tsx
import { Icon } from "@/components/ui/icon";
import type { PeriodRewards } from "@/lib/domain/challenge-report";

/** 육각 배지 — 이미지 대신 SVG */
export function LevelHex({ level, size = 44 }: { level: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className="flex-none">
      <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" fill="var(--accent-weak)" stroke="var(--accent)" strokeWidth={2} />
      <text x={22} y={23} textAnchor="middle" dominantBaseline="central" fill="var(--accent)" fontSize={12} fontWeight={900}>
        Lv.{level}
      </text>
    </svg>
  );
}

export function XpBar({ r }: { r: PeriodRewards }) {
  return (
    <>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, r.percentAtEnd))}%` }} />
      </div>
      <p className="mt-1 text-right font-mono text-[11px] text-muted">
        <b className="text-text">{r.totalXpAtEnd.toLocaleString()}</b>
        {r.nextLevelXp !== null && ` / ${r.nextLevelXp.toLocaleString()} XP`}
      </p>
    </>
  );
}

export function LevelCard({ r, onOpen }: { r: PeriodRewards; onOpen: () => void }) {
  const gained = r.levelAtEnd - r.levelAtStart;
  return (
    <button type="button" onClick={onOpen} aria-label="나의 챌린지 결과 보기"
      className="flex w-full items-center gap-3 rounded-card border border-accent/40 bg-surface p-3.5 text-left shadow-card">
      <LevelHex level={r.levelAtEnd} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold">
          {r.stageNameAtEnd} Lv.{r.levelAtEnd}
          {gained > 0 && <span className="ml-1.5 text-accent">+{gained} 레벨 업!</span>}
        </p>
        <div className="mt-1.5"><XpBar r={r} /></div>
      </div>
      <Icon name="chevron" size={18} className="flex-none text-muted" />
    </button>
  );
}
```

- [ ] **Step 5: `weekly-heatmap.tsx`** (주 상자 가로 넘김)

```tsx
import { Icon } from "@/components/ui/icon";
import type { WeekAchievement } from "@/lib/domain/challenge-report";

export function WeeklyHeatmap({ weeks }: { weeks: WeekAchievement[] }) {
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {weeks.map((w) => (
        <div key={w.week} data-testid="heat-week" className="flex-none snap-start rounded-card-sm border border-line bg-surface-2 px-3 py-2.5">
          <p className="text-center text-[11px] font-bold text-muted">{w.week}주</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {Array.from({ length: w.target }, (_, i) => (
              <span key={i} data-done={i < w.done}
                className={`grid h-[22px] w-[22px] place-items-center rounded-full ${i < w.done ? "bg-accent text-accent-ink" : "bg-surface-3 text-faint"}`}>
                <Icon name="check" size={12} strokeWidth={3} />
              </span>
            ))}
            {w.extra > 0 && <span className="text-[11px] font-bold text-accent">+{w.extra}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: `rewards-row.tsx`** (일러스트 대신 아이콘)

```tsx
import { Icon } from "@/components/ui/icon";
import type { PeriodRewards } from "@/lib/domain/challenge-report";

export function RewardsRow({ r }: { r: PeriodRewards }) {
  const tiles = [
    { key: "points", icon: "spark" as const, title: "GND 포인트", value: `+${r.pointsEarned.toLocaleString()}`, isNew: false },
    { key: "badges", icon: "award" as const, title: "배지", value: `${r.badgeCount}개`, isNew: r.badgeCount > 0 },
    { key: "xp", icon: "level" as const, title: "경험치", value: `+${r.xpGained.toLocaleString()} XP`, isNew: false },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <div key={t.key} data-testid="reward-tile" className="relative flex flex-col items-center gap-1.5 rounded-card-sm border border-line bg-surface-2 px-2 py-3 text-center">
          {t.isNew && <span className="absolute right-1.5 top-1.5 rounded-full bg-gold px-1.5 text-[9.5px] font-black text-accent-ink">NEW</span>}
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gold-weak text-gold">
            <Icon name={t.icon} size={26} />
          </span>
          <p className="text-[11.5px] font-bold">{t.title}</p>
          <p className="font-mono text-[15px] font-black text-gold">{t.value}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: `daily-activity-chart.tsx`** (계획·실제 막대 쌍 + 말풍선)

```tsx
"use client";

import { useState } from "react";
import { formatShortDay, type DailyBar } from "@/lib/domain/challenge-report";

const SLOT = 10;
const BW = 3.6;
const H = 88;

/** 시안 `일별 활동`. 높이 = 세트 수(계획 세트 / 완료 세트), 말풍선 = 계획 개수 · 운동 횟수 */
export function DailyActivityChart({ bars }: { bars: DailyBar[] }) {
  const lastWorked = [...bars].reverse().find((b) => b.actualCount > 0);
  const [sel, setSel] = useState<number | null>(lastWorked ? lastWorked.day - 1 : null);
  const max = Math.max(1, ...bars.flatMap((b) => [b.planSets, b.actualSets]));
  const h = (v: number, present: boolean) => (present ? Math.max(3, (v / max) * H) : 0);
  const width = bars.length * SLOT;
  const picked = sel === null ? null : bars[sel];
  const left = sel === null ? 0 : Math.min(86, Math.max(14, ((sel + 0.5) / bars.length) * 100));
  const ticks = bars.filter((b) => b.day === 1 || b.day % 5 === 0 || b.day === bars.length);

  return (
    <div className="relative pt-14">
      {picked && (
        <div role="status" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[10px] border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[10.5px] leading-snug shadow-card" style={{ left: `${left}%` }}>
          <p className="font-bold">{formatShortDay(picked.dayKey)}</p>
          <p className="flex items-center gap-1 text-muted"><i className="inline-block h-1.5 w-1.5 rounded-full bg-faint" />계획 {picked.planCount}회</p>
          <p className="flex items-center gap-1 text-muted"><i className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />실제 {picked.actualCount}회</p>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${H + 16}`} className="w-full" role="img" aria-label={`일별 활동, ${bars.filter((b) => b.actualCount > 0).length}일 운동`}>
        {[0.33, 0.66].map((f) => (
          <line key={f} x1={0} x2={width} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="2 3" />
        ))}
        <line x1={0} x2={width} y1={H + 0.5} y2={H + 0.5} stroke="var(--line-strong)" />
        {bars.map((b, i) => {
          const x = i * SLOT + 1.2;
          const ph = h(b.planSets, b.planCount > 0);
          const ah = h(b.actualSets, b.actualCount > 0);
          return (
            <g key={b.dayKey} onClick={() => setSel(sel === i ? null : i)} className="cursor-pointer">
              <title>{`${formatShortDay(b.dayKey)} 계획 ${b.planCount}회 · 실제 ${b.actualCount}회`}</title>
              <rect x={i * SLOT} y={0} width={SLOT} height={H} fill="transparent" />
              {sel === i && <line x1={x + BW} x2={x + BW} y1={0} y2={H} stroke="var(--line-strong)" strokeDasharray="2 2" />}
              {ph > 0 && <rect x={x} y={H - ph} width={BW} height={ph} rx={1.8} fill="var(--faint)" opacity={0.6} />}
              {ah > 0 && <rect x={x + BW + 0.6} y={H - ah} width={BW} height={ah} rx={1.8} fill="var(--accent)" />}
            </g>
          );
        })}
        {ticks.map((b) => (
          <text key={b.day} x={(b.day - 1) * SLOT + SLOT / 2} y={H + 13} textAnchor="middle" fontSize={8} fill="var(--muted)">{b.day}</text>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 8: `best-records.tsx`** (4칸 가로 줄)

```tsx
import { Icon } from "@/components/ui/icon";
import { formatShortDay, type BestRecords as Records } from "@/lib/domain/challenge-report";

export function BestRecords({ records }: { records: Records }) {
  const tiles = [
    { icon: "flame" as const, label: "최다 운동일", value: records.longestStreak > 0 ? `연속 ${records.longestStreak}일` : "-", day: null },
    { icon: "clock" as const, label: "최대 운동 시간(일)", value: records.maxMinutes ? `${Math.round(records.maxMinutes.value)}분` : "-", day: records.maxMinutes?.dayKey ?? null },
    { icon: "shoe" as const, label: "최대 유산소 거리(일)", value: records.maxCardioKm ? `${records.maxCardioKm.value.toFixed(1)}km` : "-", day: records.maxCardioKm?.dayKey ?? null },
    { icon: "dumbbell" as const, label: "최대 볼륨(일)", value: records.maxVolumeKg ? `${Math.round(records.maxVolumeKg.value).toLocaleString()}kg` : "-", day: records.maxVolumeKg?.dayKey ?? null },
  ];
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {tiles.map((t) => (
        <div key={t.label} data-testid="best-record" className="flex min-w-[84px] flex-1 flex-col items-center gap-1 rounded-card-sm border border-line bg-surface-2 px-1.5 py-3 text-center">
          <Icon name={t.icon} size={22} className="text-accent" />
          <p className="text-[10.5px] leading-tight text-muted">{t.label}</p>
          <p className="font-mono text-[14.5px] font-extrabold">{t.value}</p>
          {t.day && <p className="text-[10px] text-faint">{formatShortDay(t.day)}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: `score-trend-chart.tsx`** (말풍선 시작·끝)

```tsx
const W = 320;
const H = 150;
const PAD = { l: 18, r: 18, t: 44, b: 22 };

function Bubble({ x, y, title, value, strong }: { x: number; y: number; title: string; value: string; strong: boolean }) {
  const w = 64;
  const bx = Math.min(W - w - 2, Math.max(2, x - w / 2));
  return (
    <g>
      <rect x={bx} y={y - 40} width={w} height={32} rx={8} fill="var(--surface-2)" stroke={strong ? "var(--accent)" : "var(--line-strong)"} />
      <text x={bx + w / 2} y={y - 28} textAnchor="middle" fontSize={8.5} fill="var(--muted)">{title}</text>
      <text x={bx + w / 2} y={y - 15} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={strong ? "var(--accent)" : "var(--text)"} className="font-mono">{value}</text>
    </g>
  );
}

/** 시안 `나의 성장` — 주차 끝까지의 누적 종합점수 */
export function ScoreTrendChart({ points }: { points: { label: string; overall: number }[] }) {
  if (points.length < 2) return null;
  const top = Math.max(100, ...points.map((p) => p.overall));
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const last = points.length - 1;
  const line = points.map((p, i) => `${x(i)},${y(p.overall)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`종합점수 ${points[0].overall.toFixed(1)}점에서 ${points[last].overall.toFixed(1)}점`}>
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity={0.35} />
          <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
      <polygon points={`${x(0)},${y(0)} ${line} ${x(last)},${y(0)}`} fill="url(#trend-fill)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.overall)} r={i === last ? 5 : 4} fill={i === 0 ? "var(--text)" : "var(--accent)"} stroke="var(--surface)" strokeWidth={2} />
          <text x={x(i)} y={H - 5} textAnchor="middle" fontSize={10} fill="var(--muted)">{p.label}</text>
        </g>
      ))}
      <Bubble x={x(0)} y={y(points[0].overall)} title="챌린지 시작" value={`${points[0].overall.toFixed(1)}점`} strong={false} />
      <Bubble x={x(last)} y={y(points[last].overall)} title="챌린지 후" value={`${points[last].overall.toFixed(1)}점`} strong />
    </svg>
  );
}
```

- [ ] **Step 10:** `pnpm typecheck && pnpm lint src/components/challenge/result` → 이 폴더 오류 0
- [ ] **Step 11: Commit** — `git add src/components/challenge/result && git commit -m "feat(challenge): 결과 화면 부품 — 시안 배치의 링·카드·히트맵·보상·막대·기록·성장 선"`

---

### Task 8: 화면 A · 화면 B

**Files:** Create `result/result-summary.tsx`, `result/my-result-report.tsx`

- [ ] **Step 1: 화면 A `result-summary.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { PeriodRewards, WeekAchievement } from "@/lib/domain/challenge-report";
import { LevelCard } from "./level-card";
import { ResultHeader } from "./result-header";
import { RewardsRow } from "./rewards-row";
import { StatCard, type StatCardData } from "./stat-card";
import { WeeklyHeatmap } from "./weekly-heatmap";

const card = "rounded-card border border-line bg-surface p-4 shadow-card";

export function ResultSummary(props: {
  challengeName: string;
  periodDays: number;
  /** 기존 RankingPodium + 4위 이하 줄 — 부르는 쪽이 만든다 */
  podium: ReactNode;
  /** 목표를 안 건 사람은 null — 내 칸들을 숨긴다 */
  mine: { stats: StatCardData[]; weeks: WeekAchievement[] } | null;
  /** 장부 조회 전·실패면 null — 레벨·보상 칸만 숨는다 */
  rewards: PeriodRewards | null;
  shareNote: string | null;
  onBack: () => void;
  onShare: () => void;
  onOpenReport: () => void;
}) {
  const { mine, rewards } = props;
  return (
    <div className="flex flex-col gap-3 pb-10">
      <ResultHeader title="" onBack={props.onBack} onShare={props.onShare} />
      <section className="-mt-9 text-center">
        <p className="text-[12.5px] font-bold text-muted">{props.challengeName}</p>
        <h2 className="mt-1 text-[32px] font-black leading-tight">
          챌린지 <span className="text-accent">종료!</span>
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1 text-[13.5px] text-muted">
          {props.periodDays}일간, 정말 수고했어요! <Icon name="flame" size={15} className="text-gold" filled />
        </p>
      </section>

      <section className="rounded-card border border-line-strong bg-surface px-2 pb-3 pt-2 shadow-card">{props.podium}</section>

      {mine && rewards && <LevelCard r={rewards} onOpen={props.onOpenReport} />}
      {mine && !rewards && (
        <button type="button" onClick={props.onOpenReport} className={`${card} flex items-center justify-between text-[13.5px] font-extrabold`}>
          나의 챌린지 결과 보기 <Icon name="chevron" size={18} className="text-muted" />
        </button>
      )}

      {mine && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {mine.stats.map((s) => <StatCard key={s.key} s={s} />)}
          </div>
          <section className={card}>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">주간 달성 히트맵</h3>
              <span className="text-[11px] text-muted">꾸준함이 만든 결과예요!</span>
            </div>
            <WeeklyHeatmap weeks={mine.weeks} />
          </section>
        </>
      )}

      {mine && rewards && (
        <section className={card}>
          <h3 className="mb-2.5 text-[15px] font-extrabold">획득한 보상</h3>
          <RewardsRow r={rewards} />
        </section>
      )}

      {mine && (
        <>
          <button type="button" onClick={props.onShare} className="flex h-[52px] items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[15px] font-extrabold text-accent-ink active:bg-accent-press">
            <Icon name="share" size={18} strokeWidth={2.2} />결과 공유하기
          </button>
          {props.shareNote && <p role="status" className="text-center text-[12px] font-bold text-accent">{props.shareNote}</p>}
        </>
      )}
    </div>
  );
}
```

(머리의 빈 제목 + `-mt-9`는 시안처럼 `<`·공유 아이콘과 같은 줄에 챌린지 이름을 올리기 위해서다. 화면에서 겹치면 `-mt-9`를 조정한다.)

- [ ] **Step 2: 화면 B `my-result-report.tsx`**

```tsx
"use client";

import { Icon } from "@/components/ui/icon";
import type { RankedParticipant } from "@/lib/domain/goal-score";
import {
  cheerCopy,
  topPercent,
  type BestRecords as Records,
  type DailyBar,
  type PeriodRewards,
} from "@/lib/domain/challenge-report";
import { BestRecords } from "./best-records";
import { DailyActivityChart } from "./daily-activity-chart";
import { GoalRing } from "./goal-ring";
import { LevelHex, XpBar } from "./level-card";
import { ResultHeader } from "./result-header";
import { ScoreTrendChart } from "./score-trend-chart";

export type MyGoalResult = { key: string; label: string; actual: number; target: number; unit: string; rate: number };

export type MyReport = {
  ranked: RankedParticipant;
  total: number;
  goals: MyGoalResult[];
  bars: DailyBar[];
  records: Records;
  trend: { label: string; overall: number }[];
};

const card = "rounded-card border border-line bg-surface p-4 shadow-card";

export function MyResultReport({ me, rewards, onBack, onShare, onCreate }: {
  me: MyReport;
  rewards: PeriodRewards | null;
  onBack: () => void;
  onShare: () => void;
  onCreate: () => void;
}) {
  const done = me.goals.filter((g) => g.rate >= 1).length;
  const [l1, l2] = cheerCopy(me.ranked.rank);
  return (
    <div className="flex flex-col gap-3 pb-10">
      <ResultHeader title="나의 챌린지 결과" onBack={onBack} onShare={onShare} />

      <section className={`${card} relative overflow-hidden border-line-strong`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`font-mono text-[44px] font-black italic leading-none ${me.ranked.rank === 1 ? "text-gold" : "text-text"}`}>
              {me.ranked.rank}<span className="text-[26px]">위</span>
            </p>
            <p className="mt-3 text-[12px] text-muted">종합 점수</p>
            <p className="font-mono text-[34px] font-black leading-tight">
              {me.ranked.overall.toFixed(1)}<span className="ml-0.5 text-[16px]">점</span>
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-gold/60 bg-gold-weak px-3 py-1 text-[12.5px] font-extrabold text-gold">
              <Icon name="crown" size={14} filled />상위 {topPercent(me.ranked.rank, me.total)}%
            </span>
          </div>
          <div className="flex flex-col items-end gap-3">
            <p className="rounded-[14px] rounded-br-sm border border-line-strong bg-surface-2 px-3 py-2 text-right text-[13px] font-extrabold leading-snug">
              {l1}<br />{l2}
            </p>
            {rewards && (
              <div className="flex w-[150px] flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <LevelHex level={rewards.levelAtEnd} size={34} />
                  <span className="text-[12.5px] font-extrabold text-accent">{rewards.stageNameAtEnd}</span>
                </div>
                <XpBar r={rewards} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold">목표 달성률</h3>
          <span className="flex items-center gap-1 text-[11.5px] text-muted">
            목표 {me.goals.length}개 중 {done}개 달성! <Icon name="thumbsup" size={14} className="text-gold" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {me.goals.map((g) => (
            <div key={g.key} data-testid="goal-ring" className="relative flex flex-col items-center gap-1 text-center">
              {g.rate >= 1 && <Icon name="crown" size={15} filled className="absolute -top-2 text-gold" label="목표 달성" />}
              <GoalRing rate={g.rate} size={78} />
              <p className="text-[12.5px] font-bold">{g.label}</p>
              <p className="font-mono text-[11px] text-muted">
                {Math.round(g.actual * 10) / 10} / {g.target.toLocaleString()}{g.unit}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold">일별 활동</h3>
          <div className="flex gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-faint" />계획</span>
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-accent" />실제</span>
          </div>
        </div>
        <DailyActivityChart bars={me.bars} />
      </section>

      <section className={card}>
        <h3 className="mb-2.5 text-[15px] font-extrabold">주요 기록</h3>
        <BestRecords records={me.records} />
      </section>

      <section className={card}>
        <h3 className="mb-1 text-[15px] font-extrabold">나의 성장</h3>
        <ScoreTrendChart points={me.trend} />
      </section>

      <p className="flex items-center justify-center gap-1 text-center text-[13.5px] font-extrabold text-gold">
        다음 챌린지에서 더 높은 산을 함께 가요! <Icon name="arrow" size={15} />
      </p>
      <button type="button" onClick={onCreate} className="flex h-[52px] items-center justify-center gap-1 rounded-[14px] bg-accent text-[15px] font-extrabold text-accent-ink active:bg-accent-press">
        다음 챌린지 신청하기 <Icon name="chevron" size={17} strokeWidth={2.4} />
      </button>
    </div>
  );
}
```

(`Icon`에 `filled` prop이 있다 — `icon.tsx:91`. `crown`·`flame`은 채움으로 시안의 단색 아이콘처럼 보인다.)

- [ ] **Step 3:** `pnpm typecheck` → 두 파일 오류 0

---

### Task 9: `ResultView` 조립 + 상세·페이지 연결

**Files:** Replace `src/components/challenge/challenge-result.tsx` · Modify `challenge-detail.tsx`, `src/app/(tabs)/challenge/page.tsx` · Test `src/components/challenge/challenge-result.test.tsx`

- [ ] **Step 1: 실패하는 테스트**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeParticipantProfile, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";

const mocks = vi.hoisted(() => ({ getMyRewardLedgers: vi.fn() }));
vi.mock("@/lib/challenge-rewards", () => ({ getMyRewardLedgers: mocks.getMyRewardLedgers }));

import { ResultView } from "./challenge-result";

afterEach(cleanup);
beforeEach(() => {
  mocks.getMyRewardLedgers.mockResolvedValue({
    currentTotalXp: 1250,
    xpRows: [{ amount: 300, transactionType: "earn", createdAt: "2026-09-03T01:00:00Z" }],
    pointRows: [{ amount: 200, transactionType: "earn", createdAt: "2026-09-03T01:00:00Z" }],
    badgeEarnedAts: ["2026-09-05T01:00:00Z"],
  });
});

const goal = (user_id: string, goal_type: string, target_value: number, unit: string) =>
  ({ id: `${user_id}-${goal_type}`, user_id, goal_type, target_value, qualifier: null, planned_days: 3, unit }) as unknown as UserGoal;
const row = (userId: string, iso: string): PeriodSessionRow => ({ userId, completedAt: iso, durationMinutes: 40, exercises: [] });
const profiles: Record<string, ChallengeParticipantProfile> = {
  me: { id: "me", nickname: "나", avatar_url: null } as ChallengeParticipantProfile,
  b: { id: "b", nickname: "스칼레또", avatar_url: null } as ChallengeParticipantProfile,
};

function setup(myGoals = true) {
  const participants = [
    ...(myGoals
      ? [{ userId: "me", goals: [{ type: "workout_days" as const, target: 4, actual: 2 }, { type: "cardio_distance" as const, target: 10, actual: 12 }], workoutDays: 2, plannedDays: 6 }]
      : []),
    { userId: "b", goals: [{ type: "workout_days" as const, target: 4, actual: 1 }], workoutDays: 1, plannedDays: 6 },
  ];
  render(
    <ResultView
      challenge={{ id: "c1", name: "GND 9월 챌린지", start_date: "2026-09-01", end_date: "2026-09-14" }}
      participants={participants}
      goals={myGoals ? [goal("me", "workout_days", 4, "일"), goal("me", "cardio_distance", 10, "km"), goal("b", "workout_days", 4, "일")] : [goal("b", "workout_days", 4, "일")]}
      sessionRows={[row("me", "2026-09-01T01:00:00Z"), row("me", "2026-09-02T01:00:00Z"), row("b", "2026-09-01T01:00:00Z")]}
      plans={[{ planDate: "2026-09-02", setCount: 6 }]}
      timeZone="Asia/Seoul"
      profileOf={(id) => profiles[id]}
      myUserId="me"
      onBack={() => {}}
      onProfileClick={() => {}}
      onCreate={() => {}}
    />,
  );
}

describe("ResultView — 화면 A", () => {
  it("시안 머리와 2×2 카드 4장, 주간 2칸, 보상 3칸", async () => {
    setup();
    expect(screen.getByText("종료!")).toBeTruthy();
    expect(screen.getByText(/14일간, 정말 수고했어요!/)).toBeTruthy();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(4);
    expect(screen.getAllByTestId("heat-week")).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByTestId("reward-tile")).toHaveLength(3));
    expect(screen.getByText("+200")).toBeTruthy();
    expect(screen.getByRole("button", { name: /결과 공유하기/ })).toBeTruthy();
  });

  it("일러스트·지급 없는 보상 문구는 없다", async () => {
    setup();
    await waitFor(() => screen.getAllByTestId("reward-tile"));
    expect(screen.queryByText(/랜덤 아이템|코인/)).toBeNull();
    expect(screen.queryByRole("img", { name: /캐릭터/ })).toBeNull();
  });

  it("장부 조회가 실패해도 화면은 뜨고 레벨·보상 칸만 숨는다", async () => {
    mocks.getMyRewardLedgers.mockRejectedValueOnce(new Error("x"));
    setup();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(4);
    await waitFor(() => expect(screen.getByRole("button", { name: /나의 챌린지 결과 보기/ })).toBeTruthy());
    expect(screen.queryByTestId("reward-tile")).toBeNull();
  });

  it("목표를 안 건 사람은 시상대만", () => {
    setup(false);
    expect(screen.getByText("종료!")).toBeTruthy();
    expect(screen.queryByTestId("stat-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /결과 공유하기/ })).toBeNull();
  });
});

describe("ResultView — 화면 B", () => {
  it("레벨 카드를 누르면 나의 챌린지 결과, 뒤로 가면 A", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "나의 챌린지 결과 보기" }));
    expect(screen.getByText("나의 챌린지 결과")).toBeTruthy();
    expect(screen.getByText(/상위 50%/)).toBeTruthy();
    expect(screen.getAllByTestId("goal-ring")).toHaveLength(2);
    expect(screen.getByText("목표 2개 중 1개 달성!")).toBeTruthy();
    expect(screen.getAllByTestId("best-record")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /다음 챌린지 신청하기/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByText("종료!")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run src/components/challenge/challenge-result.test.tsx` → FAIL

- [ ] **Step 3: `challenge-result.tsx` 교체**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { RankingPodium } from "@/components/challenge/ranking-podium";
import { goalLabel, myScoreTrend, type ChallengeParticipantProfile, type PeriodSessionRow } from "@/lib/challenge";
import { getMyRewardLedgers } from "@/lib/challenge-rewards";
import { inclusiveDays } from "@/lib/domain/challenge-time";
import {
  bestRecords,
  dailyBars,
  dailyTotals,
  periodRewards,
  resultShareText,
  weeklyAchievement,
  type PeriodRewards,
  type PlanInput,
} from "@/lib/domain/challenge-report";
import { goalRate, rankParticipants, type GoalType, type ParticipantInput } from "@/lib/domain/goal-score";
import type { UserGoal } from "@/lib/types";
import { MyResultReport, type MyReport } from "./result/my-result-report";
import { ResultSummary } from "./result/result-summary";
import type { StatCardData } from "./result/stat-card";

/*
  2026-10-07: 사용자 시안(챌린지 종료! / 나의 챌린지 결과)으로 다시 그렸다.
  순위·점수는 그대로 `rankParticipants`(종합점수, 동점 같은 등수). 옛 참가자별 상세 카드는
  시안에 없어 지웠고(D2), 4위 이하는 시상대 아래 한 줄 목록이다.
*/

type IconName = StatCardData["icon"];
const GOAL_ICON: Record<GoalType, IconName> = {
  weight_reps: "sets", weight_days: "dumbbell", cardio_distance: "shoe", cardio_time: "clock",
  bodyweight_reps: "sets", bodyweight_time: "timer", bodyweight_days: "body", cardio_days: "shoe",
  tabata_count: "interval", volume: "dumbbell", workout_days: "calendar",
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

export function ResultView({
  challenge,
  participants,
  goals,
  sessionRows,
  plans,
  timeZone,
  profileOf,
  myUserId,
  onBack,
  onProfileClick,
  onCreate,
}: {
  challenge: { id: string; name: string; start_date: string; end_date: string };
  participants: ParticipantInput[];
  goals: UserGoal[];
  sessionRows: readonly PeriodSessionRow[];
  plans: readonly PlanInput[];
  timeZone: string;
  profileOf: (id: string) => ChallengeParticipantProfile | undefined;
  myUserId: string;
  onBack: () => void;
  /** ⚠️ 시트를 여기서 띄우지 않는다 — 화면에 시트가 둘이 된다 */
  onProfileClick: (p: ChallengeParticipantProfile) => void;
  onCreate: () => void;
}) {
  const [view, setView] = useState<"summary" | "report">("summary");
  const [rewards, setRewards] = useState<PeriodRewards | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const { start_date: start, end_date: end } = challenge;
  const periodDays = inclusiveDays(start, end);
  const ranked = useMemo(() => rankParticipants(participants), [participants]);
  const total = ranked.length;

  // 레벨·보상 칸 — 실패해도 결과 화면은 뜬다(칸만 숨는다)
  useEffect(() => {
    let cancelled = false;
    getMyRewardLedgers(start)
      .then((l) => {
        if (!cancelled) setRewards(periodRewards({ ...l, startDate: start, endDate: end, timeZone }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challenge.id, start, end, timeZone]);

  const mine = useMemo(() => {
    const r = ranked.find((x) => x.userId === myUserId);
    const input = participants.find((p) => p.userId === myUserId);
    if (!r || !input) return null;
    const myGoals = goals.filter((g) => g.user_id === myUserId);
    const totals = dailyTotals(sessionRows.filter((s) => s.userId === myUserId), start, end, timeZone);
    const all = [...totals.values()];
    const goalResults = myGoals.map((g) => {
      const actual = input.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
      return { key: g.id, type: g.goal_type, label: goalLabel(g.goal_type, g.qualifier), actual, target: Number(g.target_value), unit: g.unit, rate: goalRate(Number(g.target_value), actual) };
    });
    const minutes = all.some((t) => t.minutes != null) ? all.reduce((s, t) => s + (t.minutes ?? 0), 0) : null;
    const filler: StatCardData[] = [
      { key: "f-sessions", icon: "flame", label: "운동 횟수", value: fmt(all.reduce((s, t) => s + t.sessions, 0)), unit: "회", sub: "기간 기록", rate: null },
      { key: "f-minutes", icon: "clock", label: "운동 시간", value: minutes === null ? "-" : fmt(minutes), unit: minutes === null ? "" : "분", sub: "기간 기록", rate: null },
      { key: "f-km", icon: "shoe", label: "유산소 거리", value: fmt(all.reduce((s, t) => s + t.cardioKm, 0)), unit: "km", sub: "기간 기록", rate: null },
      { key: "f-kg", icon: "dumbbell", label: "총 볼륨", value: fmt(all.reduce((s, t) => s + t.volumeKg, 0)), unit: "kg", sub: "기간 기록", rate: null },
    ];
    const stats: StatCardData[] = [
      ...goalResults.slice(0, 4).map((g) => ({ key: g.key, icon: GOAL_ICON[g.type], label: g.label, value: fmt(g.actual), unit: g.unit, sub: `목표 ${g.target.toLocaleString()}${g.unit}`, rate: g.rate })),
      ...filler,
    ].slice(0, 4);
    const report: MyReport = {
      ranked: r,
      total,
      goals: goalResults,
      bars: dailyBars(totals, plans, start, end),
      records: bestRecords(totals),
      trend: myScoreTrend({ rows: sessionRows, userId: myUserId, goals: myGoals, startDate: start, endDate: end, timeZone }),
    };
    return {
      workoutDays: input.workoutDays,
      stats,
      // 주간 목표 횟수 — buildParticipantInput과 같은 기본값 5
      weeks: weeklyAchievement([...totals.keys()], start, end, myGoals[0]?.planned_days ?? 5),
      report,
    };
  }, [ranked, participants, goals, sessionRows, plans, myUserId, start, end, timeZone, total]);

  // ⚠️ navigator.share는 클릭 안에서 바로 부른다(await 뒤로 미루면 브라우저가 거절한다)
  async function handleShare() {
    if (!mine) return;
    const text = resultShareText({ challengeName: challenge.name, rank: mine.report.ranked.rank, total, overall: mine.report.ranked.overall, workoutDays: mine.workoutDays, periodDays });
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareNote("결과를 복사했어요 — 붙여 넣어 공유하세요");
    } catch {
      setShareNote("공유하지 못했어요 — 화면을 캡처해 공유해 주세요");
    }
  }

  const byId = new Map(participants.map((p) => [p.userId, p]));
  const podium = (
    <>
      <RankingPodium
        ranked={ranked}
        profileOf={profileOf}
        myUserId={myUserId}
        onProfileClick={onProfileClick}
        metaOf={(id) => {
          const r = ranked.find((x) => x.userId === id);
          return (
            <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
              <span className="flex items-center gap-0.5"><Icon name="clock" size={11} />{byId.get(id)?.workoutDays ?? 0}일</span>
              <span className="flex items-center gap-0.5"><Icon name="calendar" size={11} />{Math.round(r?.achievement ?? 0)}%</span>
            </span>
          );
        }}
      />
      {ranked.length > 3 && (
        <ol className="mt-2 flex flex-col">
          {ranked.slice(3).map((r) => (
            <li key={r.userId} className="flex items-center gap-2 border-t border-line px-2 py-2 text-[13px]">
              <span className="w-8 font-mono font-extrabold text-muted">{r.rank}위</span>
              <span className="min-w-0 flex-1 truncate font-bold">{r.userId === myUserId ? "나" : (profileOf(r.userId)?.nickname ?? "?")}</span>
              <span className="font-mono font-extrabold">{r.overall.toFixed(1)}점</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );

  if (view === "report" && mine) {
    return <MyResultReport me={mine.report} rewards={rewards} onBack={() => setView("summary")} onShare={() => void handleShare()} onCreate={onCreate} />;
  }
  return (
    <ResultSummary
      challengeName={challenge.name}
      periodDays={periodDays}
      podium={podium}
      mine={mine ? { stats: mine.stats, weeks: mine.weeks } : null}
      rewards={rewards}
      shareNote={shareNote}
      onBack={onBack}
      onShare={() => void handleShare()}
      onOpenReport={() => setView("report")}
    />
  );
}
```

- [ ] **Step 4: 상세 연결** — `challenge-detail.tsx`

props에 추가:

```ts
  /** 종료 챌린지 결과 재료 (2026-10-07) — 진행 중엔 null */
  sessionRows: readonly PeriodSessionRow[] | null;
  plans: readonly PlanInput[];
  timeZone: string;
```

종료면 **결과 화면만** 그린다(시안은 자기 머리를 가진다). 메인 `return (` 바로 위, 그 아래에 훅이 없는지 확인하고:

```tsx
  // 종료 — 시안의 결과 화면이 상세 전체다(머리·히어로 포함, 2026-10-07)
  if (challenge.status === "ended" && detailsAreCurrent) {
    return (
      <ResultView
        challenge={challenge}
        participants={participantInputs}
        goals={[...goals]}
        sessionRows={sessionRows ?? []}
        plans={plans}
        timeZone={timeZone}
        profileOf={profileOf}
        myUserId={userId}
        onBack={onBack}
        onProfileClick={onProfile}
        onCreate={onCreate}
      />
    );
  }
```

그리고 아래쪽 옛 `{challenge.status === "ended" && detailsAreCurrent && (<> <ResultView …/> <button …>새 챌린지 만들기</button> </>)}` 블록을 지운다. `levelOf`가 더 안 쓰이면 지운다(`challengeLevel` import도).

- [ ] **Step 5: 페이지 연결** — `src/app/(tabs)/challenge/page.tsx`

import: `getChallengePeriodSessions`, `foldPeriodStats`, `type PeriodSessionRow`(`@/lib/challenge`), `getWorkoutPlans`(`@/lib/workout-plan`), `type PlanInput`(`@/lib/domain/challenge-report`). 안 쓰이게 된 `getPeriodStatsByUser` import는 뺀다.

상태(`loadedStats` 옆):

```ts
  /** 종료 챌린지 결과 재료 — 점수와 같은 RPC 행 (2026-10-07) */
  const [loadedRows, setRows] = useState<PeriodSessionRow[] | null>(null);
  /** 결과 화면 '계획' 막대 — 내 계획만. 실패해도 결과 화면은 뜬다 */
  const [plans, setPlans] = useState<PlanInput[]>([]);
```

`setStats(null)`을 부르는 모든 자리에 `setRows(null); setPlans([]);`. active/ended 분기:

```ts
        if (ch.status === "active" || ch.status === "ended") {
          // 행을 한 번 받아 점수(stats)와 결과 화면(rows)이 같은 원천을 쓴다
          const rows = await getChallengePeriodSessions(ch.id);
          const statsByUser = foldPeriodStats(rows, ch.start_date, ch.end_date, timeZone);
          if (cancelled) return;
          setStats(statsByUser);
          setRows(ch.status === "ended" ? rows : null);
          setLoadedChallengeId(ch.id);
          if (ch.status === "ended") {
            getWorkoutPlans(userId)
              .then((all) => {
                if (cancelled) return;
                setPlans(
                  all
                    .filter((p) => p.planDate >= ch.start_date && p.planDate <= ch.end_date)
                    .map((p) => ({ planDate: p.planDate, setCount: p.exercises.reduce((s, e) => s + e.sets.length, 0) })),
                );
              })
              .catch(() => {});
          }
        } else {
```

`stats`가 `loadedChallengeId`로 걸러지는 식과 **같은 조건**으로 `const sessionRows = … ? loadedRows : null;`을 만들고, `<ChallengeDetail>`에 `sessionRows={sessionRows}` `plans={plans}` `timeZone={timeZone}`를 넘긴다.

- [ ] **Step 6: 통과 확인** — `pnpm vitest run src/components/challenge "src/app/(tabs)/challenge"` → PASS. 기존 `challenge/page.test.tsx`가 `getPeriodStatsByUser`를 목으로 잡고 있으면 `getChallengePeriodSessions`(빈 배열)로 바꾼다.

- [ ] **Step 7:** `pnpm typecheck && pnpm lint` → 오류 0(기존 경고 4개 그대로)

- [ ] **Step 8: Commit**

```bash
git add src/components/challenge/challenge-result.tsx src/components/challenge/challenge-result.test.tsx src/components/challenge/result src/components/challenge/challenge-detail.tsx "src/app/(tabs)/challenge/page.tsx" "src/app/(tabs)/challenge/page.test.tsx"
git commit -m "feat(challenge): 종료 화면을 시안대로 — 챌린지 종료! / 나의 챌린지 결과"
```

---

### Task 10: 개발 전용 확인 화면

종료 챌린지를 만드는 픽스처가 없다(`dev-fixture.mjs challenge`는 active만). 실제 부품을 예시 데이터로 띄운다. 장부 조회는 로그인 없이 실패하므로 레벨·보상 칸은 `?rewards=1`일 때 목으로 채운다.

**Files:** Create `src/app/challenge-result-qa/page.tsx`

- [ ] **Step 1: 작성**

```tsx
"use client";

import { notFound } from "next/navigation";
import { ResultView } from "@/components/challenge/challenge-result";
import type { ChallengeParticipantProfile, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";

/** 개발 전용 — 운영 빌드·플래그 없는 개발 서버에서는 404 */
export default function Page() {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_CHALLENGE_RESULT_QA !== "1") notFound();

  const users = ["me", "b", "c", "d"];
  const rows: PeriodSessionRow[] = [];
  users.forEach((u, ui) => {
    for (let d = 1; d <= 28; d++) {
      if ((d + ui) % (ui + 2) === 0) continue;
      rows.push({
        userId: u,
        completedAt: `2026-09-${String(d).padStart(2, "0")}T01:00:00Z`,
        durationMinutes: 20 + ((d * 7) % 70),
        exercises: [
          { exerciseType: "weight", exerciseName: "스쿼트", bodyPart: "하체", sets: Array.from({ length: 2 + (d % 4) }, () => ({ weightKg: 60, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true })) },
          { exerciseType: "cardio", exerciseName: "러닝", bodyPart: null, sets: [{ weightKg: null, reps: null, distanceMeters: 1000 + d * 100, durationSeconds: 900, isCompleted: true }] },
        ],
      });
    }
  });
  const goal = (user_id: string, goal_type: string, target_value: number, unit: string): UserGoal =>
    ({ id: `${user_id}-${goal_type}`, user_id, goal_type, target_value, qualifier: null, planned_days: 4, unit }) as unknown as UserGoal;
  const goals = users.flatMap((u) => [goal(u, "workout_days", 20, "일"), goal(u, "cardio_distance", 30, "km"), goal(u, "weight_days", 18, "일")]);
  const mine = (u: string) => rows.filter((r) => r.userId === u);
  const participants = users.map((u) => ({
    userId: u,
    goals: [
      { type: "workout_days" as const, target: 20, actual: mine(u).length },
      { type: "cardio_distance" as const, target: 30, actual: mine(u).reduce((s, r) => s + (r.exercises[1].sets[0].distanceMeters ?? 0) / 1000, 0) },
      { type: "weight_days" as const, target: 18, actual: Math.round(mine(u).length * 0.7) },
    ],
    workoutDays: mine(u).length,
    plannedDays: 16,
  }));
  const names: Record<string, string> = { me: "나", b: "스칼레또", c: "낭만송곳니", d: "새벽러너" };
  const profileOf = (id: string) => ({ id, nickname: names[id], avatar_url: null }) as unknown as ChallengeParticipantProfile;
  const plans = [2, 5, 8, 9, 12, 15, 16, 19, 22, 23, 26].map((d) => ({ planDate: `2026-09-${String(d).padStart(2, "0")}`, setCount: 6 + (d % 5) }));

  return (
    <main className="mx-auto max-w-[430px] px-4 pt-3">
      <ResultView
        challenge={{ id: "qa", name: "GND 9월 챌린지", start_date: "2026-09-01", end_date: "2026-09-28" }}
        participants={participants}
        goals={goals}
        sessionRows={rows}
        plans={plans}
        timeZone="Asia/Seoul"
        profileOf={profileOf}
        myUserId="me"
        onBack={() => history.back()}
        onProfileClick={() => {}}
        onCreate={() => alert("만들기 흐름")}
      />
    </main>
  );
}
```

(레벨·보상 칸: 비로그인이라 장부 조회가 실패해 숨는다. 이 칸은 Task 11 Step 2에서 픽스처 A 로그인 상태로 확인한다.)

- [ ] **Step 2: Commit** — `git add src/app/challenge-result-qa/page.tsx && git commit -m "chore(challenge): 결과 화면 개발 전용 확인 페이지"`

---

### Task 11: 화면 확인 (전역 지침 — 배포 전 필수)

- [ ] **Step 1:** `NEXT_PUBLIC_CHALLENGE_RESULT_QA=1 pnpm dev`, 390px로 `/challenge-result-qa`를 열고 **시안 이미지를 옆에 띄워** 비교한다.

| 조작 | 기대 |
|---|---|
| 첫 화면 | `<` · `GND 9월 챌린지` · `챌린지 종료!`(종료! 라임) · `28일간, 정말 수고했어요!` + 불꽃 · 공유 아이콘 |
| 시상대 | 2·1·3 배치, 카드마다 점수 + `🕐N일 · 📅N%` 줄, 아래 `4위 새벽러너 …점` **1줄** |
| 2×2 카드 | **4장**, 3장은 링(목표), 1장은 `기간 기록`(링 없음) |
| 주간 달성 히트맵 | 상자 **4개**, 상자마다 원 4개, 가로로 밀림 |
| 결과 공유하기 | 데스크톱: 복사 안내 문구 |
| 레벨 칸 | 로그인 안 됨 → `나의 챌린지 결과 보기 >` 버튼으로 대체 — 눌러서 B로 이동 |
| B 히어로 | `N위` · 종합점수 · `상위 N%` · 말풍선 두 줄 |
| 목표 달성률 | 링 **3개**, 100% 넘은 링 위 왕관, `목표 3개 중 N개 달성!` |
| 일별 활동 | 막대 쌍 **28개 자리**, 회색 계획 **11곳**, 말풍선이 마지막 운동일에 떠 있음 → 다른 막대 눌러 말풍선 이동 |
| 주요 기록 | **4칸** 한 줄, `9/14(월)` 형식 날짜 |
| 나의 성장 | 점 **5개**(시작·1~4주), 말풍선 `챌린지 시작 0.0점` · `챌린지 후 NN.N점` = 히어로 점수 |
| 마지막 | 금색 문구 + `다음 챌린지 신청하기 >` |
| `<` | A로 돌아옴 |
| 375 / 430px | 가로 넘침 없음(히트맵·주요 기록 줄만 안에서 밀림) |
| 부정 확인 | 캐릭터·코인·상자 그림 **없음**, `랜덤 아이템` 문구 **없음** |

- [ ] **Step 2: 로그인 상태** — 픽스처 A(`node scripts/dev-fixture.mjs status`)로 로그인한 같은 개발 서버에서 `/challenge-result-qa` → 레벨 카드(`단계명 Lv.N`, XP 막대, `+N 레벨 업`은 기간에 올랐을 때만)·보상 3칸이 뜨는지. 픽스처 A에 **이미 종료된 실제 챌린지**가 있으면 챌린지 탭에서 열어 같은 표를 본다. 없으면 `[미검증] 실제 종료 챌린지`로 남기고 알린다(운영 데이터를 바꿔 종료시키지 않는다).

- [ ] **Step 3:** 이상이 있으면 고치고 Step 1부터 다시.

---

### Task 12: 게이트 · 기록 · 푸시/배포

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 실패는 숨기지 않고 원인·남은 일을 쓴다
- [ ] `src/lib/domain/release-notes.data.json`에 새소식 1건(발송 안 함 — 발송은 사용자 지시 때만)
- [ ] `PROGRESS.md` 최상단 + `docs/superpowers/HANDOFF-2026-10-xx-challenge-result-screen.md` (0117 적용 여부, `[미검증]`)
- [ ] 배포까지 가면: 커밋 → 푸시(묻지 않음) → `git fetch` 후 `0 0` → `git archive` 복사본에서 배포(메모리 규칙) → 운영 JS에 `나의 챌린지 결과` 문구 확인. 배포 없이 끝나면 푸시 여부를 묻는다.

---

## Self-Review

- 시안 두 화면의 블록 순서와 그래프 종류(링·막대 쌍+말풍선·주 상자 히트맵·말풍선 선 그래프·보상 3칸·기록 4칸)를 모두 Task 7~9에 옮겼다. 다른 점은 대응표에 적은 것뿐: 일러스트 → 아바타/아이콘, `챌린지 전` → `챌린지 시작`, 표기 `단계명 Lv.N`.
- 점수 경로 하나: `myScoreTrend` 마지막 점 = `rankParticipants` 점수(Task 4 테스트).
- 보상·레벨은 새 지급이 아니라 본인 장부를 기간으로 자른 값(Task 3 `periodRewards` 테스트: 종료 뒤 XP 제외, reverse 부호 무관).
- 이름 일치: `ReportSessionInput`·`DayTotals`·`PlanInput`·`DailyBar`·`WeekAchievement`·`BestRecords`·`LedgerRow`·`PeriodRewards`·`StatCardData`·`MyReport`·`MyGoalResult`·`getMyRewardLedgers` — 정의와 사용 일치.
- 0117 전: `durationMinutes` 없음 → 운동 시간 카드 `-`, 주요 기록 운동 시간 `-`. 막대는 세트 기준이라 영향 없음.
