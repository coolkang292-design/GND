# 카카오톡 공유 미리보기(OG 카드) — 설계

> 2026-09-20 · 사용자 요청: *"GND 챌린지와 GND 초대 링크를 카톡이나 공유를 할 때
> 이미지와 함께 마케팅 문구가 표시되면 좋겠다"*
>
> 구현 전 설계서다. 코드는 아직 한 줄도 안 바꿨다.

---

## 1. 현재 세팅 현황 — OG 태그가 **한 개도 없다** (측정함)

운영에 카카오 스크래퍼 UA로 직접 요청한 결과:

```
$ curl -A "kakaotalk-scrap/1.0" "https://gnd-one.vercel.app/challenge?join=GND-TDQUN"
<title>GND</title>
<meta name="description" content="친구 운동 챌린지 — GND 탈출하자"/>
<meta name="viewport" .../>  <meta name="theme-color" .../>
<meta name="mobile-web-app-capable" .../>  <meta name="apple-mobile-web-app-*" .../>
```

`og:` 로 시작하는 태그 **0개**. 저장소 전체에서도 마찬가지다:

| 찾은 것 | 결과 |
|---|---|
| `grep -rn "openGraph\|og:image\|twitter:\|metadataBase\|generateMetadata\|ImageResponse\|next/og" src` | **0건** |
| `src/app/layout.tsx`의 `metadata` | `title`·`description`·`manifest`·`appleWebApp` 뿐 |
| `opengraph-image.*` 파일 | 없음 |
| `public/`의 OG용 이미지 | 없음 (`icons/`는 PWA 아이콘 192·512뿐) |
| `middleware.ts` | 없음 |

### 왜 사용자가 본 그 카드가 뜨는가

카카오는 **`og:*` 계열만** 읽는다. `<meta name="description">`은 안 본다.

- `og:title` 없음 → `<title>`로 폴백해서 **"GND"**
- `og:description` 없음 → 카카오 기본 문구 **"여기를 눌러 링크를 확인하세요"**
- `og:image` 없음 → **이미지 없는 작은 카드**

두 번째 이미지(Newtake)의 큰 카드는 `og:image` 1장 + `og:title` + `og:description`을
제대로 넣은 결과다. 즉 **지금 없는 것을 넣으면 그대로 된다.**

---

## 2. 초대 링크는 두 종류다

| | 주소 | 만드는 곳 | 공유 방식 |
|---|---|---|---|
| 챌린지 초대 | `/challenge?join=CODE&by=UID` | `lib/domain/challenge-invite.ts:56` | `navigator.share` → 클립보드 (`lib/challenge-share.ts`) |
| 친구(GND) 초대 | `/invite/CODE` | `components/crew-card.tsx:67` | 클립보드만 |

두 링크 다 카톡에 붙여넣으면 지금은 1절의 그 카드가 뜬다.

---

## 3. 구조적 제약 — 두 페이지 다 `"use client"`

Next.js에서 `generateMetadata`는 **서버 컴포넌트에서만** 내보낼 수 있다.

- `src/app/(tabs)/challenge/page.tsx` — `"use client"`, **782줄**,
  `page.test.tsx:103`이 `import ChallengePage from "./page"`
- `src/app/invite/[code]/page.tsx` — `"use client"`, 약 110줄, 테스트도 default import

그리고 레이아웃의 `generateMetadata`는 **`searchParams`를 못 받는다**. 즉
`?join=CODE`별 카드를 `(tabs)/layout.tsx`에서 만드는 길은 없다.

**이 제약이 설계 전체를 결정한다.**

---

## 4. 유리한 조건 (이미 있는 것)

1. **서버에서 DB를 읽을 수 있다.** `src/lib/supabase/admin.ts`의 service_role
   클라이언트가 이미 있고, `SUPABASE_SERVICE_ROLE_KEY`는 `/api/briefing`이 쓰고
   있으므로 **Vercel 런타임에 이미 들어가 있다.**
   → `challenges.invite_code`(0049) · `profiles.invite_code`(0061) 조회에
   **새 마이그레이션이 필요 없다.** (모든 RPC는 `anon`에서 revoke돼 있어 브라우저
   키로는 못 읽는다 — 서버 경로가 유일한 답이다.)
2. **모집 사진이 공개 URL이다.** `recruit_image_url`은 `avatars` **public 버킷**의
   `getPublicUrl` 결과다(`lib/avatar.ts:82`). 인증사진(`workout-images`)과 달리
   서명 URL이 아니라 **만료가 없다** → 카카오 스크래퍼가 그대로 가져간다.
3. **서비스 워커가 방해하지 않는다.** `public/sw.js:11`의 `fetch` 리스너는 빈
   함수다 — 라우트를 가로채거나 캐시하지 않는다.
4. `src/app/` 아래 `c/` 디렉터리가 없다 — 새 경로 충돌 없음.

---

## 5. 사용자 결정 (2026-09-20)

| | 결정 | 근거 |
|---|---|---|
| **D1** 챌린지 링크 | **새 공유 경로 `/c/[code]`** | 782줄짜리 챌린지 탭을 건드리지 않는다. 카톡 인앱 브라우저에서 사진·문구가 보이는 실제 랜딩 화면이 덤으로 생긴다 |
| **D2** OG 이미지 | **정적 1장 먼저, 동적은 나중** | `next/og` 한글 폰트 함정(§7-6)을 피하고 즉시 큰 카드를 얻는다 |
| **D3** 초대자 노출 | **닉네임을 넣는다** — "민수님이 초대했어요" | 전환율. 링크에 이미 `by=<uuid>`가 실려 있다 |

**D1의 대가를 명시한다:** 카톡에 **이미 뿌려진 옛 `?join=` 링크는 미리보기가 안
생긴다.** 동작은 그대로다(참가된다). 필요해지면 §9의 middleware 보강으로 구제한다.

**D3의 경계:** 닉네임까지다. **참가자 목록·아바타·UUID·프로필은 카드에 넣지 않는다.**
링크는 단톡방으로 전달될 수 있고, 카드는 링크를 안 누른 사람에게도 보인다.

---

## 6. 설계

### Phase 0 — 기본 OG (전 페이지 공통)

`src/app/layout.tsx`의 `metadata`에 추가한다.

```ts
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gnd-one.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),   // 없으면 상대 경로 og:image가 절대 URL이 안 된다
  title: "GND",
  description: "친구 운동 챌린지 — GND 탈출하자",
  manifest: "/manifest.webmanifest",
  appleWebApp: { /* 그대로 */ },
  openGraph: {
    type: "website",
    siteName: "GND",
    locale: "ko_KR",
    title: "...",
    description: "...",
    images: [{ url: "/og/default.png", width: 1200, height: 630, alt: "GND" }],
  },
  twitter: { card: "summary_large_image", title: "...", description: "...",
             images: ["/og/default.png"] },
};
```

**이것만으로 앱의 모든 주소가 큰 이미지 카드가 된다.** Phase 1·2가 늦어져도
사용자가 원한 그림은 여기서 대부분 나온다.

### Phase 1 — 친구 초대 `/invite/[code]`

파일이 작아 **서버 래퍼로 전환**한다. 옛 링크까지 전부 살아난다.

```
src/app/invite/[code]/page.tsx          <- 서버 컴포넌트로 교체
     export async function generateMetadata({ params })
     export default async function Page({ params })  -> <InviteClient code={code} />
src/app/invite/[code]/invite-client.tsx <- 현재 본문 그대로 이동 ("use client")
src/app/invite/[code]/page.test.tsx     <- import를 "./invite-client"로
```

`generateMetadata`가 하는 일 (service_role):

1. `profiles.invite_code = CODE` → `nickname` → `"민수님이 GND에 초대했어요"`
2. 없으면 `groups.invite_code = CODE`(옛 코드) → 그룹명
3. 둘 다 없으면 **기본 OG로 폴백** — §7-2 참조

⚠️ 현재 페이지는 `use(params)`로 클라이언트에서 푼다. 서버판은 `await params`다.

### Phase 2 — 챌린지 초대 `/c/[code]`

```
src/app/c/[code]/page.tsx        <- 신규, 서버 컴포넌트
     generateMetadata({ params, searchParams })
         params.code      -> challenges.invite_code -> name · recruit_image_url
         searchParams.by  -> profiles.id            -> nickname   (D3)
     본문 = 모집 사진 + 챌린지 이름 + 마케팅 문구 + [참여하기]
src/app/c/[code]/join-redirect.tsx  <- "use client", 사람은 즉시 /challenge?join= 으로
```

그리고 링크 생성부를 바꾼다 (`lib/domain/challenge-invite.ts:56`):
`/challenge?join=CODE&by=UID` → `/c/CODE?by=UID`

같이 고칠 곳:
- `lib/domain/challenge-invite.test.ts` — `/challenge?join=`을 단언하는 4곳
- `components/challenge/create-challenge-flow.test.tsx:71` — 목 URL
- `lib/domain/acquisition.ts:78` `landingShape` — **`/c/:code` 마스킹 추가**
  (그 함수 주석이 "새 동적 라우트가 생기면 여기에 추가하라"고 이미 경고한다.
  빠뜨리면 남의 초대 코드가 통계에 그대로 쌓인다)

⚠️ **`/challenge?join=`은 지우지 않는다.** `challenge/page.tsx:219`의 처리 로직도
그대로 둔다. `/c/[code]`는 결국 그 주소로 보내므로 **참가 경로는 여전히 한 벌이다.**

### OG 이미지 스펙 (D2 정적)

| | 값 |
|---|---|
| 크기 | **1200 × 630** (1.91:1) — 카카오·페이스북·트위터 큰 카드 공통 안전값 |
| 형식 | PNG 또는 JPG (**WebP는 쓰지 않는다** — 스크래퍼 호환) |
| 용량 | **300KB 이하** 권장 (스크래퍼 타임아웃 대비) |
| 파일 | `public/og/default.png` · `public/og/challenge.png` · `public/og/invite.png` |
| 문구 | 두 번째 이미지처럼 **이미지에 구워 넣는다** |

제작은 사용자와 협의한다. 기존 `public/challenge-assets/*.webp`를 OG 규격으로
재가공하는 길도 있다.

---

## 7. 함정 (실패하면 여기서 실패한다)

1. **`metadataBase`를 빼먹으면** 상대 경로 `og:image`가 절대 URL이 되지 않아
   카카오가 이미지를 못 가져간다.
2. **`generateMetadata`에서 throw 금지.** 코드가 틀렸거나 DB가 흔들려 500이 나면
   스크래퍼는 **카드를 통째로 안 만든다.** 조회는 전부 try/catch → 기본 OG 폴백.
3. ⚠️⚠️ **`/c/[code]`에서 서버 `redirect()`를 쓰면 안 된다.**
   서버가 307을 주면 스크래퍼가 `/challenge?join=`으로 따라가는데 **거기엔 OG가
   없다** → 카드가 깨진다. 이동은 반드시 **클라이언트**(`router.replace`)로 한다.
   스크래퍼는 JS를 안 돌리므로 OG 태그만 보고 간다.
4. **카카오 OG 캐시.** 한 번 긁은 URL의 미리보기는 캐시된다. 태그를 고쳐도 **이미
   뿌려진 링크는 옛 카드 그대로**다. 카카오 개발자 도구의 캐시 초기화가 필요하다
   (도구 주소는 배포 단계에서 확인 — **`[미검증]`**).
   → 새로 만드는 `/c/CODE`는 새 URL이라 이 문제를 안 탄다.
5. **service_role의 반환 필드를 제한한다.** 챌린지는 `name`·`recruit_image_url`만,
   초대자는 `nickname`만. `select("*")` 금지. `admin.ts`에 `import "server-only"`가
   있어 클라 번들 유출은 이미 막혀 있다.
6. **(Phase 3) `next/og` 한글 폰트.** 이 앱은 웹폰트가 없고 `system-ui`만 쓴다
   (`globals.css:42`). `ImageResponse` 기본 폰트에 한글이 없어 **폰트 파일
   (TTF/OTF — WOFF2 불가)을 넘기지 않으면 전부 두부로 나온다.**
7. **`whats-new`·`privacy` 등 다른 페이지**는 Phase 0의 기본 OG를 그대로 물려받는다.
   개별 지정은 이번 범위 밖.

---

## 8. 검증 계획 — ⚠️ **localhost에서는 검증이 불가능하다**

전역 지침은 "개발 서버에서 화면을 눈으로 본다"이지만, **이 기능만은 그게
성립하지 않는다.** 카카오 스크래퍼가 `localhost`를 못 긁는다. 그래서:

| # | 무엇 | 누가 | 무엇이 증거인가 |
|---|---|---|---|
| 1 | `pnpm dev` → `/c/GND-XXXXX` 직접 방문 | 에이전트 | 사진·문구가 보이고 **[참여하기]가 `/challenge?join=`으로 보낸다** |
| 2 | A·B 두 계정으로 **실제 참가까지** (챌린지=사회적 기능) | 에이전트 | B가 링크로 들어가 참가 완료, A에게 참가 알림 |
| 3 | `curl -A "kakaotalk-scrap/1.0" localhost:3000/c/CODE \| grep 'og:'` | 에이전트 | `og:title`·`og:description`·`og:image` 3개가 나온다 |
| 4 | lint · typecheck · test 전량 · build | 에이전트 | 전부 초록 |
| 5 | **Vercel 프리뷰 배포** | 에이전트 | 프리뷰 URL에 3번을 다시 실행 |
| 6 | **카톡 "나에게 보내기"로 링크 전송** | **사용자** | **큰 카드에 이미지 + 문구가 뜨는가** ← 이건 사람 눈밖에 못 본다 |
| 7 | 운영 배포 → 프로덕션 실물 확인 | 승인 후 | |

**6번 없이는 "됐다"고 말하지 않는다.** 3번이 초록이어도 그건 태그가 있다는 것이지
카카오가 어떻게 그리는지가 아니다 — 번들 grep이 화면을 검증하지 못하는 것과 같다.

### ⚠️ 배포 시 주의 — 운영에 안 나간 작업이 이미 있다

`PROGRESS.md` 최상단: 2026-09-18 챌린지 탭 개편(0108~0111)은 **"푸시함 · 배포 안 함"**
상태다. 이 OG 작업을 배포하면 **그 개편도 같이 나간다.** 배포 승인을 받기 전에
사용자에게 이 사실을 먼저 알린다.

---

## 9. 이번 범위 밖 (나중에)

- **옛 `?join=` 링크 구제** — `middleware.ts`에서 스크래퍼 UA일 때만
  `/challenge?join=CODE` → `/c/CODE` rewrite. 사람은 기존 경로 그대로.
  옛 링크 유입이 실제로 관측되면 그때 한다.
- **챌린지별 동적 OG 이미지** — `src/app/c/[code]/opengraph-image.tsx` +
  한글 폰트 파일(§7-6). 모집 사진·이름·참가 인원 합성.
- **`utm_source=kakao` 자동 부착** — 공유 링크에 붙이면 `acquisitionChannel`이
  referrer 추정 대신 확정값을 쓴다(`acquisition.ts`의 주석이 그렇게 권한다).
- 참가 인원·D-day 등 카드 문구의 동적화 (정적 이미지로는 불가).
