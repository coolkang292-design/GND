# 업적(배지) 퀘스트 UX v2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배지 화면을 "도감 목록"에서 "다음 목표·진행률·남은 수치·희귀도·완료율을 보여주는 게임형 퀘스트 화면"으로 바꿔, 유저가 열자마자 "조금만 더 하면 딴다 → 운동하러 간다"를 떠올리게 한다.

**Architecture:** 진행률의 원천은 **서버가 이미 계산하는 지표 6종**이다(0032 `evaluate_badges` 내부). 이걸 그대로 노출하는 읽기 전용 RPC를 만들고, **판정과 같은 SQL을 공유**해 진행바와 실제 지급이 어긋나지 않게 한다. 클라이언트는 카탈로그·획득목록·지표 3개를 합쳐 `Achievement[]` 모델을 만들고, 표시 계산(진행률·남은수치·다음목표·완료율)은 순수 도메인 함수로 분리해 TDD한다. UI는 작은 컴포넌트(ProgressBar·RarityPill·NextGoalCard)로 쪼갠다.

**Tech Stack:** Next.js(App Router)·React 19·TypeScript·Tailwind·Supabase(Postgres RPC, SECURITY DEFINER)·Vitest(`renderToStaticMarkup` SSR).

---

## 0. 설계 결정 (착수 전 확인 — 검토 후 조정 가능)

이 스펙에는 숫자·희귀도·이름이 예시로만 있어, 30종 실제값을 아래처럼 확정했다. 취향 조정이 필요하면 이 표부터 고치고 시작한다.

**결정 1 — 진행 지표는 새 RPC로, 판정과 SQL 공유.**
`evaluate_badges`가 내부에서 계산하는 지표 6종(운동수·시간·기록갱신·불꽃·볼륨·거리)을 `badge_metrics(uuid)` 함수로 빼고, `evaluate_badges`도 그걸 부르게 바꾼다(DRY). 클라이언트용은 `get_my_badge_metrics()`(본인 것만). 이렇게 안 하면 진행바가 "9/10"인데 판정은 이미 지급되는 식으로 갈라질 수 있다.

**결정 2 — 희귀도는 DB 컬럼(`rarity`)으로 추가하고 30종 seed.** (스펙 #12가 모델 필드로 명시)

| 지표 | 배지 | rarity |
|---|---|---|
| 운동수 | workout_1 / 10 / 30 / 50 / 100 / 200 | common / common / rare / rare / epic / legend |
| 시간 | minutes_300 / 1200 / 3000 / 6000 | common / rare / epic / legend |
| 불꽃 | streak_5 / 15 / 30 / 60 / 100 | common / rare / epic / epic / legend |
| 볼륨 | volume_1t / 5t / 20t / 50t / 100t / 250t | common / common / rare / rare / epic / **mythic** |
| 거리 | cardio_10k / 42k / 100k / 250k / 500k | common / rare / rare / epic / legend |
| 기록갱신 | record_beaten_1 / 5 / 10 / 25 | common / rare / epic / legend |

색: common=회색, rare=파랑, epic=보라, legend=골드, mythic=빨강.

**결정 3 — 이름은 별명 중심, 설명은 짧은 사실 한 줄(#9).** 진행바·남은수치가 동기를 담당하므로 설명은 "무슨 배지인지"만 짧게. (이전 위트 설명은 이 사실형으로 대체 — 위트는 이름이 계속 담당). 이름 변경 2건: `cardio_100k` "서울에서 평택까지"→**"서울 탈출"**, `cardio_500k` "서울에서 부산 찍고 대전까지"→**"반도 횡단"**. 설명 30종은 Task 2 seed에 전부 있다.

**결정 4 — 반복 배지(streak_5) 처리.** 진행바는 **다음 5의 배수까지**로 계산(현재 불꽃 7 → 목표 10, 남은 3). "완료율"에는 한 번이라도 받았으면 완료 1로 센다. **다음 목표 카드**는 반복 배지를 뽑지 않는다(홈 🔥가 이미 불꽃을 강조하므로 중복 방지) — 1회성 미획득 중 진행률 최고를 뽑는다.

**결정 5 — 완료율 분모는 실제 배지 수 30.** (스펙의 72는 예시). 반복 배지 포함 총 30, 완료=한 번이라도 획득한 distinct 키 수.

**결정 6 — 표시 단위 변환.** 분→시간, kg→톤, m→km. 시간=정수, 톤·km=소수 1자리. 운동수·기록=회, 불꽃=일.

---

## 파일 구조

- **DB(신규 마이그레이션)**
  - `supabase/migrations/0036_badge_metrics_rpc.sql` — 지표 함수 분리 + 조회 RPC + `evaluate_badges` DRY 리팩터
  - `supabase/migrations/0037_badge_rarity_and_naming.sql` — `rarity` 컬럼 + 30종 seed(희귀도·이름·설명)
- **도메인(신규/수정, 순수·TDD)**
  - `src/lib/domain/badges.ts` (수정) — `BadgeMeta`에 `rarity` 추가
  - `src/lib/domain/achievements.ts` (신규) — `Rarity`·`RARITY_META`·`toDisplayUnit`·`Achievement`·`buildAchievements`·`selectNextGoal`·`categoryCompletion`·`overallCompletion`
  - `src/lib/domain/achievements.test.ts` (신규)
- **조회(수정)**
  - `src/lib/badges.ts` (수정) — `getBadgeCatalog`에 `rarity` 매핑, `getMyBadgeMetrics()` 추가
- **UI(신규/수정)**
  - `src/components/profile/progress-bar.tsx` (신규) — 진행바
  - `src/components/profile/rarity-pill.tsx` (신규) — 희귀도 pill
  - `src/components/profile/next-goal-card.tsx` (신규) — 다음 목표 카드
  - `src/components/profile/badge-sheet.tsx` (재작성) — 완료율 헤더 + 카테고리 완료율 + 배지별 진행/남은/희귀도/보상/잠금
  - `src/components/profile/badge-earn-animation.tsx` (신규, 구조만) — 향후 획득 연출 자리
  - `src/components/profile/growth-hub.tsx` (수정) — 지표 조회·Achievement 조립·NextGoalCard·BadgeSheet 배선
  - 각 컴포넌트 `.test.tsx`
- **검증 스크립트**
  - `scripts/badge-metrics-check.mjs` (신규) — RPC 지표 ↔ 원장/집계 대조(실 DB)

---

## PHASE A — 백엔드 데이터

## Task 1: 0036 — 지표 조회 RPC + 판정 DRY 리팩터

**Files:**
- Create: `supabase/migrations/0036_badge_metrics_rpc.sql`
- Create: `scripts/badge-metrics-check.mjs`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0036_badge_metrics_rpc.sql`:

```sql
-- 0036: 배지 진행 지표를 조회 가능한 RPC로 노출 + 판정과 SQL 공유(DRY)
-- 적용: SQL Editor Run. 0022~0035 수정 금지. 이 파일이 0036.
--
-- 왜: 퀘스트 UI의 진행바(9/10 등)는 사용자의 현재 지표값이 필요하다. 그 값은
--     evaluate_badges가 이미 내부에서 계산하지만 밖으로 주지 않았다. 같은 SQL을
--     badge_metrics()로 빼서 판정·진행바가 한 원천을 쓰게 한다(갈라짐 방지).

-- 지표 6종 집계 (판정·조회 공용)
create or replace function public.badge_metrics(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'workout_count', coalesce(count(*), 0),
    'total_minutes', coalesce(sum(s.duration_minutes), 0),
    'record_beaten', coalesce(count(*) filter (where s.record_note is not null), 0)
  ) into v
  from workout_sessions s
  where s.user_id = p_user_id and s.status = 'completed' and s.deleted_at is null;

  v := v
    || jsonb_build_object('streak_days', public.current_streak_days(p_user_id))
    || (
      select jsonb_build_object(
        'weight_volume_kg', coalesce(sum(
          case when we.exercise_type = 'weight'
               then coalesce(ws.weight_kg, 0) * coalesce(ws.reps, 0) else 0 end), 0),
        'cardio_distance_m', coalesce(sum(
          case when we.exercise_type = 'cardio'
               then coalesce(ws.distance_meters, 0) else 0 end), 0))
      from workout_sets ws
      join workout_exercises we on we.id = ws.workout_exercise_id
      join workout_sessions s on s.id = we.session_id
      where s.user_id = p_user_id and s.status = 'completed'
        and s.deleted_at is null and ws.is_completed
    );
  return v;
end $$;
revoke all on function public.badge_metrics(uuid) from public, anon, authenticated;

-- 클라이언트용: 본인 지표만
create or replace function public.get_my_badge_metrics()
returns jsonb
language sql stable security definer set search_path = public as $$
  select public.badge_metrics(auth.uid());
$$;
revoke all on function public.get_my_badge_metrics() from public, anon;
grant execute on function public.get_my_badge_metrics() to authenticated;

-- evaluate_badges를 badge_metrics 사용으로 교체(DRY). 판정 로직은 그대로.
create or replace function public.evaluate_badges(p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
  v_metrics jsonb;
  v_new jsonb := '[]'::jsonb;
  v_value numeric;
  v_period text;
  v_inserted int;
  d record;
begin
  v_metrics := public.badge_metrics(p_user_id);

  for d in
    select * from badge_definitions where status = 'active' order by sort_order
  loop
    v_value := (v_metrics ->> d.metric_key)::numeric;

    if d.repeatable then
      if v_value <= 0 or (v_value::bigint % d.repeat_step::bigint) <> 0 then
        continue;
      end if;
      v_period := v_today;
    else
      if v_value < d.threshold then
        continue;
      end if;
      v_period := 'lifetime';
    end if;

    insert into user_badges (user_id, badge_key, period_key)
    values (p_user_id, d.badge_key, v_period)
    on conflict (user_id, badge_key, period_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then continue; end if;

    perform public.award_points(
      p_user_id, d.point_reward, 'badge_earned',
      'badge', d.badge_key || ':' || v_period, null,
      jsonb_build_object('tier', d.tier, 'metric', d.metric_key));

    v_new := v_new || jsonb_build_object(
      'badgeKey', d.badge_key, 'emoji', d.emoji, 'name', d.name,
      'tier', d.tier, 'points', d.point_reward);
  end loop;

  if jsonb_array_length(v_new) > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (p_user_id, p_user_id, 'badge_earned', null,
            '🏅 배지 획득!',
            '새 배지 ' || jsonb_array_length(v_new) || '개를 얻었어요 — 내 정보에서 확인해 보세요');
  end if;

  return v_new;
end $$;
revoke all on function public.evaluate_badges(uuid) from public, anon, authenticated;

-- 확인: 본인 지표
select public.get_my_badge_metrics();
```

- [ ] **Step 2: 사용자에게 0036 Run 요청**

> `0036`을 SQL Editor에서 Run 해주세요. 에이전트는 마이그레이션을 못 돌립니다. Run 전에는 아래 Step 3 스크립트가 실패합니다.

- [ ] **Step 3: 실 DB 대조 스크립트 작성**

`scripts/badge-metrics-check.mjs`:

```js
// get_my_badge_metrics(RPC) ↔ 원장/집계 직접계산 대조. 실계정 읽기 전용.
// 실행: node scripts/badge-metrics-check.mjs   (사전: 0036 적용)
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const rpc = async (fn, body) =>
  (await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body) })).json();
const get = async (p) => (await fetch(`${U}${p}`, { headers: h })).json();

const profs = await get("/rest/v1/profiles?select=id,nickname");
let pass = 0, fail = 0;
for (const p of profs) {
  // badge_metrics는 service_role로 직접 호출(정의자). p_user_id 지정.
  const m = await rpc("badge_metrics", { p_user_id: p.id });
  const sessions = await get(`/rest/v1/workout_sessions?user_id=eq.${p.id}&status=eq.completed&deleted_at=is.null&select=duration_minutes,record_note`);
  const wc = sessions.length;
  const mins = sessions.reduce((a, s) => a + (s.duration_minutes || 0), 0);
  const rec = sessions.filter((s) => s.record_note !== null).length;
  const ok = Number(m.workout_count) === wc && Number(m.total_minutes) === mins && Number(m.record_beaten) === rec;
  console.log(`${ok ? "PASS" : "FAIL"} ${p.nickname}  RPC(운동 ${m.workout_count}·분 ${m.total_minutes}·기록 ${m.record_beaten}) vs 직접(${wc}·${mins}·${rec})`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} passed`);
```

- [ ] **Step 4: 스크립트 실행(0036 적용 후)**

Run: `node scripts/badge-metrics-check.mjs`
Expected: 모든 계정 `PASS`, 마지막 줄 `N/N passed`

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0036_badge_metrics_rpc.sql scripts/badge-metrics-check.mjs
git commit -m "feat: 0036 배지 진행 지표 조회 RPC + 판정 SQL 공유(DRY)"
```

---

## Task 2: 0037 — 희귀도 컬럼 + 이름·설명 seed

**Files:**
- Create: `supabase/migrations/0037_badge_rarity_and_naming.sql`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0037_badge_rarity_and_naming.sql`:

```sql
-- 0037: 배지 희귀도 컬럼 + 30종 seed(희귀도·일부 이름·사실형 설명)
-- 적용: SQL Editor Run. 여러 번 안전. 0022~0036 수정 금지. 이 파일이 0037.

alter table public.badge_definitions
  add column if not exists rarity text not null default 'common'
    check (rarity in ('common','rare','epic','legend','mythic'));

update public.badge_definitions as b
set rarity = v.rarity, name = v.name, description = v.description
from (values
  ('workout_1','common','첫 발','운동 1회 달성'),
  ('workout_10','common','열 번 찍었개','운동 10회 달성'),
  ('workout_30','rare','습관이 됐개','운동 30회 달성'),
  ('workout_50','rare','쉰 번째','운동 50회 달성'),
  ('workout_100','epic','세 자릿수 클럽','운동 100회 달성'),
  ('workout_200','legend','전설이개도 고개 숙임','운동 200회 달성'),
  ('minutes_300','common','영화 세 편','누적 5시간 운동'),
  ('minutes_1200','rare','인천에서 상파울루','누적 20시간 운동'),
  ('minutes_3000','epic','이틀 꼬박','누적 50시간 운동'),
  ('minutes_6000','legend','나흘을 통째로','누적 100시간 운동'),
  ('streak_5','common','불꽃 5일','5일 연속 달성'),
  ('streak_best_15','rare','슬슬 진심이개','15일 연속 달성'),
  ('streak_best_30','epic','개근상','30일 연속 달성'),
  ('streak_best_60','epic','이쯤 되면 병이개','60일 연속 달성'),
  ('streak_best_100','legend','개도 백일잔치','100일 연속 달성'),
  ('volume_1t','common','대형견 25마리','누적 1톤 볼륨'),
  ('volume_5t','common','코끼리 한 마리','누적 5톤 볼륨'),
  ('volume_20t','rare','시내버스 두 대','누적 20톤 볼륨'),
  ('volume_50t','rare','티라노사우루스 여섯 마리','누적 50톤 볼륨'),
  ('volume_100t','epic','보잉 737 한 대','누적 100톤 볼륨'),
  ('volume_250t','mythic','자유의 여신상','누적 250톤 볼륨'),
  ('cardio_10k','common','동네 한 바퀴 백 번','누적 10km'),
  ('cardio_42k','rare','마라톤 풀코스','누적 42.195km'),
  ('cardio_100k','rare','서울 탈출','누적 100km'),
  ('cardio_250k','epic','서울에서 대구까지','누적 250km'),
  ('cardio_500k','legend','반도 횡단','누적 500km'),
  ('record_beaten_1','common','어제의 나를 이겼개','기록 1회 갱신'),
  ('record_beaten_5','rare','다섯 번 넘었개','기록 5회 갱신'),
  ('record_beaten_10','epic','기록이 무섭개','기록 10회 갱신'),
  ('record_beaten_25','legend','갱신이 취미개','기록 25회 갱신')
) as v(badge_key, rarity, name, description)
where b.badge_key = v.badge_key;

-- 확인
select rarity, count(*) from public.badge_definitions group by rarity order by 1;
```

- [ ] **Step 2: 커밋 + Run 요청**

```bash
git add supabase/migrations/0037_badge_rarity_and_naming.sql
git commit -m "feat: 0037 배지 희귀도 컬럼 + 이름·설명 정비"
```

> `0037`을 Run 해주세요. 마지막 표에서 common~mythic 분포가 나오면 정상입니다.

---

## PHASE B — 도메인 (TDD)

## Task 3: BadgeMeta에 rarity 추가 + 조회 배선

**Files:**
- Modify: `src/lib/domain/badges.ts:8-31`
- Modify: `src/lib/badges.ts`
- Modify: `src/components/crew/member-profile-sheet.test.tsx` (CATALOG 픽스처에 rarity 추가)

- [ ] **Step 1: `BadgeMeta`에 rarity 타입 추가**

`src/lib/domain/badges.ts`의 `BadgeTier` 아래에 추가:

```ts
export type BadgeRarity = "common" | "rare" | "epic" | "legend" | "mythic";
```

`BadgeMeta`에 `tier` 아래 한 줄 추가:

```ts
  tier: BadgeTier;
  rarity: BadgeRarity;
```

- [ ] **Step 2: `getBadgeCatalog`가 rarity를 읽게**

`src/lib/badges.ts`의 select 문자열 끝에 `, rarity` 추가, map에 `rarity: r.rarity as BadgeRarity` 추가(import에 `BadgeRarity` 포함).

```ts
    .select(
      "badge_key, emoji, name, description, tier, rarity, metric_key, threshold, point_reward, repeatable, repeat_step, sort_order",
    )
```
```ts
    tier: r.tier,
    rarity: r.rarity,
```
import 줄: `import type { BadgeMeta, BadgeRarity, EarnedBadge } from "@/lib/domain/badges";`

- [ ] **Step 3: `getMyBadgeMetrics()` 추가**

`src/lib/badges.ts` 끝에 추가:

```ts
import type { BadgeMetricKey } from "@/lib/domain/badges";

/** 배지 진행 지표 6종 (0036 RPC). 진행바·다음 목표 계산의 원천. */
export async function getMyBadgeMetrics(): Promise<Record<BadgeMetricKey, number>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_badge_metrics");
  if (error) throw error;
  const m = (data ?? {}) as Record<string, number | string>;
  const num = (k: string) => Number(m[k] ?? 0);
  return {
    workout_count: num("workout_count"),
    total_minutes: num("total_minutes"),
    streak_days: num("streak_days"),
    weight_volume_kg: num("weight_volume_kg"),
    cardio_distance_m: num("cardio_distance_m"),
    record_beaten: num("record_beaten"),
  };
}
```

- [ ] **Step 4: 기존 테스트 픽스처에 rarity 추가**

`src/components/crew/member-profile-sheet.test.tsx`의 `CATALOG` 3개 항목 각각에 `rarity` 추가(안 하면 typecheck 실패):

```ts
  { key: "record_beaten_1", emoji: "🏅", name: "어제의 나를 이겼개",
    description: "기록 1회 갱신", tier: "bronze", rarity: "common",
    metricKey: "record_beaten", threshold: 1, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 601 },
  { key: "record_beaten_5", emoji: "💪", name: "다섯 번 넘었개",
    description: "기록 5회 갱신", tier: "bronze", rarity: "rare",
    metricKey: "record_beaten", threshold: 5, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 602 },
  { key: "record_beaten_10", emoji: "🔥", name: "기록이 무섭개",
    description: "기록 10회 갱신", tier: "silver", rarity: "epic",
    metricKey: "record_beaten", threshold: 10, pointReward: 800,
    repeatable: false, repeatStep: null, sortOrder: 603 },
```

이 파일의 배지 기대 문구 중 설명을 검사하는 곳이 있으면 새 설명("기록 1회 갱신" 등)에 맞춘다. (Task B 테스트의 "처음으로 지난 기록을 넘었개"→"기록 1회 갱신" 등)

- [ ] **Step 5: 게이트**

Run: `pnpm typecheck && pnpm vitest run src/components/crew/member-profile-sheet.test.tsx`
Expected: 통과

- [ ] **Step 6: 커밋**

```bash
git add src/lib/domain/badges.ts src/lib/badges.ts src/components/crew/member-profile-sheet.test.tsx
git commit -m "feat: BadgeMeta에 rarity + 지표 조회(getMyBadgeMetrics)"
```

---

## Task 4: achievements 도메인 — 희귀도 메타 + 단위 변환 (TDD)

**Files:**
- Create: `src/lib/domain/achievements.ts`
- Create: `src/lib/domain/achievements.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/domain/achievements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RARITY_META, toDisplayUnit } from "./achievements";

describe("RARITY_META", () => {
  it("5단계 모두 라벨·순서를 갖는다", () => {
    expect(RARITY_META.common.label).toBe("COMMON");
    expect(RARITY_META.mythic.label).toBe("MYTHIC");
    expect(RARITY_META.epic.order).toBeGreaterThan(RARITY_META.rare.order);
  });
});

describe("toDisplayUnit", () => {
  it("분을 시간으로", () => {
    expect(toDisplayUnit("total_minutes", 2520)).toEqual({ amount: 42, unit: "시간" });
  });
  it("kg을 톤으로(소수1)", () => {
    expect(toDisplayUnit("weight_volume_kg", 18300)).toEqual({ amount: 18.3, unit: "톤" });
  });
  it("m를 km로(소수1)", () => {
    expect(toDisplayUnit("cardio_distance_m", 83000)).toEqual({ amount: 83, unit: "km" });
  });
  it("운동수·기록은 회, 불꽃은 일", () => {
    expect(toDisplayUnit("workout_count", 7)).toEqual({ amount: 7, unit: "회" });
    expect(toDisplayUnit("record_beaten", 3)).toEqual({ amount: 3, unit: "회" });
    expect(toDisplayUnit("streak_days", 4)).toEqual({ amount: 4, unit: "일" });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/achievements.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`src/lib/domain/achievements.ts`:

```ts
import type { BadgeMetricKey, BadgeRarity } from "./badges";

export const RARITY_META: Record<
  BadgeRarity,
  { label: string; order: number }
> = {
  common: { label: "COMMON", order: 1 },
  rare: { label: "RARE", order: 2 },
  epic: { label: "EPIC", order: 3 },
  legend: { label: "LEGEND", order: 4 },
  mythic: { label: "MYTHIC", order: 5 },
};

/** 원시 지표값 → 화면 단위. 시간=정수, 톤·km=소수1, 나머지=원값. */
export function toDisplayUnit(
  metricKey: BadgeMetricKey,
  raw: number,
): { amount: number; unit: string } {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  switch (metricKey) {
    case "total_minutes":
      return { amount: Math.round(raw / 60), unit: "시간" };
    case "weight_volume_kg":
      return { amount: round1(raw / 1000), unit: "톤" };
    case "cardio_distance_m":
      return { amount: round1(raw / 1000), unit: "km" };
    case "streak_days":
      return { amount: raw, unit: "일" };
    case "workout_count":
    case "record_beaten":
    default:
      return { amount: raw, unit: "회" };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/domain/achievements.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/achievements.ts src/lib/domain/achievements.test.ts
git commit -m "feat: achievements 도메인 — 희귀도 메타 + 단위 변환"
```

---

## Task 5: buildAchievements — 진행률·남은수치 (TDD)

**Files:**
- Modify: `src/lib/domain/achievements.ts`
- Modify: `src/lib/domain/achievements.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`achievements.test.ts` 끝에:

```ts
import { buildAchievements } from "./achievements";
import type { BadgeMeta, EarnedBadge } from "./badges";

function meta(over: Partial<BadgeMeta> = {}): BadgeMeta {
  return {
    key: "workout_10", emoji: "🦴", name: "열 번 찍었개",
    description: "운동 10회 달성", tier: "bronze", rarity: "common",
    metricKey: "workout_count", threshold: 10, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 102, ...over,
  };
}

describe("buildAchievements", () => {
  const metrics = {
    workout_count: 7, total_minutes: 0, streak_days: 7,
    weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0,
  };

  it("미획득 1회성: 현재/목표/진행/남은/잠김을 채운다", () => {
    const [a] = buildAchievements([meta()], [], metrics);
    expect(a.currentValue).toBe(7);
    expect(a.targetValue).toBe(10);
    expect(a.progress).toBeCloseTo(0.7);
    expect(a.remainingValue).toBe(3);
    expect(a.unlocked).toBe(false);
  });

  it("획득한 1회성: 진행 1·남은 0·unlocked", () => {
    const earned: EarnedBadge[] = [
      { badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date("2026-07-20") },
    ];
    const [a] = buildAchievements([meta()], earned, { ...metrics, workout_count: 12 });
    expect(a.unlocked).toBe(true);
    expect(a.progress).toBe(1);
    expect(a.remainingValue).toBe(0);
  });

  it("반복 배지: 목표는 다음 배수, 남은 수치도 그 기준", () => {
    const [a] = buildAchievements(
      [meta({ key: "streak_5", metricKey: "streak_days", threshold: 5, repeatable: true, repeatStep: 5 })],
      [],
      { ...metrics, streak_days: 7 },
    );
    expect(a.targetValue).toBe(10);
    expect(a.remainingValue).toBe(3);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/achievements.test.ts`
Expected: FAIL (`buildAchievements` 없음)

- [ ] **Step 3: 구현**

`achievements.ts`에 추가:

```ts
import type { BadgeMeta, EarnedBadge } from "./badges";

export type Achievement = {
  key: string;
  title: string;
  description: string;
  emoji: string;
  metricKey: BadgeMetricKey;
  rarity: BadgeRarity;
  rewardPoint: number;
  repeatable: boolean;
  currentValue: number;
  targetValue: number;
  progress: number; // 0..1
  remainingValue: number;
  unlocked: boolean;
  count: number; // 반복 획득 횟수
};

function nextRepeatTarget(current: number, step: number): number {
  return (Math.floor(current / step) + 1) * step;
}

/** 카탈로그 + 획득 + 현재 지표 → 퀘스트 모델. sortOrder 순. */
export function buildAchievements(
  catalog: BadgeMeta[],
  earned: EarnedBadge[],
  metrics: Record<BadgeMetricKey, number>,
): Achievement[] {
  const earnedByKey = new Map<string, EarnedBadge[]>();
  for (const e of earned) {
    const list = earnedByKey.get(e.badgeKey) ?? [];
    list.push(e);
    earnedByKey.set(e.badgeKey, list);
  }

  return [...catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const rows = earnedByKey.get(m.key) ?? [];
      const current = metrics[m.metricKey] ?? 0;
      const target =
        m.repeatable && m.repeatStep
          ? nextRepeatTarget(current, m.repeatStep)
          : m.threshold;
      const remaining = Math.max(0, target - current);
      const progress = target <= 0 ? 0 : Math.min(1, current / target);
      return {
        key: m.key,
        title: m.name,
        description: m.description,
        emoji: m.emoji,
        metricKey: m.metricKey,
        rarity: m.rarity,
        rewardPoint: m.pointReward,
        repeatable: m.repeatable,
        currentValue: current,
        targetValue: target,
        progress,
        remainingValue: remaining,
        unlocked: rows.length > 0,
        count: rows.length,
      };
    });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/domain/achievements.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/achievements.ts src/lib/domain/achievements.test.ts
git commit -m "feat: buildAchievements — 진행률·남은수치·반복배지 다음목표"
```

---

## Task 6: 다음 목표 선택 + 완료율 (TDD)

**Files:**
- Modify: `src/lib/domain/achievements.ts`
- Modify: `src/lib/domain/achievements.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`achievements.test.ts` 끝에:

```ts
import { selectNextGoal, categoryCompletion, overallCompletion } from "./achievements";

describe("selectNextGoal", () => {
  const base = { total_minutes: 0, streak_days: 0, weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0 };

  it("미획득 1회성 중 진행률 최고를 뽑는다", () => {
    const cat = [
      meta({ key: "workout_10", threshold: 10 }),
      meta({ key: "workout_30", threshold: 30 }),
    ];
    const goal = selectNextGoal(buildAchievements(cat, [], { ...base, workout_count: 8 }));
    expect(goal?.key).toBe("workout_10"); // 8/10 > 8/30
  });

  it("동률이면 보상이 큰 쪽", () => {
    const cat = [
      meta({ key: "a", threshold: 10, pointReward: 300 }),
      meta({ key: "b", threshold: 10, pointReward: 800 }),
    ];
    const goal = selectNextGoal(buildAchievements(cat, [], { ...base, workout_count: 5 }));
    expect(goal?.key).toBe("b");
  });

  it("반복 배지는 다음 목표로 뽑지 않는다", () => {
    const cat = [meta({ key: "streak_5", metricKey: "streak_days", threshold: 5, repeatable: true, repeatStep: 5 })];
    expect(selectNextGoal(buildAchievements(cat, [], { ...base, streak_days: 3 }))).toBeNull();
  });
});

describe("완료율", () => {
  const base = { total_minutes: 0, streak_days: 0, weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0 };
  const cat = [meta({ key: "workout_10", threshold: 10 }), meta({ key: "workout_30", threshold: 30 })];
  const earned = [{ badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date() }];

  it("카테고리 완료율", () => {
    const c = categoryCompletion(buildAchievements(cat, earned, { ...base, workout_count: 12 }));
    expect(c[0]).toEqual({ metricKey: "workout_count", done: 1, total: 2, pct: 50 });
  });

  it("전체 완료율", () => {
    const o = overallCompletion(buildAchievements(cat, earned, { ...base, workout_count: 12 }));
    expect(o).toEqual({ done: 1, total: 2, pct: 50 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/achievements.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`achievements.ts`에 추가:

```ts
/** 다음 목표: 미획득 1회성 중 진행률 최고, 동률이면 보상 큰 쪽. 없으면 null. */
export function selectNextGoal(items: Achievement[]): Achievement | null {
  const candidates = items.filter((a) => !a.unlocked && !a.repeatable);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, a) => {
    if (a.progress !== best.progress) return a.progress > best.progress ? a : best;
    return a.rewardPoint > best.rewardPoint ? a : best;
  });
}

export type CategoryCompletion = {
  metricKey: BadgeMetricKey;
  done: number;
  total: number;
  pct: number;
};

/** 카테고리(지표)별 완료율. 등장 순서 유지. */
export function categoryCompletion(items: Achievement[]): CategoryCompletion[] {
  const out: CategoryCompletion[] = [];
  for (const a of items) {
    let c = out.find((x) => x.metricKey === a.metricKey);
    if (!c) {
      c = { metricKey: a.metricKey, done: 0, total: 0, pct: 0 };
      out.push(c);
    }
    c.total += 1;
    if (a.unlocked) c.done += 1;
  }
  for (const c of out) c.pct = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
  return out;
}

/** 전체 완료율. */
export function overallCompletion(items: Achievement[]): {
  done: number;
  total: number;
  pct: number;
} {
  const done = items.filter((a) => a.unlocked).length;
  const total = items.length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `pnpm vitest run src/lib/domain/achievements.test.ts`
Expected: PASS

```bash
git add src/lib/domain/achievements.ts src/lib/domain/achievements.test.ts
git commit -m "feat: 다음 목표 선택 + 카테고리·전체 완료율"
```

---

## PHASE C — UI 컴포넌트

## Task 7: ProgressBar + RarityPill (TDD)

**Files:**
- Create: `src/components/profile/progress-bar.tsx`
- Create: `src/components/profile/rarity-pill.tsx`
- Create: `src/components/profile/progress-bar.test.tsx`
- Create: `src/components/profile/rarity-pill.test.tsx`

- [ ] **Step 1: 실패 테스트**

`progress-bar.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("진행률을 width %로, 상태 색을 반영한다", () => {
    const html = renderToStaticMarkup(<ProgressBar progress={0.7} state="active" />);
    expect(html).toContain("70%");
  });
  it("100%를 넘겨도 100%로 고정", () => {
    const html = renderToStaticMarkup(<ProgressBar progress={1.5} state="earned" />);
    expect(html).toContain("100%");
    expect(html).not.toContain("150%");
  });
});
```

`rarity-pill.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RarityPill } from "./rarity-pill";

describe("RarityPill", () => {
  it("희귀도 라벨을 대문자로 보여준다", () => {
    expect(renderToStaticMarkup(<RarityPill rarity="epic" />)).toContain("EPIC");
    expect(renderToStaticMarkup(<RarityPill rarity="mythic" />)).toContain("MYTHIC");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/profile/progress-bar.test.tsx src/components/profile/rarity-pill.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`progress-bar.tsx`:

```tsx
type BarState = "locked" | "active" | "earned";

const FILL: Record<BarState, string> = {
  locked: "bg-line",
  active: "bg-amber-400",
  earned: "bg-accent",
};

/** 진행바. width는 인라인 style로 % 지정(트랜지션 0.3s ease-out). */
export function ProgressBar({
  progress,
  state,
}: {
  progress: number;
  state: BarState;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${FILL[state]}`}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
```

`rarity-pill.tsx`:

```tsx
import { RARITY_META } from "@/lib/domain/achievements";
import type { BadgeRarity } from "@/lib/domain/badges";

const PILL: Record<BadgeRarity, string> = {
  common: "bg-surface-2 text-faint border-line",
  rare: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  epic: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  legend: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  mythic: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

/** 희귀도 pill — 배지 우상단. */
export function RarityPill({ rarity }: { rarity: BadgeRarity }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide ${PILL[rarity]}`}
    >
      {RARITY_META[rarity].label}
    </span>
  );
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `pnpm vitest run src/components/profile/progress-bar.test.tsx src/components/profile/rarity-pill.test.tsx`
Expected: PASS

```bash
git add src/components/profile/progress-bar.tsx src/components/profile/rarity-pill.tsx src/components/profile/progress-bar.test.tsx src/components/profile/rarity-pill.test.tsx
git commit -m "feat: ProgressBar + RarityPill 컴포넌트"
```

---

## Task 8: NextGoalCard (TDD)

**Files:**
- Create: `src/components/profile/next-goal-card.tsx`
- Create: `src/components/profile/next-goal-card.test.tsx`

- [ ] **Step 1: 실패 테스트**

`next-goal-card.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextGoalCard } from "./next-goal-card";
import type { Achievement } from "@/lib/domain/achievements";

const goal: Achievement = {
  key: "workout_10", title: "열 번 찍었개", description: "운동 10회 달성",
  emoji: "🦴", metricKey: "workout_count", rarity: "common", rewardPoint: 300,
  repeatable: false, currentValue: 7, targetValue: 10, progress: 0.7,
  remainingValue: 3, unlocked: false, count: 0,
};

describe("NextGoalCard", () => {
  it("제목·현재/목표·남은수치·보상을 보여준다", () => {
    const html = renderToStaticMarkup(<NextGoalCard goal={goal} />);
    expect(html).toContain("다음 목표");
    expect(html).toContain("열 번 찍었개");
    expect(html).toContain("7 / 10회");
    expect(html).toContain("앞으로 3회");
    expect(html).toContain("+300");
    expect(html).toContain("70%");
  });

  it("goal이 null이면 다 모았다는 문구", () => {
    const html = renderToStaticMarkup(<NextGoalCard goal={null} />);
    expect(html).toContain("모든 목표");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/profile/next-goal-card.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`next-goal-card.tsx`:

```tsx
import Image from "next/image";
import { toDisplayUnit, type Achievement } from "@/lib/domain/achievements";
import { ProgressBar } from "./progress-bar";

/** 최상단 "다음 목표" 카드 — 열자마자 한 번 더 하게 만드는 핵심. */
export function NextGoalCard({ goal }: { goal: Achievement | null }) {
  if (!goal) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <p className="text-[11px] font-extrabold text-accent">다음 목표</p>
        <p className="mt-1 text-sm font-bold">모든 목표를 달성했어요 🎉</p>
      </section>
    );
  }
  const cur = toDisplayUnit(goal.metricKey, goal.currentValue);
  const tgt = toDisplayUnit(goal.metricKey, goal.targetValue);
  const rem = toDisplayUnit(goal.metricKey, goal.remainingValue);
  return (
    <section className="rounded-card border border-accent/40 bg-accent-weak p-4 shadow-card">
      <p className="text-[11px] font-extrabold text-accent">다음 목표</p>
      <div className="mt-2 flex items-center gap-3">
        <Image src={`/badges/${goal.key}.png`} alt="" width={48} height={48} sizes="48px" className="flex-none opacity-40 grayscale" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">{goal.title}</p>
          <p className="text-[11.5px] text-muted">{goal.description}</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar progress={goal.progress} state="active" />
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[12.5px] font-bold">
            {cur.amount} / {tgt.amount}{tgt.unit}
          </span>
          <span className="text-[11.5px] text-muted">
            앞으로 {rem.amount}{rem.unit}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
        <span className="text-[11px] text-muted">획득 보상</span>
        <span className="text-sm font-extrabold text-accent">+{goal.rewardPoint} P</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `pnpm vitest run src/components/profile/next-goal-card.test.tsx`
Expected: PASS

```bash
git add src/components/profile/next-goal-card.tsx src/components/profile/next-goal-card.test.tsx
git commit -m "feat: NextGoalCard — 다음 목표 강조 카드"
```

---

## Task 9: BadgeSheet 재작성 — 퀘스트 화면 (TDD)

**Files:**
- Modify: `src/components/profile/badge-sheet.tsx`
- Create: `src/components/profile/badge-sheet.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`badge-sheet.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeSheet } from "./badge-sheet";
import { buildAchievements } from "@/lib/domain/achievements";
import type { BadgeMeta } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_10", emoji: "🦴", name: "열 번 찍었개", description: "운동 10회 달성",
    tier: "bronze", rarity: "common", metricKey: "workout_count", threshold: 10,
    pointReward: 300, repeatable: false, repeatStep: null, sortOrder: 102 },
  { key: "workout_30", emoji: "💪", name: "습관이 됐개", description: "운동 30회 달성",
    tier: "silver", rarity: "rare", metricKey: "workout_count", threshold: 30,
    pointReward: 800, repeatable: false, repeatStep: null, sortOrder: 103 },
];

function sheet(workoutCount: number) {
  const metrics = {
    workout_count: workoutCount, total_minutes: 0, streak_days: 0,
    weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0,
  };
  const earned = workoutCount >= 10
    ? [{ badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date("2026-07-20") }]
    : [];
  return buildAchievements(CATALOG, earned, metrics);
}

describe("BadgeSheet 퀘스트", () => {
  it("전체 완료율과 카테고리 완료율을 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    expect(html).toContain("1 / 2"); // 전체 완료
    expect(html).toContain("50%");
  });

  it("미획득 배지에 현재/목표·남은수치를 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    // workout_30 미획득: 12/30, 남은 18
    expect(html).toContain("12 / 30회");
    expect(html).toContain("앞으로 18회");
  });

  it("희귀도 라벨과 보상을 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    expect(html).toContain("RARE");
    expect(html).toContain("+800");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/profile/badge-sheet.test.tsx`
Expected: FAIL (BadgeSheet가 아직 `shelf` prop을 받음)

- [ ] **Step 3: 재작성**

`src/components/profile/badge-sheet.tsx` 전체 교체:

```tsx
"use client";

import Image from "next/image";
import {
  categoryCompletion,
  overallCompletion,
  toDisplayUnit,
  type Achievement,
} from "@/lib/domain/achievements";
import type { BadgeMetricKey } from "@/lib/domain/badges";
import { ProgressBar } from "./progress-bar";
import { RarityPill } from "./rarity-pill";

const METRIC_LABEL: Record<BadgeMetricKey, string> = {
  workout_count: "운동 횟수",
  total_minutes: "운동 시간",
  streak_days: "불꽃",
  weight_volume_kg: "웨이트 볼륨",
  cardio_distance_m: "유산소 거리",
  record_beaten: "기록 갱신",
};

function AchievementRow({ a }: { a: Achievement }) {
  const cur = toDisplayUnit(a.metricKey, a.currentValue);
  const tgt = toDisplayUnit(a.metricKey, a.targetValue);
  const rem = toDisplayUnit(a.metricKey, a.remainingValue);
  const state = a.unlocked ? "earned" : a.progress > 0 ? "active" : "locked";
  return (
    <li className="rounded-card-sm border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-3">
        <Image
          src={`/badges/${a.key}.png`}
          alt=""
          width={44}
          height={44}
          sizes="44px"
          className={a.unlocked ? "flex-none" : "flex-none opacity-30 grayscale"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-extrabold">{a.title}</p>
            {a.count > 1 && <span className="text-[11px] font-bold text-accent">×{a.count}</span>}
          </div>
          <p className="truncate text-[11px] text-muted">{a.description}</p>
        </div>
        <RarityPill rarity={a.rarity} />
      </div>

      <div className="mt-2.5">
        <ProgressBar progress={a.progress} state={state} />
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[11.5px] font-bold">
            {cur.amount} / {tgt.amount}{tgt.unit}
          </span>
          {a.unlocked ? (
            <span className="text-[11px] font-extrabold text-accent">+{a.rewardPoint} P</span>
          ) : (
            <span className="text-[11px] text-muted">🔒 앞으로 {rem.amount}{rem.unit}</span>
          )}
        </div>
      </div>
    </li>
  );
}

/** 배지 전체 시트 = 퀘스트 화면. 완료율·카테고리·배지별 진행. */
export function BadgeSheet({
  achievements,
  onClose,
}: {
  achievements: Achievement[];
  onClose: () => void;
}) {
  const overall = overallCompletion(achievements);
  const cats = categoryCompletion(achievements);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-sheet-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-baseline justify-between">
          <h3 id="badge-sheet-title" className="text-lg font-extrabold">업적</h3>
          <p className="text-[12.5px] font-bold">
            {overall.done} / {overall.total}
            <span className="ml-1.5 text-muted">{overall.pct}%</span>
          </p>
        </div>
        <div className="mt-2">
          <ProgressBar progress={overall.total ? overall.done / overall.total : 0} state="active" />
        </div>

        {cats.map((c) => {
          const items = achievements.filter((a) => a.metricKey === c.metricKey);
          return (
            <section key={c.metricKey} className="mt-5">
              <div className="flex items-baseline justify-between">
                <h4 className="text-[12.5px] font-extrabold">{METRIC_LABEL[c.metricKey]}</h4>
                <p className="text-[11px] text-muted">{c.done} / {c.total} · {c.pct}%</p>
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((a) => (
                  <AchievementRow key={a.key} a={a} />
                ))}
              </ul>
            </section>
          );
        })}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          닫기
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/components/profile/badge-sheet.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/profile/badge-sheet.tsx src/components/profile/badge-sheet.test.tsx
git commit -m "feat: BadgeSheet를 퀘스트 화면으로 재작성(완료율·진행·희귀도)"
```

---

## Task 10: 획득 애니메이션 자리 분리 (구조만)

**Files:**
- Create: `src/components/profile/badge-earn-animation.tsx`
- Create: `src/components/profile/badge-earn-animation.test.tsx`

향후 "확대→반짝임→+P→완료" 연출을 붙일 자리를 컴포넌트로 분리한다. 지금은 정적 표시만(동작 없음) — 스펙 #11 "구조 설계".

- [ ] **Step 1: 실패 테스트**

`badge-earn-animation.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeEarnAnimation } from "./badge-earn-animation";

describe("BadgeEarnAnimation", () => {
  it("배지 이름과 보상을 보여준다(정적)", () => {
    const html = renderToStaticMarkup(
      <BadgeEarnAnimation badgeKey="workout_10" name="열 번 찍었개" points={300} />,
    );
    expect(html).toContain("열 번 찍었개");
    expect(html).toContain("+300");
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `pnpm vitest run src/components/profile/badge-earn-animation.test.tsx` → FAIL

`badge-earn-animation.tsx`:

```tsx
import Image from "next/image";

/**
 * 배지 획득 연출 자리(구조). 지금은 정적. 향후 확대·반짝임·+P·진동을
 * 여기 한 곳에서 붙인다(CSS transition/keyframe + navigator.vibrate).
 */
export function BadgeEarnAnimation({
  badgeKey,
  name,
  points,
}: {
  badgeKey: string;
  name: string;
  points: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center" data-earn-anim>
      <Image src={`/badges/${badgeKey}.png`} alt="" width={96} height={96} sizes="96px" />
      <p className="text-base font-extrabold">{name}</p>
      <p className="text-sm font-extrabold text-accent">+{points} P</p>
    </div>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `pnpm vitest run src/components/profile/badge-earn-animation.test.tsx` → PASS

```bash
git add src/components/profile/badge-earn-animation.tsx src/components/profile/badge-earn-animation.test.tsx
git commit -m "feat: 배지 획득 연출 컴포넌트 자리 분리(구조)"
```

---

## PHASE D — 배선 · 배포

## Task 11: growth-hub 배선

**Files:**
- Modify: `src/components/profile/growth-hub.tsx`

성장 허브가 지표를 조회해 `Achievement[]`를 만들고, NextGoalCard와 새 BadgeSheet에 넘긴다. BadgeShowcase는 기존대로(보유 진열) 두되, 시트 진입은 유지.

- [ ] **Step 1: import·상태 교체**

`growth-hub.tsx` import에 추가:

```tsx
import { NextGoalCard } from "@/components/profile/next-goal-card";
import { getMyBadgeMetrics } from "@/lib/badges";
import {
  buildAchievements,
  selectNextGoal,
  type Achievement,
} from "@/lib/domain/achievements";
import type { BadgeMetricKey } from "@/lib/domain/badges";
```

`HubData`의 `shelf: BadgeShelfItem[];`를 아래로 교체:

```tsx
  shelf: BadgeShelfItem[];
  achievements: Achievement[];
```

- [ ] **Step 2: 조회 effect에 지표 추가**

`Promise.all` 배열에 `getMyBadgeMetrics()`를 더하고 구조분해에 `metrics` 추가:

```tsx
        const [summary, rewards, unlocks, transactions, wallet, catalog, earned, sessions, metrics] =
          await Promise.all([
            getProgressSummary(),
            getLevelRewards(),
            getMyUnlocks(),
            getRecentXpTransactions(),
            getMyWallet(),
            getBadgeCatalog(),
            getMyBadges(),
            supabase
              .from("workout_sessions")
              .select("completed_at")
              .eq("status", "completed")
              .is("deleted_at", null)
              .not("completed_at", "is", null),
            getMyBadgeMetrics(),
          ]);
```

`setData({...})`에 `achievements` 추가:

```tsx
        if (!cancelled)
          setData({
            summary, rewards, unlocks, transactions,
            balance: wallet.balance,
            streakDays,
            shelf: badgeShelf(catalog, earned),
            achievements: buildAchievements(catalog, earned, metrics as Record<BadgeMetricKey, number>),
          });
```

- [ ] **Step 3: 렌더 배선**

구조분해에 `achievements` 추가:

```tsx
  const { summary, rewards, unlocks, transactions, balance, streakDays, shelf, achievements } = data;
```

`<BadgeShowcase ... />` 위에 다음 목표 카드 추가:

```tsx
      <NextGoalCard goal={selectNextGoal(achievements)} />
```

`{badgeSheetOpen && (...)}`의 `BadgeSheet` prop을 `shelf`에서 `achievements`로 교체:

```tsx
      {badgeSheetOpen && (
        <BadgeSheet achievements={achievements} onClose={() => setBadgeSheetOpen(false)} />
      )}
```

`shelf`가 이제 BadgeShowcase에서만 쓰이면 유지, 안 쓰이면 제거(BadgeShowcase는 계속 shelf 사용 → 유지).

- [ ] **Step 4: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/components/profile/growth-hub.tsx
git commit -m "feat: 성장 허브에 다음 목표 카드 + 퀘스트 배지 시트 배선"
```

---

## Task 12: 최종 게이트 · 실 DB · 배포 · 알림

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0 · 타입 0 · 테스트 전부 PASS · 빌드 성공

- [ ] **Step 2: 실 DB 재검증(0036·0037 적용 후)**

```bash
node scripts/badge-metrics-check.mjs
node scripts/badge-point-check.mjs
node scripts/streak-parity-check.mjs
```
Expected: 지표 대조 `N/N passed` · 배지 엔진 14/14 · 불꽃 0건 (판정 DRY 리팩터가 기존 판정을 안 바꿨음을 확인)

- [ ] **Step 3: 배포**

```bash
pnpm dlx vercel deploy --prod --yes
```
`/profile` 200 확인 + 번들 grep: `다음 목표` · `앞으로` · `EPIC`(또는 `RARE`) · 완료율 표기.

- [ ] **Step 4: 실기기 확인 요청**

> 폰 내 정보에서:
> 1. 최상단 "다음 목표" 카드가 진행률·남은수치·보상과 함께 뜨는지
> 2. "전체 보기" → 상단 전체 완료율 바, 카테고리별 완료율, 배지마다 진행바·현재/목표·남은수치·희귀도 pill이 보이는지
> 3. 미획득 배지에 "🔒 앞으로 N…"이 보이는지
> 4. 정보 밀도가 높아도 한 화면에서 읽히는지

- [ ] **Step 5: 릴리스 알림 (프로세스대로)**

`src/lib/domain/release-notes.data.json` 맨 앞에 항목 추가:

```json
{
  "id": "2026-07-XX-quest-ux",
  "date": "2026-07-XX",
  "title": "업적이 퀘스트가 됐어요",
  "summary": "다음 목표·진행률·희귀도로 다시 태어난 업적 화면 🎯",
  "highlights": [
    "내 정보 맨 위에 '다음 목표'가 떠요. 앞으로 몇 번만 더 하면 되는지 한눈에.",
    "모든 배지에 진행바와 남은 수치가 생겼어요.",
    "배지마다 희귀도(COMMON~MYTHIC)와 완료율을 볼 수 있어요."
  ]
}
```

배포 후: `pnpm release:notify`(미리보기) → 사용자 확인 → `node scripts/broadcast-release.mjs --send`.

- [ ] **Step 6: PROGRESS.md 갱신 + 커밋**

최상단에 섹션 추가(0036·0037 적용·검증 실측치·커밋 해시·범위밖).

```bash
git add PROGRESS.md src/lib/domain/release-notes.data.json
git commit -m "docs: 업적 퀘스트 UX 진행 기록"
```

---

## Self-Review 체크리스트

- [ ] 다음 목표 카드(#1) — Task 8·11
- [ ] 모든 배지 진행률 표시(#2) — Task 5·9
- [ ] 진행바(#3, 0.3s ease-out)(색: 잠김 회색/진행 골드/획득 accent) — Task 7·9
- [ ] 남은 수치(#4, 회·km·시간·일) — Task 4·5·9
- [ ] 희귀도(#5, pill·색) — Task 2·7·9
- [ ] 보상 강조(#6, 구조 확장 여지) — Task 9(향후 필드 추가는 badge_definitions 컬럼로)
- [ ] 카테고리 완료율(#7) — Task 6·9
- [ ] 전체 완료율(#8) — Task 6·9
- [ ] 네이밍 개선(#9, 이름 중심·설명 사실 한 줄) — Task 2
- [ ] 잠긴 배지 남은 조건(#10) — Task 9
- [ ] 획득 애니메이션 구조 분리(#11) — Task 10
- [ ] 데이터 구조(#12, Achievement 모델) — Task 5
- [ ] 모바일 정보 밀도·가독성(#13/DoD) — Task 9(카드형 행·작은 pill·2줄 요약)
- [ ] 진행 지표 ↔ 판정 SQL 공유(갈라짐 방지) — Task 1
- [ ] 0036·0037 신규 파일, 0022~0035 미수정
```
