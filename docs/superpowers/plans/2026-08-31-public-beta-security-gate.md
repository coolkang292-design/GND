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

**산출물의 본체는 문서다. 변경은 최소로 한다.**

`docs/security/public-beta-rpc-audit.md` — 함수 95개 전수, 브리프가 요구한 12개 열.
분류는 자동으로 만든다: `pg_proc` × `pg_policies` 본문 grep × `pg_tgrelid` ×
코드의 `rpc("...")` grep → **호출자가 하나도 없는 함수만 변경 후보**.

```
함수 95개 중 SECURITY DEFINER 87개 · INVOKER 8개
```

**절대 건드리지 않는 것 — RLS 헬퍼 14개** (advisor가 anon 실행 가능으로 지목한 목록):
`is_crew_with` · `is_challenge_participant` · `is_group_member` · `owns_workout_session` ·
`owns_workout_exercise` · `workout_session_crew_visible` · `workout_exercise_crew_visible` ·
`session_crew_shared` · `shares_group_with` · `challenge_in_setup` 등.
EXECUTE를 빼면 정책 전체가 깨진다.

**변경 후보 (호출자 확인 후에만)**: 트리거 전용 `enforce_goal_raise_only` ·
`notify_reaction` · `notify_bug_report_watchers`, cron 전용 `dispatch_push_notification`
(cron/edge 호출 여부 확인 필수).

`supabase/migrations/0093_revoke_internal_function_execute.sql`

**검증:** REVOKE 후 `--tier readonly` **+ `accounts` 티어까지** 재실행.
RLS 파손은 여기서만 잡힌다. ⚠️ accounts 티어는 익명 계정을 만들고 30분+ 걸린다.

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
