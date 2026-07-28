-- 0040: 챌린지 성과 열람을 "전원 순위표"에서 "지정한 한 명"으로
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0039는 수정 금지.
--
-- 왜: 5일 연속 달성으로 열리는 2시간 창에서 지금은 크루 전원의 순위·점수가
-- 통째로 보인다. 이걸 "내 성과 + 내가 고른 한 명"으로 좁힌다(사용자 결정).
-- 고른 사람은 그 창 동안 바꿀 수 없다 — 아무나 다 열어보는 걸 막는 게 목적이라
-- 자유롭게 바꿀 수 있으면 사실상 전원 열람과 같아진다.
--
-- ⚠ 한계를 분명히 해 둔다. 순위 점수는 클라이언트가 user_goals·workout_sessions를
--    읽어 직접 계산한다(getActiveChallengeRanking). 그 두 테이블의 RLS는 여전히
--    그룹 기준이라, 이 잠금은 화면 규칙이지 데이터 경계가 아니다. 진짜 경계로
--    만들려면 순위 계산을 정의자 RPC로 옮겨야 하고, 그건 챌린지 개편 몫이다.

-- ── 1. 선택 기록 ─────────────────────────────────────────────
-- 열람 창은 "오늘 첫 완료 시각 + 2시간"이라 KST 하루에 최대 하나다(viewing-pass.ts).
-- 그래서 (보는 사람, 챌린지, KST 날짜)가 창을 유일하게 가리킨다.
create table if not exists public.challenge_peek_picks (
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  pick_date date not null,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (viewer_id, challenge_id, pick_date),
  constraint challenge_peek_picks_not_self check (viewer_id <> target_id)
);

-- ── 2. RLS — 본인 것만 읽고, 쓰기는 RPC로만 ──────────────────
alter table public.challenge_peek_picks enable row level security;
revoke all on public.challenge_peek_picks from anon, authenticated;
grant select on public.challenge_peek_picks to authenticated;

drop policy if exists "challenge_peek_picks_own_select" on public.challenge_peek_picks;
create policy "challenge_peek_picks_own_select" on public.challenge_peek_picks
  for select to authenticated
  using (viewer_id = auth.uid());

-- ── 3. 선택 RPC ──────────────────────────────────────────────
-- 이미 오늘 고른 게 있으면 그걸 그대로 돌려준다(덮어쓰지 않는다). 그래서 두 번째
-- 호출은 실패가 아니라 "이미 고른 사람"을 알려주는 조회가 된다 — 화면이 새로고침
-- 뒤에도 같은 사람을 보여줄 수 있다.
create or replace function public.pick_challenge_peek(
  p_challenge_id uuid, p_target_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_group uuid;
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  v_target uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_pick'; end if;

  select group_id into v_group from challenges
  where id = p_challenge_id and status = 'active';
  if not found then raise exception 'challenge_not_active'; end if;

  -- 보는 사람도 대상도 그 챌린지의 실제 참가자여야 한다. 그룹 소속만으로는
  -- 부족하다 — 목표를 세우지 않은 사람은 순위표에 아예 없어서 고르면 빈 카드가 된다.
  if not exists (
    select 1 from user_goals
    where challenge_id = p_challenge_id and user_id = v_me
  ) then
    raise exception 'not_participant';
  end if;
  if not exists (
    select 1 from user_goals
    where challenge_id = p_challenge_id and user_id = p_target_id
  ) then
    raise exception 'target_not_participant';
  end if;

  insert into challenge_peek_picks (viewer_id, challenge_id, pick_date, target_id)
  values (v_me, p_challenge_id, v_date, p_target_id)
  on conflict (viewer_id, challenge_id, pick_date) do nothing;

  select target_id into v_target from challenge_peek_picks
  where viewer_id = v_me
    and challenge_id = p_challenge_id
    and pick_date = v_date;

  -- locked = 이미 다른 사람을 골라 뒀다는 뜻. 화면은 이걸로 "오늘은 ○○님만
  -- 볼 수 있어요"를 띄운다.
  return jsonb_build_object(
    'targetId', v_target,
    'locked', v_target is distinct from p_target_id
  );
end $$;
revoke all on function public.pick_challenge_peek(uuid, uuid) from public, anon;
grant execute on function public.pick_challenge_peek(uuid, uuid) to authenticated;
