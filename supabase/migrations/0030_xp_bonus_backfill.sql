-- 0030: XP 미지급분 소급 (보너스 누락 + 무효 판정 피해)
-- 적용: SQL Editor에 전체 붙여넣기 → Run. **여러 번 돌려도 안전하다(멱등).**
-- 선행: 0024·0027 적용 + 사진 XP 배선 배포 완료.
--
-- 소급 대상은 두 종류다.
--
--   A. 보너스 누락 — XP는 받았으나 기록·사진 보너스가 덜 붙은 세션
--      ① 0027 이전: 유산소 세트가 섞이면 기록 완성 10점이 통째로 날아갔다.
--         (유산소 세트는 설계상 reps가 null이고 거리·시간으로 기록한다)
--      ② 사진 10점: 사진은 항상 완료 뒤에 올라오는데 후등록 RPC 호출부가
--         없어 아무에게도 지급되지 않았다.
--
--   B. 무효 판정 피해 — 정당한 운동인데 XP가 아예 0이었던 세션
--      0024 이전 is_valid_workout은 "완료 세트 3개 이상"만 유효로 봤다.
--      유산소는 1세션이 1세트라 37분 걷기 같은 운동이 무효가 됐다.
--      0024가 규칙은 고쳤지만 그때 피해 세션을 소급하지는 않았다.
--
-- 방식: 금액을 사람이 계산해 적지 않는다. 아래 쿼리가 **지금 규칙으로 다시
--       판정**해 받았어야 할 값과 실제 받은 값의 차이만 지급한다.
--
-- 원장 원칙(0022): 원장은 수정하지 않는다. 정정은 새 거래를 추가한다.
--
-- 알림은 보내지 않는다. 소급은 축하할 사건이 아니라 정정이므로
-- apply_xp_and_progress를 우회하고 user_progress를 직접 갱신한다.

do $$
declare
  v_rows int;
  v_total int;
  v_launch timestamptz;
begin

-- XP 시스템이 실제로 돌기 시작한 시점. 그 전 세션은 XP가 없는 게 정상이다.
select min(created_at) into v_launch from xp_transactions;
raise notice 'XP 시스템 가동 시점: %', v_launch;

-- ── A) 보너스 누락 소급 ─────────────────────────────────────
with recomputed as (
  select
    t.user_id,
    t.source_id,
    t.effective_date,
    coalesce((t.metadata->>'record_xp')::int, 0) as old_record_xp,
    coalesce((t.metadata->>'photo_xp')::int, 0)  as old_photo_xp,
    case
      when coalesce((t.metadata->>'is_tabata')::boolean, false) then 0
      when exists (
             select 1 from workout_sets ws
             join workout_exercises we on we.id = ws.workout_exercise_id
             where we.session_id = t.source_id::uuid and ws.is_completed
           )
       and not exists (
             select 1 from workout_sets ws
             join workout_exercises we on we.id = ws.workout_exercise_id
             where we.session_id = t.source_id::uuid and ws.is_completed
               and ws.reps is null
               and coalesce(ws.duration_seconds, 0) <= 0
               and coalesce(ws.distance_meters, 0) <= 0
           )
      then 10 else 0
    end as new_record_xp,
    case when exists (
      select 1 from workout_images wi
      where wi.session_id = t.source_id::uuid and wi.image_path is not null
    ) then 10 else 0 end as new_photo_xp
  from xp_transactions t
  where t.transaction_type = 'earn'
    and t.reason = 'workout_completed'
    and t.source_type = 'workout'
),
owed as (
  select
    user_id, source_id, effective_date,
    new_record_xp - old_record_xp as record_delta,
    new_photo_xp  - old_photo_xp  as photo_delta,
    (new_record_xp - old_record_xp) + (new_photo_xp - old_photo_xp) as amount
  from recomputed
  where (new_record_xp - old_record_xp) + (new_photo_xp - old_photo_xp) > 0
),
inserted_a as (
  insert into xp_transactions
    (user_id, amount, transaction_type, reason, source_type, source_id,
     effective_date, rule_version, metadata)
  select
    o.user_id, o.amount, 'admin_adjustment', 'admin_adjustment',
    'xp_bonus_backfill', o.source_id, o.effective_date, 'xp_v1',
    jsonb_build_object(
      'cause', 'record_and_photo_bonus_bugfix',
      'record_xp', o.record_delta,
      'photo_xp', o.photo_delta)
  from owed o
  where not exists (
    select 1 from xp_transactions x
    where x.user_id = o.user_id
      and x.source_type = 'xp_bonus_backfill'
      and x.source_id = o.source_id
  )
  returning amount
)
select count(*), coalesce(sum(amount), 0) into v_rows, v_total from inserted_a;
raise notice 'A) 보너스 누락 소급: % 건, % XP', v_rows, v_total;

-- ── B) 무효 판정 피해 소급 ──────────────────────────────────
-- reward_group='daily_workout' + transaction_type='earn'으로 넣으면
-- xp_daily_workout_reward_unique 인덱스가 **하루 1회 제한을 DB가 강제**한다.
-- 같은 날 이미 XP를 받은 유저에게는 인덱스가 알아서 막아준다.
with candidate as (
  select distinct on (s.user_id, (s.completed_at at time zone 'Asia/Seoul')::date)
    s.id, s.user_id, s.duration_minutes,
    (s.tabata_minutes is not null) as is_tabata,
    (s.completed_at at time zone 'Asia/Seoul')::date as eff_date
  from workout_sessions s
  where s.status = 'completed'
    and s.deleted_at is null
    and s.completed_at is not null
    and s.started_at is not null
    and s.completed_at >= v_launch          -- XP 시스템 가동 이후만
    and s.duration_minutes >= 0
    and s.duration_minutes < 360
    -- 이 세션으로 받은 XP가 아예 없다
    and not exists (
      select 1 from xp_transactions x
      where x.source_type = 'workout' and x.source_id = s.id::text
    )
    -- 지금 규칙(0024)으로는 유효한 운동이다
    and (
      s.tabata_minutes is not null
      or (select count(*) from workout_sets ws
          join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = s.id and ws.is_completed) >= 3
      or exists (
          select 1 from workout_sets ws
          join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = s.id and ws.is_completed
            and (coalesce(ws.distance_meters, 0) > 0
                 or coalesce(ws.duration_seconds, 0) > 0))
    )
  order by s.user_id, (s.completed_at at time zone 'Asia/Seoul')::date, s.completed_at
),
priced as (
  select
    c.*,
    100 as base_xp,
    case when c.duration_minutes >= 90 then 40
         when c.duration_minutes >= 60 then 30
         when c.duration_minutes >= 40 then 20
         when c.duration_minutes >= 20 then 10 else 0 end as duration_xp,
    case
      when c.is_tabata then 0
      when exists (select 1 from workout_sets ws
                   join workout_exercises we on we.id = ws.workout_exercise_id
                   where we.session_id = c.id and ws.is_completed)
       and not exists (select 1 from workout_sets ws
                   join workout_exercises we on we.id = ws.workout_exercise_id
                   where we.session_id = c.id and ws.is_completed
                     and ws.reps is null
                     and coalesce(ws.duration_seconds, 0) <= 0
                     and coalesce(ws.distance_meters, 0) <= 0)
      then 10 else 0 end as record_xp,
    case when exists (select 1 from workout_images wi
                      where wi.session_id = c.id and wi.image_path is not null)
         then 10 else 0 end as photo_xp
  from candidate c
),
inserted_b as (
  insert into xp_transactions
    (user_id, amount, transaction_type, reason, reward_group,
     source_type, source_id, effective_date, rule_version, metadata)
  select
    p.user_id,
    p.base_xp + p.duration_xp + p.record_xp + p.photo_xp,
    'earn', 'historical_backfill', 'daily_workout',
    'workout', p.id::text, p.eff_date, 'xp_v1',
    jsonb_build_object(
      'cause', 'invalid_workout_misjudgement',
      'base_xp', p.base_xp, 'duration_xp', p.duration_xp,
      'plan_xp', 0, 'record_xp', p.record_xp, 'photo_xp', p.photo_xp,
      'duration_minutes', p.duration_minutes, 'is_tabata', p.is_tabata)
  from priced p
  on conflict do nothing                    -- 하루 1회·세션 중복 모두 인덱스가 막는다
  returning amount
)
select count(*), coalesce(sum(amount), 0) into v_rows, v_total from inserted_b;
raise notice 'B) 무효 판정 피해 소급: % 건, % XP', v_rows, v_total;

-- ── C) 진행 캐시 재계산 ─────────────────────────────────────
-- total_xp는 캐시다(0022). 원장 SUM으로 다시 세우면 어떤 경우에도 어긋나지 않는다.
update user_progress up
set total_xp = led.sum_xp,
    current_level = lv.level,
    current_stage = lv.stage_index,
    updated_at = now()
from (
  select user_id, greatest(0, sum(amount))::int as sum_xp
  from xp_transactions
  group by user_id
) led
cross join lateral (
  select level, stage_index
  from level_definitions
  where required_total_xp <= led.sum_xp
  order by required_total_xp desc
  limit 1
) lv
where up.user_id = led.user_id
  and (up.total_xp <> led.sum_xp
       or up.current_level <> lv.level
       or up.current_stage <> lv.stage_index);

get diagnostics v_rows = row_count;
raise notice 'C) 진행 캐시 갱신: % 명', v_rows;

end $$;

-- ── 결과 확인 ───────────────────────────────────────────────
select
  p.nickname,
  up.total_xp,
  up.current_level,
  up.current_stage,
  coalesce(bf.backfilled, 0) as 소급받은_xp
from user_progress up
join profiles p on p.id = up.user_id
left join (
  select user_id, sum(amount)::int as backfilled
  from xp_transactions
  where source_type = 'xp_bonus_backfill'
     or reason = 'historical_backfill'
  group by user_id
) bf on bf.user_id = up.user_id
order by up.total_xp desc;

-- ── 되돌리려면 ──────────────────────────────────────────────
-- 소급 거래만 지우고 캐시를 다시 세우면 원상복구된다.
-- (원본 workout_completed 거래는 건드리지 않았으므로 손실이 없다)
--
--   delete from xp_transactions
--   where source_type = 'xp_bonus_backfill' or reason = 'historical_backfill';
--   -- 이어서 위 §C 블록의 update 문을 그대로 한 번 더 실행
