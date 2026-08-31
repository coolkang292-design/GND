# 공개 베타 — 사람이 손으로 해야 하는 것

**작성** 2026-08-31 (배포 A) · 관련 계획: `docs/superpowers/plans/2026-08-31-public-beta-security-gate.md`

에이전트가 코드·DB로 끝낼 수 없고 **Supabase 대시보드나 GitHub 설정 화면에서 사람이
눌러야** 하는 것들이다. 각 항목에 현재 상태·왜 필요한지·어디서 켜는지·켰을 때 영향·
되돌리는 법을 적는다.

---

## 1. 유출 비밀번호 차단 (Leaked Password Protection)

### 현재 상태

**꺼져 있다.** 2026-08-31 Supabase Security Advisor가 `auth_leaked_password_protection`
경고를 냈고, 배포 A 이후 재측정에서도 **그대로 남아 있다**(137건 중 1건).

⚠️ **에이전트가 켜지 않았다.** 이건 저장소 코드가 아니라 **운영 Auth 설정**이고,
로그인하는 실사용자에게 즉시 영향이 가므로 사용자 승인 없이 바꾸지 않는다.

### 왜 필요한가

켜면 Supabase가 회원가입·비밀번호 변경 시 입력한 비밀번호를
[HaveIBeenPwned](https://haveibeenpwned.com/)의 유출 목록과 대조해서, 이미 털린 비밀번호면
거부한다. 대조는 **k-익명성 해시**로 하므로 비밀번호 원문이 밖으로 나가지 않는다.

GND에 지금 필요한 이유: 공개 베타로 낯선 사람이 들어온다. GND는 카카오·구글 로그인이
주력이지만 **이메일+비밀번호 경로가 열려 있고**(픽스처 계정이 그 경로를 쓴다), 재사용된
유출 비밀번호는 계정 탈취의 가장 흔한 입구다.

### 어디서 켜나

```
Supabase 대시보드 → 프로젝트 "GND workout challenge"
  → Authentication → Policies  (또는 Sign In / Providers → Password)
  → "Leaked password protection" 토글 ON
  → Save
```

### 켰을 때 기존 로그인에 미치는 영향

| | 영향 |
|---|---|
| 이미 로그인해 있는 사용자 | **없다.** 세션은 그대로다 |
| 카카오·구글 로그인 | **없다.** 비밀번호를 안 쓴다 |
| 기존 이메일 계정의 로그인 | **없다.** 검사는 **비밀번호를 새로 정할 때만** 한다 |
| 신규 가입 / 비밀번호 변경 | 유출 목록에 있으면 **거부된다** |
| 개발 픽스처 A·B | `.env.local`의 `DEV_FIXTURE_PASSWORD`가 유출 목록에 있으면 **`dev-fixture.mjs create`가 새 계정을 못 만든다.** 기존 계정 로그인은 영향 없다 |

⚠️ **켜기 전에 `DEV_FIXTURE_PASSWORD`를 확인하라.** 흔한 비밀번호면 픽스처 재생성이
막힌다. 막히면 값을 더 강한 것으로 바꾸고 `destroy` → `create`를 다시 한다.

### 되돌리는 법

같은 토글을 OFF. **즉시 반영되고 기존 계정·세션에 아무 영향이 없다.** 이미 거부된
가입 시도는 되살아나지 않으므로 그 사용자는 다시 가입해야 한다.

---

## 2. GitHub 브랜치 보호 (CI 실패 시 main 병합 차단)

### 현재 상태

**설정되지 않았다.** 배포 A에서 `.github/workflows/ci.yml`을 추가했지만, **워크플로가
있다고 병합이 막히지는 않는다.** 브랜치 보호 규칙을 켜야 실패한 CI가 병합을 막는다.

⚠️ **에이전트가 설정하지 않았다.** 브랜치 보호는 저장소 관리자 권한이 필요하고,
현재 세션의 connector/API 권한으로 안전하게 설정할 수 없다. 우회하지 않고 여기에 절차만 남긴다.

### 왜 필요한가

GND는 **GitHub 연동 배포를 쓰지 않는다**(CLAUDE.md §배포). 배포는 검증한 로컬 `main`에서
사람이 `vercel --prod`로 한다. 그래서 CI는 배포를 막을 수 없고, **`main`에 깨진 코드가
들어가는 것만** 막을 수 있다. 그게 유일한 자동 방어선이므로 실제로 강제해야 의미가 있다.

### 설정 순서

먼저 CI가 **한 번은 돌아야** 한다 — 실행된 적 없는 체크는 목록에 안 뜬다.

1. 이 브랜치(`codex/public-beta-security-gate`)를 푸시하고 PR을 연다 → CI가 돈다
2. `https://github.com/coolkang292-design/GND` → **Settings** → **Rules** → **Rulesets**
   → **New ruleset** → **New branch ruleset**
3. **Ruleset Name**: `main protection` · **Enforcement status**: `Active`
4. **Target branches** → **Add target** → **Include default branch**
5. **Rules** 에서 체크:
   - ☑ **Require a pull request before merging**
     - Required approvals: `0` (1인 저장소라 1로 두면 자기 PR을 못 병합한다)
   - ☑ **Require status checks to pass**
     - ☑ Require branches to be up to date before merging
     - **Add checks** → `typecheck · lint · test · build` 를 검색해 추가
       (`ci.yml`의 job name이다. 1번에서 CI가 한 번 돌아야 검색된다)
   - ☑ **Block force pushes**
6. **Create**

### 확인하는 법

일부러 타입 오류가 있는 브랜치로 PR을 열어 **Merge 버튼이 잠기는지** 본다.
"체크가 초록이다"가 아니라 **"빨간 상태에서 병합이 막히는지"** 를 봐야 한다 —
설정이 안 먹었어도 초록일 때는 똑같이 보인다.

### 되돌리는 법

같은 화면에서 Ruleset을 `Disabled`로 바꾸거나 삭제한다. 코드에 영향 없다.

⚠️ 되돌리면 **자기 자신도 실수로 깨진 코드를 밀 수 있게 된다.** 급하게 밀어야 할 때는
Ruleset을 지우지 말고 관리자 bypass를 쓰는 편이 흔적이 남아 낫다.

---

## 3. 이번에 손대지 않기로 한 경고

| 경고 | 왜 두는가 |
|---|---|
| `extension_in_public` (`pg_net`) | 스키마를 옮기면 cron·푸시 발송이 걸려 있어 위험 대비 이득이 없다. 공개 베타 범위 밖 |
| `rls_enabled_no_policy` (`bug_report_watchers`) | 정책이 없어 아무도 못 읽는 상태 = `service_role` 전용으로 의도된 것일 가능성이 높다. **[미검증]** — 배포 B의 RPC 감사에서 확인한다 |
| `auth_allow_anonymous_sign_ins` 41건 · SECURITY DEFINER 실행 권한 93건 | 배포 B·C의 본 과제다. Advisor 숫자를 줄이려고 일괄 REVOKE 하지 않는다 |
