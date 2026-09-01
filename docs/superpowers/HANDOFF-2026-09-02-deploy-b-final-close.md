# 인수인계 — 배포 B 마감 보완 (2026-09-02, 중단 시점)

> 앞 문서를 먼저 읽어라.
> - `docs/security/public-beta-rpc-audit.md` §12 — 배포 B 적용 결과 전량
> - `docs/superpowers/HANDOFF-2026-09-01-deploy-b-security-audit.md` — 그 이전 인수인계
> - `supabase/migrations/0096_permission_tightening.sql` · `0097_permission_audit_snapshot.sql`

---

## 0. ✅ **해결됐다 (2026-09-02 후속 세션)** — 아래는 그때의 기록이다

> **§0 · §3-1 · §3-2는 전부 끝났다. 다시 하지 마라.**
> 선택은 **A(유지하고 문서화)** 였고, 이유는 되돌리기가 DB를 한 번 더 건드려야 하는데
> 그 필드들을 §3-2의 owner 가드가 곧바로 다시 필요로 하기 때문이다.
>
> | 항목 | 결과 |
> |---|---|
> | §0 저장소↔DB 불일치 | ✅ `0098_permission_audit_owner_fields.sql` 작성. 운영 본문과 **문자 단위 대조** 확인 |
> | §3-1 스냅샷 최신화 | ✅ `pnpm db:snapshot` — 헤더 98 → **99**, `permission_audit_snapshot` 포함 |
> | §3-2 owner 가드 | ✅ `[3]` 절 추가, **17 → 21단언** `--record`. 변이 테스트로 진짜임을 확인 |
> | §3-3 픽스처 비밀번호 | ⬜ **안 건드렸다** (사용자에게 물어야 한다) |
> | 곁가지 | ✅ `admin-dashboard-check` 기준선이 **활성 챌린지 수에 흔들리고 있었다** — 22 → 20, 데이터 비의존으로 전환 |
>
> 전량 기록: `docs/security/public-beta-rpc-audit.md` **§13**.
> `src/` 변경 0건이라 **배포하지 않았다.**

---

## 0-옛. ⛔ (해결됨) 저장소와 운영 DB가 어긋나 있었다

**운영 DB의 `permission_audit_snapshot()` 본문이 저장소의 0097과 다르다.**
2026-09-02에 필드 3개를 추가로 적용했는데 **마이그레이션 파일을 못 만들고 중단했다.**

```
운영 DB : measured_functions · tables_not_postgres · functions_not_postgres 를 더 돌려준다
저장소   : 0097_permission_audit_snapshot.sql 에는 그 3개가 없다
확인     : select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prosrc like '%functions_not_postgres%';   → 1
```

**이 세 필드는 무해하다** — 읽기 전용 집계이고, 보안 속성이 하나도 안 바뀌었다
(`SECURITY DEFINER` · `search_path=''` · ACL `{postgres=X, service_role=X}` · owner `postgres` · `stable`).
권한을 넓히지 않았고 개인정보도 없다(객체명·소유자명·개수뿐).

**다음 사람이 할 일은 둘 중 하나다. 고르고, 고른 이유를 적어라.**

| 선택 | 무엇을 하나 |
|---|---|
| **A. 유지하고 문서화** (권장) | `supabase/migrations/0098_permission_audit_owner_fields.sql`을 만들어 아래 §2의 SQL을 그대로 담는다. DB를 다시 건드리지 않는다 |
| **B. 되돌린다** | 0097의 본문으로 `create or replace` 한 번. 그러면 저장소가 진실이 된다 |

⚠️ **어느 쪽이든 그냥 두지 마라.** CLAUDE.md §DB 마이그레이션의 *"파일이 없으면 다음 사람이
스키마의 유래를 못 읽는다"* 가 정확히 이 상태를 막으려던 것이다.

---

## 1. 지금 상태 (2026-09-02 실측)

### 1-1. 저장소

```
로컬 HEAD    b5060b7   (= origin/main, rev-list 0 0)
작업 트리    깨끗 (변경 파일 0)
미커밋 작업  없음
```

**이번 세션에서 커밋한 것은 하나도 없다.** 파일 변경은 전부 되돌렸고, DB만 바뀌었다.

### 1-2. 운영 DB

| 항목 | 값 |
|---|---|
| public tables / RLS | 40 / 40 |
| public functions | **99** |
| SECURITY DEFINER | **90** |
| policies / indexes | 79 / 101 |
| table·function owner ≠ postgres | **0 / 0** |
| authenticated TRUNCATE 보유 | **0** |
| risky TABLE GRANT (TRUNCATE·REFERENCES·TRIGGER·MAINTAIN) | **0** |
| profiles | **8** |
| workout_sessions | **158** |
| bug_reports | **11** |
| 익명 계정 | 124 |

### 1-3. 회귀

`scripts/default-privilege-check.mjs` **17/17 통과** (스크립트는 0097 시점 그대로다 —
새 필드를 읽지 않으므로 DB가 앞서 있어도 안 깨진다).

⚠️ **나머지 회귀는 이번 세션에서 다시 안 돌렸다.** RPC 본문 변경 뒤 전량 검증을 못 했다.
다만 바뀐 것이 **읽기 전용 RPC의 반환 필드 3개뿐**이라 앱 경로에는 영향이 없다 —
그 RPC를 부르는 곳은 `default-privilege-check.mjs` 하나다(`grep -rn permission_audit_snapshot src/` → 0건).

---

## 2. ✅ 끝난 것 — 프로브 흔적 정리

2026-08-31 감사가 운영 DB에 남긴 것을 **증거 가드를 걸어** 지웠다.

### 2-1. 지운 것

| # | 객체 | 증거 |
|---|---|---|
| ① | `workout_sessions cbb64c9a-be87-4836-a497-4e7bba38ddf8` | 픽스처 A 소유 · `status=draft` · title·memo·started_at·completed_at·duration_minutes·deleted_at **전부 null** · 종목/사진/세트/응원/리액션 **0** |
| ② | `workout_sessions cf8f4b56-bf98-44d8-a4f3-14c5ad93af63` | 〃 |
| ③ | `auth.users bac9dd63-9067-4a09-8c3d-138534f58ff5` | 익명 · 프로필/세션/챌린지/크루/그룹/알림/이벤트/푸시 **0** |
| ④ | `bug_reports 25511b4b-173d-470d-8248-47de42cbae4c` | **③의 `ON DELETE CASCADE`로 함께 사라졌다** |

### 2-2. ⭐ 실사용자가 아니라는 결정적 증거 — `user_agent`

CLAUDE.md는 익명 계정 삭제를 막는다(*"사용자 폰이나 브라우저의 로그인 세션일 수 있다"*).
그 전제를 **로그로 깼다**:

```sql
-- edge_logs, 2026-08-31T22:00:18.214 (계정 생성 22:00:18.219 — 같은 요청)
POST /auth/v1/signup  200  user_agent="node"  referer=""
```

실사용자 기기였다면 `Mozilla/…` + `referer=https://gnd-one.vercel.app/` 이다.
같은 시간대(21:50~22:30)에 만들어진 계정은 **이 하나뿐**이었다.

⚠️ **이 방법을 기억해 둬라.** `auth.audit_log_entries` 테이블은 **비어 있다**(Supabase가
정리한다). 익명 계정의 출처를 가리려면 **로그 API의 `edge_logs`** 를 봐야 하고,
보존 창이 **24시간**이라 그 안에 확인해야 한다.

### 2-3. ⭐⭐ 열려 있던 보안 질문이 닫혔다 — `zzzz` 신고

2026-09-01 세션이 사용자에게 물어 놓고 답을 못 받은 질문:

> *"혹시 사장님이 보내신 게 아니라면 알려 주세요 — 그 경우엔 누가 픽스처 A 토큰으로
> RPC를 호출했는지가 별개의 보안 문제가 되고, 배포 B에서 우선순위로 봐야 합니다."*

**답: 사람이 아니라 감사 스크립트 자신이었다.**

- 신고 `25511b4b`의 생성 시각이 익명 계정 생성보다 **6.4초 뒤**
- 그 계정을 만든 요청의 `user_agent = "node"`
- 신고 내용이 `message="zzzz"` · `context={}` · `trail=["zzzz"]`
- 감사 문서 §1의 프로브 방식이 *"잘못된 리터럴을 인자로 준다 — `p_target_id = 'zzzz'`"* 다.
  `submit_bug_report`는 text 인자를 받으므로 `"zzzz"`가 **거부되지 않고 실제 행이 됐다.**

**→ 보안 사고가 아니다. 프로브의 부작용이다.** 우선순위 대상에서 빼도 된다.

⚠️ 남은 `zzzz` 신고 **2건**은 픽스처 A가 낸 것으로 아직 `bug_reports`에 있다(wontfix).
지우려면 같은 가드를 걸어라 — 다만 **원장에서 사라지므로 굳이 지울 이유는 없다.**

⚠️ **프로브를 다시 만들 사람에게**: 부작용이 있는 RPC(`submit_bug_report`·`create_group`·
`issue_my_invite_code` 등)는 **호출 가능 여부만 보고 실행하지 마라.** 리터럴을 넣으면
운영 원장에 행이 생긴다. 감사 문서 §4-2의 `POST {}` 방식도 같은 이유로 폐기했다.

### 2-4. 실사용자 데이터가 안 변한 증거

| | 전 | 후 |
|---|---|---|
| 프로필 | 8 | **8** |
| **시작된 세션** (`started_at is not null`) | 158 | **158** |
| **완료 세션** (`status='completed'`) | 142 | **142** |
| 전체 세션 | 160 | **158** (−2) |
| 신고 | 12 | **11** (−1) |

⚠️ **"전체 세션"이 아니라 "시작된 세션"을 기준으로 봐라.** 프로브 행은 `started_at`이
null이라, 이 숫자가 안 변한 것이 *실제 운동을 하나도 안 건드렸다*는 증거다.

---

## 3. ⬜ 안 한 것 — 왜 안 했는지

### 3-1. DB 스냅샷 최신화 (원래 1번)

```
docs/db-current-schema.sql 헤더 : 함수 98개 · 정책 79개 · 인덱스 101개
운영 DB 실제                    : 함수 99개 · 정책 79개 · 인덱스 101개
grep -c permission_audit_snapshot docs/db-current-schema.sql → 0   (빠져 있다)
```

**남은 일**: `pnpm db:snapshot` 한 번. 손으로 고치지 마라 — 자동 생성물이다.
⚠️ **§0을 먼저 정하고 나서 뽑아라.** 되돌리기(B)를 고르면 함수 본문이 또 바뀐다.

갱신 후 확인할 것:
- 헤더가 `함수 99개`가 되는가
- `permission_audit_snapshot`이 파일에 들어갔는가
- 실제 DB의 함수/정책/인덱스 수와 헤더가 일치하는가

### 3-2. owner 드리프트 가드 (원래 2번) — **사용자 지시로 보류**

> 사용자 (2026-09-02): *"② owner guard를 추가하고 → ③ fixture 비밀번호는 … 이건 일단
> 그대로 두고 프로브 기록만 삭제하자"*

DB 쪽(§0의 필드 3개)은 그 지시 **전에** 이미 적용됐고, **스크립트 가드 코드는 되돌렸다**
(`git checkout -- scripts/default-privilege-check.mjs`). 지금 저장소에는 가드가 없다.

#### 왜 이 가드가 필요한가 (다시 만들 때 읽어라)

`pg_default_acl`은 **객체를 만든 롤**의 것이 걸린다. 0096 STEP 3으로 `postgres` 기본값은
좁혔지만 **`supabase_admin` 기본값은 못 바꾼다** — `42501 permission denied`(플랫폼 제약).
그쪽은 여전히 anon·authenticated에 `arwdDxtm`(**TRUNCATE 포함**)를 준다.

즉 **지금 안전한 이유는 "좁힌 기본값"이 아니라 "public의 소유자가 postgres 하나뿐"이라는
사실**이다. 테이블 40개·함수 99개가 전부 postgres 소유다. 그 전제가 깨지는 순간 —
public에 postgres 아닌 소유자의 객체가 하나라도 생기는 순간 — 그 객체는 넓은 기본값을
그대로 물려받는다.

#### 설계 (그대로 다시 쓰면 된다)

- **`supabase_admin` 기본권한이 넓다는 사실 자체를 FAIL로 만들지 마라.** 고칠 수 없는 것을
  매번 빨갛게 하면 진짜 회귀가 묻힌다. 지금처럼 `[알고 있음]` 한 줄로 찍기만 한다
- 대신 `scripts/default-privilege-check.mjs`에 절 하나를 더한다:
  - `measured_functions >= 99` — 측정 대상이 비면 아래 둘이 공허하게 통과한다
  - `tables_not_postgres.length === 0`
  - `functions_not_postgres.length === 0`
- 기존 단언(기본권한·risky grant·잠근 함수 4개·anon EXECUTE ≤ 21)은 **그대로 둔다**
- `service_role` 권한, `authenticated`의 기본 DML/EXECUTE는 **건드리지 않는다**
- 기준선 17 → 20으로 `--record`

#### §0에서 A(유지)를 고르면 쓸 SQL — 이미 운영에 적용된 것과 동일하다

`permission_audit_snapshot()`의 `jsonb_build_object(...)` 안에 아래 3개가 더 있다:

```sql
    'measured_functions', (
      select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'),
    'tables_not_postgres', (
      select coalesce(jsonb_agg(c.relname || ' / ' || pg_catalog.pg_get_userbyid(c.relowner)
                                order by c.relname), '[]'::jsonb)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p')
        and pg_catalog.pg_get_userbyid(c.relowner) <> 'postgres'),
    'functions_not_postgres', (
      select coalesce(jsonb_agg(p.proname || ' / ' || pg_catalog.pg_get_userbyid(p.proowner)
                                order by p.proname), '[]'::jsonb)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres')
```

그리고 `locked_functions`의 이름 목록에 `permission_audit_snapshot`이 추가돼 있다
(자기 자신도 잠겨 있는지 보게 했다).

⚠️ `create or replace` 뒤에 **반드시** 다시 붙여라 — 본문만 바꿔도 습관적으로 확인한다:
```sql
revoke execute on function public.permission_audit_snapshot() from public, anon, authenticated;
grant  execute on function public.permission_audit_snapshot() to service_role;
```

### 3-3. 픽스처 비밀번호 (원래 3번) — **사용자 지시로 보류**

`.env.local`의 `DEV_FIXTURE_PASSWORD`가 **10자 미만**이라
`node scripts/dev-fixture.mjs create`가 `Error: … 10자 이상으로 넣으세요`로 죽는다.
**로그인은 된다**(회귀 스크립트들이 이 값으로 A·B에 정상 로그인한다) — 스크립트 자체의
길이 검증만 막는 것이다.

⛔ **비밀번호를 임의로 바꾸지 마라.** 그 계정을 쓰는 사람이 못 들어간다 (CLAUDE.md).
손대기 전에 반드시 물어라.

---

## 4. 다음 사람이 할 일 (권장 순서)

1. **§0을 정한다** — 0098을 쓸 것인가(A), 되돌릴 것인가(B). 저장소↔DB를 맞춘다
2. `pnpm db:snapshot` → 헤더 `함수 99개` · `permission_audit_snapshot` 포함 확인
3. (원하면) §3-2의 owner 가드를 다시 넣고 기준선 17 → 20 `--record`
4. 회귀 — 최소 `--tier readonly` (6종) + `cross-user-abuse-check`.
   전량이면 `pnpm verify:regression` (core 8종)
   ⚠️ **`tier: accounts`는 익명 가입 rate limit(429)에 잘 걸린다.** 연달아 돌리지 말고
   러너에 맡겨라(90초씩 대기한다). 2026-09-02에 `rls-test`가 이걸로 한 번 빨개졌다가
   7분 뒤 재실행하니 129/129였다
5. `lint` · `typecheck` · `test` · `build`
6. 커밋 → 푸시. **`src/` 변경이 없으면 배포하지 마라** — 사용자 화면에 바뀔 것이 없다

---

## 5. 함정 — 이번 세션에서 실제로 밟은 것

| 함정 | 무슨 일이 났나 |
|---|---|
| `information_schema`로 FK를 물었더니 **빈 결과** | `bug_reports`에 FK가 없는 줄 알았다. `pg_constraint`로 다시 물으니 `ON DELETE CASCADE`가 있었다. **카탈로그는 `pg_catalog`에 직접 물어라** |
| 첫 삭제 가드에 `bug_reports`를 안 넣었다 | "활동 0"이라고 판단했는데 신고가 1건 있었다. 가드가 잡아서 **아무것도 안 지우고 멈췄다** — 가드를 넓게 짜라 |
| Python으로 JS에 `\n`을 심다가 **실제 줄바꿈**이 들어감 | `console.log("` / `[3] …")` 로 갈라져 `SyntaxError`. 스크립트를 고친 뒤에는 **반드시 `node --check`** |
| `git worktree add /tmp/deploy-main main` | `main`은 이미 체크아웃돼 있어 실패한다. **`--detach`** 를 붙여라 |
| 배포 워크트리에서 모듈을 못 찾음 | 스크래치패드는 프로젝트 밖이라 `node_modules` 해석이 안 된다. 임시 스크립트는 **저장소 루트에 만들고 실행 직후 지워라** |

---

## 6. 건드리지 않은 것 (사용자 지시 — 다시 넓히지 마라)

- 크루 스트릭·운동 공개 규칙 — **그대로다.** 화면이 `current_streak_days`를 안 쓴다
  (`grep -rn current_streak_days src/` → 0건). 홈 크루 카드·`🔥 연속 N일`은
  `friend-board.ts:132`가 TS로 계산한다
- `authenticated`의 EXECUTE 전면 회수 — **안 했다.** 잠근 것은 실측으로 뚫린 4개 + 감사 RPC뿐
- SECURITY DEFINER 전면 리팩터링 · Advisor 경고 0 만들기 — **안 했다**
- `service_role` 권한 — **안 건드렸다**
- 신규 기능 · UI/UX · 기존 기능 로직 — **변경 0건** (`src/` 변경 없음)
