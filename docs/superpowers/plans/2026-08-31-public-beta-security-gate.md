# 공개 베타 전 보안·배포 게이트 — 실행 계획

**작성** 2026-08-31 · **브랜치** `codex/public-beta-security-gate` (기준 `6c76a9b`)
**목적** 새 기능 추가가 아니다. **현재 정상 동작을 보존하면서** 공개 베타에 필요한
보안·배포 게이트를 채운다. 정상 동작 보존이 Advisor 경고 0보다 **우선한다.**

---

## 0. 기준선 — 2026-08-31 측정 (전부 초록, 기존 실패 0건)

측정 시점 코드: `6c76a9b` + 작업 트리 정리 후 (아래 §0.1).

| 항목 | 결과 |
|---|---|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 — 경고 2건은 **기존**(`scripts/make-study-pack.mjs`의 `basename`·`grepCount` 미사용). 이번 작업과 무관 |
| `pnpm test` | ✅ **191 파일 / 2862건 통과**, exit 0 (브리프의 "약 2869건"은 근사값) |
| `pnpm build` | ✅ exit 0 |
| `pnpm build` **(env 없는 워크트리)** | ✅ **exit 0 — Supabase 환경변수 없이도 빌드된다** |
| `pnpm install --frozen-lockfile` (env 없는 워크트리) | ✅ 23초, lockfile 동기 |
| `pnpm verify:regression --tier readonly` | ✅ **5종 전부 통과 · 실패 0 · 증가 0** |
| 픽스처 | A `dev-fixture-a@gnd.local` auth ✅ / B `dev-fixture-b@gnd.local` auth ✅ |

**⚠️ `pnpm db:snapshot`이 갱신을 요구했다.** 저장소의 `docs/db-current-schema.sql`이
**0091 적용 전 상태로 굳어 있었다.** 재생성하니 `join_challenge_as_newcomer(p_code, p_inviter)`
시그니처와 `issue_challenge_invite_code`의 방장 전용 해제가 나타났다 — **운영 DB에는
0091이 들어가 있고 저장소 스냅샷만 뒤처져 있었던 것.** 이번 브랜치에 갱신본을 포함한다.
(CLAUDE.md §DB 마이그레이션: "마이그레이션 적용 후 갱신할 것"이 0091에서 누락됐다.)

### 0.1 작업 트리 정리 (완료)

미커밋 12건이 기준선을 오염시켜 먼저 덜어냈다.

- `wip/launch-splash-admin-snapshot-2026-08-31` (`95c2e75`) — launch-splash 개선,
  `analytics.ts` 지표, `admin/snapshot.ts`·`snapshot-payload.ts`(미배선),
  `validate-avatar-mock-assets.mjs`, 관련 계획 문서
- **커밋하지 않고 작업 트리에 그대로 둔 것**: `docs/design-sources/avatar-shop/` (12M),
  `public/avatar-mock/` (860K). git에 넣으면 영구 용량이 되고, typecheck·lint·test·build에
  영향이 없어 기준선을 오염시키지 않는다.

---

## 1. 실측으로 확인한 사실 (브리프 전제 대조)

### 1.1 브리프 숫자 검증

| 브리프 | 실측 | |
|---|---|---|
| tables 39 / functions 95 / policies 78 / indexes 97 | 동일 | ✅ |
| **triggers 17** | **비내부 15** (내부 포함 255) | ❌ |
| RLS 미적용 테이블 | 0개 | ✅ |
| auth.users 123 / anon 116 / non-anon 7 | 동일 | ✅ |
| 0091까지 반영 | 객체로 확인 — 0090·0091 전부 존재 | ✅ |
| search_path 경고 5개 | 함수 5개까지 정확히 일치 | ✅ |
| leaked password protection 꺼짐 | 여전히 WARN | ✅ |
| `.github/workflows` 없음 | `.github` 디렉터리 자체가 없음 | ✅ |

**⚠️ `list_migrations`가 빈 배열이다.** 이 저장소는 SQL Editor로 손으로 Run해서
`supabase_migrations` 이력이 없다. **"NNNN까지 반영됐는지"는 마이그레이션 목록으로
확인할 수 없고 객체 존재로 확인해야 한다.** 다음 사람도 같은 함정에 빠진다.

### 1.2 Advisor 실측 — 총 142건 (변경 전 기준선)

| 건수 | 항목 |
|---:|---|
| 79 | `authenticated_security_definer_function_executable` |
| 41 | `auth_allow_anonymous_sign_ins` |
| 14 | `anon_security_definer_function_executable` |
| 5 | `function_search_path_mutable` |
| 1 | `extension_in_public` (`pg_net`) |
| 1 | `auth_leaked_password_protection` |
| 1 | INFO `rls_enabled_no_policy` (`bug_report_watchers`) |

### 1.3 브리프가 몰랐던 결정적 사실 4가지

**① 1번 항목은 "검증·보완"이 아니라 신설이다.**
```
is_anonymous를 참조하는 RLS 정책 :  0개
anon 롤에 직접 걸린 정책         :  0개
TO PUBLIC(롤 미지정) 정책        : 49개 / 78개
```
DB에 익명/영구를 가르는 장치가 하나도 없다. 클라이언트도 `hasLinkedIdentity()` 하나뿐이고
`install-gate.tsx`(설치 안내)에서만 쓴다. Advisor의 익명 경고 41건은 `anon` 롤 때문이
아니라 **정책 49개가 `TO PUBLIC`이라 anon에도 적용되기 때문**이다. 진짜 위험은 `anon` 롤
(세션이 없어 `auth.uid()`가 null)이 아니라 **`is_anonymous=true`인 authenticated 사용자**다.

**② 그런데 위험은 거의 없다 — 익명 116명 중 프로필 보유자는 1명뿐.**

| 닉네임 | 이메일 | is_anonymous | identities |
|---|---|---|---|
| 오뎅끼데스까 | atty2@naver.com | false | 3 |
| 스칼레또 | contact.yulekim@gmail.com | false | 1 |
| 낭만송곳니 | rabcode@gmail.com | false | 1 |
| 아라짱 | shalen45@naver.com | false | 1 |
| 헬스장주주 | dev-fixture-a@gnd.local | false | 1 |
| 근육은퇴근중 | dev-fixture-b@gnd.local | false | 1 |
| dev-테스터C | dev-fixture-c@gnd.local | false | 1 |
| **test** | — | **true** | 0 |

익명 115명은 앱을 열기만 하고 프로필도 안 만든 빈 계정이다. **익명 제한을 걸어도 실제로
막히는 사람은 사실상 0명.** 이것이 배포 C의 위험을 크게 낮춘다.

**③ GND는 익명→영구 전환(identity linking) 모델 — 실측 확인됨.**
`오뎅끼데스까`가 `identities=3`인데 `is_anonymous=false`다. 계정이 갈린 게 아니라 **익명
계정에 카카오·구글을 붙여 그 자리에서 승격**된 것. 따라서 `is_anonymous`가 정확한 판정
기준이고, `src/lib/identity.ts:175`에 **이미 그 로직이 한 곳에 있다 — 새 추상화를 만들지 마라.**

> ⚠️ **JWT는 발급 시점에 굳는다.** 연결 직후 옛 토큰에 `is_anonymous: true`가 남아 있으면
> "UI는 영구인데 DB가 거부"가 난다. **토큰 갱신 검증이 배포 C의 필수 항목**이다 (브리프에 없음).

**④ 7번(admin 지표)은 이미 절반 이상 되어 있다.**
`src/lib/admin/queries.ts`가 이미 `auth.admin.listUsers()`를 읽고 `anonymousWithoutProfile`·
`excludedTestAccounts`를 계산한다. 주석에 "현재 실계정 4명"이라 적혀 있다. **"123을 123으로
오판"하는 상태가 아닐 가능성이 높다 — 화면 확인이 먼저다.**

### 1.4 CI 전제 3개 정정

| 브리프 | 실제 |
|---|---|
| "package.json에서 Node/pnpm 버전 확인" | **`packageManager`도 `engines`도 `.nvmrc`도 없다.** 로컬 Node `24.13.0` / pnpm `11.13.0` / lockfile `9.0` → CI에 명시 pin하고 `packageManager`를 추가한다 |
| "regression이 secret 없이 되면 포함" | **불가.** readonly 5종이 `.env.local` **파일을 디스크에서 직접 읽고**(`admin-dashboard-check.mjs:14`) 운영 DB에 붙는다 → `workflow_dispatch` 별도 workflow로 분리 |
| build에 env 필요? | **불필요 — 실측으로 확인.** env 없는 워크트리에서 exit 0. CI에 Supabase secret이 전혀 필요 없다 |

---

## 2. 배포를 3번으로 나누는 이유

브리프의 순서(0→1→…→7)는 목차 순서지 위험 순서가 아니다. 5개 항목은 서로 독립적인데,
한 배포로 묶으면 **0091 초대 흐름이 깨졌을 때 원인 분리가 불가능하다.** 브리프 자신이
"0091이 깨지면 이번 작업은 실패"라고 했으므로 분할이 브리프의 목표를 더 잘 달성한다.

| 배포 | 내용 | 위험 | Advisor |
|---|---|---|---|
| **A** | search_path(0092) · CI · admin 지표 · 문서 | 낮음 | 142 → 137 |
| **B** | SECURITY DEFINER 전수 감사 + 최소 REVOKE(0093) | 중간 (RLS 파손) | 137 → ? |
| **C** | 익명 권한 경계(0094) | **높음** (0091 파손) | ? |

---

## 3. 배포 A — 저위험 4종 *(브리프 3·5·6·7)*

### A-1. `supabase/migrations/0092_fix_function_search_path.sql`
대상 5개는 전부 **`SECURITY INVOKER` 트리거 함수**다 (실측). 위험이 낮다.

- `set_workout_set_completed_at` · `set_updated_at` · `clear_profile_invited_by_on_insert` ·
  `freeze_profile_attribution` → `set search_path = ''` (스키마 명시 재작성 필요)
- `generate_invite_code` → **DEFAULT 식에서 불릴 수 있으므로 `pg_catalog, public`**
  (빈 문자열이 아니다). 호출처를 먼저 확인할 것
- **본문을 파일에서 베끼지 말고 `docs/db-current-schema.sql`(갱신본)에서 가져온다**
  — CLAUDE.md §DB 마이그레이션

### A-2. `.github/workflows/ci.yml`
```
on: pull_request + push(main)
node 24 · pnpm 11 (pin) · pnpm install --frozen-lockfile
→ typecheck → lint → test → build
secret 없음 (§1.4로 확인)
```
`package.json`에 `"packageManager": "pnpm@11.13.0"` 추가.

### A-3. `.github/workflows/db-regression.yml`
`workflow_dispatch` 전용. `.env.local`을 secret에서 생성해야 하고 **운영 DB에 붙으므로
PR CI와 분리한다.** 기본은 `--tier readonly`.

### A-4. admin 회원 지표
`src/lib/admin/queries.ts`에 6개 값 추가 — `authTotal` · `authAnonymous` ·
`authPermanent` · `profiles` · `permanent7d` · `permanent30d`.
**기존 `anonymousWithoutProfile`과 중복되지 않게 화면을 먼저 본다.** 새 분석 시스템을
만들지 않는다. 현재 실측: 123 / 116 / 7 / 8 / **0** / **2**.

### A-5. 문서
`docs/operations/public-beta-manual-checklist.md` — leaked password protection(현재 상태·
켜는 위치·기존 로그인 영향·롤백) + branch protection 수동 설정 순서.
**운영 Auth 설정은 사용자 승인 없이 바꾸지 않는다.**

### A-6. 검증
`typecheck`·`lint`·`test`·`build` → **개발 서버에서 `/admin` 화면 확인**(계정 A만으로 충분)
→ 커밋 → 푸시 → 배포 → 프로덕션 실물 확인 → **Advisor 재측정 (137 기대)**

---

## 4. 배포 B — SECURITY DEFINER 전수 감사 *(브리프 2)*

> **상태 (2026-09-01): 조사·문서·회귀는 끝. DB 권한 변경은 승인 대기.**
> 산출물 → `docs/security/public-beta-rpc-audit.md` (678줄)
> 제안 SQL → `supabase/migrations/0096_permission_tightening_PROPOSAL.sql` (**미적용**)

### 4-0. 계획 시점 숫자 정정 (실측 결과)

| | 계획서(8/31 추정) | 실측(9/1) |
|---|---|---|
| public 함수 | 95 | **98** |
| SECURITY DEFINER | 87 | **89** |
| INVOKER | 8 | **9** |
| 마이그레이션 번호 | `0093_...` | **0096** (0093~0095가 이미 나갔다) |

### 4-1. 끝난 것

- **함수 98개 전수표** — 요구한 14개 열 (인자·SD·search_path·anon/auth EXECUTE·
  `auth.uid()` 검사·익명 게이트·소유권 검사·외부 user-id 인자·동적 SQL·사용처·위험도·판정)
- **4배우 권한 매트릭스** — raw anon / 익명-auth / 정식 / service_role.
  ⭐ **익명-auth와 정식은 DB 롤이 `authenticated`로 같다** — 권한 계층에서 구분 불가.
  0094 게이트는 권한이 아니라 함수 본문 동작이다
- **테이블 ACL 40개 · RLS 정책 79개 전수** — 실측 (카탈로그 없이 PostgREST로)
- **cross-user 공격 테스트** — `scripts/cross-user-abuse-check.mjs` 신설, **40 통과 / 3 실패**
- **회귀** — `challenge-invite-link-check` 28/28 · `challenge-room-check` 48/0 ·
  `rls-test` 129/0 (0090 규칙에 맞춰 단언 수정, 기준선 128→129)

### 4-2. 발견 3건 — 전부 한 패턴

```
SECURITY DEFINER + 남의 user_id 인자 + auth.uid() 검사 없음 + authenticated EXECUTE 열림
```

| 함수 | 실측 결과 | 위험도 |
|---|---|---|
| `current_streak_days(p_user_id)` | A가 B의 스트릭 `3`을 읽었다 | High |
| `notify_challenge_peek_unlock(p_user_id)` | A의 호출이 204로 성공 (알림 경로) | High |
| `is_blocked_between(p_a, p_b)` | 남 둘의 차단 관계를 조회 | Medium |

⭐ **같은 부류 5개는 이미 잠겨 있다** (`award_points`·`apply_xp_and_progress`·
`badge_metrics`·`evaluate_badges`·`notify`). 0077이 `remind_upcoming_challenges`를
같은 이유로 service_role 전용으로 만들었다. **새 규칙이 아니라 빠뜨린 3개에 기존 규칙을 적용**한다.

### 4-3. 절대 건드리지 않는 것 — 계획서 예상과 달랐다

**RLS 헬퍼 10개**는 계획대로 유지한다 (EXECUTE를 빼면 정책이 깨진다).

**계획서가 몰랐던 것 — `autostart_due_challenges`·`autofinalize_due_challenges`.**
`auth.uid()` 검사가 없는 SD라 패턴만 보면 회수 후보인데,
`src/app/(tabs)/challenge/page.tsx:363-364`가 **클라이언트에서 직접 부른다.**
회수했으면 챌린지 화면이 깨졌다. 악용해도 이미 기한이 지난 전이를 앞당기는 것뿐이라
정상 UI와 결과가 같다 → **Medium, 유지·근거 기록**.

**"호출자가 하나도 없는 함수만 변경 후보"는 쓸 수 없었다 — 고아 RPC가 0개다.**
88개 전부 사용처가 있다(앱·정책·다른 함수·서버 라우트). 계획서가 후보로 적은
`enforce_goal_raise_only`·`notify_reaction`·`dispatch_push_notification`은
PostgREST에 노출조차 안 되는 트리거 함수라 회수할 이유가 없다.
대신 **"권한은 있는데 정책이 0개라 RLS가 기본 거부하는 죽은 GRANT"** 를 근거로 삼았다.

### 4-4. 남은 것 (승인 대기 / 수단 없음)

- ⛔ **`REVOKE` · `ALTER DEFAULT PRIVILEGES` 적용** — 사용자 승인 후 (감사 문서 §8)
- ⛔ **카탈로그 재조회** — 이 세션에 Supabase MCP가 없었다. `pg_default_acl`,
  TRUNCATE 12개 목록, 함수 owner가 `[미검증]`
- ⛔ **새 객체 재발 실증** (`scripts/default-privilege-check.mjs`) — DDL 수단 필요
- `cross-user-abuse-check`는 **기준선에 등록하지 않았다** — 실패 3건이 아직 열린
  발견이라 등록하면 회귀 전체가 빨개진다. 0096 STEP 1 적용 후 43/43을 확인하고 `--record`

**검증:** REVOKE 후 `--tier readonly` **+ `accounts` 티어까지** 재실행.
RLS 파손은 여기서만 잡힌다. ⚠️ accounts 티어는 익명 계정을 만들고 30분+ 걸린다.
⚠️ 익명 가입은 시간당 rate limit이 있다 — 연달아 돌리면 429가 난다.

---

## 5. 배포 C — 익명 권한 경계 *(브리프 1·4)* — 가장 위험, 마지막

### C-1. 먼저 문서: `docs/security/public-beta-auth-matrix.md`
코드 추적 경로: `auth-provider.tsx:158`(`signInAnonymously`) → onboarding → 프로필 생성 →
`pendingChallengeInvitePath` → `join_challenge_as_newcomer` → `issue_challenge_invite_code`
→ `linkProvider`(승격). 브리프가 요구한 8개 열로 작성.

### C-2. 판정은 한 곳에서만
`src/lib/identity.ts`의 `is_anonymous` 판정을 그대로 쓴다. **새 추상화를 만들지 않는다.**
DB 쪽은 `(auth.jwt() ->> 'is_anonymous')::boolean is not true`.

### C-3. 절대 건드리지 않는 것 — 0091 바이럴 흐름
- `join_challenge_as_newcomer` (초대 신규 가입자의 챌린지 참가)
- onboarding · 프로필 생성 · 자기 운동 기록 · 자기 계획/추천
- 초대 링크 **수신**

### C-4. 제한 후보 (matrix 결론에 따라 축소 가능)
공개 챌린지 생성 · 초대 **발행** · 크루 요청 · 댓글 작성/수정 · 반응/응원.
**UI와 DB가 같은 말을 해야 한다** — 버튼이 보이는데 DB가 거부하는 상태 금지.
익명이 permanent-only 기능을 누르면 가입 유도 UX로 보낸다.

### C-5. 필수 추가 검증 (브리프에 없음)
**카카오 연결 직후 토큰이 갱신되어 `is_anonymous`가 false로 바뀌는지.**
안 되면 승격 직후 사용자가 자기 기능에서 막힌다.

### C-6. 화면 검증 — 계정 2개 필수
크롬=A / 엣지=B. 브리프 9번의 A·B·C·D 시나리오 전량.
**C(초대 신규 사용자) 흐름이 최우선이다.**

---

## 6. 하지 않을 것

브리프 8번 그대로. 추가로:
- **Advisor 숫자를 줄이려는 일괄 REVOKE 금지.** 79+14건 대부분이 정상 동작에 필요한 함수다
- **`pg_net` 스키마 이동(extension_in_public)은 이번 범위 밖.** cron·푸시가 걸려 있어
  위험 대비 이득이 없다. 문서에만 남긴다
- **익명 계정 116개 삭제 금지.** 사용자 폰의 로그인 세션일 수 있다 (CLAUDE.md)

---

## 7. 남은 미확인 항목

- **[미검증]** 픽스처 A·B의 `DEV_FIXTURE_PASSWORD`가 실제로 맞는지. `status`는 `auth ✅`만
  말하고 비밀번호를 검사하지 않는다 (CLAUDE.md 2026-08-31 경고). `fixture` 티어 2종
  (`peek-reset-check`·`block-report-goal-check`) 실행 전에 확인 필요
- ~~`dev-fixture-c@gnd.local`의 용도~~ → **2026-08-31 확인 완료. 검사 대상에서 제외한다.**
  커밋 `5b46aea`(08-17)에서 "A·B는 둘 다 active 챌린지가 있어 빈 화면이 안 나온다"는
  이유로 만든 **일회성 계정**이다. `dev-fixture.mjs`의 `FIXTURES` 배열에 없다.
  발자국: `workout_sessions` 0 · `crew_links` 0 · `challenge_participants` 0 ·
  `user_progress` 없음 · `push_subscriptions` 0 · `groups` 1(자기 소유) · 08-17 이후 로그인 없음.
  **제외 근거** ① 크루·챌린지가 0건이라 회귀가 검사할 대상이 없다 ② A↔B 쌍이 이미
  상호 연결돼 있어 C를 넣으면 상태를 새로 만들어야 한다(scope creep) ③ `analytics-accounts.ts`가
  `@gnd.local` 도메인으로 **이미 자동 제외**한다 ④ 삭제도 하지 않는다 — `groups` 1건이 있어
  그룹부터 지워야 하고 §6(production 데이터 삭제 금지) 밖이다
- **[미검증]** `generate_invite_code`가 컬럼 DEFAULT에서 불리는지 (0092 작성 전 확인)
- **[미검증]** `dispatch_push_notification`의 cron/edge 호출 여부 (0093 작성 전 확인)
- **[미검증]** `bug_report_watchers`의 `rls_enabled_no_policy` — 의도된 것인지
  (service_role 전용 테이블일 가능성)

---

## 8. 운영 규칙 (CLAUDE.md 준수)

- **⛔ 마이그레이션은 에이전트가 Supabase MCP로 직접 적용하고 반영까지 검증한다.**
  사용자 지시 (2026-08-31, 세션 중 변경 — 이전 "사용자가 SQL Editor에서 Run" 결정을 대체한다).
  **단 파괴적 변경(`drop`·`delete`·`truncate`·기존 행 `update`·`revoke`·`alter drop column`)은
  실행 전에 멈추고 보고한다.** 상세 규칙은 `CLAUDE.md` §DB 마이그레이션
  - 적용 후 **객체를 다시 조회해서** 확인한다. "명령이 성공했다"는 검증이 아니다
  - 적용 후 `pnpm db:snapshot`으로 스냅샷을 갱신한다
  - ⚠️ **배포 B의 `REVOKE`는 파괴적 변경이다** — RLS 헬퍼가 섞이면 정책이 조용히 깨진다.
    실행 전에 대상 목록과 근거를 보고하고 승인을 받는다
- **각 배포마다** 개발 서버 화면 확인 → 커밋 → **푸시(묻지 않는다)** → 배포 → 프로덕션 실물 확인
- **`git push`는 배포가 아니다.** 완료 보고에서 "코드 완료 / DB Run 완료 / 배포 완료 /
  프로덕션 실물 확인 완료"를 분리해서 쓴다
- 마이그레이션 적용 후 **`pnpm db:snapshot` 갱신** — 0091에서 누락됐던 단계다

---
---

# 계획 갱신 — 2026-08-31 (배포 A 완료 후)

배포 A가 끝난 뒤 사용자가 새 명령문 **2건**을 추가했다.

1. **사용자 퍼널·이탈 계측** — 외부인이 어느 단계에서 막혀 나가는지 `/admin`에서 본다
2. **인플루언서별 유입 성과 추적** — 캠페인/인플루언서별로 유입 품질을 비교한다 (완료 조건)

아래는 그 둘을 실제 코드·운영 DB에 대조한 결과와, 그에 따라 바뀐 배포 순서다.

---

## D-1. 가장 중요한 발견 — 지금 구조로는 퍼널의 **윗부분을 아예 측정할 수 없다**

실측(2026-08-31):

```
src/lib/acquisition.ts:19   const KEY = "gnd-acquisition"      ← 진입 즉시 localStorage에 재운다
src/lib/acquisition.ts:74   acquisitionColumns()               ← profiles에 실어 보낼 모양
src/lib/crew.ts:44          ...acquisitionColumns()            ← **프로필을 만들 때** 비로소 DB에 쓴다
supabase 0080               freeze_profile_attribution         ← 한 번 잡히면 동결
```

즉 **유입 정보는 프로필이 생길 때까지 브라우저 localStorage에만 있다.**
인플루언서 링크로 들어왔지만 온보딩을 끝내지 않은 사람은 **DB에 아무 흔적도 남지 않는다.**

운영 DB가 그것을 그대로 보여준다:

| | 값 |
|---|---|
| `profiles.acquisition_campaign`이 있는 행 | **1** |
| `profiles.acquisition_source`가 있는 행 | **1** (`kakao`) |
| `profiles.acquisition_captured_at`이 있는 행 | 3 |
| `auth.users` 익명 | 116 (프로필 있는 것은 1) |

### 이것이 새 명령문에 뜻하는 것

인플루언서 명령문의 **질문 1번 "인플루언서 A 링크를 몇 명이 열었는가?"** 와
퍼널 명령문의 **1~3단계(외부 진입 · 온보딩 시작 · 온보딩 완료)** 는
**지금 구조로는 원리적으로 답할 수 없다.** 프로필이 생기기 전 구간이기 때문이다.

그래서 새 명령문의 "이미 DB에 흔적이 남으면 이벤트를 만들지 마라"는 원칙을 지키더라도,
**진입~프로필 이전 구간은 새 기록이 반드시 필요하다.** 이건 중복 저장이 아니라
**현재 아무 데도 없는 사실**이다.

반대로 **프로필 이후 구간은 새 이벤트가 필요 없다** (아래 표).

---

## D-2. 계측 가능 범위 실측 — 무엇이 이미 되고 무엇이 안 되나

| 단계 | 지금 DB 흔적 | 근거 | 새 이벤트 필요? |
|---|---|---|---|
| 외부 링크 진입 | **없음** | localStorage에만 있다 | ✅ **필요** |
| 익명 auth 생성 | 있음 | `auth.users.created_at`, `is_anonymous` | ❌ 불필요 |
| 온보딩 시작 | **없음** | 아무 것도 안 남는다 | ✅ **필요** |
| 온보딩 각 단계 | **없음** | 〃 | ✅ 필요(최소한으로) |
| 온보딩 완료 = 프로필 생성 | 있음 | `profiles.created_at` | ❌ 불필요 |
| identity linking 시작 | **없음** | OAuth 리다이렉트라 흔적 없음 | ✅ **필요**(실패 구분 위해) |
| identity linking 완료 | 있음 | `auth.identities`, `is_anonymous=false` | ❌ 불필요 |
| 프로필 완료 | 있음 | `profiles` | ❌ 불필요 |
| 첫 운동 시작 | 있음 | `workout_sessions.started_at` · `workout_events`(313행, `event_type`) | ❌ 불필요 |
| 첫 운동 완료 | 있음 | `workout_sessions.status/completed_at` | ❌ 불필요 |
| 챌린지 **확인** | **없음** | 화면을 본 것은 안 남는다 | ✅ **필요** |
| 챌린지 참가 | 있음 | `challenge_participants` | ❌ 불필요 |
| 3회 운동 | 있음 | `workout_sessions` 집계 (`activationFunnel`이 이미 한다) | ❌ 불필요 |
| D1/D7 재운동 | 있음 | `reworkoutRetention()` 이미 있다 | ❌ 불필요 |

**결론: 새 이벤트는 5종이면 충분하다** — `landing_opened` · `onboarding_started` ·
`onboarding_step` · `identity_link_started`/`_failed` · `challenge_viewed`.
나머지는 전부 기존 테이블에서 계산한다. (명령문이 후보로 든 `profile_completed`·
`first_workout_*`·`challenge_joined`·`three_workouts`·`D7`은 **만들지 않는다.**)

---

## D-3. 익명 → 영구 연결은 **이미 성립한다** (검증됨)

새 명령문 §5가 요구한 것 — 익명 때 남긴 이벤트와 가입 후 행동이 같은 사람으로 이어질 것.

**성립한다.** GND는 익명 계정에 identity를 붙여 그 자리에서 승격하므로 `auth.users.id`가
바뀌지 않는다 (실측: `오뎅끼데스까` `identities=3` · `is_anonymous=false` · 같은 행).
따라서 이벤트를 `auth.uid()`로만 키잉하면 **새 device fingerprint 없이** 연결이 유지된다.

⚠️ **남은 검증 1개 [미검증]**: identity linking **직후 JWT가 갱신되어 `is_anonymous=false`가
되는지.** 갱신이 늦으면 "UI는 영구인데 DB는 익명" 구간이 생긴다. 배포 C·D 공통 필수 항목.

---

## D-4. 인플루언서 추적 — 새 컬럼을 만들지 않는다

| 명령문 요구 | 실측 | 판정 |
|---|---|---|
| 캠페인 구분 | `UTM_KEYS = ["utm_source","utm_medium","utm_campaign"]` 이미 파싱 | ✅ 재사용 |
| `profiles.acquisition_campaign` | 컬럼 존재, `crew.ts:44`가 **쓰고 있다** | ✅ 재사용 |
| admin이 campaign을 읽나 | **읽지 않는다** — `queries.ts`가 `acquisition_source,acquisition_referrer`만 select | ❌ **여기가 빠진 곳** |
| creator/influencer 별도 dimension | `utm_medium=creator` + `utm_campaign=influencer_a_pilot01`로 충분 | ❌ **새 컬럼 만들지 않는다** |

즉 인플루언서 추적에 **새 컬럼은 필요 없다.** 필요한 것은 두 가지뿐이다.
① `queries.ts`의 select에 `acquisition_medium, acquisition_campaign`을 더한다
② 캠페인별 퍼널 집계 함수와 `/admin` 필터를 만든다

⚠️ 단 **유입 단계(질문 1번)만은 D-1 때문에 캠페인을 `landing_opened` 이벤트에도 실어야 한다.**
프로필이 안 생긴 사람의 캠페인은 `profiles`에 영영 안 남기 때문이다.

⚠️ **지금 데이터로는 아무 것도 비교할 수 없다** — campaign 값이 있는 행이 **1개**다.
"인플루언서 A vs B" 비교는 **파일럿을 실제로 돌린 뒤에야** 숫자가 생긴다. 기능이 완성돼도
당장 화면은 거의 비어 있는 것이 정상이고, 그것을 실패로 읽지 않도록 화면이 말해야 한다.

---

## D-5. 배포 C와 D의 충돌 — 먼저 알아야 한다 ⚠️

**배포 C(익명 권한 경계)는 익명 사용자의 쓰기를 제한하려는 것이고,
배포 D(퍼널 계측)는 익명 사용자가 이벤트를 써야 성립한다.**

둘을 따로 설계하면 C가 D를 막거나, D 때문에 C가 뚫린다. 그래서:

- `analytics_events`(가칭) INSERT는 **익명에게 명시적으로 허용**한다. 이건 "사회적 공개 변경"이
  아니라 자기 행동 기록이므로 C의 제한 대상이 아니다
- 정책은 `auth.uid() = user_id`로 **자기 것만** 쓰게 한다. 클라가 남의 `user_id`를 지정 못 한다
- SELECT는 일반 사용자 전면 금지, `service_role`만
- C의 auth matrix 문서에 이 항목을 **명시적으로 한 줄 넣는다**

---

## D-6. 갱신된 배포 순서

| | 내용 | 상태 |
|---|---|---|
| **A** | search_path(0092) · CI · 회원 지표 · 문서 | ✅ **완료** (코드·DB·배포·CI 전부) |
| **D** | 퍼널 계측 + 인플루언서/캠페인 성과 | ⬅️ **다음. B보다 먼저** |
| **C** | 익명 권한 경계 | D 다음 (D와 같이 설계) |
| **B** | SECURITY DEFINER 전수 감사 + 최소 REVOKE | 마지막 |

### 왜 순서를 바꾸나

원래 계획은 A → B → C였다. 바꾸는 근거:

1. **D가 사업 목표에 직결된다.** 외부 베타의 목적은 "어디서 막히는지 찾아 고치는 것"이고,
   계측이 없으면 파일럿을 돌려도 아무것도 배우지 못한다. B(Advisor 경고 93건)는 **지금
   실제 사고를 내고 있지 않다**
2. **D는 C의 입력이다.** 익명이 무엇을 하는지 데이터가 있어야 무엇을 막을지 정할 수 있다.
   지금 익명 116명 중 프로필 보유자가 1명뿐이라는 사실도 D가 있으면 "몇 명이 들어와서
   어디서 나갔나"로 바뀐다
3. **B가 가장 위험하고 가장 안 급하다.** REVOKE는 RLS를 조용히 깨뜨릴 수 있고
   (CLAUDE.md의 새 규칙상 **파괴적 변경 — 실행 전 보고 대상**), 미루어도 손해가 없다

### D의 산출물 (예정)

```
docs/analytics/public-beta-funnel-audit.md      단계별 계측 가능 범위 전수 (D-2 확장)
supabase/migrations/0093_analytics_events.sql   새 테이블 + RLS + 인덱스 (비파괴)
src/lib/domain/analytics-funnel.ts              퍼널·캠페인 집계 순수 함수 + 테스트
src/lib/domain/analytics-acquisition.ts         CAMPAIGN_LABELS 상수 추가 (D-7)
src/lib/admin/queries.ts                        acquisition_medium/campaign select 추가
src/app/admin/_components/public-beta-funnel-panel.tsx      전체 퍼널
src/app/admin/_components/campaign-comparison-panel.tsx     제안처 비교표 (D-7 ①)
src/app/admin/_components/campaign-funnel-panel.tsx         캠페인 상세 퍼널 (D-7 ②)
```

**완료 판정은 화면이다** — DB에 값이 있는 것으로는 완료가 아니다. 상세는 §D-7.

⚠️ **표본 규칙을 지킨다.** 지금 실사용자 4명이다. `MIN_RATIO_SAMPLE = 5` 원칙대로
표본이 적으면 퍼센트 대신 원시 숫자를 보여주고, "가장 큰 마찰 구간"은
**"표본 부족 — 판정 안 함"** 으로 둔다. 4명 데이터로 "32% 이탈이 문제"라는 가짜 확신을
만들지 않는다.

⚠️ **개인별 행동 timeline은 만들지 않는다.** metadata는 allowlist로 제한하고
이메일·raw referrer URL·초대 코드 원문·토큰은 넣지 않는다.

---

## D-7. 추가 완료 조건 — `/admin` 화면 2개 (2026-08-31 사용자 추가 지시)

**"DB에 저장했다"는 완료가 아니다.** 운영자가 Supabase SQL Editor를 열지 않고
`/admin`만 보고 *"어느 인플루언서/커뮤니티가 가장 좋은 사용자를 데려왔는가?"* 에
답할 수 있어야 완료다. 그리고 **`source=instagram`까지만 보여주는 것도 완료가 아니다** —
같은 Instagram 안에서 인플루언서 A / B / pilot01 / pilot02가 분리돼야 한다.

### 화면 ① 제안처·캠페인 비교표

한 표에서 서로 비교할 수 있어야 한다 (예: 카카오 오픈채팅 A · 인스타 인플루언서 B · 유튜버 C).

| 열 | 출처 |
|---|---|
| 채널 | `acquisitionChannel(source, referrer)` — 기존 함수 재사용 |
| 제안처/인플루언서 식별명 | `acquisition_medium` + `CAMPAIGN_LABELS` (아래) |
| campaign | `acquisition_campaign` |
| **유입 사용자 수** | ⚠️ **`landing_opened` 이벤트만이 답할 수 있다** (D-1) |
| 온보딩 완료 | `profiles.created_at` |
| 정식 계정 전환 | `auth.users.is_anonymous = false` |
| 첫 운동 시작 | `workout_sessions.started_at` |
| 첫 운동 완료 | `workout_sessions.status/completed_at` |
| 3회 운동 | `workout_sessions` 집계 (`activationFunnel` 재사용) |
| challenge 참여 | `challenge_participants` |
| D7 재운동 | `reworkoutRetention()` 재사용 |

**유입 수만 새 이벤트에서 오고 나머지 8열은 전부 기존 테이블에서 나온다.**
프로필이 없는 사람은 `profiles`에 행 자체가 없기 때문이다.

### 화면 ② 캠페인 상세 퍼널

특정 campaign을 고르면 **그 집단만** 대상으로:

```
유입 → 온보딩 → 계정 전환 → 프로필 → 첫 운동 → 3회 운동 → 챌린지 → D7 재운동
```

표본이 충분할 때만 **가장 큰 이탈 구간**을 표시한다. 부족하면
**"표본 부족 — 마찰 구간 판정 안 함"**. 실사용자 4명 규모에서 "32% 이탈이 문제"라는
가짜 확신을 만들지 않는다 (`MIN_RATIO_SAMPLE = 5`).

### campaign registry — **테이블을 만들지 않는다**

명령문이 "campaign key와 표시명을 분리하는 가벼운 registry를 검토하되 문자열로 충분하면
테이블을 추가하지 마라"고 했다. **저장소에 이미 정확히 그 패턴이 있다:**

```ts
// src/lib/domain/analytics-acquisition.ts:17
export const CREW_ORIGIN_LABELS: readonly (readonly [string, string])[] = [
  ["invite_link", "친구 초대 링크"], ...
];
// 그리고 그 아래 주석:
// ⚠️ 목록에 없는 값도 버리지 않고 그대로 낸다. 새 경로가 생겼는데 라벨을 안 붙이면
//    그 줄이 화면에서 통째로 사라져 합이 안 맞는다 — 합이 안 맞는 것보다 라벨이 못생긴 편이 낫다.
```

→ **`CAMPAIGN_LABELS`를 같은 모양의 코드 상수로 만든다.** DB 테이블도, 새 컬럼도 없다.
- `["influencer_a_pilot01", "인플루언서 A · 1차"]` 처럼 사람이 읽는 이름을 붙인다
- **라벨이 없는 campaign도 원본 키를 그대로 표시한다** — 새 파일럿을 열 때 코드 배포를
  기다리지 않아도 화면에 나온다. 이게 테이블이 필요 없는 진짜 이유다
- 라벨 추가는 상수 한 줄이고, 그 줄이 없다고 데이터가 사라지지 않는다

### ⚠️ campaign 값의 출처가 둘이 된다 — 우선순위를 한 곳에 고정한다

`landing_opened` 이벤트와 `profiles.acquisition_campaign`이 **둘 다** campaign을 갖게 된다.
둘은 같은 localStorage 캡처에서 나오므로 일치해야 하지만, 규칙을 안 정하면 숫자가 갈린다.

**규칙 (한 함수에만 둔다):**
1. 집단(cohort) 배정은 **`landing_opened` 이벤트**가 한다 — 프로필 없는 사람까지 덮는 유일한 기록
2. `profiles.acquisition_*`은 **기존 패널(AcquisitionPanel·topInviters)이 계속 쓴다** — 건드리지 않는다
3. 둘 다 있는 사용자에서 값이 갈리면 **테스트가 실패하게 한다** (조용히 한쪽을 고르지 않는다)

> ⚠️ **이 3번은 §D-8 ②로 교체됐다.** 테스트는 계속 실패시키되, **운영에서는 던지지
> 않고** `/admin`에 "campaign 귀속 불일치 N건"으로 표시한다 — 진단 하나 때문에
> 대시보드 전체를 500으로 잃지 않기 위해서다 (2026-08-31 사용자 지시).

### 배선 경로 — 세 층을 실제로 잇는다

명령문의 지적이 정확하다. 지금은 **DB에 값이 있는데 admin이 안 읽는다.**

```
① queries.ts     select에 acquisition_medium, acquisition_campaign 추가
                 (지금은 acquisition_source, acquisition_referrer 만 읽는다)
② domain         analytics-funnel.ts — campaignFunnels() / campaignComparison() 순수 함수 + 테스트
③ UI             campaign-comparison-panel.tsx (표) + campaign-funnel-panel.tsx (상세)
                 캠페인 선택은 query parameter (?campaign=...) 로 받는다
```

### 자동 테스트 (완료 조건)

**서로 다른 campaign 2개의 집계가 섞이지 않는 테스트를 반드시 넣는다.** 최소:
- `influencer_a_pilot01`과 `influencer_b_pilot01`이 같은 `source=instagram`이어도 분리된다
- 같은 인플루언서의 `pilot01`과 `pilot02`가 분리된다
- 캠페인별 퍼널이 **앞 단계보다 뒤 단계가 커지지 않는다**(단조성)
- 표본 5 미만이면 퍼센트 대신 원시 숫자
- campaign이 `null`인 사람(직접 유입)이 **집계에서 빠지지 않는다** — 기존
  `acquisitionBreakdown`의 "`direct`를 빼지 마라" 원칙과 같다

### 개인정보

캠페인별 **집단 행동**만 본다. 개별 사용자 목록·이메일·타임라인을 인플루언서에게
노출하는 기능은 만들지 않는다. metadata는 allowlist로 제한한다.

### ⚠️ 완성돼도 당분간 화면은 비어 있다

현재 `acquisition_campaign` 값이 있는 행이 **1개**다. 비교표는 파일럿을 실제로 돌린
뒤에야 채워진다. **화면이 그 사실을 스스로 말해야 한다** — 빈 표를 "기능이 안 된다"로
읽지 않도록, 기존 `acquisitionCaptureRate`처럼 "언제부터 계측했는지·몇 명이 계측됐는지"를
함께 보여준다.

---

## D-8. 보완 지시 2건 반영 (2026-08-31 사용자)

### ① 온보딩 완료 — 코드 실측 결과 **프로필 생성과 같은 행위다**

사용자 지시: *"온보딩 완료와 프로필 완료가 실제 제품 흐름에서 **별개의 단계라면** 각각
독립 측정하라. 현재 DB에서 알 수 없다면 이벤트로 계측하라. 다만 **같은 사실로 중복
표시해서 퍼널에 의미 없는 두 단계를 만들지 마라.**"*

**조사했다. 결론: 별개가 아니다 — 지시의 두 번째 절이 적용된다.**

```
src/app/onboarding/page.tsx:54   type Step = "profile" | "done"
                                 (crew·create·join 단계는 2026-08-08에 삭제됨)
src/app/onboarding/page.tsx:335  mustAskNickname = providers.length === 0
                            :336  showNicknameStep = mustAskNickname || linked === true
                                 → 닉네임 칸은 카카오·구글 연결 뒤에만 뜬다
src/app/onboarding/page.tsx:206  await upsertMyProfile({...})   ← 온보딩을 끝내는 유일한 행위
                                 이후 코드는 전부 라우팅(홈·챌린지·done)일 뿐이다
```

`upsertMyProfile`을 부르는 곳은 온보딩과 `profile-edit-sheet`뿐이고 후자는 **수정**이라
`created_at`을 바꾸지 않는다(`crew.ts:37` upsert). 즉 **`profiles.created_at`은 온보딩을
끝낸 바로 그 호출이 남긴 정확한 기록**이다.

→ **`onboarding_completed` 이벤트를 만들지 않는다.** 만들면 `profiles.created_at`과
같은 사실을 두 곳에 저장하게 되고(§0 원칙 위반), 퍼널에 항상 숫자가 똑같은 두 줄이
생긴다. 그건 정보가 아니라 잡음이다.

### ①-b 그 대신 — **실제 제품 순서가 브리프와 다르다**

같은 조사에서 더 중요한 것이 나왔다. 브리프의 기본 순서는
`온보딩 완료 → 계정 연결 → 프로필`인데, **GND의 실제 순서는 반대다.**

```
외부 진입 → 익명 계정 발급 → 온보딩 화면(카카오·구글 버튼 2개)
   → [버튼 누름]        ← ❌ 측정 안 됨   ← ⚠️ 진짜 공백이 여기다
   → OAuth 왕복 복귀 = 정식 계정 전환     ← ✅ auth.identities / is_anonymous
   → [닉네임 화면 노출]  ← ❌ 측정 안 됨
   → 프로필 생성 = 온보딩 완료            ← ✅ profiles.created_at
   → 홈 또는 챌린지
```

브리프가 *"프로필 완료 후 identity linking인 구조라면 위 순서를 억지로 적용하지 마라"*
고 했으므로 **실제 순서를 따른다: 계정 전환이 프로필보다 앞이다.**

그리고 **지금 안 보이는 진짜 이탈 지점은 "온보딩 화면을 봤지만 카카오/구글을 안 눌렀다"
와 "눌렀는데 안 돌아왔다"** 두 곳이다. 여기가 외부 사용자가 가장 많이 빠질 곳인데
현재 완전히 깜깜하다. `onboarding_completed`를 만드는 것보다 **이쪽을 계측하는 것이
같은 노력으로 훨씬 큰 값**이다.

**최종 이벤트 목록 (5종 — 개수는 그대로, 의미가 정확해졌다):**

| 이벤트 | 왜 필요한가 |
|---|---|
| `landing_opened` | 유입. 프로필 없는 사람의 유일한 흔적 (§D-1) |
| `onboarding_started` | 온보딩 화면을 실제로 봤다 |
| `identity_link_started` | 카카오·구글을 **눌렀다** — 여기서 안 돌아오는 사람이 보인다 |
| `identity_link_failed` | 안 하려고 안 한 것과 오류로 못 한 것을 가른다 (error code만) |
| `challenge_viewed` | 챌린지 화면을 봤다 (참가는 `challenge_participants`가 안다) |

**만들지 않는다:** `onboarding_completed`(=`profiles.created_at`) ·
`identity_link_completed`(=`auth.identities`) · `profile_completed` ·
`first_workout_started/completed` · `challenge_joined` · `three_workouts` · `D7`.

### ② campaign 귀속 불일치 — 테스트는 실패, 운영은 계속 돈다

사용자 지시: *"자동 테스트에서는 실패 조건으로 두되, production에서 불일치가 생겼다고
앱이나 admin 전체가 실패하지 않게 하라. 조용히 한쪽을 고르지 말고 `/admin`에
**'campaign 귀속 불일치 N건'** 처럼 관측 가능하게 표시하라."*

D-7에 적었던 "둘이 갈리면 테스트가 실패하게 한다"만으로는 부족했다. **운영에서 던지면
`/admin` 전체가 500이 된다** — 진단 하나 때문에 대시보드를 통째로 잃는 건 손해다.
아래로 교체한다.

**집계 함수는 절대 던지지 않는다.**

```
campaignCohort(events, profiles) →
  { rows: CampaignRow[],
    mismatches: { count: number, samples: {eventCampaign, profileCampaign, n}[] } }
```

- 배정은 **`landing_opened` 이벤트 값**을 쓴다 (프로필 없는 사람까지 덮는 유일한 기록).
  이건 "조용한 선택"이 아니라 **문서화된 우선순위**이고, 고른 사실을 아래처럼 화면이 말한다
- 불일치는 **버리지도 고치지도 않고 세어서 같이 낸다**
- `samples`에 **사용자 id·이메일을 넣지 않는다** — campaign 문자열 쌍과 건수만.
  개인 감시를 만들지 않는다는 §12 원칙 그대로다

**`/admin` 표시.** 캠페인 비교표 아래에 진단 줄을 둔다.

```
✅ campaign 귀속 불일치 0건
⚠️ campaign 귀속 불일치 3건 — 유입 기록과 프로필 기록의 캠페인이 다릅니다.
   비교표는 유입 기록 기준으로 셌습니다.
   influencer_a_pilot01 ↔ influencer_a_pilot02 (2건) · instagram_ad ↔ (없음) (1건)
```

0건이면 초록 한 줄로 조용히, 1건 이상이면 경고와 함께 **어떤 쌍이 몇 건인지** 보여준다.
운영자가 SQL Editor를 열지 않고도 원인을 짚을 수 있어야 한다.

**테스트 (양쪽 다 넣는다):**
- 불일치를 만든 픽스처에서 `mismatches.count`가 **정확히 그 수**로 나온다 (실패 조건)
- 불일치가 있어도 `campaignCohort`가 **던지지 않고 rows를 정상 반환**한다 (운영 보호)
- 패널이 불일치 0건일 때와 N건일 때 **각각 렌더된다** — N건에서 화면이 죽지 않는다
- `samples`에 uuid·이메일 형태 문자열이 **들어가지 않는다** (개인정보)

### D의 완료 판정 (다시 못박는다)

Supabase에 이벤트가 쌓이는 것은 완료가 **아니다.** `/admin`에서 실제 운영 데이터
경로로 다음이 확인돼야 완료다.

1. 제안처/캠페인별 성과 비교 (표)
2. 특정 캠페인의 상세 퍼널
3. 가장 큰 이탈 단계 (표본 충분할 때만)
4. pilot01 vs pilot02 비교
5. `source`가 같아도 인플루언서 A/B 분리

**외부 파일럿은 D의 production 검증이 끝난 뒤에 시작한다.**

---

## B-추가. 배포 D 중 우연히 발견한 기존 권한 문제 (배포 B에서 처리)

0093을 만들면서 드러났다. **이 프로젝트의 Supabase에는 새 테이블에 자동으로
`grant all to anon, authenticated`가 붙는 default privileges가 걸려 있다.**
`grant insert`만 줘도 이미 받은 7개 권한(`DELETE·INSERT·REFERENCES·SELECT·
TRIGGER·TRUNCATE·UPDATE`)은 사라지지 않는다.

### 실측 (2026-08-31)

| 롤 | 권한 가진 테이블 | TRUNCATE | DELETE | SELECT |
|---|---:|---:|---:|---:|
| `anon` | 3 (0093 제외) | 3 | 3 | 3 |
| `authenticated` | 39 | **12** | 18 | 39 |
| `service_role` | 40 | 40 | 40 | 40 |

`authenticated`가 TRUNCATE를 가진 12개: `profiles` · `workout_sessions` ·
`workout_sets` · `workout_exercises` · `workout_images` · `challenges` ·
`groups` · `group_members` · `user_goals` · `bug_reports` · `profile_views` ·
`exercise_catalog`.
`anon`이 권한을 가진 3개: `profiles` · `groups` · `group_members`.

### 왜 중요한가 — **TRUNCATE는 RLS를 우회한다**

SELECT·UPDATE·DELETE는 정책이 막지만 TRUNCATE는 정책 평가를 거치지 않는다.
"RLS가 켜져 있으니 괜찮다"가 여기서는 **틀린다.**

### 그런데 실효 위험은 낮다 — 과장하지 않는다

- **PostgREST에 TRUNCATE 동사가 없다.** 공개 REST API로는 도달할 수 없다.
  악용하려면 `anon`/`authenticated` 롤로 **직접 Postgres 연결**이 필요한데,
  일반 사용자는 JWT만 갖고 롤 전환은 서버에서 일어난다
- **읽기는 안전하다 (확인함).** `profiles`·`groups`·`group_members`의 SELECT 정책이
  전부 `auth.uid()`에 의존하고, `anon`은 세션이 없어 `auth.uid()`가 null이라
  한 행도 못 읽는다. 정책 자체는 제대로 서 있다

→ **긴급하지 않다. 그러나 최소 권한이 아니다.** 배포 B의 감사 대상에 넣는다.
**⛔ 기존 테이블의 REVOKE는 사용자 지시상 "실행 전 중단·보고" 대상이다** — 배포 B에서
대상 목록과 근거를 먼저 보고하고 승인을 받은 뒤에 실행한다. 여기서 손대지 않았다.

### 0093에서는 처음부터 안 만들었다

새 테이블이 같은 상태로 태어나지 않도록 `revoke all` → `grant insert`
순서로 내렸다. **적용 후 재조회로 확인**: `anon` 권한 없음 · `authenticated` INSERT만 ·
`service_role`은 집계용으로 유지.

---
---

# 계획 갱신 — 2026-09-01: 배포 B가 마지막 남은 항목

A · D · 계보 · C · 0095가 **전부 코드·DB·CI·배포까지 끝났다.** 남은 것은 **B 하나**다.

## 완료 현황

| 배포 | 내용 | 코드 | DB 적용 | CI | Vercel | 마이그레이션 |
|---|---|---|---|---|---|---|
| **A** | search_path · CI · 회원 지표 · 문서 | ✅ | ✅ | ✅ | ✅ | 0092 |
| **D** | 퍼널 계측 + 인플루언서 비교 | ✅ | ✅ | ✅ | ✅ | 0093 |
| **계보** | 뿌리 캠페인 · 확산 성과 | ✅ | — (DB 변경 0) | ✅ | ✅ | — |
| **C** | 익명 확산형 mutation 게이트 | ✅ | ✅ | ✅ | ✅ | 0094 |
| **0095** | 영구 크루 vs 챌린지 임시 소셜 | ✅ | ✅ | ✅ | ✅ | 0095 |
| **B** | SECURITY DEFINER · GRANT · TRUNCATE 감사 | ⬜ | ⬜ | ⬜ | ⬜ | 0096 예정 |

⚠️ **C를 D·계보보다 먼저 배포했다.** 원래 순서(A→D→C→B)와 다른 이유: C의 DB(0094)가
이미 운영에 적용된 상태에서 배포를 미루면 **"DB엔 게이트가 있는데 앱엔 JWT 갱신 수정이
없는"** 상태가 유지되는데, 그게 사용자가 최우선 결함으로 꼽은 바로 그 상황이었다.

## B의 범위 (2026-09-01 사용자 지시 반영)

원래 계획의 B(“SECURITY DEFINER 전수 감사 + 최소 REVOKE”)에 **두 가지가 추가됐다.**

### 추가 ① 테이블 GRANT / TRUNCATE 전수 감사
D에서 발견한 것: `authenticated`가 **12개 테이블에 TRUNCATE**를 갖고 있다.
TRUNCATE는 **RLS를 우회한다.** PostgREST에 TRUNCATE 동사가 없어 공개 API로는 도달
불가라 실효 위험은 낮지만, **그건 공격 가능성을 낮추는 요소일 뿐 권한이 필요하다는
근거가 아니다.** 앱 역할에 필요 없는 권한은 없애는 것이 원칙이다.

### 추가 ② ⭐ ALTER DEFAULT PRIVILEGES 근본 원인
**이미 증명했다 (2026-09-01 실측).**

```
postgres       / public / TABLE → anon=arwdDxtm , authenticated=arwdDxtm
supabase_admin / public / TABLE → anon=arwdDxtm , authenticated=arwdDxtm
postgres       / public / FUNC  → anon=X       , authenticated=X
      a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN
```

→ **새 테이블을 만드는 순간 `anon`·`authenticated`가 TRUNCATE 포함 전 권한을 받는다.**
새 함수도 `anon` EXECUTE를 자동으로 받는다. 0093에서 `analytics_events`를 만들 때
실제로 그랬고 별도 REVOKE로 막았다.

**기존 12개만 REVOKE하고 끝내면 다음 테이블에서 또 생긴다.** 뿌리를 고쳐야 하고,
고쳤으면 **새 객체로 재발 테스트**까지 해야 한다.

## B 완료 조건

Advisor 숫자가 아니라 **네 질문에 증거로 답하는 것**이다.

1. 일반 사용자가 관리자 RPC로 남의 데이터를 읽거나 바꿀 수 있는가?
2. 익명 사용자가 정식 전용 작업을 우회 실행할 수 있는가?
3. 테이블에 필요 이상의 권한이 직접 부여돼 있는가?
4. **지금 고쳐도 새 테이블에서 또 생기는가?**

산출물: `docs/security/public-beta-rpc-audit.md` (89개 SECURITY DEFINER 전수) ·
A/B/C/D 4배우 매트릭스 · `scripts/cross-user-abuse-check.mjs` ·
`scripts/default-privilege-check.mjs` · 마이그레이션 0096

**상세 인수인계: `docs/superpowers/HANDOFF-2026-09-01-deploy-b-security-audit.md`**
