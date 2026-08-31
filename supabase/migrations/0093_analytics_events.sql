-- 0093: 퍼널 계측 이벤트 (공개 베타 배포 D)
--
-- 왜 필요한가. 유입 정보는 진입 즉시 localStorage(`gnd-acquisition`)에만 들어가고,
-- `crew.ts:44`가 **프로필을 만들 때** 비로소 `profiles`에 쓴다. 그래서 인플루언서
-- 링크로 들어왔지만 온보딩을 끝내지 않은 사람은 **DB에 흔적이 하나도 없다.**
-- 운영 실측(2026-08-31): `acquisition_campaign`이 있는 행 1개, 익명 116명 중
-- 프로필 보유자 1명. 즉 "몇 명이 들어와서 어디서 나갔나"를 지금은 답할 수 없다.
--
-- ⛔ **이 테이블은 Mixpanel이 아니다.** 기존 DB가 알 수 없는 5가지만 보충한다.
--    나머지는 전부 기존 테이블에서 계산한다 —
--      온보딩 완료 = profiles.created_at   (upsertMyProfile 한 번이 온보딩을 끝낸다)
--      정식 전환   = auth.identities / is_anonymous
--      첫 운동     = workout_sessions · workout_events
--      챌린지 참가 = challenge_participants
--      3회·D7      = 기존 activationFunnel() · reworkoutRetention()
--    전수 감사는 docs/analytics/public-beta-funnel-audit.md
--
-- ⚠️ 비파괴 변경이다 — 새 테이블·인덱스·정책만 만들고 기존 행을 건드리지 않는다.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),

  -- ⚠️ 익명 계정에 카카오·구글을 붙이면 **같은 행이 승격**된다(id 불변).
  --    그래서 auth.uid() 하나로 익명 때 기록과 가입 후 행동이 이어진다.
  --    device fingerprint·광고 식별자를 만들지 않는 이유다.
  user_id uuid not null references auth.users (id) on delete cascade,

  -- 허용목록 밖 이름은 DB가 거부한다. 클라가 임의 이벤트를 쏟아붓지 못한다.
  event_name text not null check (
    event_name in (
      'landing_opened',        -- 유입. 프로필 없는 사람의 유일한 흔적
      'onboarding_started',    -- 온보딩 화면을 실제로 봤다
      'identity_link_started', -- 카카오·구글을 눌렀다 (안 눌린 것과 구분)
      'identity_link_failed',  -- 눌렀는데 실패했다 (안 하려던 것과 구분)
      'challenge_viewed'       -- 챌린지 화면을 봤다 (참가는 challenge_participants가 안다)
    )
  ),

  /*
    유입 귀속 — `landing_opened`에만 실린다.
    프로필이 안 생긴 사람의 캠페인은 `profiles`에 영영 안 남기 때문에 여기 둔다.
    ⚠️ 프로필이 있는 사람은 `profiles.acquisition_*`에도 같은 값이 생긴다.
       우선순위와 불일치 처리는 계획서 §D-8 ②를 따른다 — 운영에서 던지지 않고
       /admin에 "campaign 귀속 불일치 N건"으로 표시한다.
  */
  source   text check (source   is null or length(source)   between 1 and 64),
  medium   text check (medium   is null or length(medium)   between 1 and 64),
  campaign text check (campaign is null or length(campaign) between 1 and 100),

  /*
    실패 분류 — **error code만.** raw error 전문·스택·URL을 넣지 않는다.
    "가입이 싫어서 안 했다"와 "카카오가 KOE205로 죽었다"는 고칠 것이 완전히 다르다.
  */
  error_code text check (error_code is null or length(error_code) between 1 and 64),

  created_at timestamptz not null default now()
);

/*
  ── 중복을 스키마로 막는다 ────────────────────────────────────────────────────
  새로고침 한 번에 행이 하나씩 늘면 테이블이 무한히 커지고 퍼널 숫자도 부푼다.
  **사용자·이벤트당 한 행만** 둔다 — 퍼널이 묻는 것은 "몇 번 했나"가 아니라
  "이 단계에 도달했나"이기 때문이다. 사용자당 최대 5행이라 보존 정책이 필요 없다.

  ⚠️ 대가: `identity_link_failed`에 **첫 실패 코드**만 남는다(마지막이 아니라).
     퍼널 판정에는 "한 번이라도 실패했나"면 충분해서 받아들인다. 재시도 횟수가
     필요해지면 그때 별도 카운터를 만들어라 — 이 테이블을 늘리지 말고.

  ⚠️ `landing_opened`가 한 행이라는 것은 **첫 유입 귀속(first-touch)** 을 뜻한다.
     기존 `freeze_profile_attribution`(0080)이 유입을 동결하는 것과 같은 규칙이다.
     둘이 어긋나면 안 되므로 일부러 맞췄다.
*/
create unique index if not exists analytics_events_user_event_uniq
  on public.analytics_events (user_id, event_name);

-- 퍼널을 기간으로 자르는 질의
create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);

-- 캠페인별 집단 조회 (값이 있는 행만 — 대부분은 null이다)
create index if not exists analytics_events_campaign_idx
  on public.analytics_events (campaign)
  where campaign is not null;

alter table public.analytics_events enable row level security;

/*
  ── RLS ──────────────────────────────────────────────────────────────────────
  ⚠️ **익명 사용자도 INSERT할 수 있어야 한다.** 이 계측의 목적 자체가 "익명으로
     들어와서 어디서 나갔나"를 보는 것이라, 익명을 막으면 기능이 성립하지 않는다.
     배포 C(익명 권한 경계)가 이 테이블을 막지 않도록 auth matrix에 명시한다.
     자기 행동 기록은 "사회적 공개 변경"이 아니므로 C의 제한 대상이 아니다.

  ⚠️ 그러나 **남의 이름으로는 못 쓴다** — `auth.uid() = user_id`가 강제한다.
     클라가 user_id를 임의로 지정해 남의 퍼널을 오염시킬 수 없다.

  ⚠️ SELECT 정책을 **일부러 만들지 않는다.** 일반 사용자는 자기 것도 못 읽는다.
     집계는 `service_role`이 RLS를 우회해서 읽는다(`getSupabaseAdminClient`).
     읽을 이유가 없는 권한은 주지 않는다.

  ⚠️ UPDATE·DELETE 정책도 없다. 기록은 고쳐 쓰는 것이 아니다.

  ⚠️ SECURITY DEFINER 함수를 쓰지 않는다 — 필요가 없다. 정책만으로 충분하다.
*/
create policy analytics_events_insert_own
  on public.analytics_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

/*
  ⚠️⚠️ **`grant insert`만으로는 부족하다 — 먼저 REVOKE해야 한다.** (2026-08-31 실측)
     이 프로젝트의 Supabase에는 `alter default privileges ... grant all on tables
     to anon, authenticated`가 걸려 있어서, **새 테이블을 만드는 순간 anon·authenticated가
     DELETE·TRUNCATE 포함 7개 권한을 자동으로 받는다.** `grant insert`를 추가로 줘도
     이미 받은 권한은 사라지지 않는다.

     SELECT·UPDATE·DELETE는 RLS가 막지만 **TRUNCATE는 RLS를 우회한다.** 그래서
     "정책만 잘 쓰면 된다"가 여기서는 틀린다. 반드시 REVOKE로 내려야 한다.

     (PostgREST에 TRUNCATE 동사가 없어 공개 API로는 도달할 수 없다 — 그래도
      최소 권한이 아닌 상태를 새로 만들지 않는다.)
*/
revoke all on public.analytics_events from anon;
revoke all on public.analytics_events from authenticated;

-- PostgREST가 테이블에 닿으려면 롤 GRANT가 필요하다. **INSERT만** 준다.
-- service_role은 집계에 SELECT가 필요하고 기본 권한으로 이미 갖고 있다.
grant insert on public.analytics_events to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 적용 확인
-- ─────────────────────────────────────────────────────────────────────────────
-- select relrowsecurity from pg_class where relname = 'analytics_events';
-- select policyname, cmd, roles from pg_policies where tablename = 'analytics_events';
-- select indexname from pg_indexes where tablename = 'analytics_events';
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'analytics_events';
