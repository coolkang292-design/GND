# 인수인계 — 카카오톡 공유 미리보기(OG 카드) (2026-09-20)

설계서: `docs/superpowers/specs/2026-09-20-kakao-share-og-preview-design.md`

---

## 0. 먼저 이것부터 (30초)

- **마이그레이션 없다.** DB 스키마는 한 줄도 안 바뀌었다. 조회만 한다
- **게이트 전량 초록**: lint 0 오류 · typecheck OK · 테스트 **3714건 전량 통과**(212파일) · build OK
- **✅ 운영 배포 완료 (2026-09-20)** — `gnd-kgmz9kxr6-gnd4.vercel.app` → `gnd-one.vercel.app`.
  운영 실물 검증까지 끝냈다(§4). **이 배포로 2026-09-18 챌린지 탭 개편(0108~0111)도
  함께 나갔다** — 그쪽은 "푸시함·배포 안 함" 상태였다
- **⛔ 카카오톡 카드 실물은 사람 눈으로만 볼 수 있다.** 운영 초대 링크를
  "나에게 보내기"로 보내 확인해야 한다. §4-2

---

## 1. 무엇을 고쳤나

2026-09-20 운영 실측: 초대 링크를 카톡에 붙이면 이미지도 설명도 없는 회색 줄
하나가 떴다. 원인은 단순했다 — **`og:` 태그가 한 개도 없었다.**

```
$ curl -A "kakaotalk-scrap/1.0" "https://gnd-one.vercel.app/challenge?join=GND-TDQUN"
<title>GND</title>
<meta name="description" content="친구 운동 챌린지 — GND 탈출하자"/>
(og:* 0개)
```

카카오는 **`og:*` 계열만 읽는다.** `name="description"`은 안 본다 — 그게 있는데도
카카오 기본 문구 "여기를 눌러 링크를 확인하세요"가 떴던 이유다.

### 사용자 결정 (2026-09-20)

| | 결정 |
|---|---|
| **D1** 챌린지 링크 | **새 공유 경로 `/c/[code]`**. 782줄짜리 챌린지 탭을 안 건드린다 |
| **D2** OG 이미지 | 정적 이미지. **사용자가 직접 디자인해 주었다**(§2 참조) |
| **D3** 초대자 노출 | 닉네임까지. 참가자 목록·아바타·UUID는 **안 넣는다** |

---

## 2. 지금 상태 — 코드

### 새로 생긴 것

| 파일 | 하는 일 |
|---|---|
| `src/lib/domain/share-meta.ts` | 카드 문구·그림 경로·규격. **순수 함수만** |
| `src/lib/site-url.ts` | `metadataBase`가 쓸 절대 주소. 프리뷰(`VERCEL_URL`)도 본다 |
| `src/lib/share-lookup.ts` | service_role 조회. **서버 전용, 절대 던지지 않는다** |
| `src/app/c/[code]/page.tsx` | 챌린지 초대 공유 경로 (서버 컴포넌트) |
| `src/app/c/[code]/join-redirect.tsx` | 사람만 `/challenge?join=`으로 옮긴다 (클라이언트) |
| `src/app/invite/[code]/invite-client.tsx` | 옛 `page.tsx` 본문 그대로 이동 |
| `public/og/{default,challenge,invite}.jpg` | **사용자 제작** 1200×630 (157~172KB) |
| `src/lib/domain/share-meta.test.ts` | 문구 규칙 (14건) |
| `src/lib/invite-url-usage.test.ts` | **주소를 손으로 조립하는 것을 막는 가드** (§3) |

### 고친 것

| 파일 | 무엇 |
|---|---|
| `src/app/layout.tsx` | `metadataBase` + `openGraph` + `twitter` 추가 |
| `src/app/invite/[code]/page.tsx` | 서버 컴포넌트로 전환 + `generateMetadata` |
| `src/lib/domain/challenge-invite.ts` | `challengeInviteUrl` → `/c/[code]`, `challengeJoinPath` 신설 |
| `src/components/challenge/invite-sheet.tsx` | **손으로 조립하던 주소를 `challengeInviteUrl`로** (§3) |
| `src/lib/challenge.ts` | `pendingChallengeInvitePath`가 `challengeJoinPath`에 위임 |
| `src/lib/domain/acquisition.ts` | `landingShape`에 `/c/:code` 마스킹 |
| `.gitignore` | `/카톡 공유 이미지/` (디자인 원본은 안 올린다) |

### 이미지는 사용자 제작본이다

원본 폴더 `카톡 공유 이미지/`(gitignore 대상)에서 `public/og/`로 복사했다.
**교체할 때 파일 이름·확장자를 그대로 유지하라** — 바꾸면 `share-meta.ts`의
`OG_IMAGES`도 같이 고쳐야 한다.

세션 초반에 `next/og`로 임시 카드를 구웠다가 사용자 이미지가 오면서 **스크립트와
임시 PNG를 지웠다.** 런타임은 정적 JPG를 서빙만 한다 — 한글 폰트도, 합성도 없다.

---

## 3. ⛔ 건드리면 안 되는 것

### 3-1. `/challenge?join=`을 없애지 마라

카카오톡에 **이미 뿌려진 링크**가 그 모양이다. 미리보기는 안 뜨지만 **동작은
해야 한다.** `/c/[code]`도 결국 그 주소로 사람을 보낸다 — 참가 로직은 한 벌이다.

### 3-2. `/c/[code]`에서 서버 `redirect()`를 쓰지 마라

서버가 307을 주면 스크래퍼가 `/challenge?join=`으로 따라가는데 **거기엔 og 태그가
없다** → 카드가 깨진다. 이 경로가 존재하는 이유를 리다이렉트가 무효로 만든다.
이동은 반드시 클라이언트(`JoinRedirect`)로 한다.

### 3-3. `generateMetadata`에서 던지지 마라

500이 나면 스크래퍼는 **카드를 통째로 안 만든다.** `share-lookup.ts`의 세 함수는
무슨 일이 있어도 `null`을 준다. 없는 코드로 요청해도 **HTTP 200 + 기본 카드**가
나오는 것을 확인했다(§4).

### 3-4. 주소를 손으로 조립하지 마라 — **이 작업에서 실제로 물렸다**

`challengeInviteUrl`을 `/c/[code]`로 바꿔 놓고 배포 직전에야
`invite-sheet.tsx:252`가 주소를 **따로 조립하고 있는 것**을 찾았다. 그대로
나갔으면 "초대 링크 복사하기" 버튼으로 만든 링크만 미리보기가 없었을 것이다 —
그리고 그건 **참가자가 쓰는 유일한 초대 경로**다(0091).

lint·typecheck·테스트 3711건이 전부 초록인 채로 지나갔다. **옛 주소가 여전히
동작하기 때문이다**(참가는 된다). 깨지는 것은 미리보기뿐이라 화면으로도 안 보인다.

그래서 `src/lib/invite-url-usage.test.ts`가 소스를 훑어 막는다.
**그 가드가 실제로 이 버그를 잡는지 되돌려서 확인했다** — 옛 코드로 되돌리니
`invite-sheet.tsx`를 지목하며 실패했고, 복구하니 통과했다.

---

## 4. 검증 기록 (2026-09-20)

### ✅ 확인한 것 — 개발 서버 + 카카오 스크래퍼 UA

`pnpm dev` + 운영 Supabase의 **실제 초대 코드**로 확인했다.

| 무엇 | 결과 |
|---|---|
| `/c/GND-7TEXC?by=<헬스장주주 id>` | `og:title` = **"헬스장주주님이 30일 아침운동에 초대했어요"** — 닉네임·챌린지 이름이 DB에서 실제로 실렸다 |
| 같은 응답 | `og:image` = `https://…/og/challenge.jpg` **절대 URL** · `og:image:width/height` 1200/630 · `twitter:card` = `summary_large_image` |
| `/invite/GND-TMSD3` | `og:title` = **"낭만송곳니님이 GND 친구로 초대했어요"** · 그림은 `/og/invite.jpg` |
| `/` (기본) | `og:title` = "GND — 친구 운동 챌린지" · `/og/default.jpg` |
| `/c/GND-WP8G9` (초대자 없음) | **"30일아침 운동 챌린지, 같이 할래?"** — 폴백이 문장이 된다 |
| `/c/GND-NOPE1` (없는 코드) | **HTTP 200** + "운동 챌린지에 초대받았어요". 500이 아니다 |
| `/og/*.jpg` 3장 | HTTP 200 · `image/jpeg` · 161·172·163KB (상한 300KB 이내) |
| `/c/[code]`의 `<a>` | `href="/challenge?join=GND-7TEXC&by=…"` — JS 없는 탈출구가 `by`까지 나른다 |
| `/challenge?join=GND-7TEXC` | **HTTP 200** — 옛 링크가 산다 |
| build 라우트 표 | `/c/[code]`·`/invite/[code]` = ƒ(동적), **`/challenge` = ○(정적 그대로)** — 챌린지 탭 무손상 |

### ✅ 운영 배포 후 실물 검증 (2026-09-20, `https://gnd-one.vercel.app`)

배포 명령이 성공한 것은 증거가 아니다. 운영에서 직접 받아 확인했다.

| 무엇 | 결과 |
|---|---|
| `/c/GND-7TEXC?by=…` | `og:title` **"헬스장주주님이 30일 아침운동에 초대했어요"** — 개인화가 운영에서도 실렸다 |
| `/invite/GND-TMSD3` | **"낭만송곳니님이 GND 친구로 초대했어요"** |
| `/` | "GND — 친구 운동 챌린지" |
| `/og/{default,challenge,invite}.jpg` | 전부 **HTTP 200 · image/jpeg** · **161,213 / 172,340 / 163,731 bytes** — 원본과 바이트 일치 |
| `og:image` 호스트 | `https://gnd-one.vercel.app/...` — 운영 별칭을 가리킨다 |
| `/c/GND-NOPE1` (없는 코드) | **HTTP 200 + 폴백 카드**. 500이 아니다 |
| `/challenge?join=GND-7TEXC` | **HTTP 200** — 옛 링크 생존 |

#### 프리뷰에서 배운 것 (기록해 둔다)

프리뷰 배포(`gnd-k4rrh99gb`)에서는 카드가 **폴백 문구**로 나왔다. 원인은 코드가 아니라
**`SUPABASE_SERVICE_ROLE_KEY`가 Production 환경에만 있고 Preview에는 없는 것**이다
(`vercel env ls`로 확인 — Preview엔 `NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY` 둘뿐).

⚠️ 그래서 **프리뷰로는 카드 개인화를 검증할 수 없다.** 게다가 프리뷰에는 SSO
Deployment Protection이 걸려 있어 카카오 스크래퍼가 접근 자체를 못 한다
(모든 요청이 `vercel.com/sso-api`로 302). 다음에 프리뷰로 확인하려면 그 키를
Preview에도 넣어야 하고, 카드는 그래도 못 본다.

역설적으로 이게 **§3-3(던지지 않는다)이 실제 배포에서 도는 증거**였다 — 조회가
진짜로 실패했는데 500이 아니라 200 + 폴백 카드가 나왔다.

### ⛔ 확인하지 **못한** 것 — 사용자가 해야 한다

이 세션에는 **브라우저를 조작할 도구가 없었다**(Playwright·chrome MCP 모두 없음).
그래서 아래는 **`[미검증]`이다. "괜찮을 것"으로 넘기지 마라.**

1. **카카오톡 카드 실물** — 사람 눈으로만 볼 수 있다. 이 작업의 **최종 증거가
   이것이다**. 운영 초대 링크를 카톡 "나에게 보내기"로 보내 확인한다.
   ⚠️ **이미 긁힌 주소는 카카오가 카드를 캐시해 둔다.** 루트(`gnd-one.vercel.app`)로
   확인하면 옛 카드가 보일 수 있다 — **새로 만든 `/c/CODE` 링크로** 확인해야 한다
2. `/c/[code]` 화면이 실제로 그려지고 `JoinRedirect`가 참가 경로로 옮기는지
3. A·B 두 계정 링크 초대 전체 흐름 (챌린지는 사회적 기능 — `CLAUDE.md` §사회적 기능)
4. 초대 시트 "초대 링크 복사하기"가 이제 `/c/…`를 복사하는지

배포본이 운영에 나가 있으므로 확인은 운영 링크로 한다.

---

## 5. 남은 일 · 알려진 한계

- **옛 `?join=` 링크는 미리보기가 없다.** D1의 알려진 대가다. 동작은 한다.
  구제하려면 `middleware.ts`에서 스크래퍼 UA만 `/c/`로 rewrite — 옛 링크 유입이
  실제로 관측되면 그때 한다
- **카카오 OG 캐시** — 한 번 긁은 URL은 미리보기가 캐시된다. 새로 만드는
  `/c/CODE`는 새 주소라 영향이 없지만, 운영 `/`를 다시 긁게 하려면 카카오
  개발자 도구의 캐시 초기화가 필요하다 (도구 주소 **`[미검증]`**)
- **챌린지별 동적 이미지**(모집 사진 합성)는 안 했다. `next/og` 런타임 합성은
  한글 폰트 파일이 필요하다 — 설계서 §7-6
- `utm_source=kakao` 자동 부착은 범위 밖. 붙이면 `acquisitionChannel`이 referrer
  추정 대신 확정값을 쓴다
