-- 0094: 익명 계정의 "확산형" mutation 제한 (공개 베타 배포 C)
--
-- ⛔ 무엇을 막나 — **딱 세 가지.** 익명 사용자가 *먼저 나서서* 남을 끌어들이거나
--    새 관계를 만드는 행위만이다.
--      1. issue_my_invite_code    친구 초대 링크 발행
--      2. send_crew_request       크루 요청 (상대에게 알림이 간다)
--      3. create_challenge_room   챌린지 방 생성 (공개 모집에 노출될 수 있다)
--
-- ✅ 막지 않는 것 (익명에게 그대로 열려 있다):
--      프로필 생성 · 자기 운동 기록 · 계측(analytics_events INSERT)
--      accept_friend_invite · join_challenge_as_newcomer  ← 초대로 들어오는 신규 흐름
--      block_user · report_user · submit_bug_report       ← 자기 보호와 품질 제보
--      search_profile_by_nickname                          ← 읽기
--      poke_user · send_cheer · post_session_comment      ← 크루 관계가 전제라 이미 막힌다
--
-- 왜 이 세 개인가 — 2026-08-31 운영 DB에 익명 토큰으로 REST를 직접 때려 확인했다
-- (`scripts/anon-capability-probe.mjs`). UI를 거치지 않으면 익명도 프로필을 만들고
-- 위 세 가지를 **전부 실행할 수 있었다.** 브라우저를 지우면 사라지는 계정이
-- 크루 요청을 보내고 방을 만들면, 상대에게는 알림이 남고 방은 고아가 된다.
--
-- ⚠️⚠️ **판정은 fail-open이다.** JWT에 `is_anonymous` 클레임이 없으면(옛 세션)
--    막지 않는다. **정식 사용자를 잘못 막는 것이 익명을 놓치는 것보다 나쁘다.**
--    실측(`scripts/anon-upgrade-jwt-check.mjs`): 승격 직후 서버는 이미
--    is_anonymous=false인데 **갱신하지 않은 옛 토큰은 true를 들고 있다.**
--    그래서 클라이언트가 연결 직후 세션을 갱신한다(auth/callback).
--
-- ⚠️ SECURITY DEFINER 함수를 **새로 만들지 않았다.** 판정 함수는 자기 JWT만
--    보므로 INVOKER면 충분하다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 판정 함수
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_anonymous_session()
returns boolean
language sql
stable
set search_path = ''
as $function$
  -- 클레임이 없으면 false(=정식으로 본다). 옛 세션을 잘못 막지 않기 위해서다.
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$function$;

comment on function public.is_anonymous_session() is
  '익명 세션인가. 클레임이 없으면 false(fail-open) — 옛 세션을 잘못 막지 않는다. 0094';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 세 함수에 가드 한 줄 주입
--
-- ⚠️⚠️ **본문을 손으로 옮겨 적지 않는다.** 이 세 함수는 0001~0093에서 여러 번
--    덮어쓰였고(CLAUDE.md §DB 마이그레이션), 수백 줄을 사람이 베끼면 오타 한 글자가
--    함수를 통째로 바꾼다. 그래서 **DB가 자기 현행 정의를 읽어 한 줄만 끼워 넣는다.**
--
--    → 이 파일만 읽어서는 주입 뒤의 본문을 볼 수 없다.
--      **`docs/db-current-schema.sql`을 보라** — 저장소는 원래 그것을 현행 정의의
--      단일 답으로 쓴다(CLAUDE.md). 이 마이그레이션 직후 갱신해 두었다.
--
--    멱등하다: 이미 가드가 있으면 건너뛴다. 앵커가 없으면 조용히 넘어가지 않고
--    예외를 낸다 — 조용히 안 걸리는 것이 가장 나쁘다.
-- ─────────────────────────────────────────────────────────────────────────────
do $do$
declare
  fns  constant text[] := array[
    'issue_my_invite_code', 'send_crew_request', 'create_challenge_room'
  ];
  fn   text;
  def  text;
  pos  int;
  anchor constant text := 'raise exception ''not_authenticated''; end if;';
  guard  constant text := E'\r\n\r\n  -- 0094: 익명 계정은 남을 끌어들이거나 새 관계를 만들 수 없다.\r\n  --        자기 기록·초대 수락·차단·신고는 그대로 열려 있다.\r\n  if public.is_anonymous_session() then\r\n    raise exception ''permanent_account_required'';\r\n  end if;';
begin
  foreach fn in array fns loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;

    if def is null then raise exception '함수를 찾을 수 없다: %', fn; end if;

    if position('permanent_account_required' in def) > 0 then
      raise notice '이미 적용됨: %', fn;
      continue;
    end if;

    pos := position(anchor in def);
    if pos = 0 then raise exception '앵커를 찾을 수 없다: %', fn; end if;

    def := overlay(def placing (anchor || guard) from pos for length(anchor));
    execute def;
    raise notice '가드 주입: %', fn;
  end loop;
end $do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 적용 확인 (2026-08-31 실행 결과)
--   is_anonymous_session   INVOKER · search_path=""
--   issue_my_invite_code   DEFINER · search_path=public, pg_temp · 가드 있음
--   send_crew_request      DEFINER · search_path=public          · 가드 있음
--   create_challenge_room  DEFINER · search_path=public          · 가드 있음
-- ─────────────────────────────────────────────────────────────────────────────
-- select p.proname,
--        case when p.prosecdef then 'DEFINER' else 'INVOKER' end as sec,
--        array_to_string(p.proconfig, ',') as cfg,
--        position('permanent_account_required' in pg_get_functiondef(p.oid)) > 0 as guarded
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('is_anonymous_session','issue_my_invite_code',
--                      'send_crew_request','create_challenge_room');
