# 친구 초대 링크 · 온보딩 · 계정 지키기 · 단계 표시 (설계)

작성 2026-08-08 · 방법론 `first-principles` + `brainstorming` · 마이그레이션 **2개**

사용자 지시 4건:

1. **친구 초대하기 링크가 친구가 아니라 챌린지 크루로 초대되는 것 같다** — 확인 요청
2. **온보딩 화면을 시안대로** 바꾼다 (`어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png`)
3. 처음엔 닉네임만으로 바로 운동하고, **기록 보관은 내정보에서 계정 연동**으로 세팅
4. **친구 리스트에 단계**(개노답·눈떴개 …)를 표시

사용자 확정 4건 (2026-08-08):

- 초대 링크는 **친구 연결만** 한다 (그룹은 챌린지를 만들 때 붙인다)
- 온보딩 히어로는 **문구 없는 아트 1장**을 새로 받아 문구는 HTML로 그린다
- 계정 연동은 이메일이 아니라 **구글/카카오 `linkIdentity`**
- 단계는 **기존 레벨 알약에 합친다** — `Lv.2 눈떴개`

---

## 1. 문제의 본질

네 지시는 서로 다른 화면이지만 **뿌리가 둘**이다.

**뿌리 ①: 이 앱에는 "친구"가 두 겹인데 화면이 한 겹처럼 말한다.**

| 층 | 테이블 | 무엇을 성립시키나 |
|---|---|---|
| 친구 그래프 | `crew_links` | 친구 목록·찌르기·성과 비교·서로의 세션 열람(RLS) |
| 그룹 | `groups` · `group_members` | `challenges.group_id`(not null)·챌린지 생성 |

지시 1이 정확히 이 틈이다. 지시 3도 같은 뿌리다 — 익명 계정은 브라우저에만 있고,
그 사실을 카드 문구가 "이메일 가입 없이"라며 장점처럼 팔다가 계정 화면에서는 경고한다.

**뿌리 ②: 온보딩이 시작 전에 세 가지를 묻는다.** 이모지·닉네임·주간목표. 지시 2의 시안과
지시 3("닉네임만으로 바로 운동")은 같은 말을 한다 — **묻는 것을 하나로 줄이고 나머지는
나중에.**

**성공 기준 (측정 가능):**

- 초대 링크를 연 뒤 **초대한 사람의 친구 목록에 그 사람이 보인다** (행 수를 센다)
- 링크로 처음 들어온 사람도 **챌린지를 만들 수 있다** (`no_group_yet` 토스트가 안 뜬다)
- 카톡에 이미 뿌려진 **옛 그룹 코드 링크가 여전히 동작한다** (그룹 합류로)
- 온보딩 첫 화면에 **입력이 닉네임 하나뿐이다** — 이모지 9종·주간목표 스테퍼가 **없다**(부정 확인)
- `/account`에서 구글을 연결하면 **로그인 이메일 자리가 채워지고 로그아웃 버튼이 열린다**
- 친구 목록 각 행에 **`Lv.N 단계명`** 이 보인다

---

## 2. 착수 실측 — 코드·운영 스키마에서 직접 확인

| 확인한 것 | 결과 | 근거 |
|---|---|---|
| 초대 링크가 실제로 하는 일 | `join_group_with_code`가 **`group_members`에만** insert. `crew_links` 미접촉 | `db-current-schema.sql:1600` |
| 친구 목록의 원천 | `get_my_crew()`가 **`crew_links`만** 읽는다 | `db-current-schema.sql` |
| 챌린지 **생성**의 그룹 요구 | 방장이 그룹에 없으면 `no_group_yet`. `challenges.group_id`는 아직 not null | `create_challenge_room` |
| 챌린지 **참가**의 그룹 요구 | **없다.** `join_challenge_with_code`·`invite_to_challenge` 둘 다 그룹을 안 본다 | 두 함수 본문 |
| 익명 계정 자체 이메일 연결 | `updateUser({email})` → **429 `over_email_send_rate_limit`**. 원시 REST도 같다 | 2026-08-08 실측(§5.1) |
| 친구 단계명 | `FriendRow.stageName`이 **이미 계산돼 있다** | `friend-board.ts:212` |
| 코드 생성기 | `generate_invite_code()` = `GND-` + 31자 알파벳 5자 | `db-current-schema.sql:1136` |
| `profiles.invite_code` | **없다** — 새로 만든다 | 스키마 전량 grep |

**⚠️ 그냥 만들었으면 깨졌을 자리 5개**

1. **초대 링크를 친구 연결로 바꾸면 챌린지 생성이 막힌다.** 링크가 그룹에 안 넣으므로,
   링크로 들어온 사람은 그룹이 없고 `create_challenge_room`이 `no_group_yet`으로 거절한다.
   → §3.4에서 **개인 그룹 자동 생성**으로 같이 푼다.
2. **카톡에 이미 뿌려진 링크가 죽는다.** `/invite/[code]`가 친구 코드만 받으면 옛 그룹
   코드 링크가 전부 "잘못된 초대"가 된다. → §3.3 **두 단계 조회**.
3. **코드 형식이 그룹과 같아 모호해진다.** 둘 다 `GND-XXXXX`다. → §3.1에서 발급 시
   `groups.invite_code`와도 대조해 **전역 유일**을 보장한다.
4. **크루 카드가 그룹이 없으면 아예 안 뜬다.** `getMyGroups()`가 비면 `NoCrewCard`로
   갈아타서 **친구 초대를 할 방법이 사라진다**. → §3.5.
5. **`updateUser({email, password})`는 429가 아니라 400 `Email address "" is invalid`를 준다.**
   password를 같이 보내면 GoTrue가 다른 갈래로 빠진다. 이 오류 메시지를 보고 "코드 버그"로
   오진하지 마라 — 근본 원인은 §5.1의 발송 한도다.

---

## 3. A. 친구 초대 링크 — 코드의 주인을 그룹에서 **사람**으로 옮긴다

### 3.1 왜 이 방향인가 (ground truth → 설계)

**Ground truth:** 초대는 *한 사람이 다른 사람을 부르는* 행위다. 그런데 지금 링크에 실린
코드는 `groups.invite_code` — **그룹의 것**이다. 링크가 그룹에 넣는 것은 버그가 아니라
코드 주인이 그룹이기 때문에 생긴 **정확한 결과**다. 문구를 고쳐서는 풀리지 않는다.

**마이그레이션 `0061_profile_invite_code.sql`**

```sql
alter table profiles add column invite_code text unique;

-- 발급: groups.invite_code와도 대조해 전역 유일을 보장한다 (§2 함정 3)
create or replace function issue_my_invite_code() returns text ...
  -- 이미 있으면 그대로 반환(멱등) · 없으면 generate_invite_code() 재시도 루프
  -- 충돌 검사: profiles.invite_code · groups.invite_code 둘 다

-- 기존 프로필 backfill (4명 + 픽스처 2명)
```

`profiles` RLS는 그대로 둔다. 남의 코드를 조회하는 것은 아래 `security definer` RPC 안에서만
일어나므로 정책을 열 필요가 없다.

### 3.2 새 RPC `accept_friend_invite(p_code text)`

`accept_crew_request`(`db-current-schema.sql:60~`)의 검증된 골격을 그대로 따른다.

```
1. auth.uid() 없으면 not_authenticated
2. upper(trim(p_code))로 profiles에서 주인 찾기 → 없으면 invalid_friend_code
3. 주인 = 나면 self_invite
4. pg_advisory_xact_lock(hashtext(least||greatest))     ← 쌍 단위 직렬화
5. crew_links (least, greatest) insert on conflict do nothing   ← 멱등
6. 반대 방향에 남은 pending crew_requests도 accepted로 닫는다
7. notify(주인, 나, 'crew_accepted', null, '<닉>님과 크루가 됐어요 🤝', …)
   begin/exception when others then null  ← 알림 실패가 연결을 되돌리지 않는다
8. return jsonb {ownerId, nickname, alreadyFriends}
```

**요청/수락을 다시 묻지 않는다.** 링크를 보낸 것이 초대 의사이고 링크를 연 것이 수락이다.
`send_crew_request`를 거치게 하면 초대한 사람이 자기가 부른 사람의 요청을 또 수락해야 한다.

4번 advisory lock을 빼면 안 된다 — 서로의 링크를 동시에 열 때 락 순서가 엇갈려 40P01
데드락이 난다(`accept_crew_request`가 같은 이유로 걸어 뒀다).

### 3.3 `/invite/[code]` — 친구 먼저, 그룹은 하위 호환

```
normalizeInviteCode(code)
  → accept_friend_invite(code)
      성공          → /home  ("○○님과 친구가 됐어요")
      invalid_friend_code → joinGroupWithCode(code)   ← 옛 링크 구제
            성공    → /home
            실패    → "존재하지 않는 초대 링크예요"
```

프로필이 없는 신규 사용자는 지금처럼 `savePendingInvite(code)` → `/onboarding`.
온보딩이 닉네임 저장 직후 같은 두 단계를 태운다(§4.3).

### 3.4 챌린지 생성의 그룹 요구 — 개인 그룹 자동 생성

**마이그레이션 `0062_challenge_room_autogroup.sql`** — `create_challenge_room`을 덮어쓴다.

```sql
select gm.group_id into v_group from group_members gm
 where gm.user_id = v_me order by gm.joined_at limit 1;

if v_group is null then
  -- 옛 동작: raise exception 'no_group_yet'
  -- 새 동작: 본인용 그룹을 만들고 그 id를 쓴다
  insert into groups (name, invite_code, owner_id)
  values ('내 크루', generate_invite_code(), v_me) returning id into v_group;
  insert into group_members (group_id, user_id, role) values (v_group, v_me, 'owner');
end if;
```

⚠️ **`challenges.group_id`를 지우려 하지 마라.** `challenges` RLS 정책 두 개가 이 컬럼을
쓴다(`db-current-schema.sql:2657`·`2659`) 그리고 `record_views` 집계도 쓴다(2578). 컬럼을
드롭하는 것은 이 지시의 범위를 훨씬 넘는다. **채워 두는 쪽이 안전하다.**

⚠️ `create_group`을 호출하지 않고 직접 insert하는 이유: `create_group`은 `security definer`가
아니고 `auth.uid()`를 owner로 쓰므로 정의자 함수 안에서 부르면 소유자가 어긋날 수 있다.
같은 파일에 두 개의 진실을 만들지 않도록 **`0062`가 insert를 직접 한다**.

`no_group_yet` 문구는 `challenge/page.tsx:95`에 남겨 둔다 — 옛 클라이언트가 새 RPC를 만나기
전까지의 안전망이고, 지우면 그 사이 사용자에게 원문 오류가 노출된다.

### 3.5 홈 카드 — 이름과 동작이 일치해진다

[crew-card.tsx](../../../src/components/crew-card.tsx)

- 보여주는 코드: `group.invite_code` → **`profile.invite_code`**(`issue_my_invite_code()`로 확보)
- **그룹 유무와 무관하게 카드를 그린다.** 지금은 그룹이 없으면 `NoCrewCard`로 갈아타서
  친구 초대를 아예 못 한다(§2 함정 4)
- **`NoCrewCard`를 지운다.** 그룹은 이제 `0062`가 챌린지 생성 때 자동으로 만들므로
  "＋ 크루 만들기 / 초대 코드로 참여"라는 선택을 사용자에게 물을 이유가 없어졌다.
  친구가 0명일 때의 안내는 친구 목록 카드의 `NoFriendsCard`가 이미 하고 있다 —
  두 카드가 같은 자리에서 같은 말을 하면 홈이 "크루와 함께하면 더 강해져요"와
  "친구와 함께하면 더 강해져요"를 나란히 띄운다
- 옛 그룹 코드로 참여할 길은 `/invite/<code>` 링크와 온보딩 `step="join"`에 남는다 —
  홈에서 코드를 손으로 입력하는 자리만 없어진다
- 상세 접힘 문구를 고친다: "이 크루에 바로 들어와요" → **"바로 친구가 돼요"**.
  "챌린지 초대와는 달라요" 한 줄은 남긴다 — 이제 **참인 문장**이다
- 이메일 문구(`크루장이 대신 붙여 줘요`)는 **C 배치에서** 같이 고친다(§5.5). 지금 고치면
  아직 없는 기능을 안내하게 된다

---

## 4. B. 온보딩 — 시안대로, 닉네임 하나만

### 4.1 자산

| 원본 | 규격 | 반영 위치 |
|---|---|---|
| `어플 UI 이미지/온보딩 히어로.png` | 941×1672 RGB, 검정 배경, 문구 없음 | `public/onboarding/hero.webp` |
| `어플 UI 이미지/방패체크.png` | 1024×1024 **RGBA(투명)** | `public/ui-icons/shield-check.webp` |

프롬프트·검수 항목은 [onboarding-hero-prompt.md](../../design-sources/onboarding-hero-prompt.md).
변환은 기존 아이콘 파이프라인과 같은 방식(webp, 최대폭 제한)으로 한다.

`shield-check`는 `UI_ICONS` 카탈로그에 키를 추가해야 한다 — `ui-icons.test.ts`가 카탈로그와
실제 파일의 일치를 단언하므로, 파일만 넣으면 테스트가 실패한다.

### 4.2 화면 (step=profile)

```
[히어로 아트]                       ← next/image, priority, 폭 100%
운동 안하면 GND 확정. 친구들과 함께 탈출해요.   ← accent, 작게
닉네임만 정하면                      ← 흰색, 크게
바로 시작해요                        ← 골드, 크게
🛡 GND에서 친구들에게 보여질 이름이에요.
   언제든 바꿀 수 있어요.
[ 닉네임 / 예: 스칼레또 ]            ← 라벨이 칸 안에 뜨는 골드 테두리 입력
[ GND 시작하기            → ]        ← 골드 채움
이미 계정이 있나요? 로그인
```

**빠지는 것 (부정 확인 대상):**

- 프로필 이모지 9종 선택 → `avatar_url`은 `AVATARS[0]`(`🧔`)로 저장하고 `/profile`에서 바꾼다
- 주간 운동 목표 스테퍼 → `weekly_goal = 3`으로 저장하고 `/profile`에서 바꾼다
- `🏋️ GND` 텍스트 로고와 `NO EXCUSES. JUST RESULTS.` → 히어로 아트가 같은 일을 한다
- **시안의 뒤로가기 버튼은 넣지 않는다** — 온보딩 첫 화면은 뒤로 갈 곳이 없다

### 4.3 ⚠️ 프로필 편집 시트를 **같이 만든다** — 없으면 두 기능이 죽는다

설계를 검토하다 실측했다. **`/profile`에는 이모지·주간목표를 바꾸는 자리가 없다.**
`upsertMyProfile`을 부르는 곳은 **온보딩 한 곳뿐**이다(`grep`으로 확인).

그래서 §4.2를 그대로 하면:

| 값 | 어디에 쓰이나 | 편집 자리를 안 만들면 |
|---|---|---|
| `avatar_url` | 크루 목록·닉네임 검색 결과·프로필 시트·피드 2곳·킹 카드 2곳·챌린지 화면 3곳·관리자 — **12곳** | **모든 사용자가 영구히 `🧔`** 로 똑같이 보인다 |
| `weekly_goal` | 홈 `WeeklyStats`의 `N / 3` · 기록 캘린더 월간 요약(`summarizeMonth`) | **주 3회에 영구 고정.** 홈이 달성률을 틀린 기준으로 잰다 |

**"나중에 바꾸면 된다"는 전제가 사실이 아니었다.** 그래서 이 배치에 편집 자리를 포함한다 —
온보딩에서 뺀 것을 옮겨 놓는 것이지 새 기능이 아니다.

- `src/components/profile/profile-edit-sheet.tsx` (신설) — 닉네임 · 이모지 9종 · 주간목표 스테퍼
- 진입: `/profile` 상단의 내 이름 옆 편집 버튼. 저장은 기존 `upsertMyProfile` 그대로
- 이모지 목록은 `AVATARS`를 **온보딩에서 도메인 모듈로 옮겨** 두 화면이 같은 배열을 쓴다.
  복사하면 한쪽에 이모지를 더할 때 다른 쪽이 조용히 뒤처진다
- 닉네임 중복은 이미 `upsertMyProfile`이 23505를 문구로 바꿔 준다 — 그 경로를 그대로 쓴다
- 저장 후 홈·캘린더가 새 `weekly_goal`을 읽는지 화면에서 확인한다(둘 다 마운트 때 조회한다)

DB 컬럼은 둘 다 not null이므로 온보딩은 기본값(`🧔`, `3`)을 **반드시** 넣는다.

### 4.4 초대 링크로 온 사람

닉네임 저장 직후:

```
challengeCode 있으면  → joinChallengeWithCode  → /challenge   (기존 그대로)
pendingInvite 있으면  → accept_friend_invite → 실패 시 joinGroupWithCode → /home
그 외                → /home                                  ← crew 단계를 안 지난다
```

⚠️ **`step="crew"`(크루 만들기/참여) 분기는 지우지 않는다.** 옛 그룹 코드로 들어온 사람이
`joinGroupWithCode`까지 실패했을 때의 유일한 복구 경로이고, `onboarding/page.test.tsx`가
이 분기를 단언한다.

---

## 5. C. 계정 지키기 — 구글 연결(`linkIdentity`)

### 5.1 실측 — 이메일 경로가 막힌 지점

2026-08-08, 임시 익명 계정 1개로 운영 Supabase에 직접 호출(자동 삭제 완료):

| 호출 | 결과 |
|---|---|
| `updateUser({ email, password })` | 400 `Email address "" is invalid` |
| `updateUser({ email })` | **429 `over_email_send_rate_limit`** |
| 원시 `PUT /auth/v1/user` | **429 `over_email_send_rate_limit`** |

서버는 요청을 **받아들였고 확인 메일을 보내려다 실패했다.** 막힌 것은 코드가 아니라
**Supabase 내장 메일 발송기의 한도**다. `account/page.tsx:13`의 주석이 옳았고 이제 근거가 있다.

→ **메일을 한 통도 쓰지 않는 경로를 택한다.** OAuth 신원 연결은 검증을 구글이 대신 한다.

### 5.2 사용자가 해야 하는 설정 (에이전트가 할 수 없다)

1. Google Cloud Console에서 OAuth 2.0 클라이언트 발급 (승인된 리디렉션 URI에
   `https://<project-ref>.supabase.co/auth/v1/callback`)
2. Supabase → Auth → Providers → **Google 활성화** + client id/secret 입력
3. Supabase → Auth → **Manual linking 허용** ← 없으면 `linkIdentity`가 거부된다
4. Supabase → Auth → URL Configuration → Redirect URLs에 **두 개** 추가:
   `http://localhost:3000/auth/callback` · `https://gnd-one.vercel.app/auth/callback`

**이 4단계가 끝나기 전에는 C 배치를 배포하지 않는다** — 버튼만 있고 눌리면 실패한다.

### 5.3 앱 작업

| 파일 | 무엇 |
|---|---|
| `src/app/auth/callback/page.tsx` (신설) | PKCE 코드 교환 후 `/account`로. `(tabs)` 밖에 둔다 — `OnboardingGate`가 돌면 여기 온 사람을 온보딩으로 밀어낸다(`/login`·`/account`와 같은 이유) |
| `src/lib/identity.ts` (신설) | `linkGoogle()` · `getMyIdentities()` 래퍼. 오류 코드 → 문구 매핑을 한곳에 |
| `src/app/account/page.tsx` | "구글로 계정 지키기" 버튼 · 연결된 신원 목록 · **연결되면 로그아웃 잠금 해제** |
| `src/app/login/page.tsx` | "구글로 로그인" 버튼 (돌아오는 문) |
| `src/components/crew-card.tsx` | 상세 문구의 `크루장이 대신 붙여 줘요` → `내 정보 → 계정에서 구글을 연결하면 지켜져요` |

### 5.4 실패 갈래 — 화면이 반드시 말해야 하는 것

- `identity_already_exists` — 그 구글 계정이 **이미 다른 GND 계정**에 붙어 있다.
  → "이 구글 계정은 이미 다른 GND 계정에 연결돼 있어요. 그 계정으로 로그인해 주세요."
  이 경우 **지금 계정의 기록은 옮겨지지 않는다.** 그 사실을 숨기지 않는다
- `manual_linking_disabled` — §5.2의 3단계가 안 됐다. 개발자용 문구로 구분해 띄운다
- 사용자가 구글 동의 화면을 닫음 → 조용히 원상복귀(오류 표시 없음)

### 5.5 남겨 두는 것

관리자 스크립트 `scripts/link-email-to-account.mjs`는 **그대로 둔다.** 구글 계정이 없는
사용자의 유일한 탈출구다. 카카오는 같은 구조라 provider 문자열만 추가하면 되지만,
Kakao Developers 앱 등록이 별도로 필요하므로 **이 설계의 범위 밖**이다.

---

## 6. D. 친구 목록 단계 표시

[friend-board-card.tsx](../../../src/components/home/friend-board-card.tsx)의 레벨 알약 한 곳.

```diff
- Lv.{row.level}
+ Lv.{row.level} {row.stageName}
```

- **DB 조회 추가 0건** — `row.stageName`이 이미 있다(`friend-board.ts:212`)
- 알약을 **하나로 유지**한다. 하나 더 붙이면 좁은 폰에서 닉네임이 더 잘린다 —
  이 행은 이미 닉네임+`나`+`Lv`+`›`+상태+콕으로 빽빽하다
- 나와 친구가 **같은 컴포넌트**라 한 곳만 고치면 둘 다 바뀐다
- 표기는 앱 기준을 따른다: `개노답 · 눈떴개 · 일단하개 · 물고가개 · 미쳐보개 · 판을짜개 · 전설이개`
  (사용자 지시문의 "눈떳개"는 오타. `progression.ts:26`이 단일 기준이다)

---

## 7. 테스트

**새 단언 (일부러 고장냈을 때 실패해야 한다):**

| 대상 | 단언 |
|---|---|
| `accept_friend_invite` | 링크 수락 후 **양쪽** `get_my_crew()`에 상대가 **1명** 있다 (0이 아니라 1) |
| 같은 코드 두 번 | 두 번째도 성공하고 `crew_links`가 **1행** (멱등) |
| 자기 코드 | `self_invite` |
| 옛 그룹 코드 | `/invite/<group code>`가 여전히 **그룹 합류**로 끝난다 |
| `create_challenge_room` | **그룹 없는 계정**이 챌린지를 만들면 성공하고 `group_members`에 1행이 생긴다 |
| 온보딩 | 첫 화면에 `프로필 사진`·`주간 운동 목표`가 **없다** (부정 확인) |
| 온보딩 | 저장된 프로필의 `weekly_goal === 3`, `avatar_url === "🧔"` |
| 프로필 편집 시트 | 이모지 9개가 렌더되고, 주간목표를 5로 바꿔 저장하면 **홈이 `N / 5`** 로 바뀐다 (3이 아니라 5 — 뒤집힌 단언) |
| `AVATARS` | 온보딩과 편집 시트가 **같은 배열 참조**를 쓴다 (복사본이 아님) |
| 친구 행 | 알약 문자열이 `Lv.2 눈떴개` |
| `/account` | 신원 미연결이면 로그아웃 버튼이 **없고**, 연결되면 **있다** (양방향) |

회귀 스크립트: `rls-test.mjs`에 A 배치 단언을 추가한다. 기준은 언제나 **`0 failed`**이고
숫자가 128보다 커지면 CLAUDE.md의 표를 갱신한다.

**⚠️ A·C 배치는 사회적 기능이므로 픽스처 두 계정으로 화면을 본다.**
`node scripts/dev-fixture.mjs create` → 크롬=A, 엣지=B. RPC가 행을 만든 것까지는 스크립트가
보지만, **초대한 쪽 친구 목록에 상대가 실제로 렌더되는지**는 화면을 봐야 잡힌다.

---

## 8. 배치 순서

| 배치 | 내용 | 마이그레이션 | 막는 것 |
|---|---|---|---|
| 1 | **D** 단계 알약 | 없음 | 없음 |
| 2 | **B** 온보딩 + 자산 2장 + **프로필 편집 시트**(§4.3) | 없음 | 없음 (자산 도착 완료) |
| 3 | **A** 친구 초대 링크 | `0061` · `0062` | 사용자가 SQL Editor에서 Run · 픽스처 A·B 화면 확인 |
| 4 | **C** 구글 연결 | 없음 | §5.2 사용자 설정 4단계 |

**1·2는 마이그레이션이 0건이라 함께 검증·배포할 수 있다.** 3은 DB 적용 → 개발 서버
두 계정 확인 → 배포 순서를 지킨다. 4는 설정이 끝난 뒤에만 배포한다.

`0061`·`0062`는 **둘 다 "지금 Run해도 안전"** 쪽이다 — 새 컬럼·새 RPC·기존 RPC 덮어쓰기이고,
운영에 떠 있는 옛 앱은 `profiles.invite_code`를 읽지 않으며 `create_challenge_room`은
그룹이 있는 사용자에게 동작이 동일하다. 기존 행을 바꾸는 UPDATE는 backfill뿐이고 이것도
옛 앱에 보이지 않는다.

---

## 9. 되돌리기

| 배치 | 되돌리는 법 |
|---|---|
| D | 커밋 되돌리기 |
| B | 커밋 되돌리기. 자산 파일은 남겨도 무해. **편집 시트는 남겨 두는 편이 안전하다** — 온보딩만 되돌리면 이모지·주간목표를 묻는 자리가 두 곳이 되지만, 시트를 먼저 지우면 바꿀 방법이 없어진다 |
| A | `create_challenge_room`을 0044판으로 되돌리고, `/invite/[code]`를 그룹 전용으로 되돌리고, `NoCrewCard`를 되살린다. `profiles.invite_code`는 **남겨도 무해**하다 — 아무도 읽지 않는다. 이미 맺어진 `crew_links`도 그대로 유효하다 |
| C | 버튼을 감춘다. 이미 붙은 구글 신원은 그대로 유효하고 로그인도 계속 된다 |

## 10. 받아들이는 절충

- **친구 초대에 수락 단계가 없다.** 코드를 아는 사람은 즉시 친구가 된다. 링크가 유출되면
  모르는 사람이 친구가 될 수 있다 — 대신 코드를 **재발급하는 자리**를 두지 않았다(YAGNI).
  실제로 필요해지면 `issue_my_invite_code`에 강제 재발급 인자를 더한다
- **개인 그룹이 조용히 생긴다.** 사용자는 "내 크루"라는 그룹이 생긴 것을 모른다.
  화면에 그룹 이름을 안 쓰기로 이미 정했으므로(2026-08-07) 눈에 띄지 않는다
- **구글 계정이 없는 사용자는 여전히 관리자 도움이 필요하다.** 카카오를 붙이면 줄어든다
