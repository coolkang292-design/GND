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
| 3 | 카카오·구글 계정 연결 (`linkIdentity`) | `b63b315` | ❌ **미배포** |
| 4 | 온보딩 개편 + 프로필 편집 시트 | `5fd520e` | ❌ **미배포** |

**지금 당장 할 일:** §3의 화면 확인 → §4의 Vercel 환경변수 → 사용자 승인 → 배포.
⚠️ **환경변수를 빼면 배포해도 카카오·구글 버튼이 안 뜬다.** 설계상 fail-closed다.

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

## 3. ❌ 남은 일 ① — 화면 확인 (배포 전 필수)

`pnpm dev` → `http://localhost:3000`. 아래는 **사용자가 아직 못 본 것**이다.

| # | 조작 | 기대 | 상태 |
|---|---|---|---|
| 1 | `/onboarding` 시크릿 창 | 히어로 + 카카오·구글 2버튼. 닉네임 칸 **없음** | ✅ 확인됨 |
| 2 | 카카오로 시작 → 돌아옴 | `반가워요!` + 닉네임 칸 하나 | ❌ **[미검증]** |
| 3 | 닉네임 저장 | **바로 홈**(크루 화면 안 뜬다) | ❌ **[미검증]** |
| 4 | `/login` | 히어로 + `카카오로 로그인`(금색)/`구글로 로그인`(테두리) + 이메일 폼 | ❌ **[미검증]** |
| 5 | 구글로 로그인 | 실제로 로그인된다 | ❌ **[미검증]** |
| 6 | 내 정보 → 프로필 편집 | 이모지·닉네임만. **주간 목표 없음** | ❌ **[미검증]** |
| 7 | 이모지 바꾸고 저장 | `저장했어요 ✓` + 위 성장 카드도 같이 바뀜 | ❌ **[미검증]** |
| 8 | 초대 링크 `/invite/GND-7FDVC` | 카카오 화면 없이 바로 닉네임 칸 | ❌ **[미검증]** |

⚠️ **같은 카카오·구글은 GND 계정 하나에만 붙는다.** 시험용으로 붙였으면
`node scripts/unlink-identity.mjs <닉네임> <provider>`로 떼어야 다른 계정에 붙는다.
(2026-08-08 현재 전부 떼어 둔 상태 — 계정마다 `email`만 있다.)

---

## 4. ❌ 남은 일 ② — 배포

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
grep -c "카카오로 시작하기" /tmp/b.js     # 1 이상
grep -c "주간 운동 목표" /tmp/b.js        # 0 (부정 확인)
curl -s -o /dev/null -w "%{http_code}\n" https://gnd-one.vercel.app/onboarding/hero.webp
```

---

## 5. ❌ 남은 일 ③ — 릴리스 공지

항목 `2026-08-08-friend-invite-link`가 `release-notes.data.json`에 **이미 있고 DRY RUN까지
끝났다**(대상 5명·제외 1명). 다만 **배치 3·4 내용이 안 들어 있다** — 계정 연결과 온보딩
개편을 항목에 추가한 뒤 발송해야 한다.

⚠️ `/whats-new`는 앱 번들에서 읽으므로 **배포해야 새 항목이 뜬다.**
⚠️ 발송(`--send`)은 **사용자가 지시할 때 사용자가 Run한다** (2026-07-31 규약).

---

## 6. 남은 정리거리 (배포를 막지는 않는다)

| 항목 | 내용 |
|---|---|
| **홈 주간 목표** | 사용자 결정 — *"주간 운동표는 챌린지에서 세팅하는 걸로 하자."* 프로필 편집에서 스테퍼를 뺐는데 홈 `WeeklyStats`([weekly-stats.tsx:45](../../src/components/home/weekly-stats.tsx#L45))가 아직 `N / 3`을 그린다. **아무도 못 바꾸는 숫자를 기준으로 재고 있다.** 챌린지로 옮기거나 홈에서 분모를 빼야 한다 |
| **`pnpm db:snapshot`** | 배치 3·4는 DB를 안 건드렸으므로 0063 시점 그대로 유효 |
| **히어로 레이어 3장** | 포털을 따로 움직이게 하려면. 프롬프트는 문서에 있으나 **지금은 안 쓰기로 했다** |

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

---

## 8. 이번 작업에서 배운 것 (같은 실수 반복 금지)

**"여백처럼 보인다"는 신고를 받으면 CSS보다 자산을 먼저 재라.**
온보딩 히어로 양옆 검은 띠를 CSS 패딩으로 오해해 `w-full` → `-mx-6` → full-bleed로
**세 번 고쳤고 세 번 다 틀렸다.** 실제 원인은 **그림 자체의 좌 8.0% · 우 6.8%가
순검정**이었던 것. 자산을 한 번 재는 데 명령 한 줄이면 됐는데 네 번째에야 했다.

스크린샷 픽셀을 자로 재서 원인을 추정하지 마라. 화면이 축소돼 있어 24px인지 40px인지
구분이 안 된다. DOM을 찍고(`_debug-hero.test.tsx` 같은 임시 테스트) 자산을 재라.
