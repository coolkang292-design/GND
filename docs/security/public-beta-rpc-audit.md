# 배포 B — SECURITY DEFINER / RPC / GRANT 전수 감사

**작성** 2026-09-01 · **기준 커밋** `e247785` · **대상** 운영 Supabase (`gnd-one.vercel.app`)
**앞선 작업** 배포 A(0092) · D(0093) · 계보 · C(0094) · 0095 — 전부 배포 완료
**선행 문서** `docs/superpowers/HANDOFF-2026-09-01-deploy-b-security-audit.md`

---

## 0. 결론 요약

| | |
|---|---|
| **경계 모델 전반** | 튼튼하다. cross-user 공격 43종 중 **40종이 막혔다** |
| **실제로 열린 경로** | **3건** — 전부 "남의 id를 인자로 받는데 `auth.uid()` 검사가 없는 SECURITY DEFINER" 한 가지 패턴 |
| **RLS 정책** | 79개 중 소유권 술어가 없는 것은 **2개**뿐이고 둘 다 읽기 전용 참조 테이블(`badge_definitions`·`level_definitions`)이다 |
| **동적 SQL** | **0건** (SQL injection 표면 없음) |
| **search_path 미설정** | **0건** (0092가 닫은 것이 유지되고 있다) |
| **고아 RPC** | **0개.** 88개 전부 사용처가 있다 — "안 쓰니 회수" 논거는 쓸 수 없다 |
| **죽은 GRANT** | 있다. 권한은 있는데 정책이 0개라 RLS가 기본 거부하는 (테이블,명령) 쌍 **8개** (그중 2개는 `anon`도 함께 갖고 있다) |

> ⛔ **이 문서는 조사 결과와 제안까지다. 권한 변경은 하나도 적용하지 않았다.**
> `REVOKE`·`ALTER DEFAULT PRIVILEGES`는 사용자 승인 후에만 적용한다 (§8).

---

## 1. ⚠️ 이번 세션의 측정 방법 — 카탈로그를 못 봤다

**이 세션에는 Supabase MCP가 붙어 있지 않다.** `.claude.json`의 `mcpServers`가 비어 있고,
`supabase` CLI·`psql`도 없고, 임의 SQL을 실행하는 RPC도 없다(`admin_schema_snapshot`은
함수·정책·인덱스만 준다). 그래서 `pg_default_acl`·`information_schema.role_table_grants`
같은 **카탈로그 직접 조회를 하지 못했다.**

대신 **PostgREST에 실제로 때려서** 쟀다. 카탈로그보다 오히려 강한 증거인 부분이 있다 —
"권한 표에 무엇이 적혀 있나"가 아니라 "그 경로로 실제로 무엇이 되나"를 보기 때문이다.

### 1-1. 함수 EXECUTE 판정 — 부작용 0 프로브

```
잘못된 리터럴을 인자로 준다.  예: p_target_id = "zzzz"

  42501 permission denied for function X  →  EXECUTE 없음
  22P02 invalid input syntax for uuid     →  EXECUTE 있음 (본문은 실행되지 않았다)
```

Postgres는 함수 EXECUTE 권한을 **인자 평가보다 먼저** 확인한다. 그래서 이 프로브는
권한을 정확히 가르면서 **함수 본문을 한 줄도 돌리지 않는다.** 운영 데이터가 안 바뀐다.

인자가 없거나 전부 text/jsonb라 강제 오류를 낼 수 없는 함수 9개는 개별 처리했다:

| 함수 | 어떻게 쟀나 |
|---|---|
| `generate_invite_code` | 순수 랜덤·부작용 없음 → 그냥 호출 |
| `accept_friend_invite` · `join_group_with_code` · `join_challenge_with_code` | 없는 코드를 주면 **조회 직후 예외**를 던지고 변경 전에 끝난다(본문 확인) → 안전 |
| `autostart_due_challenges` · `autofinalize_due_challenges` · `remind_upcoming_challenges` | 호출 전에 service_role로 **대상 0건**을 확인하고 불렀다 → 진짜 무동작 |
| `create_group` · `issue_my_invite_code` | 부르면 행이 생기거나 값이 바뀐다 → **부르지 않았다.** `[미검증]` |

### 1-2. 테이블·컬럼 GRANT 판정

```
SELECT : GET  ?select=<col>&limit=0
INSERT : POST {}                       ← 제약 위반으로 실패하지만 권한은 그 전에 본다
UPDATE : PATCH  + 모순 필터(0행)        ← 컬럼 권한은 행 수와 무관하게 계획 시점에 검사된다
DELETE : DELETE + 모순 필터(0행)
```

모순 필터는 `and=(col.is.null,col.not.is.null)` — 항상 거짓이라 **0행이 보장된다.**

⚠️ **GRANT와 RLS를 메시지로 갈라야 한다.** 둘 다 42501이다.

```
"permission denied for table X"              → GRANT 없음
"new row violates row-level security policy" → GRANT 있음 · RLS가 막음
```

이걸 안 가르면 "권한이 없다"와 "정책이 막았다"가 뭉개진다. 첫 측정에서 실제로 뭉갰고
두 번째에 갈랐다.

### 1-3. 이 방법으로 못 잰 것

| 못 잰 것 | 이유 |
|---|---|
| **TRUNCATE 권한** | PostgREST에 TRUNCATE 경로가 아예 없다. HTTP로 도달 불가 |
| `MAINTAIN` · `REFERENCES` · `TRIGGER` | 같은 이유 |
| `pg_default_acl` (근본 원인) | 카탈로그 전용. 새 객체를 만들지 않고는 확인할 방법이 없다 |
| 함수 owner | `pg_get_functiondef`가 owner를 안 찍는다 |
| `PUBLIC` 롤과 `anon` 롤의 분리 | HTTP에서 오는 무인증 요청은 `anon`이다. `PUBLIC` 단독 부여분은 분리 불가 |

**→ 이 다섯은 `[미검증]`이다.** §9에 남겼고 카탈로그 접근이 생기면 그때 채운다.

---

## 2. 실측 재확인 — 인수인계서 숫자 대조

| 항목 | 인수인계서(8/31) | 이번 실측(9/1) | 판정 |
|---|---|---|---|
| public 테이블 | 40 | **40** | 일치 |
| public 함수 | 98 | **98** | 일치 |
| SECURITY DEFINER | 89 | **89** | 일치 |
| SECURITY INVOKER | (없음) | **9** | 신규 |
| RLS 정책 | 79 | **79** (39개 테이블) | 일치 |
| `authenticated` DELETE 보유 테이블 | 17 | **17** | 일치 |
| `anon` 테이블 권한 보유 | 3 (`profiles`·`groups`·`group_members`) | **3, 동일** | 일치 |
| `anon` EXECUTE 함수 | 21 | **11** (+ `[미검증]` 2) | **불일치 — 아래 참조** |
| `authenticated` TRUNCATE | 12 | `[미검증]` | 측정 수단 없음 |

> ⚠️ **`anon` EXECUTE 21 → 11.** 어느 쪽이 맞는지 이 세션에서는 못 가른다.
> 이번 값은 **PostgREST로 실제 도달 가능한 88개**만 센 것이고, 인수인계서 값은
> 카탈로그의 98개 전량(트리거 함수 10개 포함)을 셌을 수 있다. 트리거 함수는
> HTTP로 부를 수 없으므로 **공격 표면 기준으로는 11이 맞고**, 권한 위생 기준으로는
> 카탈로그 재조회가 필요하다.

**한 번 정정.** 처음 파서가 `STABLE SECURITY DEFINER`(한 줄 형태)를 놓쳐 56으로 셌다.
`pg_get_functiondef`는 VOLATILE이면 ` SECURITY DEFINER`를 단독 줄로, STABLE이면
`STABLE SECURITY DEFINER`를 한 줄로 찍는다. 고친 뒤 89로 인수인계서와 일치했다.

---

## 3. 4배우 권한 매트릭스

배우를 넷으로 나눴지만 **DB 롤은 셋뿐이다.** 이것이 이 시스템의 핵심 성질이다.

| 배우 | DB 롤 | JWT | 구분되는 곳 |
|---|---|---|---|
| A. raw Postgres anon | `anon` | 없음 | GRANT로 구분된다 |
| B. Supabase 익명 인증 | **`authenticated`** | `is_anonymous=true` | **GRANT로는 C와 구분 불가.** 함수 본문의 `is_anonymous_session()` 게이트(0094)로만 갈린다 |
| C. 정식 사용자 | **`authenticated`** | `is_anonymous=false` | 〃 |
| D. service_role | `service_role` | — | 전부 통과 |

> **B와 C는 권한 계층에서 같은 롤이다.** 그래서 이 감사의 EXECUTE·GRANT 측정에
> 익명 계정을 만들 필요가 없었다(rate limit 회피). 익명 제한은 **권한이 아니라
> 동작**이며 `scripts/anon-capability-probe.mjs`가 담당한다.

### 3-1. 함수 EXECUTE 집계 (PostgREST 노출 88개 중 86개 측정)

| | ALLOW | DENY |
|---|---:|---:|
| `anon` | **12** | 74 |
| `authenticated` (= 익명 인증 포함) | **78** | 8 |
| `service_role` | 86 | 0 |

**`anon`이 실행 가능한 12개** — 10개가 RLS 정책이 쓰는 헬퍼 술어다:

```
challenge_in_setup · is_challenge_participant · is_crew_with · is_group_member
owns_workout_exercise · owns_workout_session · session_crew_shared · shares_group_with
workout_exercise_crew_visible · workout_session_crew_visible          ← 정책 헬퍼
is_anonymous_session · generate_invite_code                            ← 무해 (순수 함수)
```

**`authenticated`가 실행하지 못하는 8개** — 이미 회수돼 있다. 이번 제안의 **선례**다:

```
admin_schema_snapshot · apply_xp_and_progress · award_points · badge_metrics
evaluate_badges · is_valid_workout · notify · remind_upcoming_challenges
```

---

## 4. 테이블·컬럼 ACL 과 RLS 정책

### 4-1. 테이블 GRANT (40개 전량 실측)

| 롤 | SELECT | INSERT | UPDATE | DELETE |
|---|---:|---:|---:|---:|
| `anon` | 3 | 3 | 3 | 3 |
| `authenticated` | 38 | 18 | 12 | 17 |

`anon`이 권한을 가진 3개는 `profiles` · `groups` · `group_members`다.
**그러나 이 세 테이블의 정책은 전부 `auth.uid()`에 의존한다** — anon은 `uid`가 null이라
모든 술어가 거짓이 된다. 즉 **GRANT는 있으나 도달 가능한 행이 0이다.**

```
profiles       [SELECT] (id = auth.uid()) OR is_crew_with(id) OR shares_group_with(id)
profiles       [UPDATE] (id = auth.uid())
groups         [SELECT] (owner_id = auth.uid()) OR is_group_member(id, auth.uid())
group_members  [SELECT] is_group_member(group_id, auth.uid())
```

`authenticated`가 **아무 권한도 없는** 테이블은 `bug_report_watchers` 하나다.

> ⭐ **인수인계서 §6의 열린 질문이 닫혔다.**
> `bug_report_watchers` = RLS 켜짐 · 정책 0개 · `authenticated` GRANT 0개 →
> **service_role 전용이 의도대로 성립한다.** `[추정]`이 아니라 `[확실]`이다.

### 4-2. 컬럼 단위 GRANT

인수인계서가 경고한 `workout_sessions`를 확인했다. 테이블 단위 프로브에서
`POST /workout_sessions {}` 가 **성공했다**(전 컬럼 기본값 + RLS 통과). 즉 컬럼 14칸에
INSERT가 있고 그 조합만으로 행이 만들어진다.

⚠️ **이 프로브가 실제로 빈 행 2개를 만들었다.** §10에 정리 대상으로 남겼다.
**이 방식(`POST {}`)은 다시 쓰지 않는다** — 전 컬럼 기본값 테이블에서 행이 생긴다.

### 4-3. RLS 정책 79개 정적 감사

| 명령 | 정책 수 |
|---|---:|
| SELECT | 36 |
| INSERT | 16 |
| DELETE | 14 |
| UPDATE | 11 |
| ALL | 2 |

**소유권/관계 술어가 없는 정책 2개** — 둘 다 의도된 공개 참조 데이터다:

```
badge_definitions   badge_definitions_read  [SELECT] using: true
level_definitions   level_definitions_read  [SELECT] using: true
```

### 4-4. 죽은 GRANT — 권한은 있는데 정책이 0개

RLS는 정책이 없으면 **기본 거부**다. 아래 (테이블, 명령)은 GRANT가 있어도 아무 행에도
도달하지 못한다. **기능 영향 0이 증명된 회수 후보**다.

| 롤 | 테이블 | 죽은 권한 |
|---|---|---|
| `authenticated` | `bug_reports` | INSERT · UPDATE · DELETE |
| `authenticated` | `exercise_catalog` | UPDATE |
| `authenticated` | `group_members` | UPDATE |
| `authenticated` | `profile_views` | UPDATE · DELETE |
| `authenticated` | `profiles` | DELETE |
| `anon` | `group_members` | UPDATE |
| `anon` | `profiles` | DELETE |

`bug_reports`는 `submit_bug_report`(SECURITY DEFINER)가 RLS를 지나쳐 넣으므로
INSERT GRANT가 없어도 신고가 된다.

> **정정 2건.** 처음에 `push_subscriptions`·`notification_settings`도 이 목록에 넣었다가
> 뺐다. 둘은 `cmd=ALL` 정책(`user_id = auth.uid()`)이 있어 GRANT가 실제로 쓰인다.
> 명령별로만 세면 `ALL`을 놓친다.

---

## 5. SECURITY DEFINER 전수표 (98개 전량, 그중 SD 89개)

**열 읽는 법**
`SD`=SECURITY DEFINER · `anon`/`auth`=실측 EXECUTE(굵은 **O**는 무인증 도달 가능) ·
`uid검사`=본문이 `auth.uid()`를 쓴다 · `익명게이트`=`is_anonymous_session()` 확인(0094) ·
`소유권검사`=본문에 소유/관계 술어가 있다 · `사용처`=앱 화면 / RLS 정책 / 다른 함수 내부

| # | 함수 | 인자 | SD | search_path | anon | auth | uid검사 | 익명게이트 | 소유권검사 | 외부 user-id | 사용처 | 위험도 | 판정 |
|---|---|---|:-:|---|:-:|:-:|:-:|:-:|:-:|---|---|:-:|---|
| 1 | `accept_challenge_invite` | `p_challenge_id uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 2 | `accept_crew_request` | `p_request_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱+함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 3 | `accept_friend_invite` | `p_code text` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 4 | `admin_schema_snapshot` | — | O | `'public'` | — | — | — | — | — | — | 서버라우트/스크립트 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 5 | `apply_xp_and_progress` | `p_user_id uuid, p_amount integer, p_reason text, p_reward_group text, p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb` | O | `'public'` | — | — | — | — | O | p_user_id | 함수내부 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 6 | `approve_challenge_goals` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 7 | `autofinalize_due_challenges` | — | O | `'public'` | — | O | — | — | — | — | 앱 | Medium | 인증 검사가 없지만 앱이 화면에서 직접 부른다. 회수하면 기능이 깨진다 → 유지·근거 기록 |
| 8 | `autostart_due_challenges` | — | O | `'public'` | — | O | — | — | O | — | 앱 | Medium | 인증 검사가 없지만 앱이 화면에서 직접 부른다. 회수하면 기능이 깨진다 → 유지·근거 기록 |
| 9 | `award_points` | `p_user_id uuid, p_amount integer, p_reason text, p_source_type text, p_source_id text, p_multiplier numeric, p_metadata jsonb` | O | `'public'` | — | — | — | — | O | p_user_id | 함수내부 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 10 | `award_workout_photo_xp` | `p_session_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 11 | `badge_metrics` | `p_user_id uuid` | O | `'public'` | — | — | — | — | O | p_user_id | 함수내부 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 12 | `block_user` | `p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 13 | `cancel_challenge` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 14 | `cancel_crew_request` | `p_request_id uuid` | O | `'public'` | — | O | O | — | — | — | 서버라우트/스크립트 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 15 | `cancel_program_enrollment` | `p_enrollment_id uuid` | O | `''` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 16 | `cancel_workout` | `p_session_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 17 | `challenge_in_setup` | `cid uuid` | O | `'public'` | **O** | O | — | — | — | — | 정책 | Info | 유지 |
| 18 | `challenge_is_active` | `cid uuid` | O | `'public'` | — | O | — | — | — | — | 정책+함수내부 | Info | 유지 |
| 19 | `clear_profile_invited_by_on_insert` | — | — | `''` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 20 | `complete_workout` | `p_session_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 21 | `complete_workout_v2` | `p_session_id uuid, p_paused_seconds integer DEFAULT 0` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 22 | `create_challenge_room` | `p_name text, p_start_date date, p_end_date date, p_photo_required boolean DEFAULT true` | O | `'public'` | — | O | O | O | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 23 | `create_group` | `p_name text` | — | `'public'` | — | — | O | — | — | — | 앱+함수내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 24 | `create_program_enrollment` | `p_program_key text, p_program_version integer, p_title_snapshot text, p_level_at_start text, p_start_date date, p_timezone text, p_preferred_slots jsonb, p_plans jsonb` | O | `''` | — | O | O | — | O | — | 서버라우트/스크립트 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 25 | `current_streak_days` | `p_user_id uuid` | O | `'public'` | — | O | — | — | O | p_user_id | 함수내부 | High | 남의 id를 받고 auth.uid() 검사가 없는데 정식 사용자가 부를 수 있다 → **회수 후보** |
| 26 | `decline_challenge_invite` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 27 | `dispatch_push_notification` | — | O | `'public'` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 28 | `edit_session_comment` | `p_comment_id uuid, p_body text` | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 29 | `enforce_goal_raise_only` | — | O | `'public', 'pg_temp'` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 30 | `enforce_routine_slot_limit` | — | O | `'public'` | — | — | — | — | O | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 31 | `evaluate_badges` | `p_user_id uuid` | O | `'public'` | — | — | — | — | — | p_user_id | 함수내부 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 32 | `finalize_challenge` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 33 | `freeze_profile_attribution` | — | — | `''` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 34 | `generate_invite_code` | — | — | `''` | **O** | O | — | — | — | — | 함수내부 | Info | 유지 |
| 35 | `get_challenge_activity` | `p_challenge_id uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 36 | `get_challenge_participant_profiles` | `p_challenge_id uuid` | O | `'public', 'pg_temp'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 37 | `get_challenge_period_sessions` | `p_challenge_id uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 38 | `get_crew_member_profile` | `p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 39 | `get_incoming_crew_requests` | — | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 40 | `get_my_badge_metrics` | — | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 41 | `get_my_crew` | — | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 42 | `get_my_recent_pokes` | — | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 43 | `get_session_actor_profiles` | `p_session_ids uuid[]` | O | `'public'` | — | O | — | — | — | — | 앱 | Medium | 인증 검사가 없지만 앱이 화면에서 직접 부른다. 회수하면 기능이 깨진다 → 유지·근거 기록 |
| 44 | `invite_to_challenge` | `p_challenge_id uuid, p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 45 | `is_anonymous_session` | — | — | `''` | **O** | O | — | O | — | — | 함수내부 | Info | 유지 |
| 46 | `is_blocked_between` | `p_a uuid, p_b uuid` | O | `'public', 'pg_temp'` | — | O | — | — | — | p_a,p_b | 함수내부 | High | 남의 id를 받고 auth.uid() 검사가 없는데 정식 사용자가 부를 수 있다 → **회수 후보** |
| 47 | `is_challenge_participant` | `cid uuid, uid uuid` | O | `'public'` | **O** | O | — | — | O | uid | 정책+함수내부 | Medium | RLS 헬퍼라 정책 평가에 EXECUTE가 필요하다. 멤버십 노출은 설계상 감수 → 유지·문서화 |
| 48 | `is_crew_with` | `uid uuid` | O | `'public'` | **O** | O | O | — | — | uid | 앱+정책+함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 49 | `is_group_member` | `gid uuid, uid uuid` | O | `'public'` | **O** | O | — | — | O | uid | 정책+함수내부 | Medium | RLS 헬퍼라 정책 평가에 EXECUTE가 필요하다. 멤버십 노출은 설계상 감수 → 유지·문서화 |
| 50 | `is_valid_workout` | `p_session_id uuid` | O | `'public'` | — | — | O | — | — | — | 함수내부 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 51 | `issue_challenge_invite_code` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 52 | `issue_my_invite_code` | — | O | `'public', 'pg_temp'` | — | — | O | O | O | — | 앱 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 53 | `join_challenge_as_newcomer` | `p_code text, p_inviter uuid DEFAULT NULL::uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | p_inviter | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 54 | `join_challenge_with_code` | `p_code text` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱+함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 55 | `join_discoverable_challenge` | `p_challenge_id uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 56 | `join_group_with_code` | `p_code text` | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 57 | `leave_setup_challenge` | `p_challenge_id uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 58 | `list_blocked_users` | — | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 59 | `list_discoverable_challenges` | — | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 60 | `mark_record_beaten` | `p_session_id uuid, p_note text` | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 61 | `move_workout_plan` | `p_plan_id uuid, p_target_date date, p_replace boolean DEFAULT false` | O | `''` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 62 | `notify` | `p_user_id uuid, p_actor_id uuid, p_type text, p_reference_id uuid, p_title text, p_body text` | O | `'public'` | — | — | — | — | — | p_user_id,p_actor_id | 함수내부 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 63 | `notify_bug_report_watchers` | — | O | `'public'` | — | — | — | — | O | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 64 | `notify_challenge_peek_unlock` | `p_user_id uuid` | O | `'public'` | — | O | — | — | O | p_user_id | 함수내부 | High | 남의 id를 받고 auth.uid() 검사가 없는데 정식 사용자가 부를 수 있다 → **회수 후보** |
| 65 | `notify_reaction` | — | O | `'public'` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 66 | `owns_program_enrollment` | `eid uuid` | O | `''` | — | O | O | — | O | — | 정책 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 67 | `owns_workout_exercise` | `eid uuid` | O | `'public'` | **O** | O | O | — | O | — | 정책 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 68 | `owns_workout_session` | `sid uuid` | O | `'public'` | **O** | O | O | — | O | — | 정책 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 69 | `pending_bug_report_count` | — | O | `'public'` | — | O | — | — | — | — | 서버라우트/스크립트 | Medium | 인증 검사 없는 SECURITY DEFINER인데 앱이 화면에서 부르지 않는다 → 회수 후보 |
| 70 | `pick_challenge_peek` | `p_challenge_id uuid, p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 71 | `point_multiplier` | `p_streak integer` | — | `'public'` | — | O | — | — | — | — | 함수내부 | Info | 유지 |
| 72 | `poke_user` | `p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 73 | `post_session_comment` | `p_session_id uuid, p_body text, p_parent_id uuid DEFAULT NULL::uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 74 | `reject_crew_request` | `p_request_id uuid` | O | `'public'` | — | O | O | — | — | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 75 | `remind_upcoming_challenges` | — | O | `'public'` | — | — | — | — | O | — | 서버라우트/스크립트 | Info | 정식·익명 모두 EXECUTE 없음 (service_role 전용) → 유지 |
| 76 | `remove_crew` | `p_target_id uuid` | O | `'public'` | — | O | O | — | — | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 77 | `report_user` | `p_target_id uuid, p_reason text, p_note text DEFAULT NULL::text, p_challenge_id uuid DEFAULT NULL::uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 서버라우트/스크립트 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 78 | `reschedule_program_plans` | `p_enrollment_id uuid, p_moves jsonb` | O | `''` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 79 | `search_profile_by_nickname` | `p_nickname text` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 80 | `send_cheer` | `p_session_id uuid, p_cheer_type text, p_message text DEFAULT NULL::text` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 81 | `send_crew_request` | `p_target_id uuid` | O | `'public'` | — | O | O | O | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 82 | `session_crew_shared` | `sid uuid` | O | `'public'` | **O** | O | O | — | O | — | 정책+함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 83 | `set_recruit_opened_at` | — | — | `'public'` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 84 | `set_updated_at` | — | — | `''` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 85 | `set_workout_set_completed_at` | — | — | `''` | — | — | — | — | — | — | 트리거/내부 | — | PostgREST 미노출 (트리거 함수). 호출 경로 없음 → 유지 |
| 86 | `set_workout_verification` | `p_session_id uuid, p_source text, p_client_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 87 | `shares_active_challenge_with` | `p_other uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | p_other | 함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 88 | `shares_any_challenge_with` | `p_other uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | p_other | 함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 89 | `shares_challenge_with` | `p_challenge_id uuid, p_other uuid` | O | `'public', 'pg_temp'` | — | O | O | — | O | p_other | 함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 90 | `shares_group_with` | `uid uuid` | O | `'public'` | **O** | O | O | — | O | uid | 정책 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 91 | `start_challenge` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 92 | `start_workout` | `p_session_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 93 | `submit_bug_report` | `p_message text, p_route text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb, p_trail jsonb DEFAULT '[]'::jsonb` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 94 | `unapprove_challenge_goals` | `p_challenge_id uuid` | O | `'public'` | — | O | O | — | O | — | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 95 | `unblock_user` | `p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 96 | `view_record` | `p_target_id uuid` | O | `'public'` | — | O | O | — | O | p_target_id | 앱 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
| 97 | `workout_exercise_crew_visible` | `eid uuid` | O | `'public'` | **O** | O | — | — | — | — | 정책 | Info | 유지 |
| 98 | `workout_session_crew_visible` | `sid uuid` | O | `'public'` | **O** | O | O | — | O | — | 정책+함수내부 | Info | auth.uid()로 호출자를 고정한다 → 유지 |
---

## 6. Cross-user 공격 테스트 — 실행 결과

**스크립트** `scripts/cross-user-abuse-check.mjs` (이번 작업에서 신설)
**배우** 상설 픽스처 A(공격자) · B(피해자). 둘 다 정식 계정이라 익명 rate limit이 없다.

```
40 통과 / 3 실패
```

| # | 표면 | 시도 | 결과 |
|---|---|---|---|
| 1 | 프로필 | A가 B의 프로필 수정 · 제3자 프로필 열람 | **막힘** (0행) |
| 2 | 운동 세션 | B의 세션 PATCH · `complete_workout` · `cancel_workout` · `start_workout` · `mark_record_beaten` · `set_workout_verification` · `award_workout_photo_xp` | **전부 막힘** |
| 3 | 종목·세트 | B의 `workout_exercises` · `workout_sets` 수정 | **막힘** (0행) |
| 4 | 크루 | 남의 요청에 `accept`/`reject`/`cancel_crew_request` · 무관한 요청 열람 | **전부 막힘** |
| 5 | 챌린지 | 남의 챌린지에 `start`/`cancel`/`finalize`/`approve`/`unapprove`/`issue_invite_code` · `invite_to_challenge` · 위조 코드 + 타인 inviter로 `join_challenge_as_newcomer` | **전부 막힘** |
| 6 | 알림 | B의 알림 읽기·수정 · `notify`로 위조 | **막힘** |
| 6 | 알림 | **`notify_challenge_peek_unlock(p_user_id=B)`** | ⚠️ **열림 (204)** |
| 7 | 응원·댓글·리액션 | B 이름으로 `cheers`·`reactions` 삽입 · 남의 댓글 수정 | **전부 막힘** |
| 8 | analytics_events | B 이름으로 이벤트 위조 · 읽기 | **막힘** |
| 9 | 포인트·XP | `award_points` · `apply_xp_and_progress` · `point_transactions` 직접 삽입 · B의 지갑/진행도 읽기 | **전부 막힘** |
| 10 | RPC 인자 우회 | `badge_metrics(B)` · `evaluate_badges(B)` | **막힘** (42501) |
| 10 | RPC 인자 우회 | **`current_streak_days(p_user_id=B)`** | ⚠️ **열림 — 값 `3` 반환** |
| 10 | RPC 인자 우회 | **`is_blocked_between(B, 제3자)`** | ⚠️ **열림 — `false` 반환** |

### 6-1. 안전 설계 — 이 테스트가 운영 데이터를 안 상하게 하는 이유

1. **계정을 만들지 않는다.** 상설 픽스처만 쓴다 → 익명 가입 rate limit과 무관
2. **쓰기 시도는 전부 "현재 값과 같은 값"을 쓴다.** 막히면 0행, 뚫려도 내용이 그대로다
3. **DELETE는 시도하지 않는다.** 뚫려 있으면 실데이터가 사라진다 → §4-3 정책 정적 감사로 대체
4. service_role은 **대상 id를 찾는 읽기에만** 쓴다. 공격은 전부 A의 사용자 토큰

---

## 7. 발견 3건 — 전부 같은 패턴이다

```
SECURITY DEFINER  +  남의 user_id를 인자로 받음  +  본문에 auth.uid() 검사 없음
                  +  authenticated에게 EXECUTE가 열림
```

`SECURITY DEFINER`는 RLS를 지나친다. 그래서 인자로 받은 id를 검증하지 않으면
**호출자가 누구든 그 id의 데이터로 동작한다.** RLS가 아무리 촘촘해도 이 경로는 그 위를 지난다.

| # | 함수 | 무엇이 되나 | 위험도 | 근거 |
|---|---|---|---|---|
| F1 | `current_streak_days(p_user_id)` | **아무 사용자의 연속 운동 일수**를 읽는다. A가 B의 값 `3`을 그대로 받았다 | **High** (정보 노출) | 크루가 아니어도 읽힌다. 활동 패턴이 노출된다 |
| F2 | `notify_challenge_peek_unlock(p_user_id)` | 아무 사용자를 대상으로 **알림 발송 경로를 트리거**한다. A의 호출이 204로 성공했다 | **High** (알림 스팸·위조) | 조건(대상이 active 챌린지 참가 중)이 맞으면 실제 알림이 나간다. B가 조건 밖이라 이번엔 안 나갔다 |
| F3 | `is_blocked_between(p_a, p_b)` | **임의의 두 사용자**의 차단 관계를 조회한다 | **Medium** (관계 노출) | 나와 무관한 두 사람의 사회 관계를 캘 수 있다 |

### 7-1. ⭐ 형제 함수는 이미 잠겨 있다

같은 패턴의 함수 5개는 **이미 `authenticated`에서 회수돼 있다**:

```
award_points(p_user_id)          ← 42501
apply_xp_and_progress(p_user_id) ← 42501
badge_metrics(p_user_id)         ← 42501
evaluate_badges(p_user_id)       ← 42501
notify(p_user_id, p_actor_id)    ← 42501
```

그리고 `remind_upcoming_challenges`는 0077이 **명시적으로** service_role 전용으로 만들었다
(`src/app/api/briefing/route.ts`에 그 주석이 남아 있다).

**즉 이 저장소는 이미 "이 부류는 잠근다"는 규칙을 갖고 있고, F1~F3만 그물을 빠져나갔다.**
새 정책을 만드는 것이 아니라 **기존 정책을 빠뜨린 3개에 적용하는 것**이다.

### 7-2. 회수해도 안 깨지는 이유 — 호출부 전수 확인

| 함수 | 앱 화면 | RLS 정책 | 다른 함수 내부 | 서버/스크립트 |
|---|:-:|:-:|---|---|
| `current_streak_days` | — | — | `badge_metrics`(SD) · `complete_workout_v2`(SD) | `streak-parity-check.mjs` (service_role) |
| `notify_challenge_peek_unlock` | — | — | `complete_workout_v2`(SD) | `peek-reset-check.mjs` (service_role) |
| `is_blocked_between` | — | — | `get_challenge_activity` · `get_my_crew` · `is_crew_with` · `list_discoverable_challenges` · `shares_active_challenge_with` (**전부 SD**) | — |
| `pending_bug_report_count` | — | — | — | `src/app/api/briefing/route.ts` (service_role) · `bug-report-check.mjs` |

**핵심**: 내부 호출자가 전부 `SECURITY DEFINER`다. SD 함수 안에서는 **소유자(postgres)
권한으로** 실행되므로, `anon`/`authenticated`의 EXECUTE를 회수해도 **내부 호출은 그대로 된다.**
외부 회귀 스크립트도 전부 `service_role` 키를 쓴다.

### 7-3. 회수하면 안 되는 것 — 같은 모양인데 실제로 쓰인다

| 함수 | 왜 유지하나 |
|---|---|
| `autostart_due_challenges` · `autofinalize_due_challenges` | `auth.uid()` 검사가 없는 SD인데 **`src/app/(tabs)/challenge/page.tsx:363-364`가 클라이언트에서 직접 부른다.** 회수하면 챌린지 화면이 깨진다. 악용해도 **이미 기한이 지난 전이를 앞당기는 것**뿐이고(미래 챌린지는 못 연다) 정상 UI가 하는 일과 같다 → **Medium, 유지·근거 기록** |
| `is_challenge_participant` · `is_group_member` | RLS 정책 본문이 부른다. 정책 평가는 **호출 롤 권한으로** 되므로 EXECUTE가 필요하다. 멤버십 노출은 설계상 감수 → **유지·문서화** |
| `get_session_actor_profiles` | 앱이 화면에서 부른다 |

> 이것이 "Advisor 숫자를 줄이는 작업이 아니다"의 실제 의미다. 패턴만 보고 5개를 회수했으면
> 챌린지 화면과 RLS 정책이 함께 깨졌을 것이다.

---

## 8. 권한 변경 제안 — ⛔ 승인 전까지 적용하지 않는다

### 8-0. 요약표

| 대상 | 현재 권한 | 문제 | 제안 변경 | 영향받는 기능 | 회귀 테스트 |
|---|---|---|---|---|---|
| `current_streak_days(uuid)` | anon 없음 · **authenticated EXECUTE** | 남의 스트릭을 읽는다 (F1, 실측) | `revoke execute from anon, authenticated` | **없음** — 호출부 전부 SD 내부·service_role | `cross-user-abuse-check` · `streak-parity-check` · `badge-metrics-check` |
| `notify_challenge_peek_unlock(uuid)` | anon 없음 · **authenticated EXECUTE** | 남에게 알림을 트리거한다 (F2, 실측) | `revoke execute from anon, authenticated` | **없음** — `complete_workout_v2` 내부 호출 | `cross-user-abuse-check` · `peek-reset-check` |
| `is_blocked_between(uuid,uuid)` | anon 없음 · **authenticated EXECUTE** | 남 둘의 차단 관계를 캔다 (F3, 실측) | `revoke execute from anon, authenticated` | **없음** — SD 5개 내부 호출 | `cross-user-abuse-check` · `block-report-goal-check` |
| `pending_bug_report_count()` | **authenticated EXECUTE** | 앱이 안 부르는 운영 지표가 사용자에게 열림 | `revoke execute from anon, authenticated` | **없음** — 브리핑 라우트는 service_role | `bug-report-check` · `briefing-integration-test` |
| `bug_reports` | authenticated **INSERT·UPDATE·DELETE** | 정책 0개 → 죽은 권한 | `revoke insert, update, delete from authenticated` | **없음** — `submit_bug_report`(SD)가 넣는다 | `bug-report-check` |
| `profiles` | authenticated·anon **DELETE** | DELETE 정책 0개 → 죽은 권한 | `revoke delete from anon, authenticated` | **없음** | `rls-test` · `crew-profile-check` |
| `profile_views` | authenticated **UPDATE·DELETE** | 정책 0개 → 죽은 권한 | `revoke update, delete from authenticated` | **없음** | `crew-profile-check` |
| `exercise_catalog` | authenticated **UPDATE** | UPDATE 정책 0개 → 죽은 권한 | `revoke update from authenticated` | **없음** | `rls-test` |
| `group_members` | authenticated·anon **UPDATE** | UPDATE 정책 0개 → 죽은 권한 | `revoke update from anon, authenticated` | **없음** | `rls-test` · `crew-link-check` |
| `groups`·`group_members`·`profiles` | **anon** SELECT·INSERT·UPDATE·DELETE | 정책이 전부 `auth.uid()` 의존 → anon은 0행. 권한만 남아 있다 | `revoke all from anon` (단계 2에서) | **없음으로 추정** — 무인증 화면이 이 테이블을 직접 읽는지 확인 필요 | `anon-capability-probe` · `rls-test` |
| **TRUNCATE** (12개 테이블 추정) | authenticated TRUNCATE | 한 번의 호출로 테이블 전체가 사라진다 | `revoke truncate from anon, authenticated` | **없음** — PostgREST에 경로 자체가 없다 | 카탈로그 재조회로 사후 확인 |
| `pg_default_acl` | 새 객체에 anon/authenticated 전 권한 자동 부여 | 다음 테이블에서 같은 문제가 재발한다 | §8-C | 전역 | `default-privilege-check`(신설 필요) |

### 8-A. 기존 테이블에서 회수할 권한

```sql
-- A1. 죽은 권한 (정책 0개 → RLS 기본 거부. 기능 영향이 실측으로 0)
revoke insert, update, delete on public.bug_reports      from authenticated;
revoke update, delete         on public.profile_views    from authenticated;
revoke update                 on public.exercise_catalog from authenticated;
revoke update                 on public.group_members    from anon, authenticated;
revoke delete                 on public.profiles         from anon, authenticated;

-- A2. TRUNCATE — HTTP 경로가 없어 기능 영향 0, 사고 시 피해는 최대
--     ⚠️ 대상 12개 목록은 인수인계서 값이다. 적용 전 카탈로그로 재확인할 것.
revoke truncate on all tables in schema public from anon, authenticated;

-- A3. MAINTAIN · REFERENCES · TRIGGER — 앱이 쓸 일이 없다
revoke references, trigger on all tables in schema public from anon, authenticated;
```

> `MAINTAIN`은 PG17+ 권한이다. 서버 버전이 낮으면 이 이름이 없으므로 A3에서 제외했다.
> 카탈로그 확인 후 필요하면 추가한다.

**DELETE는 남긴다.** 17개 중 대부분은 소유권 정책이 붙은 정상 기능이다
(`cheers_delete_own` · `catalog_delete_own_custom` 등). 죽은 것 3개만 A1에서 회수한다.

### 8-B. 기존 함수에서 회수할 EXECUTE

```sql
revoke execute on function public.current_streak_days(uuid)          from public, anon, authenticated;
revoke execute on function public.notify_challenge_peek_unlock(uuid) from public, anon, authenticated;
revoke execute on function public.is_blocked_between(uuid, uuid)     from public, anon, authenticated;
revoke execute on function public.pending_bug_report_count()         from public, anon, authenticated;
grant  execute on function public.current_streak_days(uuid)          to service_role;
grant  execute on function public.notify_challenge_peek_unlock(uuid) to service_role;
grant  execute on function public.is_blocked_between(uuid, uuid)     to service_role;
grant  execute on function public.pending_bug_report_count()         to service_role;
```

⚠️ **`from public`만 쓰면 `anon`이 안 빠진다.** Supabase는 `anon`에 **직접** 부여한다
(인수인계서 §4-1, 0093에서 실제로 겪음). `from anon`을 반드시 함께 쓴다.

⚠️ **`revoke` 뒤에 `grant ... to service_role`을 반드시 붙인다.** 0048이 같은 순서를 쓴다.

**회수하지 않는 것과 그 이유** (§7-3):
`autostart_due_challenges` · `autofinalize_due_challenges` (앱이 클라이언트에서 부른다) ·
`is_challenge_participant` · `is_group_member` · `challenge_in_setup` 등 정책 헬퍼 10개
(정책 평가에 EXECUTE가 필요하다) · `get_session_actor_profiles` (앱이 부른다).

### 8-C. `ALTER DEFAULT PRIVILEGES` — owner별 설정

> ⛔ **이 항목은 `[미검증]`이다.** 카탈로그를 못 봐서 `pg_default_acl`을 이 세션에서
> 재확인하지 못했다. 아래는 인수인계서 §2의 실측값을 전제로 한 **제안**이며,
> 적용 전에 반드시 재조회해야 한다.

인수인계서가 기록한 현 상태:

```
postgres       / public / TABLE → anon=arwdDxtm , authenticated=arwdDxtm , service_role=arwdDxtm
supabase_admin / public / TABLE → (동일)
postgres       / public / FUNC  → anon=X       , authenticated=X        , service_role=X
supabase_admin / public / FUNC  → (동일)
postgres       / public / SEQ   → anon=rwU     , authenticated=rwU      , service_role=rwU
```

**`REVOKE ALL`로 밀지 않는다.** Supabase/PostgREST가 정상 동작하려면 남겨야 하는 것이 있다.
남길 것과 뺄 것을 이렇게 가른다:

| 객체 | 롤 | 남긴다 | 뺀다 | 근거 |
|---|---|---|---|---|
| TABLE | `authenticated` | `SELECT, INSERT, UPDATE, DELETE` | **`TRUNCATE, REFERENCES, TRIGGER`** (+PG17 `MAINTAIN`) | 앱은 CRUD만 쓴다. 나머지 넷은 PostgREST 경로가 없다 |
| TABLE | `anon` | **아무것도 안 남긴다** | `ALL` | 무인증이 새 테이블에 기본 권한을 받을 이유가 없다. 필요하면 그 테이블에서 명시적으로 준다 |
| TABLE | `service_role` | `ALL` | — | admin 조회·회귀·cron이 전부 여기 의존한다. **건드리지 않는다** |
| FUNCTION | `authenticated` | `EXECUTE` | — | 새 RPC마다 손으로 grant하게 만들면 반드시 빠뜨린다. 대신 §8-B 부류는 개별 회수 |
| FUNCTION | `anon` | — | **`EXECUTE`** | 무인증이 새 함수를 자동으로 부를 수 있어야 할 이유가 없다. 정책 헬퍼는 그때 명시적으로 준다 |
| SEQUENCE | `anon` | — | **`ALL`** | 〃 |

```sql
-- owner가 둘이므로 둘 다 건다. 지금 객체는 전부 postgres 소유지만
-- supabase_admin 항목이 남아 있어 어느 쪽이 미래 객체에 걸릴지 단정할 수 없다.
alter default privileges for role postgres       in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role supabase_admin in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres       in schema public revoke all on tables    from anon;
alter default privileges for role supabase_admin in schema public revoke all on tables    from anon;
alter default privileges for role postgres       in schema public revoke all on sequences from anon;
alter default privileges for role postgres       in schema public revoke execute on functions from anon;
alter default privileges for role supabase_admin in schema public revoke execute on functions from anon;
-- service_role은 어떤 줄에서도 건드리지 않는다.
```

### 8-D. Supabase · PostgREST · service_role 영향

| 대상 | 영향 |
|---|---|
| **PostgREST** | 없음. 스키마 캐시는 권한과 무관하게 만들어진다(이번에 실측: 권한 없는 `admin_schema_snapshot`도 OpenAPI에 나온다). 회수된 경로는 호출 시 42501로 떨어진다 |
| **service_role** | **한 줄도 건드리지 않는다.** admin 대시보드·회귀 34종·cron 브리핑이 전부 여기 의존한다 |
| **Supabase 대시보드** | Table Editor는 `postgres`로 붙으므로 영향 없음 |
| **익명 인증 사용자** | `authenticated` 롤이라 §8-B의 4개 함수만 못 부르게 된다. 0094 게이트는 그대로 |
| **되돌림 위험** | Supabase가 default privileges를 나중에 되돌려 놓을 수 있다 → §8-E와 재발 감시 테스트 필요 |

### 8-E. 롤백 방법

```sql
-- 8-B 롤백 (함수 EXECUTE 복구)
grant execute on function public.current_streak_days(uuid)          to anon, authenticated;
grant execute on function public.notify_challenge_peek_unlock(uuid) to anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid)     to anon, authenticated;
grant execute on function public.pending_bug_report_count()         to anon, authenticated;

-- 8-A 롤백 (테이블 권한 복구)
grant insert, update, delete on public.bug_reports      to authenticated;
grant update, delete         on public.profile_views    to authenticated;
grant update                 on public.exercise_catalog to authenticated;
grant update                 on public.group_members    to anon, authenticated;
grant delete                 on public.profiles         to anon, authenticated;
grant truncate, references, trigger on all tables in schema public to anon, authenticated;

-- 8-C 롤백 (default privileges 복구)
alter default privileges for role postgres       in schema public grant all on tables    to anon, authenticated;
alter default privileges for role supabase_admin in schema public grant all on tables    to anon, authenticated;
alter default privileges for role postgres       in schema public grant all on sequences to anon;
alter default privileges for role postgres       in schema public grant execute on functions to anon;
alter default privileges for role supabase_admin in schema public grant execute on functions to anon;
```

**롤백이 필요한지 판단하는 법**: 회귀 34종 + `cross-user-abuse-check`를 돌린다.
빨개진 것이 **제품 기능**이면 롤백, **공격 단언**이면 정상(고쳐진 것이다).

### 8-F. 적용 순서 제안

```
1) 카탈로그 재조회      — pg_default_acl · TRUNCATE 12개 목록 · 함수 owner   ← 지금 못 한 것
2) 8-B (함수 4개)       — 영향 0이 실측으로 증명됨. 가장 안전하고 이득이 크다
3) cross-user-abuse-check 재실행 → 43/43 이 되어야 한다
4) 8-A1 (죽은 테이블 권한)
5) 회귀 34종 전량
6) 8-A2/A3 (TRUNCATE·REFERENCES·TRIGGER)
7) 8-C (default privileges) + 재발 감시 테스트 신설
8) 회귀 전량 + 화면 확인 → 배포
```

---

## 9. `[미검증]` — 무엇이 닫혔고 무엇이 남았나

> **2026-09-02 갱신.** Supabase MCP가 붙은 세션에서 카탈로그를 직접 조회해
> 아래 ✅ 항목들이 닫혔다. 실측값은 §12에 있다.

### 9-0. 2026-09-02에 닫힌 것

| 항목 | 실측 결과 |
|---|---|
| ✅ `pg_default_acl` 현재 값 | `postgres`·`supabase_admin` **양쪽** `public`에 TABLE→`arwdDxtm`(anon·authenticated). 인수인계서 §2 추정이 **정확했다** |
| ✅ `authenticated` TRUNCATE 12개 목록 | **정확히 12개** — bug_reports · challenges · exercise_catalog · group_members · groups · profile_views · profiles · user_goals · workout_exercises · workout_images · workout_sessions · workout_sets (anon은 3개: groups · group_members · profiles) |
| ✅ `MAINTAIN`·`REFERENCES`·`TRIGGER` | PG **17.6** 이라 `MAINTAIN`이 실재. 셋 다 STEP 2에서 회수 |
| ✅ 함수 owner | 98개 **전부 `postgres`** (≠postgres 0개) |
| ✅ 정책이 회수 대상 4함수를 부르는가 | **0개** — 정책 79개 전수 정규식 검색 |
| ✅ `pending_bug_report_count` 사용처 | **아무도 안 부른다.** `briefing/route.ts:29`가 안 쓰는 이유를 주석으로 적고 직접 센다 |

### 9-1. 아직 남은 것

| 항목 | 상태 | 왜 |
|---|---|---|
| **새 객체 재발 실증** (요구 §7) | **`[미검증]`** | 새 테이블을 만들어야 확인되는데 DDL 수단이 없다. `pg_temp`·`begin/rollback` 모두 임의 SQL이 필요하다 |
| `authenticated` TRUNCATE 12개 목록 | **`[미검증]`** | PostgREST에 TRUNCATE 경로 없음 |
| `MAINTAIN`·`REFERENCES`·`TRIGGER` 권한 | **`[미검증]`** | 〃 |
| 함수 owner (postgres 여부) | **`[미검증]`** | `pg_get_functiondef`가 owner를 안 찍는다 |
| `PUBLIC` 롤 단독 부여분 | **`[미검증]`** | HTTP 무인증은 `anon`으로 온다. `PUBLIC`과 분리 불가 |
| `create_group` · `issue_my_invite_code` EXECUTE | **`[미검증]`** | 부르면 행이 생기거나 값이 바뀌어 프로브하지 않았다 |
| `anon` EXECUTE 21 vs 11 | **불일치** | 트리거 함수 포함 여부 차이로 추정. 카탈로그로 확정할 것 |
| `/admin` 프로덕션 육안 | 사용자 확인 완료(2026-09-01) · 자동화 불가 | |
| 카카오/구글 OAuth 왕복 | **`[미검증]`** | 자동화 불가 |
| `leaked password protection` | **`[미검증]`** | 대시보드 설정 |
| GitHub branch protection | **`[미검증]`** | 수동 설정 |

### 9-1. 재발 감시 테스트 (§8-C와 짝) — 아직 못 만들었다

`scripts/default-privilege-check.mjs`는 **새 테이블을 만들고 ACL을 확인**해야 하므로
DDL 실행 수단이 필요하다. 이 세션에서는 만들 수 없었다. 카탈로그 접근이 생기면:

```
begin;
  create table pg_temp.acl_probe(id int);        -- 또는 public에 만들고 rollback
  select grantee, privilege_type from information_schema.role_table_grants
   where table_name = 'acl_probe';
rollback;                                         -- 운영에 객체를 남기지 않는다
```

단언: `anon`·`authenticated`에 `TRUNCATE`·`DELETE`가 **자동으로 붙지 않는다.**
`scripts/regression-baselines.json`에 등록한다.

---

## 10. 이번 감사가 운영 DB에 남긴 흔적 (정리 필요)

프로브 과정에서 3건이 남았다. **전부 픽스처·프로브 산출물이고 실사용자 데이터가 아니다.**
정리 명령이 auto 모드 분류기에 막혀 지우지 못했다.

> ⚠️ **2026-09-02 확인 — 3건 모두 아직 남아 있다.** 사용자가 직접 정리하기로 했고(2026-09-01),
> 그 세션에서는 손대지 않았다. 이번 세션에서도 삭제는 파괴적 변경이라 승인 없이 하지 않았다.

| 대상 | 무엇 | 왜 생겼나 |
|---|---|---|
| `auth.users` `bac9dd63-9067-4a09-8c3d-138534f58ff5` | 익명 계정 1개 (프로필·활동 없음) | EXECUTE 매트릭스 1차 시도가 정리 직전에 크래시 |
| `workout_sessions` `cbb64c9a-be87-4836-a497-4e7bba38ddf8` | 전 컬럼 null · `status=draft` · 픽스처 A 소유 | 테이블 ACL 프로브의 `POST {}` (§4-2) |
| `workout_sessions` `cf8f4b56-bf98-44d8-a4f3-14c5ad93af63` | 〃 | 〃 (프로브 2회 실행) |

정리 SQL (승인 시):

```sql
delete from public.workout_sessions
 where id in ('cbb64c9a-be87-4836-a497-4e7bba38ddf8','cf8f4b56-bf98-44d8-a4f3-14c5ad93af63')
   and user_id = '5c25117d-9cc6-494d-8026-eb462c4e072d'
   and status = 'draft' and started_at is null and title is null;
-- 익명 계정은 Supabase 대시보드 Authentication에서 지운다 (auth 스키마 직접 조작 금지)
```

---

## 11. 함께 처리한 회귀

| 스크립트 | 결과 | 비고 |
|---|---|---|
| `challenge-invite-link-check` | **28/28** | 0095 새 규칙 확정 — `crewLinked=0`인데 `invited_by`는 남는다(계보 보존)를 실측 |
| `challenge-room-check` | **48 통과 / 0 실패** | 지난 세션 rate limit 미검증분 해소 |
| `rls-test` | **129 통과 / 0 실패** | 단언 1건이 옛 규칙을 보고 있어 고쳤다 ↓ |
| `cross-user-abuse-check` | **40 통과 / 3 실패** | 신설. 실패 3건이 §7의 발견이다 |

### 11-1. `rls-test` 단언을 0090에 맞춰 고쳤다

```
옛 단언: "시작 후 KPI 수정 불가 (기록 보존)"  →  status<300 && 0행
현 규칙: 0090이 **올리기만** 허용으로 바꿨다. 낮추기는 트리거가 goal_lowered로 막는다
```

제품이 고장난 게 아니라 **차단이 조용한 0행에서 명시적 예외로 강해진** 것이다.
단언을 둘로 나눴다 — 낮추기는 막히고(`goal_lowered`), 올리기는 허용된다.
기준선 128 → **129**로 `--record` 갱신했다.

> 지난 세션의 `challenge-invite-link-check` 22/27과 **같은 종류**다.
> CLAUDE.md의 *"단언이 통과하는가가 아니라 지금도 운영이 그 경로를 쓰는가를 먼저 물어라"* 가
> 이틀 연속 걸렸다.

### 11-2. `cross-user-abuse-check`를 기준선에 등록하지 않은 이유

실패 3건이 **아직 열려 있는 발견**이다. 지금 `scripts/regression-baselines.json`에
등록하면 `pnpm verify:regression`이 통째로 빨개지고, 그 빨강이 무관한 배포까지 막는다.

**등록 시점**: 0096 STEP 1(함수 EXECUTE 회수)을 적용하고
`node scripts/cross-user-abuse-check.mjs`가 **43 통과 / 0 실패**가 된 것을 확인한 뒤
`pnpm verify:regression --only cross-user-abuse-check --record`.

그때까지는 이 문서 §6 표가 그 자리를 대신한다.

---

## 12. ✅ 적용 결과 — 2026-09-02 (STEP 1 · STEP 2)

**사용자 승인 후 Supabase MCP로 직접 적용하고 객체 재조회로 검증했다.**
STEP 3(`ALTER DEFAULT PRIVILEGES`)은 **적용하지 않았다** — 별도 승인 대상이다.

### 12-1. 무엇이 바뀌었나 (객체 재조회 실측)

| 대상 | 적용 전 | 적용 후 |
|---|---|---|
| `current_streak_days(uuid)` | `{postgres=X, authenticated=X, service_role=X}` | **`{postgres=X, service_role=X}`** |
| `notify_challenge_peek_unlock(uuid)` | 〃 | 〃 |
| `is_blocked_between(uuid,uuid)` | 〃 | 〃 |
| `pending_bug_report_count()` | 〃 | 〃 |
| `TRUNCATE` 보유 테이블 | **12** | **0** |
| `REFERENCES`·`TRIGGER`·`MAINTAIN` 보유 | 다수 | **0** |
| 죽은 권한 5건 | 있음 | **0** |
| ⚠️ `profiles` SELECT·INSERT·UPDATE | 3 | **3** (그대로) |
| ⚠️ `push_subscriptions` / `notification_settings` | 4 / 3 | **4 / 3** (그대로) |

### 12-2. ⚠️ 크루 스트릭은 그대로다 — 화면으로 확인했다

사용자 지시(2026-09-02): **크루끼리 서로의 스트릭을 보는 것은 GND 핵심 기능이므로
절대 제거하지 마라.** 닫은 것은 관계 검사를 우회하는 **직접 RPC 경로**뿐이다.

`grep -rn current_streak_days src/` → **0건**. 화면은 이 RPC를 안 쓴다:

| 화면 | 스트릭 출처 |
|---|---|
| 홈 크루 카드 | `friend-board.ts:132` → `currentStreak(keys, todayKey)` **TS 계산** |
| `🔥 연속 N일` 시트 | `member-profile-sheet.tsx` 가 **prop으로 받는다** |
| 원재료 | RLS가 허용한 `workout_sessions` (`sessions_select_own_or_crew`) |

`localhost:3000`에서 픽스처 A로 로그인해 **적용 후** 직접 봤다:

```
홈 크루 카드   오뎅끼데스까 연속 33일 · 근육은퇴근중 연속 3일
프로필 시트    근육은퇴근중님 🔥 3 · 누적 운동 19회 · 🔥 연속 3일 · 이번 주 1일
피드           오뎅끼데스까🔥33 · 근육은퇴근중🔥3 · 헬스장주주(나)🔥1
크루 화면      내 크루 2명
```

**네 곳의 숫자가 전부 일치한다** — 화면 `3` · `service_role`의 `current_streak_days(B)` `3` ·
회귀 단언 "A가 본 B의 완료 세션" `19` · DB 실측 `19`(21건 중 2건 소프트 삭제).

### 12-3. 회귀 — `cross-user-abuse-check`에 [11]절을 새로 넣었다

40/3 → **51/51**. 늘어난 8건은 **양방향**을 단언한다. 막힌 것만 세면 기능을 죽여도 초록이다.

| 단언 | 방향 |
|---|---|
| 크루 A는 B의 완료 세션을 **정책 수만큼 본다** | ✅ 기능 보존 |
| 크루라도 B가 **삭제한** 기록은 못 본다 | ❌ 경계 |
| `service_role`은 `current_streak_days`를 **여전히 부른다** | ✅ 내부 경로(배지·XP·운동완료) |
| **크루인 A조차** 직접 RPC는 못 부른다 | ❌ 뒷문 |
| 비크루의 스트릭도 직접 못 부른다 | ❌ 뒷문 |
| A는 비크루의 운동 세션을 못 읽는다 | ❌ 경계 |

> ⚠️ **이 단언이 진짜인 것은 실제로 빨개져서 증명됐다.** 처음엔 진실값을
> `status=completed`로만 잡아 19/21로 실패했다. 원인은 회귀가 아니라 **B의 세션 2건이
> 소프트 삭제**된 것이었다. 정책과 **똑같은 조건**(`visibility='group' AND deleted_at IS NULL`)
> 으로 진실값을 만들어야 한다 — 진실값이 정책보다 느슨하면 **정상 동작을 고장으로 신고**한다.

적용 후 전량: `rls-test` 129/129 · `crew-link-check` 53/53 · `bug-report-check` 20/20 ·
`block-report-goal-check` 23/23 · readonly 5종 전부 · lint 0 error · typecheck ·
test 2983/2983 · build 성공.

`peek-reset-check`는 **2/8 [부분]** 이다. 제 변경과 무관하다 — 이 스크립트는
`SUPABASE_SERVICE_ROLE_KEY` **전용**이고(35~46행) STEP 1은 `service_role`을 재부여했다.
축소 원인은 픽스처 결손(`Test11` 챌린지에 B가 참가자로 없다)이고, 그건
`dev-fixture.mjs create`가 `.env.local`의 `DEV_FIXTURE_PASSWORD` 길이(10자 미만)에
막혀서다. ⛔ 비밀번호는 임의로 되돌리지 않았다(CLAUDE.md).

### 12-4. ⚠️ 스키마 스냅샷은 GRANT를 담지 않는다

`pnpm db:snapshot` 후 `docs/db-current-schema.sql`의 diff가 **0줄**이었다.
스냅샷은 함수·정책·인덱스만 담고 **GRANT/REVOKE는 한 줄도 없다**(`grep -c` → 0).

즉 **권한 회귀는 스냅샷 diff로 절대 안 잡힌다.** 감시자는 `cross-user-abuse-check`
하나뿐이므로 core 기준선에 넣었다(`tier: fixture`, 51단언).

### 12-5. 콘솔의 406·409는 이번 변경과 무관하다 — 로그로 확인

| 오류 | 실제 요청 | 판정 |
|---|---|---|
| **406** ×8 | `GET /profiles?select=created_at&id=eq.<익명id>` | 앱이 접속 시 자동 생성한 **익명 계정에 프로필 행이 없어** `.single()`이 406. 전부 A 로그인 **전** 시각이고, **8월 31일에도 다른 익명 id로 같은 패턴**이 있다 |
| **409** | `POST /analytics_events` | `unique(user_id, event_name)` 중복 — `analytics-events.ts`가 **의도적으로 삼킨다** |

A로 로그인한 뒤 localhost에서 나간 요청 중 2xx가 아닌 것은 이 409 하나뿐이었다.

### 12-6. 운영 DB 정리

- ✅ 회귀 잔여 계정 `lnkH-t006r`(`zzperm-…@example.com`, 활동 전부 0) **삭제** —
  닉네임 허용목록 + 이메일 접두사 + 활동 0 + 개수 가드(9→8)를 모두 건 스크립트로 했다.
  프로필 **8개**로 기준선 복구
- ⬜ §10의 프로브 흔적 3건은 **아직 남아 있다** (사용자가 직접 정리하기로 한 건)
- ℹ️ 개발 서버를 열면서 익명 계정 1개가 새로 생겼다. CLAUDE.md대로 **지우지 않는다**
