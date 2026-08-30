-- 0090: 진행 중(active) 챌린지에서 목표를 **올리는 것만** 허용
-- 결정: 사용자 2026-08-31 ("올리는 것만 허용")
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0089는 수정하지 않는다.
--
-- ⚠️ 0089보다 **나중에** Run 해야 한다. 둘은 서로 안 겹치지만 번호 순서를
--    지키는 편이 다음 사람이 이력을 읽기 쉽다.
--
-- ⚠️ 배포보다 먼저 Run 해도 안전하다. 옛 클라이언트는 active에서 목표 편집
--    화면을 아예 열지 않으므로, 규칙이 넓어져도 부를 사람이 없다.
--
-- ── 무엇이 문제였나 ──────────────────────────────────────────
--
-- 지금은 `goals_update_own_setup`의 `challenge_in_setup`이 막아서, 시작하고 나면
-- 목표를 한 글자도 못 고친다. 잘못 넣은 목표를 4주 내내 안고 가야 한다.
--
-- 그렇다고 자유롭게 열면 **막판에 목표를 낮춰 100%를 만들 수 있다.** 랭킹이
-- 달성률로 서는데 분모를 사용자가 고칠 수 있으면 순위가 의미를 잃는다.
--
-- 그래서 **올리기만** 허용한다. 의욕이 생겨 상향하는 길은 열고, 물러설 길은 막는다.
--
-- ── ⚠️ RLS만으로는 못 한다 ───────────────────────────────────
--
-- `WITH CHECK`는 **새 행만** 본다. 옛 값과 비교할 수 없으므로 "낮추지 마라"를
-- 정책으로 쓸 수 없다. 정책은 "active여도 UPDATE는 열린다"까지만 하고,
-- **BEFORE UPDATE 트리거**가 옛 값과 대조한다. 둘 다 있어야 성립한다.
--
-- ── ⚠️ 잠그는 것이 target_value 하나가 아니다 ────────────────
--
-- 난이도를 낮추는 길이 여럿이다. 하나라도 열어 두면 그 길로 다 빠져나간다:
--
--   target_value  낮추기        → 막는다 (올리기만)
--   planned_days  낮추기        → 막는다. **참여율의 분모**다
--                                 (buildParticipantInput의
--                                  plannedDaysForPeriod(planned_days ?? 5, …)).
--                                 5일 → 1일로 바꾸면 한 번만 나가도 100%다
--   goal_type     바꾸기        → 막는다. 어려운 종목에서 쉬운 종목으로
--                                 갈아타면 그동안의 실적이 새 잣대로 재채점된다
--   qualifier     바꾸기        → 막는다. 목표의 조건(예: 최소 무게·횟수)이라
--                                 낮추면 같은 숫자가 쉬워진다
--
-- INSERT·DELETE는 손대지 않는다 — 이미 setup에서만 열려 있어(goals_insert_own_setup ·
-- goals_delete_own_setup) active에서 목표를 새로 만들거나 지울 수 없다.
-- ⚠️ **그 두 정책을 넓히지 마라.** 지우고 다시 넣는 것이 "낮추기"의 우회로가 된다.
--
-- 되돌리기
--   ⓐ drop trigger if exists user_goals_raise_only_when_active on public.user_goals;
--   ⓑ drop function if exists public.enforce_goal_raise_only();
--   ⓒ 정책을 옛 정의로: using/check 를 (user_id = auth.uid()) AND challenge_in_setup(challenge_id)
--   ⓓ drop function if exists public.challenge_is_active(uuid);

begin;

-- ============================================================
-- 1) challenge_is_active — challenge_in_setup의 짝
-- ============================================================
create or replace function public.challenge_is_active(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from challenges where id = cid and status = 'active'
  )
$$;
revoke execute on function public.challenge_is_active(uuid) from public, anon;
grant  execute on function public.challenge_is_active(uuid) to authenticated;

-- ============================================================
-- 2) 정책 — active에서도 UPDATE 자체는 열어 준다
-- ============================================================
--
-- ⚠️ 이름을 그대로 둔다(`goals_update_own_setup`). 바꾸면 스냅샷·문서·회귀
--    스크립트가 가리키는 이름이 한꺼번에 어긋난다. 대신 조건이 넓어졌다는 것을
--    여기 적어 둔다 — 이름만 보고 "setup 전용"이라고 믿지 마라.
drop policy if exists goals_update_own_setup on public.user_goals;
create policy goals_update_own_setup on public.user_goals
  for update
  using (
    user_id = (select auth.uid())
    and (
      public.challenge_in_setup(challenge_id)
      or public.challenge_is_active(challenge_id)   -- 0090
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      public.challenge_in_setup(challenge_id)
      or public.challenge_is_active(challenge_id)   -- 0090
    )
  );

-- ============================================================
-- 3) 트리거 — active면 올리기만
-- ============================================================
create or replace function public.enforce_goal_raise_only()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- setup 단계에서는 지금까지처럼 무엇이든 고칠 수 있다. 아직 시작 전이라
  -- 남과 비교되는 숫자가 없다.
  if not public.challenge_is_active(new.challenge_id) then
    return new;
  end if;

  -- 소속을 바꿔 다른 챌린지로 옮기는 길도 막는다.
  if new.challenge_id is distinct from old.challenge_id
     or new.group_id is distinct from old.group_id
     or new.user_id is distinct from old.user_id then
    raise exception 'goal_locked';
  end if;

  if new.goal_type is distinct from old.goal_type then
    raise exception 'goal_type_locked';
  end if;

  if new.qualifier is distinct from old.qualifier then
    raise exception 'goal_qualifier_locked';
  end if;

  -- 분모를 낮추는 길. 같거나 커야 한다.
  if coalesce(new.planned_days, 0) < coalesce(old.planned_days, 0) then
    raise exception 'goal_planned_days_lowered';
  end if;

  -- 본론. 같거나 커야 한다 — 같은 값 저장(멱등)은 통과시킨다.
  if new.target_value < old.target_value then
    raise exception 'goal_lowered';
  end if;

  return new;
end $$;

drop trigger if exists user_goals_raise_only_when_active on public.user_goals;
create trigger user_goals_raise_only_when_active
  before update on public.user_goals
  for each row execute function public.enforce_goal_raise_only();

commit;

-- ── 적용 확인 (Run 뒤에 따로 실행해서 눈으로 본다) ─────────────
--
-- select tgname from pg_trigger where tgname = 'user_goals_raise_only_when_active';
-- select polname, pg_get_expr(polqual, polrelid) from pg_policy
--  where polname = 'goals_update_own_setup';
--
-- 진짜로 막히는지 — active 챌린지의 내 목표 하나로 흉내 내고 롤백한다.
-- (인수인계서 §5의 방법. ROLLBACK_ON_PURPOSE로 끝나면 그 앞 단언이 전부 통과한 것이다.)
--
-- do $$
-- declare v_goal public.user_goals; v_err text;
-- begin
--   select g.* into v_goal from public.user_goals g
--     join public.challenges c on c.id = g.challenge_id
--    where c.status = 'active' limit 1;
--   if not found then raise notice '진행 중 챌린지의 목표가 없다 — 검증 못 함'; return; end if;
--
--   begin
--     update public.user_goals set target_value = v_goal.target_value - 1 where id = v_goal.id;
--     raise exception 'FAIL: 목표를 낮췄는데 통과했다';
--   exception when others then
--     get stacked diagnostics v_err = message_text;
--     if v_err <> 'goal_lowered' then raise; end if;
--     raise notice 'OK 낮추기 거부됨';
--   end;
--
--   update public.user_goals set target_value = v_goal.target_value + 1 where id = v_goal.id;
--   raise notice 'OK 올리기 허용됨';
--
--   raise exception 'ROLLBACK_ON_PURPOSE';
-- end $$;
