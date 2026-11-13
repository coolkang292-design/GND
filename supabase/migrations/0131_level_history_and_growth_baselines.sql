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
