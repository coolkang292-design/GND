-- 0092: 함수 5개의 search_path 고정 (Supabase Advisor: function_search_path_mutable)
--
-- 무엇이 문제인가. 이 5개는 `search_path`가 고정돼 있지 않아서 **호출자가 정한
-- 스키마 순서를 그대로 물려받는다.** 공격자가 자기 스키마를 search_path 앞에 두고
-- `now()`나 `substr()` 같은 이름의 함수를 심으면, 트리거가 그 가짜를 부른다.
-- 지금은 익명 가입이 열려 있고 공개 베타를 앞두고 있어 막아 둔다.
--
-- 왜 다섯 개 전부 `''`(빈 search_path)인가 — 기계적으로 같은 값을 넣은 것이 아니라,
-- **함수마다 본문과 호출처를 따로 조사한 결과가 수렴했다.** 2026-08-31 실측:
--
--   함수                                참조하는 것                    호출처
--   ─────────────────────────────────── ────────────────────────────── ─────────────────────
--   set_updated_at                      now()                          트리거 6개
--                                                                      (profiles·user_goals·
--                                                                       workout_plans·routines·
--                                                                       sessions·program_enrollments)
--   set_workout_set_completed_at        now()                          트리거 1개 (workout_sets)
--   clear_profile_invited_by_on_insert  (없음 — new 필드만)            트리거 1개 (profiles)
--   freeze_profile_attribution          coalesce()                     트리거 1개 (profiles)
--   generate_invite_code                random() substr() floor()      함수 4개가 호출
--                                       length()                       (create_challenge_room ·
--                                                                       create_group ·
--                                                                       issue_challenge_invite_code ·
--                                                                       issue_my_invite_code)
--
-- 다섯 개 다 **테이블·뷰·커스텀 타입을 하나도 참조하지 않고 `pg_catalog` 내장만 쓴다.**
-- `pg_catalog`는 search_path에 안 적어도 항상 암묵적으로 먼저 검색되므로 `''`로 충분하다.
-- 오히려 `''`가 더 안전하다 — 나중에 누가 이 함수에 테이블 참조를 넣으면 조용히
-- 엉뚱한 스키마를 잡는 대신 **즉시 에러로 터진다.**
--
-- ⚠️ `generate_invite_code`를 확인한 것: **컬럼 DEFAULT 식에서 쓰이지 않는다.**
--    `pg_attrdef` 전수 조회 결과 0건이다. DEFAULT에 걸려 있었다면 `''`가 위험할 수
--    있어(테이블 삽입 경로에서 스키마 해석이 필요해질 수 있다) `pg_catalog, public`을
--    써야 했다. 실측으로 아니라는 것을 확인해서 `''`로 간다.
--
-- ⚠️ 검증 방법. 추론으로 넘기지 않고 **pg_temp에 같은 본문 + `search_path=''`로 복제해
--    실제로 돌려 봤다** (2026-08-31, 운영 스키마 무변경).
--      generate_invite_code            → 'GND-TXHK3' 생성 ✅
--      set_workout_set_completed_at    → is_completed=false 시 completed_at 해제 ✅
--      set_updated_at                  → updated_at 기록 ✅
--      clear_profile_invited_by_on_insert → INSERT 시 invited_by null ✅
--      freeze_profile_attribution      → 덮어쓰기 거부하고 원래 값 유지 ✅
--
-- 본문은 **운영 DB의 현행 정의**(pg_get_functiondef)에서 가져왔다. 마이그레이션
-- 파일에서 베끼지 않았다 — CLAUDE.md §DB 마이그레이션("현행 정의는 가장 나중에
-- 덮어쓴 파일에 있다").
--
-- 이 파일은 **DDL만** 담는다. 기존 행을 바꾸지 않으므로 앱 배포 전에 돌려도 안전하다.
-- (CLAUDE.md §DB 마이그레이션 "Run 시점이 다른 것을 한 파일에 담지 마라")

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. set_updated_at — 트리거 6개가 쓴다. 여기가 깨지면 저장이 전부 막힌다
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. set_workout_set_completed_at — workout_sets 트리거
--    세트를 체크하면 시각을 찍고, 해제하면 지운다. 이미 찍힌 것은 다시 안 찍는다
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_workout_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not new.is_completed then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or not old.is_completed then
    new.completed_at := now();
  else
    new.completed_at := old.completed_at;
  end if;
  return new;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. clear_profile_invited_by_on_insert — 0080. 가입 시 초대자를 클라가 못 정하게 한다
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clear_profile_invited_by_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.invited_by := null;
  return new;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. freeze_profile_attribution — 0080. 유입 계측은 한 번 잡히면 통째로 동결한다
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.freeze_profile_attribution()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- 초대자는 따로 논다. 유입 계측과 시점이 달라서다(위 주석 참고).
  new.invited_by := coalesce(old.invited_by, new.invited_by);

  -- 유입 6칸은 한 벌이다. 한 번 잡혔으면 통째로 그때 것을 지킨다.
  if old.acquisition_captured_at is not null then
    new.acquisition_source      := old.acquisition_source;
    new.acquisition_medium      := old.acquisition_medium;
    new.acquisition_campaign    := old.acquisition_campaign;
    new.acquisition_referrer    := old.acquisition_referrer;
    new.acquisition_landing     := old.acquisition_landing;
    new.acquisition_captured_at := old.acquisition_captured_at;
  end if;

  return new;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. generate_invite_code — 초대 코드 생성. 4개 SECURITY DEFINER 함수가 호출한다
--    혼동하기 쉬운 글자(0·O·1·I·L)를 뺀 31자 알파벳에서 5자를 뽑는다
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_invite_code()
returns text
language plpgsql
set search_path = ''
as $function$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..5 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'GND-' || code;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 적용 확인 — 아래가 5행 모두 `search_path=` 를 보여야 한다
-- ─────────────────────────────────────────────────────────────────────────────
-- select p.proname, p.proconfig
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('set_updated_at','set_workout_set_completed_at',
--                     'clear_profile_invited_by_on_insert','freeze_profile_attribution',
--                     'generate_invite_code')
-- order by p.proname;
