# 인수인계 — 배치 2·3·4 (초대 링크 · 계정 연결 · 온보딩 개편)

작성 2026-08-08 저녁 · **이어받는 사람이 처음부터 읽어야 하는 문서**
앞 문서: [`HANDOFF-2026-08-08-friend-invite-identity.md`](HANDOFF-2026-08-08-friend-invite-identity.md) (배치 1·2 상세)

---

## 0. 30초 요약

사용자 지시 4건이 배치 4개로 쪼개져 있었다. **네 배치 모두 코드가 끝났고, 배치 1·2는
배포까지 됐다. 배치 3·4가 미배포 상태로 커밋만 돼 있다.**

| 배치 | 내용 | 커밋 | 배포 |
|---|---|---|---|
| 1 | 친구 목록 단계 알약 | `35faa13` | ✅ |
| 2 | 초대 링크가 친구를 맺는다 + 챌린지 신입 자동 친구 | `5b17576` | ✅ |
| 3 | 카카오·구글 계정 연결 (`linkIdentity`) | `b63b315` | ✅ 2026-08-08 16:07 |
| 4 | 온보딩 개편 + 프로필 편집 시트 | `5fd520e` | ✅ 2026-08-08 16:07 |
| — | 릴리스 공지 배치 3·4 + `/whats-new` 강조 표기 | `aa5e801` | ✅ 2026-08-08 16:07 |

**지금 당장 할 일:** ① §3.1의 카카오·구글 왕복을 **운영에서** 한 번 해 본다(사람)
② 릴리스 공지 발송(§5) ③ 주간 목표를 챌린지로 옮긴다(§6, 사용자 결정).

### 0.1 2026-08-08 저녁 두 번째 세션에서 한 것

| | |
|---|---|
| 화면 확인 | 8항목 중 **6개 확인 완료**. 2개(카카오·구글 실제 왕복)는 사람 몫 → §3.1 |
| 릴리스 공지 | 배치 3·4 내용 7줄 추가 → §5. **발송은 안 했다** |
| 새로 잡은 버그 | `/whats-new`가 `**굵게**`를 별표째 그리고 있었다 → §5.1 |
| 고친 거짓 주석 | "이모지를 바꾸면 위 성장 카드가 같이 바뀐다"는 사실이 아니다 → §3 |
| 검사 | lint 0 · typecheck 0 · **test 1409/1409** · build ✅ (단언 8건 늘었다: 1401 → 1409) |

---

## 1. 읽어야 하는 문서

| 경로 | 무엇 |
|---|---|
| [`specs/2026-08-08-friend-invite-identity-onboarding-design.md`](specs/2026-08-08-friend-invite-identity-onboarding-design.md) | **설계 원본.** 실측 수치·함정·되돌리기 |
| [`HANDOFF-2026-08-08-friend-invite-identity.md`](HANDOFF-2026-08-08-friend-invite-identity.md) | 배치 1·2 상세 (0051 회귀 등) |
| [`../design-sources/onboarding-hero-prompt.md`](../design-sources/onboarding-hero-prompt.md) | 히어로 아트 생성 규격 |
| `CLAUDE.md` | 개발 서버 확인·배포·픽스처 규약 |

---

## 2. 배치 3·4에서 한 것

### 2.1 배치 3 — 계정 연결 (`b63b315`)

| 파일 | 무엇 |
|---|---|
| `src/lib/identity.ts` 🆕 | 제공자 목록·연결·오류 문구의 **단일 원천** |
| `src/app/auth/callback/page.tsx` 🆕 | 제공자에서 돌아오는 착지점. 프로필 유무로 갈라 보낸다 |
| `src/app/account/page.tsx` | 연결 버튼 · 연결됨 목록 · 로그아웃 잠금 기준 교체 |
| `src/app/login/page.tsx` | 카카오·구글 버튼 |
| `scripts/unlink-identity.mjs` 🆕 | 시험 삼아 붙인 신원을 떼는 유일한 길 |

**⚠️⚠️ `signInWithOAuth`와 `linkIdentity`를 뒤바꾸지 마라.**
`AuthProvider`가 `/login`을 뺀 모든 진입에서 익명 세션을 발급한다
(`auth-provider.tsx:104`). 온보딩·`/account`에서 `signInWithOAuth`를 쓰면 그 계정을
버리고 새 계정으로 갈아타 **기록이 분리된다.** 계정을 지키려다 잃는, 이 기능에서
제일 나쁜 실패다. 호출 스파이 테스트로 고정해 뒀다.

**⚠️ 로그아웃 잠금은 `신원 ≥ 1 또는 이메일`이다.** 이메일을 빼지 마라 — 이메일만
붙고 신원 행이 없는 계정이 생길 수 있는 경로가 있다(`link-email-to-account.mjs`).

### 2.2 배치 4 — 온보딩 개편 (`5fd520e`)

| 파일 | 무엇 |
|---|---|
| `src/app/onboarding/page.tsx` | 모드 1(카카오·구글 2버튼) / 모드 2(닉네임) |
| `src/components/profile/profile-edit-sheet.tsx` 🆕 | 이모지·닉네임 편집 |
| `src/lib/domain/avatars.ts` 🆕 | 이모지 배열 단일 원천 |
| `src/components/brand/` 🆕 | `HeroArt` · `GoldCta` — 온보딩·로그인 공용 |
| `scripts/make-onboarding-assets.py` 🆕 | 자산 변환 (여백 자동 제거 + CSS 비율 출력) |

**⚠️ 프로필 편집 시트를 지우지 마라.** 온보딩에서 이모지를 뺐으므로 이게 없으면
`avatar_url`이 전원 `🧔`로 **영구 고정**된다(12곳이 렌더한다).

**⚠️ 온보딩 `crew`·`create`·`join` 3단계를 지웠다** (사용자 지시). 되살리기 전에
전제를 확인해라 — ① 0062가 챌린지 만들 때 개인 그룹을 자동 생성하므로 크루를 손으로
만들 이유가 없다 ② 초대는 링크가 주 경로다.

### 2.3 작업 중 잡은 버그 2건

**① `/auth/callback`이 오류를 조용히 삼켰다.** `error` 파라미터를 전부 "사용자가
취소함"으로 뭉개서, 개발 서버 로그의 이 응답을 아무 말 없이 넘겼다:

```
?error=server_error&error_code=identity_already_exists
```

계정을 지키려다 실패했는데 화면이 아무 말도 안 했다 → 지켜진 줄 알고 브라우저를
지우면 기록이 사라진다. 취소(`access_denied`)만 조용히 넘기도록 고쳤다.

**② `unlink-identity.mjs`가 없는 경로를 썼다.** `DELETE /auth/v1/admin/users/{id}/identities/{id}`는
**404**다(실측). 지원되는 길은 본인 세션으로 부르는
`DELETE /auth/v1/user/identities/{id}`뿐이라 그쪽으로 고쳤다 — 그래서 이메일+비밀번호가 필요하다.

---

## 3. 화면 확인 — 6/8 끝, **2건은 사람이 해야 한다**

2026-08-08 저녁 두 번째 세션에서 개발 서버(`localhost:3000`, 이미 떠 있던 것)로 확인했다.
⚠️ 이 세션은 **브라우저 창을 볼 수 없었다**(Browser pane 미표시 → 스크린샷 타임아웃).
그래서 눈이 아니라 **DOM·네트워크·DB를 찍어서** 확인했다. §8의 "픽셀을 눈대중하지
말고 DOM을 찍어라"와 같은 방식이다.

| # | 조작 | 기대 | 상태 |
|---|---|---|---|
| 1 | `/onboarding` | 히어로 + 카카오·구글 2버튼. 닉네임 칸 **없음** | ✅ `hero.webp` 540×960 로드됨 · `button` 2개 · `input` **0개** · 가로 스크롤 없음(`scrollWidth 375 = innerWidth`) |
| 2 | 카카오로 시작 → 돌아옴 | `반가워요!` + 닉네임 칸 하나 | ⚠️ **분기만 확인.** 같은 렌더 분기(`showNicknameStep`)를 8번 경로로 확인했다 — `반가워요! / 이름만 정하면 시작해요` + 닉네임 칸 1개. **카카오 실제 왕복은 [미검증]** (§3.1) |
| 3 | 닉네임 저장 | **바로 홈**(크루 화면 안 뜬다) | ✅ 저장 후 `/home` 도착. 크루 단계는 `type Step`에 아예 없다. 단 경유한 것은 초대코드 실패 폴백 분기(둘 다 `router.replace("/home")`) |
| 4 | `/login` | 히어로 + `카카오로 로그인`(금색)/`구글로 로그인`(테두리) + 이메일 폼 | ✅ 히어로 로드 · 카카오=금색 그라데이션 채움(`#d0a066→#7a5329`) · 구글=테두리(`rgba(201,150,91,.55)`) · `email`·`password` 입력 + `로그인` |
| 5 | 구글로 로그인 | 실제로 로그인된다 | ❌ **[미검증]** — 사람이 해야 한다 (§3.1) |
| 6 | 내 정보 → 프로필 편집 | 이모지·닉네임만. **주간 목표 없음** | ✅ 이모지 9개 + 닉네임 1칸. `주간·목표·회` 문구 **0건**(부정 확인) |
| 7 | 이모지 바꾸고 저장 | `저장했어요 ✓` | ✅ `role="status"`에 `저장했어요 ✓` · **DB `profiles.avatar_url = 🧗`** · 새로고침 후 다시 열어도 🧗 |
| 8 | 초대 링크 `/invite/GND-…` | 카카오 화면 없이 바로 닉네임 칸 | ✅ 카카오·구글 버튼 0개, 닉네임 칸 1개로 바로 진입 |

⚠️ **7번의 옛 기대치 "위 성장 카드도 같이 바뀜"은 틀렸다.** `GrowthHub`는 `profiles`를
아예 읽지 않는다 — 내 정보 화면 어디에도 `avatar_url`이 안 그려진다(실측). 바꾼
이모지가 보이는 곳은 **홈 친구 목록·챌린지 참가자 목록**이다
(`home-client.tsx:54` · `king-card.tsx:157` · `challenge/page.tsx:836`).
`profile/page.tsx`의 `key={profileKey}` 리마운트는 XP·배지를 다시 읽어 줄 뿐이다.
주석 두 곳을 사실대로 고쳐 뒀다.

확인용으로 만든 임시 프로필(`온보딩확인임시`)은 **지웠다.** 프로필 수는 확인 전과
같은 7개다(오뎅끼데스까·dev-테스터A·dev-테스터B·스칼레또·낭만송곳니·test·test11).
익명 auth 계정은 그대로 뒀다 — 브라우저 세션이 물려 있다(CLAUDE.md).

### 3.1 남은 2건은 왜 에이전트가 못 하나

2·5번은 **카카오·구글 계정에 실제로 로그인**해야 한다. 에이전트는 어떤 화면에도
비밀번호를 입력하지 않는다. 사람이 해 주면 된다:

1. 시크릿 창 → `http://localhost:3000/onboarding`
2. `카카오로 시작하기` → 카카오 동의 → 돌아오면 **`반가워요!` + 닉네임 칸 하나**인지
3. 닉네임 넣고 `GND 시작하기` → **바로 홈**인지 (크루 화면이 안 떠야 한다)
4. `/login`에서 `구글로 로그인` → 실제로 들어가지는지

⚠️ **같은 카카오·구글은 GND 계정 하나에만 붙는다.** 시험 삼아 붙였으면
`node scripts/unlink-identity.mjs <닉네임> <provider>`로 떼어야 다른 계정에 붙는다.
(2026-08-08 현재 전부 떼어 둔 상태 — 계정마다 `email`만 있다.)

⚠️ 그리고 이 확인은 **로컬**에서만 유효하다. 운영에서 되려면 Supabase의
Redirect URL 허용목록에 `https://gnd-one.vercel.app/auth/callback`이 있어야 한다.

---

## 4. ✅ 배포 완료 (2026-08-08 16:07 KST)

배치 3·4가 운영에 나갔다. 커밋 `aa5e801` 기준.

| | |
|---|---|
| 배포 | `gnd-77093jtnx-gnd4.vercel.app` · `gnd-one.vercel.app` 별칭이 여기를 가리킨다 |
| 환경변수 | `NEXT_PUBLIC_OAUTH_PROVIDERS = kakao,google` (Production) — 배포 **전**에 넣었다 |
| 번들 실물 | `let e="kakao,google".split(",")` — **환경변수가 실제로 박혔다.** fail-closed를 안 탔다 |
| 운영 화면 | `/onboarding` 히어로 + 카카오·구글 2버튼 · 닉네임 칸 0개 / `/login` 카카오·구글 + 이메일 폼 |
| 부정 확인 | 번들에 `주간 운동 목표` 0 · `닉네임만 정하면 바로 시작해요` 0 · `크루 만들기` 0 |
| `/whats-new` | HTML에 `<strong>` 98개 · 남은 `**` **0개** |

⚠️ **여전히 [미검증]:** 운영에서 카카오·구글로 **실제로 로그인이 되는지**.
Supabase Redirect URL 허용목록에 `https://gnd-one.vercel.app/auth/callback`이 있어야 한다.
`/auth/v1/authorize`는 허용목록과 무관하게 302를 주므로 **밖에서는 확인할 수 없다**(실측).
Supabase Dashboard → Authentication → URL Configuration → Redirect URLs에서 봐야 한다.
없으면 로그인은 되지만 `/auth/callback`이 아니라 SITE_URL로 떨어진다.

제공자 자체는 켜져 있다 — `/auth/v1/settings`에서 `google`·`kakao` 둘 다 `true` 확인(실측).

### 4.1 ⚠️ Vercel 환경변수를 **먼저** 넣는다

```
NEXT_PUBLIC_OAUTH_PROVIDERS = kakao,google      (Production)
```

**이걸 빼면 배포는 성공하는데 카카오·구글 버튼이 하나도 안 뜬다.** 설계상
fail-closed이고 오류도 안 난다 — 조용히 없다. 값은 **빌드 시각에 번들에 박히므로**
환경변수를 넣은 **뒤에** 배포해야 한다.

- CLI: `npx vercel env add NEXT_PUBLIC_OAUTH_PROVIDERS production --scope gnd4`
- 대시보드: Vercel → gnd → Settings → Environment Variables

### 4.2 배포 절차

```bash
DEPLOY=/c/Users/SAMSUNG/AppData/Local/Temp/gnd-deploy-<sha>
rm -rf "$DEPLOY"; mkdir -p "$DEPLOY"
git archive HEAD | tar -x -C "$DEPLOY"
cp .env.local "$DEPLOY/"; cp -r .vercel "$DEPLOY/"
cd "$DEPLOY" && pnpm install --frozen-lockfile && pnpm build
npx vercel@latest --prod --yes --scope gnd4
```

⚠️ **`--scope gnd4`가 없으면 `Not authorized`로 실패한다** (2026-08-08 실측).
`.vercel/project.json`에 orgId가 있어도 그렇다. CLAUDE.md 절차에는 없던 내용이다.

⚠️ `.git` 없는 복사본에서 배포한다 — Vercel이 커밋 이메일을 매칭 못 해 Blocked가 난다.

### 4.3 배포 뒤 실물 확인

```bash
curl -s https://gnd-one.vercel.app/onboarding \
  | grep -oE '/_next/static/[a-zA-Z0-9._/-]+\.js' | sort -u \
  | while read c; do curl -s "https://gnd-one.vercel.app$c"; done > /tmp/b.js
grep -c 'kakao,google' /tmp/b.js          # 1 이상 ← ⚠️ 이게 진짜 확인이다
grep -c "주간 운동 목표" /tmp/b.js        # 0 (부정 확인)
curl -s -o /dev/null -w "%{http_code}\n" https://gnd-one.vercel.app/onboarding/hero.webp
```

⚠️ **`grep -c "카카오로 시작하기"`는 0이 나온다. 그래도 정상이다.**
이 문구는 `` `${PROVIDER_META[p].short}로 시작하기` ``로 **조립**되므로 번들에
통째로 들어 있지 않다. 2026-08-08에 이걸 모르고 "안 나갔나" 하고 한 번 멈췄다.
버튼이 뜨는지 보려면 **환경변수가 박혔는지**(`kakao,google`)를 봐라 —
fail-closed라 그 문자열이 없으면 버튼이 하나도 안 그려진다.

⚠️ `/whats-new`는 **서버 렌더**다. 릴리스 노트 문구를 JS 번들에서 찾으면 0이다.
HTML을 받아서 봐라: `curl -s https://gnd-one.vercel.app/whats-new | grep -c '<strong'`

---

## 5. 릴리스 공지 — ✅ 글은 다 썼다. 발송만 남았다

항목 `2026-08-08-friend-invite-link`에 **배치 3·4 내용 7줄을 앞에 넣었다**(총 13줄).
id는 그대로 뒀다 — `bug-reports.mjs --fix --release <id>`가 이 id를 참조한다.
제목·요약도 계정 연결까지 담도록 넓혔다.

| | 전 | 후 |
|---|---|---|
| 제목 | 초대 링크로 진짜 친구가 돼요 | 카카오·구글로 계정을 지키고, 초대 링크로 친구가 돼요 |
| 요약 | 초대 링크를 보내면 이제 서로 친구가 돼요 🤝 … | 이제 카카오·구글로 시작해 기록을 지킬 수 있어요 🔐 … |

### 5.1 ⚠️ 이 김에 잡은 것 — `/whats-new`가 별표를 그대로 그리고 있었다

릴리스 노트 데이터는 처음부터 `**굵게**`·`` `코드` ``를 쓰는데, `whats-new/page.tsx`가
`{h}`를 **문자열 그대로** 그렸다. 즉 지금까지 배포된 모든 릴리스 노트가 사용자 화면에
`**이렇게** 별표가 낀 채로` 보이고 있었다. 배치 3·4와 무관한 **전부터 있던 버그**다.

`parseHighlight()`(`release-notes.ts`)를 두고 `<strong>`·`<code>`로 그리게 고쳤다.
확인: `/whats-new` 18개 항목 전체에서 화면에 남은 `**` **0개**, 백틱 **0개**,
`<strong>` 98개 · `<code>` 24개.

⚠️ **데이터 단언 두 건을 지우지 마라** (`release-notes.test.ts`). 짝이 안 맞거나
겹쳐 쓴 표기를 잡는다 — 화면은 못 떼어 낸 표기를 글자로 그리므로 이게 유일한 방어선이다.
일부러 `**카카오*`로 깨뜨려 **실제로 실패하는 것을 확인했다**(CLAUDE.md의 가짜 통과 방지).
처음엔 `text` 조각만 봤다가 `**굵게 `코드` 굵게**` 중첩을 놓쳤다 — 모든 조각을 본다.

⚠️ `/whats-new`는 앱 번들에서 읽으므로 **배포해야 새 항목이 뜬다.**
⚠️ 발송(`--send`)은 **사용자가 지시할 때 사용자가 Run한다** (2026-07-31 규약).

---

## 6. 남은 정리거리 (배포를 막지는 않는다)

| 항목 | 내용 |
|---|---|
| **홈 주간 목표** | ✅ **끝났다** (아래 §6.1). 커밋 `<주간목표>`. 배포는 아직 |
| **`pnpm db:snapshot`** | 배치 3·4는 DB를 안 건드렸으므로 0063 시점 그대로 유효 |
| **히어로 레이어 3장** | 포털을 따로 움직이게 하려면. 프롬프트는 문서에 있으나 **지금은 안 쓰기로 했다** |

### 6.1 주간 목표를 챌린지로 옮겼다 (2026-08-08 저녁, **미배포**)

사용자 결정 — *"주간 운동표는 챌린지에서 세팅하는 걸로 하자."* 챌린지가 없는 사람은
*"분모 빼고 챌린지로 유도"* (2026-08-08 재확인).

**원천이 바뀌었다.** `profiles.weekly_goal`(항상 3, 아무도 못 바꿈)
→ 진행 중 챌린지의 `user_goals.planned_days`(챌린지 세팅 시트의 `주 N일`, 1~7).

| 파일 | 무엇 |
|---|---|
| `src/lib/challenge.ts` | `getMyWeeklyGoalDays(userId)` 🆕 — 없으면 `null` |
| `src/components/home/weekly-stats.tsx` | `weeklyGoal: number \| null`. 없으면 `3일` + `— 목표 정하기 ›`(→`/challenge`) |
| `src/components/home/home-client.tsx` · `record/calendar-view.tsx` | 원천 교체 |
| `src/lib/domain/calendar.ts` | `achievementRate: number \| null` |

**⚠️⚠️ `null`에 기본값을 붙이지 마라.** `?? 3`·`?? 5`를 넣는 순간 "아무도 못 바꾸는
숫자로 달성률을 매긴다"는 원래 문제가 그대로 돌아온다. 부정 단언 3건이 이걸 지킨다
(`weekly-stats.test.tsx` 2건 · `calendar.test.ts` 1건). 일부러 `?? 3`을 넣어
**2건이 실제로 실패하는 것을 확인했다.**

**⚠️ `active`만 본다.** `setup`은 아직 목표를 고치는 중이고 `ended`는 지난 기준이다.

**실측 (운영 DB, 읽기 전용)** — 임베드 `challenges!inner(status)`가 실제로 풀린다.
목표 23행 중 cancelled 11행이 걸러져 12행만 남았다. 실사용자 5명의 주 운동일은 3·4·5일이라,
배포되면 그 사람들 홈에 **실제로 각자가 정한 분모**가 뜬다.

**화면 확인 (개발 서버)** — 챌린지 없는 계정:
홈 `0일 / 이번 주 운동` · `— / 목표 정하기 ›`(href `/challenge`) · 페이지 전체에 `/ N` 0건 · `%` 0건.
기록 달력 `— / 목표 미설정` · `달성률` 문구 0건.
⚠️ **[미검증]** 챌린지가 **있는** 계정의 홈(`N / M` + `%`). 그 계정에 들어가려면
로그인이 필요해서 못 했다 — 단위 테스트와 위 DB 실측으로 대신했다.

---

## 7. 절대 하지 말 것

1. **`signInWithOAuth`와 `linkIdentity`를 뒤바꾸지 마라** (§2.1). 기록이 갈린다
2. **프로필 편집 시트를 지우지 마라** (§2.2). 아바타가 전원 `🧔`로 굳는다
3. **0063의 신입 가드를 지우거나 완화하지 마라.** 2026-07-31 사고(D5)가 재발한다
4. **적용된 마이그레이션(0001~0063)을 수정하지 마라.** 새 번호로만 추가
5. **Vercel 환경변수 없이 배포하지 마라** (§4.1). 버튼이 조용히 사라진다
6. **화면 확인 없이 배포하지 마라.** 자동 테스트·build는 화면을 검증하지 않는다
7. **히어로 자산을 바꾸면 CSS 비율도 바꿔라.** `make-onboarding-assets.py`가
   `→ CSS: aspect-[...]`로 찍어 준다. 눈대중으로 맞추다 두 번 틀렸다
8. **주간 목표 `null`에 기본값을 붙이지 마라** (§6.1). 챌린지가 없으면 기준이
   **없는 것**이지 3도 5도 아니다
9. **`profiles.weekly_goal`을 다시 화면에 끌어다 쓰지 마라** (§6.1). 바꿀 자리가
   없는 숫자다 — 컬럼이 not null이라 쓰기만 하고 아무도 읽지 않는다

---

## 8. 이번 작업에서 배운 것 (같은 실수 반복 금지)

**"여백처럼 보인다"는 신고를 받으면 CSS보다 자산을 먼저 재라.**
온보딩 히어로 양옆 검은 띠를 CSS 패딩으로 오해해 `w-full` → `-mx-6` → full-bleed로
**세 번 고쳤고 세 번 다 틀렸다.** 실제 원인은 **그림 자체의 좌 8.0% · 우 6.8%가
순검정**이었던 것. 자산을 한 번 재는 데 명령 한 줄이면 됐는데 네 번째에야 했다.

스크린샷 픽셀을 자로 재서 원인을 추정하지 마라. 화면이 축소돼 있어 24px인지 40px인지
구분이 안 된다. DOM을 찍고(`_debug-hero.test.tsx` 같은 임시 테스트) 자산을 재라.
