# 인수인계 — 친구 초대 링크 · 온보딩 · 계정 지키기 · 단계 표시

작성 2026-08-08 · **2026-08-08 갱신(2차)** · 이어받는 사람이 **처음부터 읽어야 하는 문서**

---

## 0. 30초 요약

사용자 지시 4건에서 시작해 결정이 쌓였다. **배치 1·2는 코드·검증·화면 확인까지 끝났고
배포만 남았다.**

| 배치 | 내용 | 상태 |
|---|---|---|
| **1** | 친구 목록 단계 알약 | ✅ 완료 · 커밋 `35faa13` · **미배포** |
| **2** | 친구 초대 링크 + 챌린지 신입 자동 친구 | ✅ DB · 코드 · 게이트 4종 · 회귀 25/25 · **화면 확인** 전부 완료 · **미배포** |
| **3** | 카카오·구글 계정 연결 | ⬜ 미착수 — 사용자 대시보드 설정 선행 필요 |
| **4** | 온보딩 개편 (시안 + 프로필 편집 시트) | ⬜ 미착수 — 배치 3 의존 |

**지금 당장 할 일:** 사용자 승인 → `vercel --prod` (배치 1·2가 같이 나간다).
그다음 프로덕션 실물 확인. 코드 쪽에 남은 일은 없다.

### 2차 갱신에서 끝낸 것 (2026-08-08)

| 항목 | 결과 |
|---|---|
| 실패 테스트 2건(§4.2) | ✅ 고침 |
| 미작성 테스트(§4.3) | ✅ `src/lib/crew.test.ts`·`src/app/invite/[code]/page.test.tsx` 신규, 온보딩 friend 모드 4건 추가 |
| 0051 회귀 등 서버 단언 | ✅ `challenge-invite-link-check.mjs` **21 → 25 / 0 failed** (rls-test.mjs가 아니다 — §4.3 참조) |
| `lint` · `typecheck` · `test` · `build` | ✅ 전부 초록 (테스트 **1358건**) |
| `pnpm db:snapshot` | ✅ 0063 시점으로 갱신 |
| 0062 `[미검증]` | ✅ **해소** — §7 |
| §4.4 화면 확인 | ✅ **사용자가 직접 확인**(2026-08-08). 에이전트 세션에 브라우저 조작 수단이 없어 표를 넘겨 사람이 눌렀다 |

---

## 1. 읽어야 하는 문서 (순서대로)

| 경로 | 무엇 |
|---|---|
| [`docs/superpowers/specs/2026-08-08-friend-invite-identity-onboarding-design.md`](specs/2026-08-08-friend-invite-identity-onboarding-design.md) | **설계 원본.** 실측 수치·함정·되돌리기까지 전부 여기 있다 |
| [`docs/design-sources/onboarding-hero-prompt.md`](../design-sources/onboarding-hero-prompt.md) | 배치 4 히어로 아트 생성 프롬프트 (자산은 이미 도착) |
| `supabase/migrations/0061~0063` 헤더 | 각 마이그레이션의 이유·함정. **0063 헤더는 반드시 읽어라** (§3.3) |
| `CLAUDE.md` | 개발 서버 확인·배포·픽스처 규약 |

커밋 2개가 설계를 담고 있다: `e2e0d6d`(설계) · `6dcf7eb`(2차 결정 반영).

---

## 2. 사용자 지시·결정 전량 (시간순)

**최초 지시 4건 (2026-08-08):**

1. 친구 초대하기 링크가 친구가 아니라 챌린지 크루로 초대되는 것 같다 — 확인 요청
2. 온보딩 화면을 시안대로 바꾼다 (`어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png`)
3. 처음엔 닉네임만으로 바로 운동하고, 기록 보관은 내정보에서 계정 연동
4. 친구 리스트에 단계(개노답/눈떴개)를 표시

**1차 결정:**

- 초대 링크는 **친구 연결만** 한다 (그룹은 챌린지 만들 때 붙인다)
- 온보딩 히어로는 **문구 없는 아트 1장**, 문구는 HTML
- 계정 연동은 이메일이 아니라 **`linkIdentity`**
- 단계는 **기존 레벨 알약에 합친다**

**2차 결정 (질문에서 파생):**

- *"챌린지 초대로 처음 조인하는 사람이면 친구도 되게 해야 하지 않나"* →
  **신규 가입자만 · 방장 한 사람만** 자동 연결. **A(배치 2)에 합친다**
- *"차라리 온보딩에서 카카오나 네이버로 로그인시키는 방향은?"* →
  **카카오 주버튼 + 닉네임 부버튼**, 제공자는 **카카오 + 구글** (네이버 제외)

**3차 결정 (화면을 보고):**

- 단계 표기 순서를 **`개노답 Lv.2`** 로 (단계명이 앞)
- `오늘 완료` → **`완료`**
- 운동 상태는 지표 줄로, **찌름은 상단(이름 줄)으로**

**⚠️ 설계 검토·실측에서 내가 추가한 것 (사용자 승인 받음):**

- 프로필 편집 시트를 배치 4에 포함 — 없으면 아바타가 전원 `🧔`, 주간목표가 주3회로 영구 고정
- 홈의 `NoCrewCard`("＋ 크루 만들기") 제거
- 장식용 `›` 화살표 제거 (닉네임 마지막 글자 몫)

---

## 3. 완료된 것

### 3.1 배치 1 — 친구 목록 단계 알약 (커밋 `35faa13`, **미배포**)

`src/components/home/friend-board-card.tsx` · 같은 이름 `.test.tsx`

- 알약이 `개노답 Lv.3` (단계명 앞). `row.stageName`이 이미 있어 **DB 조회 추가 0건**
- 상태를 지표 줄 **첫 칸**으로 (3칸 → 4칸, 첫 칸만 `1.25fr`)
- `오늘 완료` → `완료`, 색 점 제거
- 찌름을 **이름 줄**로 (성과 보기 버튼의 형제 — 안에 넣으면 버튼 중첩)
- 장식용 `›` 제거

**왜 이렇게까지 했나 — 375px 실측 (닉네임 온전: 내 행 82px, 친구 81px):**

| 이름 줄 구성 | 내 행 | 친구 행 |
|---|---|---|
| 닉네임+Lv+상태+콕 (변경 전) | 81 | **32** ← 원래도 잘려 있었다 |
| 닉네임+단계+상태+콕 | 46 | **0** ← 닉네임이 사라진다 |
| 닉네임+단계+콕+`›` | 82 | 75 |
| 닉네임+단계+콕 (지금) | 82 | **81** ✅ |

**`[한계]`** 320px에서는 친구 행 닉네임이 29/81px로 잘린다. 375px 이상을 기준으로 잡았다.

검증: 테스트 1342건 통과 · typecheck · lint · build · 개발 서버 375/1280px 실측 · 사용자 확인 완료.

### 3.2 마이그레이션 3개 — **운영 DB 적용 완료** (사용자가 Run, 2026-08-08)

| 파일 | 무엇 | 적용 확인 |
|---|---|---|
| `supabase/migrations/0061_profile_invite_code.sql` | `profiles.invite_code` + `issue_my_invite_code()` + `accept_friend_invite()` + backfill | ✅ **확인됨** — 프로필 5개 전부 코드 있음, 그룹 코드 충돌 0건, RPC 2개 호출 가능 |
| `supabase/migrations/0062_challenge_room_autogroup.sql` | `create_challenge_room`이 그룹 없으면 개인 그룹 자동 생성 | 🟡 **`[미검증]`** — 함수 본문은 REST로 못 본다. §7의 SQL을 SQL Editor에서 돌려 확인할 것 |
| `supabase/migrations/0063_newcomer_challenge_crew_link.sql` | `join_challenge_as_newcomer()` — 신입만·방장만 | ✅ **확인됨** — RPC 호출 가능 |

실측된 초대 코드 (화면에서 눈으로 대조할 값):

```
GND-7FDVC  dev-테스터A
GND-K2H5M  dev-테스터B
GND-TMSD3  낭만송곳니
GND-FUGBY  스칼레또
GND-23YWV  오뎅끼데스까
```

⚠️ **`pnpm db:snapshot`을 아직 안 돌렸다.** `docs/db-current-schema.sql`이 0060 시점이므로
다음 사람이 함수 정의를 그 파일에서 찾으면 옛 것을 본다. **먼저 갱신하라.**

### 3.3 ⚠️⚠️ 0063을 손대기 전에 반드시 알아야 할 것

`join_challenge_as_newcomer`가 하는 일은 **2026-07-31에 사용자가 신고해서 `0051`이 지운
기능(`D5`)과 겉모습이 같다.** 0051 헤더 인용:

> 사용자 신고 (2026-07-31): "리얼GND에 형이라는 아이디가 포함됨. 저 아이디는 다른 챌린지
> 멤버인데." → "각각의 챌린지별로 크루원을 따로 묶어야지, 기존 챌린지에 다른 챌린지
> 팀원을 묶으면 안 되지."

`D5`는 링크 참가자 **전원**을 `crew_links`로 묶었다. 0063은 **신규 가입자만**(`crew_links`
0건 + `challenge_participants` 0건), **방장 한 사람만** 묶는다. 신규는 정의상 다른 챌린지에
있을 수 없으므로 그때의 실패가 구조적으로 발생하지 않는다.

**가드가 이 설계의 본체다. 가드를 지우면 그 순간 D5가 된다.**
회귀 단언: *"이미 다른 챌린지에 있는 계정이 같은 링크로 참가하면 방장의 크루 수가
그대로다."* — 이게 깨지면 D5가 되살아난 것이다. (§4의 남은 일에 포함)

---

## 4. 🟡 배치 2 — 코드는 끝났고 **화면 확인만 남았다**

### 4.1 워킹 트리에 있는 파일 (아직 커밋 안 됨)

```
M src/lib/crew.ts                        issueMyInviteCode · acceptFriendInvite ·
                                         isNotFriendCode · redeemInviteCode(2단계 진입점)
M src/lib/challenge.ts                   joinChallengeAsNewcomer · isNotNewcomer ·
                                         saveOnboardingNotice / takeOnboardingNotice
M src/app/invite/[code]/page.tsx         redeemInviteCode 사용 · self_invite 문구
M src/components/crew-card.tsx           개인 코드 사용 · groups 조회 제거 · NoCrewCard 삭제
M src/components/crew-card.test.tsx      위에 맞춰 갱신 (12건 통과)
M src/app/onboarding/page.tsx            챌린지 신입 경로 · 친구 코드 경로 · done 화면 friend 모드
M src/app/(tabs)/challenge/page.tsx      takeOnboardingNotice → showToast
M src/components/challenge/invite-sheet.tsx  "서로 크루가 되지 않아요"에 조건절 추가
M src/lib/crew.test.ts                    🆕 redeemInviteCode 2단계 폴백 (6건)
M src/app/invite/[code]/page.test.tsx     🆕 링크 진입 4갈래 (4건)
M scripts/challenge-invite-link-check.mjs 0061~0063 회귀 단언 (21 → 25)
M docs/db-current-schema.sql              0063 시점으로 갱신
M CLAUDE.md                               회귀 기준선 표에 25/0 추가
```

마이그레이션 `0061`~`0063`은 **이미 커밋돼 있다**(`87f184f`) — 워킹 트리에 없다.

`lint` ✅ / `typecheck` ✅ / `test` **1358건 통과** ✅ / `build` ✅

### 4.2 ✅ 실패 테스트 2건 — 해결됨

**① `src/app/onboarding/page.test.tsx`** — `joinChallengeAsNewcomer`·`isNotNewcomer`·
`saveOnboardingNotice` 목을 넣고 **두 갈래를 각각 단언**으로 나눴다.

- `신입은 방장과 친구까지 맺고 챌린지 화면으로 이동한다` — `saveOnboardingNotice`에
  **방장 닉네임이 들어가는지**까지 본다. 폴백은 안 불려야 한다(두 번 참가 금지)
- `신입이 아니면 joinChallengeWithCode로 폴백해 참가는 시킨다` — 이게 없으면
  기존 사용자가 챌린지 링크로 아예 못 들어온다(§8-4)
- `참가 실패 시…` — `invalid_code`는 **폴백하지 않는다**고 단언한다. `isNotNewcomer`
  목을 `true` 고정이 아니라 **실제 구현과 같은 판정**으로 뒀기 때문에 잡힌다

**② `src/components/challenge/invite-sheet.test.tsx`** — 태그를 걷어낸 뒤
`/이미 GND를 쓰는 사람[^.]*서로 크루가 되지 않아요/`와
`/GND가 처음인 사람[^.]*나와 친구가 돼요/`로 **조건 → 결과 순서**를 잰다.
조건절을 빼고 옛 단정문으로 되돌리면 두 정규식이 모두 깨진다.

### 4.3 ✅ 새로 쓴 테스트

**클라이언트 (vitest):**

| 파일 | 단언 |
|---|---|
| `src/lib/crew.test.ts` 🆕 | 친구 코드 성공 · `alreadyFriends` 전달 · `invalid_friend_code`면 그룹 폴백 · **`self_invite`는 폴백하지 않는다** · 둘 다 실패하면 그룹 오류 |
| `src/app/invite/[code]/page.test.tsx` 🆕 | 프로필 없으면 보관 후 온보딩(redeem 안 부름) · 있으면 정규화해 redeem → `/home` · `self_invite` 문구 · 없는 코드 문구 |
| `src/app/onboarding/page.test.tsx` | friend done 화면이 닉네임을 말하고 **크루 이름을 말하지 않는다** · `이미 친구예요` · 옛 그룹 코드는 `크루 참여 완료!` · 죽은 코드는 `join` 화면으로 |

⚠️ `/invite/[code]`는 Next 16이 `params`를 Promise로 준다. 테스트는 **이미 이행된
thenable**(`status: "fulfilled"`)을 넘겨 서스펜스 재시도 타이밍을 안 탄다. 그냥
`Promise.resolve(...)`를 넘기면 서스펜스 fallback에서 멈춰 4건이 전부 실패한다.

**서버 (실 DB) — `scripts/challenge-invite-link-check.mjs`, `25/25 passed`:**

⚠️ **`rls-test.mjs`가 아니다.** 초대 링크 계약이 이미 이 파일에 있고(코드 발급·참가·
경계), D5 단언("링크 참가 후 `crew_links`가 생기지 않는다")도 여기 있다. 갈라 놓으면
다음 사람이 한쪽만 본다. `rls-test.mjs` 기준선 128은 안 건드렸다.

| 단언 | 잡는 것 |
|---|---|
| 🎯 신입이 링크로 참가하면 방장과 친구가 된다 (`crewLinked=1`·`hostId` 일치) | 신입 경로 |
| 방장의 `get_my_crew()`에 그 신입이 **1명**으로 보인다 | 0이 아니라 1 |
| 🎯 이미 친구가 있는 사람은 `not_newcomer` | **crew_links 가드** (참가 0건 계정으로 격리) |
| 🎯 이미 챌린지에 있는 계정은 `not_newcomer` | **participants 가드** (crew 0건 계정으로 격리) |
| 🎯 **0051 회귀**: 위 둘이 눌러도 방장 크루가 **1 그대로** | D5 재발 |
| 🎯 참가가 `invalid_status`면 `crew_links`도 안 남는다 | **원자성** — 방장 크루 1을 같이 재서 "0이라 통과"를 막았다 |
| 🎯 그룹 없는 계정이 챌린지를 만든다 + `group_members` 1행 | 0062 |

픽스처가 3계정 늘어 `start_challenge`의 `kpi_incomplete`를 피하려면 신입에게도
목표·동의를 넣어야 한다 — 그 줄을 지우면 시작 단언이 통째로 죽는다(주석 있음).

### 4.4 ✅ 화면 확인 — **픽스처 A·B 두 계정** (2026-08-08 사용자가 직접 확인)

⚠️ **이 표를 지우지 마라.** 배치 3·4에서 온보딩과 초대 경로를 또 건드리므로 같은 표를
다시 쓰게 된다. 에이전트 세션에 브라우저 자동화가 없으면 이 표를 그대로 사용자에게
넘기고 **답을 기다린다** — 배포한 뒤 폰에서 확인하는 것으로 미루지 않는다(`CLAUDE.md` 최상단).

사회적 기능이므로 한 계정으로는 절반만 본 것이다 (`CLAUDE.md` §사회적 기능).

```bash
node scripts/dev-fixture.mjs status
```

- **크롬 = A**(`dev-fixture-a@gnd.local`) · **엣지 = B**(`dev-fixture-b@gnd.local`)
- 비밀번호는 `.env.local`의 `DEV_FIXTURE_PASSWORD`
- 실측 코드 (2026-08-08): **A `GND-7FDVC`** · **B `GND-K2H5M`** ·
  옛 그룹 코드 `GND-3Y7J5`(개발 확인용 크루 — A·B 둘 다 멤버) · `GND-U2X6G`(리얼GND)
- A와 B는 **이미 서로 친구다**(`crew_links` 1행). 그래서 A 링크를 B가 열면
  `이미 친구예요`가 맞다 — 새로 친구가 되는 것을 보려면 **시크릿 창의 새 계정**으로 연다
- ⚠️ **같은 브라우저의 새 탭·창으로는 안 된다** — `@supabase/ssr`이 세션을 쿠키에 넣어
  프로필 단위로 공유된다. 나중에 로그인한 계정으로 양쪽이 덮인다
- 두 창이 갈렸는지는 **⚙️ → 계정의 로그인 이메일**로 확인한다

**확인 목록:**

| 조작 | 기대 |
|---|---|
| A 홈의 친구 초대 카드 | 코드가 **`GND-7FDVC`**(A의 개인 코드)다. 옛 그룹 코드(`GND-3Y7J5`)가 아니다 |
| A 홈 | `＋ 크루 만들기` / `초대 코드로 참여` 카드가 **없다** (부정 확인) |
| 시크릿 창에서 `/invite/GND-7FDVC` | 온보딩 → 닉네임 저장 → **`친구가 됐어요!` + A 닉네임** → 홈 |
| 그 뒤 **A 화면** | 친구 목록에 새 사람이 **실제로 렌더된다** (숫자를 센다) · 알림 벨에 `크루가 됐어요` |
| A가 자기 링크를 누름 | `내 초대 링크예요. 친구에게 보내 주세요` |
| 옛 그룹 코드로 `/invite/<그룹코드>` | 여전히 **그룹 합류**로 끝난다 (하위 호환) |
| A가 챌린지 만들기 (그룹 있음) | 정상 |
| 그룹 없는 새 계정이 챌린지 만들기 | **`no_group_yet` 토스트가 안 뜬다** (0062) |
| 새 계정이 챌린지 링크로 참가 | 참가 + **방장과 친구** + 챌린지 화면에 토스트 한 줄 |
| **B(기존 사용자)가 같은 챌린지 링크로 참가** | 참가는 되고 **친구는 안 된다** ← 0051 회귀 방지 |

### 4.5 커밋 뒤에 할 것

1. ~~`pnpm db:snapshot`~~ ✅ 했다 — 함수 72개·정책 70개·인덱스 77개, 0061~0063 전부 들어갔다
2. ~~회귀 기준선 갱신~~ ✅ 했다 — `CLAUDE.md`에 `challenge-invite-link-check.mjs` **25 / 0** 추가.
   `rls-test.mjs`는 128 그대로(안 건드렸다)
3. ~~설계 §8 배치 표~~ ✅ 반영했다
4. 배포는 **사용자 승인 후** `vercel --prod` (배치 1 커밋도 아직 미배포다 — 같이 나간다).
   ⚠️ Vercel이 커밋 이메일을 매칭 못 해 Blocked가 나므로 **`git archive HEAD`로 푼
   `.git` 없는 폴더**에서 배포한다

---

## 5. ⬜ 배치 3 — 카카오·구글 계정 연결 (미착수)

**막는 것: 사용자가 대시보드 설정을 먼저 해야 한다.** 설계 §5.3의 7단계:

1. Kakao Developers 앱 생성 → 카카오 로그인 활성화
2. Redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` 등록
3. Supabase → Auth → Providers → **Kakao** 활성화 + 키 입력
4. Google Cloud OAuth 클라이언트 발급 (같은 Redirect URI)
5. Supabase → Auth → Providers → **Google** 활성화
6. Supabase → Auth → **Manual linking 허용** ← 없으면 `linkIdentity`가 막힌다
7. Redirect URLs에 `http://localhost:3000/auth/callback` · `https://gnd-one.vercel.app/auth/callback`

**왜 이메일이 아니라 OAuth인가 — 2026-08-08 실측:**

| 호출 | 결과 |
|---|---|
| `updateUser({ email, password })` | 400 `Email address "" is invalid` |
| `updateUser({ email })` | **429 `over_email_send_rate_limit`** |
| 원시 `PUT /auth/v1/user` | **429 `over_email_send_rate_limit`** |

서버는 요청을 받아들이고 **확인 메일 발송에서 실패**한다. 막힌 것은 코드가 아니라
Supabase 내장 메일 발송기의 한도다. 그래서 메일을 한 통도 안 쓰는 경로로 간다.

**⚠️ 온보딩에서도 `signInWithOAuth`가 아니라 `linkIdentity`다.** `AuthProvider`가 이미
익명 세션을 발급해 뒀으므로(`auth-provider.tsx:104`) 전자를 쓰면 user id가 갈린다.
`/login`만 예외 — 그 화면은 익명 세션을 만들지 않는다.
부수 확인: **`is_anonymous`에 걸린 RLS가 하나도 없다**(전량 grep) — 승격이 권한을 안 바꾼다.

앱 작업 목록은 설계 §5.4에 파일별로 있다.

---

## 6. ⬜ 배치 4 — 온보딩 개편 (미착수, 배치 3 의존)

**자산은 이미 도착·검수 완료:**

| 원본 | 규격 | 반영 위치 |
|---|---|---|
| `어플 UI 이미지/온보딩 히어로.png` | 941×1672 RGB, 검정 배경, 문구 없음 | `public/onboarding/hero.webp` |
| `어플 UI 이미지/방패체크.png` | 1024×1024 **RGBA(투명)** | `public/ui-icons/shield-check.webp` |

`shield-check`는 `UI_ICONS` 카탈로그에 키를 추가해야 한다 — `ui-icons.test.ts`가 카탈로그와
파일의 일치를 단언하므로 파일만 넣으면 테스트가 실패한다.

**⚠️ 프로필 편집 시트를 같은 배치에 넣어라.** 온보딩에서 이모지·주간목표를 빼는데
`upsertMyProfile`을 부르는 곳이 **온보딩 한 곳뿐**이고 `/profile`에 편집 자리가 없다.
그대로 빼면 `avatar_url`(12곳에 렌더)이 전원 `🧔`로, `weekly_goal`이 주3회로 영구 고정되고
홈 `WeeklyStats`가 틀린 기준으로 잰다. 자세한 것은 설계 §4.3.

화면 구성(모드 1/2)은 설계 §4.2에 있다. 판정은 쿼리스트링이 아니라 **연결된 신원의 존재
여부**로 한다.

---

## 7. 남은 확인 · 미검증 항목

| 항목 | 상태 | 근거 |
|---|---|---|
| 0062 함수 본문 | ✅ **해소** | 아래 두 가지 |
| `docs/db-current-schema.sql` | ✅ 0063 시점 | `pnpm db:snapshot` |
| 배치 2 화면 | ❌ **미확인** | §4.4 — 사람이 눌러야 한다 |
| 배치 1·2 배포 | ❌ 미배포 | 사용자 승인 후 `vercel --prod` |

**0062가 해소된 근거 (SQL Editor를 안 거쳤다):**

1. **동작으로** — `challenge-invite-link-check.mjs`의 새 단언 2건. 그룹이 하나도 없는
   계정이 `create_challenge_room`을 불러 **성공**했고 `group_members`에 정확히 1행이
   생겼다. 옛 동작이었으면 `no_group_yet`으로 400이 났다
2. **본문으로** — `pnpm db:snapshot`이 받아 온 `docs/db-current-schema.sql`
   [944행](../db-current-schema.sql)에 `-- 0062: 옛 동작은 여기서 raise exception
   'no_group_yet'이었다`가 있고, 그 아래가 `insert into groups … '내 크루'`다.
   **`raise exception 'no_group_yet'`은 파일에 한 줄도 없다**(주석 안의 인용뿐)

REST로 함수 본문을 못 본다던 제약은 스냅샷 스크립트가 이미 뚫어 놓은 길이었다.

---

## 8. 절대 하지 말 것

1. **0063의 신입 가드를 지우거나 완화하지 마라.** §3.3. 지우면 2026-07-31 사고가 재발한다
2. **`challenges.group_id`를 드롭하지 마라.** RLS 정책 2개(스냅샷 2657·2659)와
   `record_views` 집계(2578)가 쓴다
3. **`redeemInviteCode`의 2단계 로직을 호출부에 복사하지 마라.** 갈라진다 —
   이 저장소는 같은 실수로 `start_challenge`를 세 번 고쳤다
4. **`join_challenge_as_newcomer`의 폴백(`isNotNewcomer` → `joinChallengeWithCode`)을
   빼지 마라.** 기존 사용자가 챌린지 링크로 못 들어간다
5. **친구 목록 이름 줄에 요소를 더하지 마라.** 실측표가 §3.1에 있다. 더하면 닉네임이 사라진다
6. **적용된 마이그레이션(0001~0063)을 수정하지 마라.** 새 번호 파일을 만든다
7. **화면 확인 없이 배포하지 마라.** 자동 테스트·build는 "화면이 어떻게 보이는가"를
   하나도 검증하지 않는다 (`CLAUDE.md` 최상단)
