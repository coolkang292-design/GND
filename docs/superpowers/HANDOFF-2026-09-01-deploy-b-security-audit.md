# 인수인계 — 배포 B: SECURITY DEFINER / GRANT / TRUNCATE 전수 감사

> ## ✅ 이 인수인계서는 2026-09-01에 대부분 소진됐다
>
> **감사·공격 테스트·문서·회귀는 끝났다.** 결과는 여기가 아니라
> **`docs/security/public-beta-rpc-audit.md`** 에 있다. 그쪽을 먼저 읽어라.
>
> | | |
> |---|---|
> | 함수 98개 전수표 · 4배우 매트릭스 · 테이블 ACL · 정책 79개 | ✅ 완료 |
> | cross-user 공격 테스트 (`scripts/cross-user-abuse-check.mjs`) | ✅ **40 통과 / 3 실패** |
> | 발견 | **3건** — 전부 "남의 id 인자 + `auth.uid()` 검사 없음 + SD" 패턴 |
> | 회귀 미검증분 (`challenge-room-check` · `rls-test` · `challenge-invite-link-check`) | ✅ 전부 해소 (`rls-test`는 0090에 맞춰 단언 수정, 128→129) |
> | **DB 권한 변경** | ⛔ **승인 대기.** `supabase/migrations/0096_permission_tightening_PROPOSAL.sql` (미적용) |
> | 카탈로그 재조회 (`pg_default_acl`·TRUNCATE 목록·함수 owner) | ⛔ **`[미검증]`** — 그 세션에 Supabase MCP가 없었다 |
> | 새 객체 재발 실증 (§2의 질문) | ⛔ **`[미검증]`** — DDL 수단 없음 |
>
> **아래 §1~§10은 그때의 출발점 기록이다.** §1의 숫자 중 `anon` EXECUTE 21은
> 실측 11과 어긋난다(감사 문서 §2 참조). §6의 `bug_report_watchers` 항목은
> **닫혔다** — service_role 전용이 확정됐다.

**작성** 2026-09-01 · **기준 커밋** `9870eff` · **배포** `gnd-ndyijuofe-gnd4` → `gnd-one.vercel.app`
**앞선 작업** 배포 A(0092) · D(0093 퍼널) · 계보 · C(0094 익명 경계) · 0095(크루/챌린지 소셜 분리) — **전부 코드·DB·CI·배포 완료**

---

> # ⚠️ 2026-09-02 갱신 — 이 인수인계서의 절반은 이미 끝났다
>
> **STEP 1 · STEP 2가 운영 DB에 적용됐다** (사용자 승인 후 Supabase MCP).
> 아래 본문은 **적용 전** 시점에 쓴 것이다. 지금 상태는 다음을 보라:
>
> | 무엇 | 어디 |
> |---|---|
> | 적용 결과·실측·화면 확인 | `docs/security/public-beta-rpc-audit.md` **§12** |
> | 적용된 SQL과 검증 SQL | `supabase/migrations/0096_permission_tightening.sql` |
>
> **끝난 것** — 카탈로그 재조회(§6의 `[미검증]` 6건 해소) · 함수 EXECUTE 4개 회수 ·
> 죽은 테이블 권한 5건 회수 · TRUNCATE/REFERENCES/TRIGGER/MAINTAIN 전량 회수 ·
> `cross-user-abuse-check` 40/3 → **51/51** (기능 보존 단언 8건 추가) · core 기준선 등록 ·
> 화면 확인(크루 스트릭 정상) · 잔여 계정 정리.
>
> **남은 것** — ⬜ **STEP 3 `ALTER DEFAULT PRIVILEGES`** (별도 승인 필요) ·
> ⬜ `scripts/default-privilege-check.mjs` 신설 · ⬜ §10 프로브 흔적 3건 정리.
>
> ⚠️ **`pg_default_acl`은 그대로다.** STEP 2로 지금 있는 테이블은 정리됐지만,
> **다음에 만드는 테이블은 여전히 anon·authenticated에 TRUNCATE 포함 전 권한을 받는다.**
> 0093의 `analytics_events`가 그랬다. STEP 3을 해야 재발이 끊긴다.

---

## 0. 지금 당장 알아야 할 것 세 가지

1. **근본 원인을 이미 찾아 뒀다.** `pg_default_acl`이 새 테이블·새 함수에 `anon`/`authenticated`
   전 권한을 자동으로 붙인다. §3에 실측 증거가 있다. **B의 절반은 이걸 고치는 일이다.**
2. **REVOKE는 이 저장소에서 "멈추고 보고" 대상이었다.** 다만 사용자가 2026-09-01에
   *"사용처가 없고 서비스 영향이 없다는 것을 증명했다면 비파괴 보안 수정으로 적용할 수 있다"*
   고 명시했다. **증명이 먼저고, 그다음이 REVOKE다.** 순서를 뒤집지 마라.
3. **Advisor 숫자를 줄이는 작업이 아니다.** 139건 중 상당수는 앱이 실제로 부르는 함수라
   정상이다. 목표는 **실제 공격 경로를 닫는 것**이고, 정상 기능을 깨뜨리면 실패다.

---

## 1. 실측 스냅샷 (2026-09-01) — 출발점

> ⚠️ 이 표도 **다시 확인하라.** 여기 적힌 이유는 "0에서 시작하지 말라"는 것이지
> "믿으라"는 것이 아니다. 아래 쿼리를 그대로 다시 돌려라.

| 항목 | 값 |
|---|---|
| public 테이블 | **40** (전부 owner = `postgres`) |
| RLS 미적용 테이블 | **0** |
| public 함수 | **98** — 그중 **SECURITY DEFINER 89** |
| `anon` EXECUTE 가진 함수 | **21** |
| `authenticated` TRUNCATE 보유 테이블 | **12** |
| `authenticated` DELETE 보유 테이블 | **17** |
| `anon` 테이블 권한 보유 | **3** (`profiles` · `groups` · `group_members`) |
| Supabase Advisor | **139건** |

**`authenticated` TRUNCATE 12개 (실측 목록):**
```
bug_reports · challenges · exercise_catalog · group_members · groups ·
profile_views · profiles · user_goals · workout_exercises · workout_images ·
workout_sessions · workout_sets
```

**Advisor 139건 내역:**
```
 81  authenticated_security_definer_function_executable
 41  auth_allow_anonymous_sign_ins
 14  anon_security_definer_function_executable
  1  rls_enabled_no_policy        (bug_report_watchers)
  1  extension_in_public          (pg_net)
  1  auth_leaked_password_protection
```

재조회 쿼리:
```sql
-- 테이블 ACL
select grantee, privilege_type, count(*) , string_agg(table_name, ', ' order by table_name)
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')
group by 1,2 order by 1,2;

-- 컬럼 단위 GRANT (⚠️ 테이블 단위만 보면 놓친다 — §5 참조)
select table_name, privilege_type, count(*) as cols
from information_schema.column_privileges
where table_schema='public' and grantee='authenticated'
group by 1,2 order by 1,2;

-- SECURITY DEFINER 전수
select p.proname, pg_get_function_arguments(p.oid) as args,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef,
       array_to_string(p.proconfig,',') as cfg
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef order by p.proname;

-- 함수 EXECUTE 권한
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public' and grantee in ('anon','authenticated','PUBLIC')
order by routine_name, grantee;
```

---

## 2. ⭐ 근본 원인 — 이미 증명했다 [확실]

`pg_default_acl`에 **public 스키마용 항목이 2개** 있다 (owner `postgres`, owner `supabase_admin`).

```
postgres       / public / TABLE → anon=arwdDxtm , authenticated=arwdDxtm , service_role=arwdDxtm
supabase_admin / public / TABLE → anon=arwdDxtm , authenticated=arwdDxtm , service_role=arwdDxtm
postgres       / public / FUNC  → anon=X       , authenticated=X        , service_role=X
supabase_admin / public / FUNC  → anon=X       , authenticated=X        , service_role=X
postgres       / public / SEQ   → anon=rwU     , authenticated=rwU      , service_role=rwU
```

`arwdDxtm` 풀이:
```
a=INSERT  r=SELECT  w=UPDATE  d=DELETE  D=TRUNCATE  x=REFERENCES  t=TRIGGER  m=MAINTAIN
```

**즉 `public`에 새 테이블을 만들면 그 순간 `anon`과 `authenticated`가 TRUNCATE 포함 전 권한을 받는다.**
새 함수도 마찬가지로 `anon` EXECUTE를 자동으로 받는다.

### 이게 실제로 일어난 증거

배포 D(0093)에서 `analytics_events`를 만들 때 `grant insert ... to authenticated` **하나만** 줬는데,
직후 조회하니 `anon`·`authenticated` 둘 다 `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`를
갖고 있었다. `revoke all ... from public`으로도 안 빠져서 **`from anon`을 명시**해야 했다.
(`0093`·`0095` 마이그레이션에 그 경위가 주석으로 남아 있다)

### 확인 쿼리
```sql
select coalesce(r.rolname,'(all)') as owner, n.nspname as schema,
       case d.defaclobjtype when 'r' then 'TABLE' when 'S' then 'SEQ'
            when 'f' then 'FUNC' else d.defaclobjtype::text end as objtype,
       array_to_string(d.defaclacl, ' , ') as acl
from pg_default_acl d
left join pg_roles r on r.oid=d.defaclrole
left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname = 'public';
```

### ⚠️ 고치기 전에 반드시 확인할 것

`ALTER DEFAULT PRIVILEGES ... REVOKE`를 무작정 실행하면 **Supabase가 기대하는 동작이 깨질 수 있다.**
먼저 답을 확보하라:

- **PostgREST가 실제로 필요로 하는 최소 권한은 무엇인가?** 지금 앱은 테이블 대부분에
  `SELECT` + 일부 `INSERT/UPDATE`만 쓴다. `workout_sessions`는 **컬럼 단위 INSERT 14칸**만 있다(§5)
- **`service_role`은 건드리지 마라.** admin 조회·회귀 스크립트·cron이 전부 여기 의존한다
- **owner가 둘이다.** 지금 테이블은 전부 `postgres` 소유지만, `supabase_admin` 항목도 남아 있다.
  둘 중 어느 쪽이 미래 객체에 적용될지 확인하고 필요한 쪽만 고쳐라
- Supabase 대시보드/CLI가 나중에 default privileges를 되돌려 놓을 수 있다.
  **되돌아왔는지 감시할 회귀 테스트를 남겨라** (§7)

---

## 3. 이미 확인된 사실 — 다시 조사하지 않아도 되는 것

시간을 아끼기 위해 앞선 작업에서 **실측으로 확정한 것**만 적는다. 의심되면 재확인하되,
처음부터 다시 파헤칠 필요는 없다.

| 사실 | 근거 |
|---|---|
| `anon`(raw)은 `profiles`·`groups`·`group_members`를 **읽지 못한다** | 세 테이블의 SELECT 정책이 전부 `auth.uid()`에 의존. anon은 uid가 null |
| `analytics_events`는 **남의 이름으로 INSERT 불가** | 익명 토큰으로 `user_id=남` 시도 → `42501 new row violates row-level security` |
| `analytics_events`는 **SELECT 불가**(일반 사용자) | SELECT 정책이 없고 grant도 없다. service_role만 읽는다 |
| `workout_sessions`는 **컬럼 단위 INSERT 권한**(14칸) | `information_schema.column_privileges`. `status`는 목록에 없어 클라가 못 넣는다 |
| 익명 사용자는 `role='authenticated'` + `is_anonymous=true` | JWT 실측. **role로는 A와 B를 구분할 수 없다** |
| 승격 직후 **옛 토큰은 `is_anonymous=true`를 유지** | `scripts/anon-upgrade-jwt-check.mjs` 10/10. 갱신해야 false가 된다 |
| 0094 게이트는 익명만 막고 정식은 통과 | `scripts/anon-capability-probe.mjs` |

---

## 4. ⚠️ 함정 — 앞 작업에서 실제로 밟은 것들

다음 에이전트가 같은 곳에서 시간을 버리지 않도록 남긴다.

1. **`revoke all ... from public`으로는 `anon`이 안 빠진다.** Supabase는 `anon`에 **직접** 부여한다.
   `revoke ... from anon`을 따로 써야 한다.
2. **`Prefer: return=representation`은 SELECT 권한을 요구한다.** INSERT만 허용된 테이블에
   이걸 붙여 프로브하면 `42501`이 나서 **"INSERT가 막혔다"로 오독한다.** 실제로 그렇게 잘못 읽었다.
   클라이언트(`analytics-events.ts`)는 `.insert()`만 쓰므로 `return=minimal`이 맞다.
3. **테이블 단위 ACL만 보면 컬럼 단위 GRANT를 놓친다.** `workout_sessions`는 테이블 단위로는
   INSERT가 없지만 컬럼 14개에 INSERT가 있다. `column_privileges`를 꼭 같이 봐라.
4. **회귀 스크립트의 픽스처는 익명 계정이었다.** 0094 이후 10종이 깨져
   `crew-link-check`가 53/53 → 24/53이 됐다. `scripts/_permanent-user.mjs`로 고쳤다.
   **B에서 권한을 건드리면 같은 종류의 "픽스처가 실사용자와 다름" 문제가 또 날 수 있다.**
   빨개지면 *제품이 깨졌나, 픽스처가 낡았나*를 먼저 갈라라.
5. **익명 가입은 시간당 rate limit(429)이 있다.** `accounts` tier를 연달아 돌리면 막힌다.
   사이에 2분 이상 두고, 막히면 **코드 실패와 섞어 말하지 마라.**
6. **`send_cheer`는 `status='active'`인 세션에만 된다.** 완료된 세션으로 시험하면
   권한이 아니라 상태(`not_active`)에 걸려 결과를 오독한다.
7. **한 사람에게 진행 중 운동은 하나뿐이다.** 두 번째 active 세션 insert는 조용히 null을 준다.

---

## 5. B의 작업 순서 (권장)

### 5-1. 감사 (변경 없음)
1. §1 쿼리 전량 재실행 → 현재 수치 확정
2. **SECURITY DEFINER 89개 전수표** 작성 → `docs/security/public-beta-rpc-audit.md`
   열: 함수명 · 인자 · owner · search_path · PUBLIC/anon/authenticated/service_role EXECUTE ·
   `auth.uid()` 검증 · 익명 차단 · 소유권 검증 · 남의 id를 인자로 받나 · cross-user 가능성 ·
   동적 SQL · 위험도 · 판정
3. **A/B/C/D 4배우 매트릭스** — raw anon / 익명-auth / 정식 / service_role
4. 분류 자동화 힌트: `pg_policies` 본문 grep × `pg_trigger` × 코드의 `rpc("...")` grep
   → **호출자가 하나도 없는 함수**가 1차 회수 후보

### 5-2. Cross-user 공격 테스트 (변경 없음, 증거 수집)
`scripts/anon-capability-probe.mjs`와 `challenge-social-check.mjs`가 **뼈대다.** 복제해서
`scripts/cross-user-abuse-check.mjs`를 만들어라. A가 B에게:
프로필 수정 · 세션 수정/삭제 · 세트 조작 · 챌린지 상태 변경 · 크루 관계 조작 ·
알림 읽기 · 응원/댓글 조작 · **`analytics_events` 위조** · 포인트/XP 변경
→ **전부 실패해야 한다.** 특히 RPC 인자에 `p_user_id = B`를 넣는 우회를 반드시 시험하라.

### 5-3. 최소 수정 (위험도 순)
- **Critical**: cross-user read/write가 실제로 되는 것 → 즉시
- **High**: 불필요한 PUBLIC/anon EXECUTE · 불필요한 TRUNCATE/DELETE → **사용처 증명 후** 회수
- **Medium**: Advisor 경고는 있으나 내부 검증으로 안전 → 이유를 문서에 남기고 유지
- **Info**: 문서화만

### 5-4. 근본 원인 수정 (§2)
default privileges를 최소로. **그리고 재발 테스트**(§5-5).

### 5-5. 재발 방지 테스트 — 새 회귀 스크립트
`scripts/default-privilege-check.mjs` (가칭):
- 임시 스키마나 트랜잭션 롤백으로 **새 테이블을 하나 만들고 ACL을 확인**
- `anon`/`authenticated`에 TRUNCATE·DELETE가 **자동으로 안 붙는지** 단언
- ⚠️ **운영에 쓰레기 객체를 남기지 마라.** `pg_temp` 또는 `begin ... rollback`을 써라
  (0092에서 `pg_temp` 리허설로 트리거 함수를 안전하게 검증한 전례가 있다)
- `scripts/regression-baselines.json`에 등록

### 5-6. 절대 하지 말 것
```
DROP TABLE / DROP COLUMN / 운영 DELETE / TRUNCATE 실행 / RLS 비활성화 /
service_role 권한 축소 / 영향 범위 미확정 ALTER DEFAULT PRIVILEGES
```
→ **멈추고 보고.**

---

## 6. 미검증으로 남은 것 (B에서 닫아라)

| 항목 | 상태 | 비고 |
|---|---|---|
| `/admin` 프로덕션 육안 확인 | **[미검증 — 관리자 인증 필요]** | 사장님이 확인 완료 회신함(2026-09-01). 자동화는 여전히 불가 |
| 카카오/구글 실제 OAuth 왕복 | **[미검증 — 자동화 불가]** | JWT 갱신은 이메일 승격 경로로 실측 완료(10/10). OAuth 경로만 미확인 |
| `leaked password protection` | **[미검증 — 대시보드 설정]** | `docs/operations/public-beta-manual-checklist.md`에 절차 있음 |
| GitHub branch protection | **[미검증 — 수동 설정]** | 같은 문서에 절차 있음 |
| `bug_report_watchers` RLS 정책 0개 | **[추정]** service_role 전용으로 의도된 듯 | **B에서 확정하라** |
| `pg_net` extension in public | 이번 범위 밖으로 남김 | cron·푸시가 걸려 있어 위험 대비 이득이 없다 |

---

## 7. 회귀 목록 (34종) — B에서 돌려야 할 것

```bash
pnpm verify:regression --list              # 전량 + 기준선
pnpm verify:regression --tier readonly     # 5종, 안전·빠름
node scripts/challenge-social-check.mjs    # 0095 (29단언)
node scripts/referral-tree-check.mjs       # 계보 (12단언)
node scripts/anon-capability-probe.mjs     # 0094 익명 경계
node scripts/anon-upgrade-jwt-check.mjs    # JWT 갱신 (10단언)
node scripts/crew-link-check.mjs           # 크루 (53단언)
```

⚠️ `admin-dashboard-check`가 21 → **22**로 늘었다. `--record`로 기준선을 갱신하라:
```bash
pnpm verify:regression --only admin-dashboard-check --record
```

---

## 8. 앞선 작업이 남긴 문서 (읽는 순서)

| 문서 | 내용 |
|---|---|
| `docs/superpowers/plans/2026-08-31-public-beta-security-gate.md` | A~D 전체 계획·근거 |
| `docs/security/public-beta-auth-matrix.md` | 익명/정식 권한 매트릭스 (C) |
| `docs/analytics/public-beta-funnel-audit.md` | 퍼널 계측 감사 (D) |
| `docs/analytics/public-beta-referral-audit.md` | 추천 계보 감사 |
| `docs/operations/public-beta-manual-checklist.md` | 사람이 손으로 해야 하는 것 |
| `docs/db-current-schema.sql` | **현행 함수·정책·인덱스 전량.** 마이그레이션 파일에서 베끼지 말고 여기서 봐라 |

**아직 없는 것 = B의 산출물:** `docs/security/public-beta-rpc-audit.md`

---

## 9. 마이그레이션 번호

다음은 **0096**이다. 0092~0095가 이미 나갔다.

| 번호 | 내용 |
|---|---|
| 0092 | 함수 5개 search_path 고정 |
| 0093 | `analytics_events` (퍼널 계측) |
| 0094 | 익명 확산형 mutation 게이트 |
| 0095 | 영구 크루 vs 챌린지 임시 소셜 |

⚠️ `list_migrations`는 **빈 배열**이다. 이 저장소는 `supabase_migrations` 이력을 안 쓴다.
"NNNN까지 반영됐는지"는 **객체 존재로** 확인한다.

---

## 10. 작업 규칙 요약 (CLAUDE.md에서 자주 걸리는 것)

- **DB 변경은 에이전트가 MCP로 직접 적용**하고 **객체를 재조회해서** 확인한다.
  "명령이 성공했다"는 검증이 아니다. 파괴적 변경만 멈추고 보고
- 적용 후 **`pnpm db:snapshot`**으로 `docs/db-current-schema.sql` 갱신
- **배포하는 작업은 푸시를 따로 묻지 않는다.** 커밋 → 푸시 → 배포 한 흐름
- 배포 전 **개발 서버에서 화면을 눈으로 본다.** `pnpm dev` + 브라우저 조작
- 배포: `git worktree` → `.env.local`·`.vercel` 복사 → `npm run build` →
  `npx vercel@latest --prod --yes --scope gnd4` (**`--scope gnd4` 빼면 죽는다**)
- 완료 보고는 **코드/DB적용/DB검증/테스트/푸시/CI/배포/운영확인을 각각 따로**
