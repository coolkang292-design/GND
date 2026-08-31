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
src/lib/admin/queries.ts                        acquisition_medium/campaign select 추가
src/app/admin/_components/public-beta-funnel-panel.tsx
```

⚠️ **표본 규칙을 지킨다.** 지금 실사용자 4명이다. `MIN_RATIO_SAMPLE = 5` 원칙대로
표본이 적으면 퍼센트 대신 원시 숫자를 보여주고, "가장 큰 마찰 구간"은
**"표본 부족 — 판정 안 함"** 으로 둔다. 4명 데이터로 "32% 이탈이 문제"라는 가짜 확신을
만들지 않는다.

⚠️ **개인별 행동 timeline은 만들지 않는다.** metadata는 allowlist로 제한하고
이메일·raw referrer URL·초대 코드 원문·토큰은 넣지 않는다.
