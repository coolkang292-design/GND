# 친구 초대 링크 · 온보딩 · 계정 지키기 · 단계 표시 (설계)

작성 2026-08-08 · 방법론 `first-principles` + `brainstorming` · 마이그레이션 **2개**

사용자 지시 4건:

1. **친구 초대하기 링크가 친구가 아니라 챌린지 크루로 초대되는 것 같다** — 확인 요청
2. **온보딩 화면을 시안대로** 바꾼다 (`어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png`)
3. 처음엔 닉네임만으로 바로 운동하고, **기록 보관은 내정보에서 계정 연동**으로 세팅
4. **친구 리스트에 단계**(개노답·눈떴개 …)를 표시

사용자 확정 4건 (2026-08-08):

- 초대 링크는 **친구 연결만** 한다 (그룹은 챌린지를 만들 때 붙인다)
- **챌린지 링크로 들어온 신규 가입자는 방장과 자동으로 친구가 된다** — 신규만, 방장 한 사람만 (§3.6)
- 온보딩 히어로는 **문구 없는 아트 1장**을 새로 받아 문구는 HTML로 그린다
- 계정 연동은 이메일이 아니라 **`linkIdentity`** — 제공자는 **카카오 + 구글**
- **온보딩 첫 화면에 카카오를 주 버튼으로** 둔다. `닉네임만으로 시작하기`는 부 버튼으로 남긴다
  *(2026-08-08 2차 결정 — "차라리 온보딩에서 카카오나 네이버로 로그인시키는 방향은 어떤가")*
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
- 온보딩에서 **카카오로 시작해 돌아온 뒤 닉네임만 정하면 `/home`에 들어간다** (리다이렉트 왕복 1회)
- 카카오로 시작한 계정은 **다른 브라우저에서 같은 카카오로 로그인해 같은 기록이 보인다**
  — 이것이 "기록 보관"의 실제 증거다
- `/account`에서 카카오·구글을 연결하면 **연결된 제공자가 표시되고 로그아웃 버튼이 열린다**
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
6. **§3.6은 2026-07-31에 사용자가 신고해서 지운 기능(`D5`)과 겉모습이 같다.**
   `0051` 헤더를 읽지 않고 손대면 같은 사고를 다시 낸다. 조건이 어떻게 달라졌는지는
   §3.6.1을 보라 — **가드를 지우면 그 순간 0051 이전으로 돌아간다.**

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

### 3.6 챌린지 링크로 온 **신규 가입자**는 방장과 친구가 된다

사용자 질문 (2026-08-08): *"GND 처음 조인하는 사람이라면 챌린지 초대한 사람과 친구도 되고
챌린지도 추가 되게 설계해야 하는 거 아닌가."*

**실측 — 지금은 이렇게 끝난다.** 챌린지 링크(`/challenge?join=<코드>`)로 처음 온 사람은
닉네임을 정하고 챌린지에 들어간 뒤 **거기서 멈춘다**:

- `crew_links` **0행** → 방장의 홈 친구 목록에 **안 나타난다.** 3명을 불러도 홈은 `친구 0명`
- 서로 **콕 찌르기 불가** — `poke_user`가 `not_crew`로 막는다
- 피드·운동 알림도 없다. 보이는 것은 **그 챌린지 안의 닉네임과 랭킹**뿐(`shares_challenge_with`)
- `join_challenge_with_code`의 반환값에 **`crewLinked: 0`이 상수로 박혀 있다** — `0051`이
  필드를 지우지 않고 0으로 고정한 흔적이다

#### 3.6.1 ⚠️ 이 기능은 있었고, 사용자가 신고해서 지웠다 — 무엇이 달라졌는가

`0051_challenge_scoped_visibility.sql` 헤더:

> 사용자 신고 (2026-07-31): "리얼GND에 형이라는 아이디가 포함됨. 저 아이디는 다른 챌린지
> 멤버인데." → "각각의 챌린지별로 크루원을 따로 묶어야지, 기존 챌린지에 다른 챌린지 팀원을
> 묶으면 안 되지."

`D5`는 챌린지 링크 참가자 **전원**을 `crew_links`로 묶었고, `crew_links`에는 `challenge_id`가
없어 챌린지가 끝나도 남아 크루 목록에 낯선 사람이 쌓였다.

**이번 규칙은 두 군데가 다르다:**

| | `D5` (2026-07-31 폐기) | §3.6 (신규 규칙) |
|---|---|---|
| 대상 | 링크로 참가하는 **모든 사람** | **신규 가입자만** (참가 0건 · 크루 0건) |
| 연결 상대 | 참가자 **전원** | **방장 한 사람** |

신규 가입자는 정의상 다른 챌린지에 있을 수 없다. **그래서 2026-07-31에 신고된 실패
(다른 챌린지 멤버가 내 크루에 섞임)가 구조적으로 발생하지 않는다.**
`D5`를 되살리는 것이 아니라 조건을 좁혀 다시 넣는 것이다.

⚠️ **가드가 이 설계의 본체다.** 가드를 지우면 그 순간 `D5`가 된다. §7의 회귀 단언
("기존 사용자가 링크로 참가하면 방장의 크루가 **그대로**다")이 그것을 고정한다.

#### 3.6.2 마이그레이션 `0063_newcomer_challenge_crew_link.sql`

새 RPC `join_challenge_as_newcomer(p_code text) returns jsonb`:

```
1. auth.uid() 없으면 not_authenticated
2. 신입 가드 — ⚠️ 참가 **전에** 센다 (참가 후면 1건이 되어 조건이 뒤집힌다)
     crew_links 에 내가 낀 행 0건            아니면 not_newcomer
     challenge_participants 에 내 행 0건     아니면 not_newcomer
3. v_result := join_challenge_with_code(p_code);
     ↑ 참가 절차를 **베끼지 않는다.** advisory lock·status='setup' 검사·upsert가
       한 벌만 존재해야 한다 (이 저장소가 start_challenge를 세 곳에 복사해 두고
       0045~0047로 세 번 고친 전례가 있다)
4. 방장 = challenge_participants where challenge_id and role='host' limit 1
5. crew_links (least, greatest) insert on conflict do nothing
6. notify(방장, 나, 'crew_accepted', challenge_id,
          '<닉>님이 챌린지에 들어오고 친구가 됐어요 🤝', …)
     begin/exception when others then null   ← 알림 실패가 연결을 되돌리지 않는다
7. return v_result || {crewLinked:1, hostId, hostNickname}
```

3번이 예외를 던지면 전체가 롤백된다 — 챌린지에 못 들어갔는데 친구만 된 상태가 생기지 않는다.

코드가 챌린지 코드가 아니면 3번이 `invalid_invite_code`를 던지고, 클라이언트가
친구/그룹 코드 경로로 흘러간다(§4.4).

#### 3.6.3 클라이언트

| 파일 | 무엇 |
|---|---|
| `src/lib/challenge.ts` | `joinChallengeAsNewcomer(code)` 추가 |
| `src/app/onboarding/page.tsx` | 챌린지 코드 경로: 신입 RPC 먼저 → `not_newcomer`면 기존 `joinChallengeWithCode`로 폴백 |
| `src/components/challenge/invite-sheet.tsx` | **문구 수정** — 아래 |
| `/challenge` | 온보딩이 남긴 일회성 안내를 토스트로 소비 |

**⚠️ 초대 시트 문구는 반드시 고친다.** 지금 화면은 `링크로 참가해도 **서로 크루가 되지는
않아요.**`라고 약속한다. §3.6 이후 이 약속은 **절반만 참**이 되므로, 고치지 않으면 화면이
거짓말을 한다:

> 이미 GND를 쓰는 사람은 링크로 참가해도 서로 크루가 되지 않아요.
> GND가 처음인 사람은 **나와 친구가 돼요.**

**성공 안내:** 지금 온보딩은 챌린지 참가 후 아무 말 없이 `/challenge`로 보낸다. 신입은
두 가지가 동시에 일어났으므로 둘 다 말해야 한다 — `sessionStorage`에 일회성 문구
(`○○ 챌린지에 참가하고 △△님과 친구가 됐어요 🤝`)를 넣고 `/challenge`의 기존 `showToast`가
꺼내 쓴다. 쿼리스트링에 닉네임을 담지 않는다.

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

화면이 **두 모드**다. 판정은 쿼리스트링이 아니라 **연결된 신원의 존재 여부**로 한다
(`getUserIdentities()`에 `anonymous` 외의 것이 있는가) — 쿼리스트링은 새로고침·뒤로가기로
쉽게 어긋나고, 이미 그 방식으로 한 번 샌 전례가 있다(`challenge/page.tsx`의 `join` 정리).

**모드 1 — 처음 (연결된 신원 없음)**

```
[히어로 아트]                       ← next/image, priority, 폭 100%
운동 안하면 GND 확정. 친구들과 함께 탈출해요.   ← accent, 작게
닉네임만 정하면                      ← 흰색, 크게
바로 시작해요                        ← 골드, 크게

[ 💬 카카오로 시작하기 ]             ← 주 버튼. 카카오 브랜드색
   기록·배지가 안전하게 지켜져요
[ G 구글로 시작하기 ]                ← 주 버튼 2

이미 계정이 있나요? 로그인
```

### ⚠️ 3차 결정 (2026-08-08) — 닉네임 부버튼을 **첫 화면에서 뺀다**

사용자 판단: *"처음부터 가입할 때 카카오·구글로 가는 게 더 안전한 방법인 것 같음."*

**왜 뒤집었나 — "나중에 연결하면 된다"가 항상 되는 게 아니다.**
같은 카카오 계정은 GND 계정 **하나에만** 붙는다. 그래서 이런 순서가 가능하다:

> 폰에서 닉네임으로 시작 → 3개월치 기록 → 그 사이 PC에서 앱을 열어 카카오로 시작
> (빈 계정에 카카오가 붙는다) → 폰에서 "카카오 연결" → **`identity_already_exists`**

이 시점에서 폰의 3개월치는 **영영 못 지킨다.** 기록은 옮겨지지 않는다. 부버튼의 위험은
"지금 안 지켜짐"이 아니라 **"지킬 기회를 잃을 수 있음"** 이었고, 그건 되돌릴 수 없다.

**그래도 닉네임 경로를 지우지는 않는다 — 비상구로 남긴다.**
`enabledProviders()`가 **빈 배열일 때만** 닉네임 입력을 렌더한다. 카카오 장애나 설정
사고로 플래그를 꺼야 할 때 이게 없으면 **신규 가입이 0이 된다**. 평상시 화면에는
안 보이므로 사용자가 보는 것은 주 버튼 2개뿐이다.

⚠️ **받아들이는 대가**: 초대 링크(친구·챌린지 신입)로 온 사람도 카카오 동의를 먼저 거친다.
GND가 뭔지 보기 전에 동의 화면을 만난다. 카톡 안에서 열면 이미 로그인 상태라 탭 두 번이지만,
**유입 경로 전부가 이 화면을 지난다**는 것은 알고 넣은 것이다. 되돌리려면 닉네임 입력의
렌더 조건 한 줄만 바꾸면 된다.

**모드 2 — 카카오·구글에서 돌아옴 (신원 있음, 프로필 없음)**

```
[히어로 아트]
반가워요!                            ← 흰색, 크게
이름만 정하면 시작해요                ← 골드, 크게
🛡 GND에서 친구들에게 보여질 이름이에요.
[ 닉네임 / (제공자 닉네임 프리필) ]
[ GND 시작하기               → ]     ← 골드 채움
```

⚠️ **주 버튼은 닉네임을 요구하지 않는다.** 리다이렉트로 화면을 떠나므로 입력한 닉네임이
사라진다. 닉네임은 **돌아온 뒤**(모드 2)에 받는다. 제공자 닉네임을 프리필하되 `profiles.nickname`은
유니크 제약이 있으므로 **중복이면 문구로 알리고 사용자가 고친다**(`upsertMyProfile`의 23505 경로).

⚠️ 시안의 CTA는 하나였다. **주 버튼 2개가 추가된 것은 2026-08-08 2차 결정이다** —
시안과 다르다는 것을 알고 넣은 것이니 "시안대로 되돌리자"고 하지 마라.

⚠️ **카카오·구글 설정이 끝나기 전에는 주 버튼을 렌더하지 않는다.** 환경변수 플래그
(`NEXT_PUBLIC_OAUTH_PROVIDERS`)로 가린다. 누르면 실패하는 버튼을 첫 화면에 두는 것이
이 앱에서 가장 나쁜 실패다 — 신규 사용자가 아예 못 들어온다.

**빠지는 것 (부정 확인 대상):**

- 프로필 이모지 9종 선택 → `avatar_url`은 `AVATARS[0]`(`🧔`)로 저장하고 `/profile`에서 바꾼다
  (제공자 프로필 사진을 쓰지 않는다 — 앱 전체가 `avatar_url`을 **이모지 문자열**로 렌더한다.
  URL을 넣으면 12곳이 전부 깨진 텍스트를 그린다)
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
challengeCode 있으면  → join_challenge_as_newcomer        (§3.6 — 방장과 친구까지)
                          not_newcomer면 joinChallengeWithCode 폴백
                        → /challenge  + 일회성 토스트
pendingInvite 있으면  → accept_friend_invite → 실패 시 joinGroupWithCode → /home
그 외                → /home                                  ← crew 단계를 안 지난다
```

두 코드는 **키가 달라 섞이지 않는다**(`gnd-pending-invite` · 챌린지 쪽 별도 키). 챌린지
코드를 먼저 보고 조기 반환하므로 한 사람이 둘을 다 가진 경우도 한쪽만 실행된다.

⚠️ **`step="crew"`(크루 만들기/참여) 분기는 지우지 않는다.** 옛 그룹 코드로 들어온 사람이
`joinGroupWithCode`까지 실패했을 때의 유일한 복구 경로이고, `onboarding/page.test.tsx`가
이 분기를 단언한다.

---

## 5. C. 계정 지키기 — 카카오·구글 연결(`linkIdentity`)

### 5.1 실측 — 이메일 경로가 막힌 지점

2026-08-08, 임시 익명 계정 1개로 운영 Supabase에 직접 호출(자동 삭제 완료):

| 호출 | 결과 |
|---|---|
| `updateUser({ email, password })` | 400 `Email address "" is invalid` |
| `updateUser({ email })` | **429 `over_email_send_rate_limit`** |
| 원시 `PUT /auth/v1/user` | **429 `over_email_send_rate_limit`** |

서버는 요청을 **받아들였고 확인 메일을 보내려다 실패했다.** 막힌 것은 코드가 아니라
**Supabase 내장 메일 발송기의 한도**다. `account/page.tsx:13`의 주석이 옳았고 이제 근거가 있다.

→ **메일을 한 통도 쓰지 않는 경로를 택한다.** OAuth 신원 연결은 검증을 제공자가 대신 한다.

### 5.2 왜 `signInWithOAuth`가 아니라 `linkIdentity`인가

**온보딩 시점에도 익명 세션은 이미 있다.** `AuthProvider`가 `/login` 외 모든 경로에서
즉시 `signInAnonymously()`를 부른다(`auth-provider.tsx:104`). 여기서 `signInWithOAuth`를
부르면 **다른 user id**로 갈아타므로, 사용자가 온보딩 전에 뭔가 했다면 그것이 고립된다.
`linkIdentity`는 **같은 id에 신원만 덧붙인다**.

부수 확인: **`is_anonymous`에 걸린 RLS 정책이 하나도 없다**(스키마·마이그레이션 전량 grep).
익명 → 영구 승격이 권한을 하나도 바꾸지 않는다.

리다이렉트를 거쳐도 `localStorage`의 보관 코드(`gnd-pending-invite`·챌린지 코드)는 **같은
오리진이라 살아남는다** — 초대 링크로 온 사람이 카카오를 거쳐도 이어서 합류한다.

### 5.3 사용자가 해야 하는 설정 (에이전트가 할 수 없다)

**카카오**

1. Kakao Developers에서 앱 생성 → 카카오 로그인 활성화
2. Redirect URI에 `https://<project-ref>.supabase.co/auth/v1/callback` 등록
3. Supabase → Auth → Providers → **Kakao 활성화** + REST API 키 / Client Secret 입력

**구글**

4. Google Cloud Console에서 OAuth 2.0 클라이언트 발급 (승인된 리디렉션 URI 동일)
5. Supabase → Auth → Providers → **Google 활성화** + client id/secret 입력

**공통**

6. Supabase → Auth → **Manual linking 허용** ← 없으면 `linkIdentity`가 거부된다
7. Supabase → Auth → URL Configuration → Redirect URLs에 **두 개** 추가:
   `http://localhost:3000/auth/callback` · `https://gnd-one.vercel.app/auth/callback`

⚠️ **카카오 이메일 수집은 비즈앱/검수가 필요할 수 있다.** 기록 복구에 필요한 것은 이메일이
아니라 **신원**이라서 이메일 없이도 목적은 달성된다 — 그러니 이메일 동의항목이 막혀도
멈추지 말고 진행한다. 다만 `/account`의 "로그인 이메일" 자리가 비므로, 그 자리는
**연결된 제공자 목록**을 함께 보여주도록 고친다(§5.5).

⚠️ **네이버는 Supabase 기본 제공자 목록에 없다** `[미검증 — 대시보드 확인 필요]`.
커스텀 OIDC나 별도 인증 계층이 필요해 작업량이 크게 다르다. 이 설계의 범위 밖이다.

**7단계가 끝나기 전에는 배포하지 않는다.** 온보딩 주 버튼이 실패하면 **신규 사용자가
아예 앱에 못 들어온다** — `/account` 버튼이 실패하는 것보다 훨씬 나쁘다. 그래서
`NEXT_PUBLIC_OAUTH_PROVIDERS` 플래그로 가린다(§4.2).

### 5.4 앱 작업

| 파일 | 무엇 |
|---|---|
| `src/app/auth/callback/page.tsx` (신설) | PKCE 코드 교환 후 **프로필 유무로 갈라 보낸다** — 없으면 `/onboarding`(모드 2), 있으면 `/account`. `(tabs)` 밖에 둔다 — `OnboardingGate`가 돌면 여기 온 사람을 밀어낸다(`/login`·`/account`와 같은 이유) |
| `src/lib/identity.ts` (신설) | `linkProvider('kakao'\|'google')` · `getMyIdentities()` · 오류 코드 → 문구 매핑. **제공자 목록은 한 배열**로 두고 온보딩·`/account`·`/login`이 같은 것을 쓴다 |
| `src/app/onboarding/page.tsx` | 모드 1의 주 버튼 2개 · 모드 2의 닉네임 프리필 (§4.2) |
| `src/app/account/page.tsx` | 연결된 제공자 목록 · 안 붙은 제공자 연결 버튼 · **하나라도 붙으면 로그아웃 잠금 해제** |
| `src/app/login/page.tsx` | 카카오·구글 로그인 버튼 (돌아오는 문). 여기서는 `signInWithOAuth`가 **맞다** — 로그인 화면은 익명 세션을 만들지 않는다 |
| `src/components/crew-card.tsx` | `크루장이 대신 붙여 줘요` → `내 정보 → 계정에서 카카오·구글을 연결하면 지켜져요` |

⚠️ `/login`만 `signInWithOAuth`이고 나머지는 `linkIdentity`다. 이 둘을 뒤바꾸면
로그인 화면이 익명 계정에 신원을 붙이려 하거나(세션이 없어 실패), 온보딩이 방금 만든
익명 계정을 버리고 새 계정으로 갈아탄다.

### 5.5 실패 갈래 — 화면이 반드시 말해야 하는 것

- `identity_already_exists` — 그 카카오/구글 계정이 **이미 다른 GND 계정**에 붙어 있다.
  → "이 계정은 이미 다른 GND 계정에 연결돼 있어요. 그 계정으로 로그인해 주세요."
  **지금 계정의 기록은 옮겨지지 않는다.** 그 사실을 숨기지 않는다
- `manual_linking_disabled` — §5.3의 6단계가 안 됐다. 개발자용 문구로 구분해 띄운다
- 사용자가 제공자 동의 화면을 닫음 → 조용히 원상복귀(오류 표시 없음)
- **온보딩 모드 1에서 실패하면 부 버튼 경로가 그대로 남아 있어야 한다** — 카카오가 죽어도
  닉네임으로는 들어올 수 있다

### 5.6 남겨 두는 것

관리자 스크립트 `scripts/link-email-to-account.mjs`와 이메일+비밀번호 로그인은 **그대로
둔다.** 이미 이메일로 붙은 계정이 있고, 카카오·구글이 둘 다 없는 사용자의 탈출구다.

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
| `join_challenge_as_newcomer` — 신입 | 참가 0·크루 0인 계정이 링크로 참가하면 **방장의 `get_my_crew()`에 1명** (0이 아니라 1) |
| **↑ 0051 회귀 방지 (핵심)** | **이미 다른 챌린지에 있는 계정**이 같은 링크로 참가하면 `not_newcomer`이고 **방장의 크루 수가 그대로다** — 이 단언이 실패하면 `D5`가 되살아난 것이다 |
| 같은 링크 두 번 | 두 번째는 `already_joined`. `crew_links`는 여전히 **1행** |
| 챌린지 참가 실패 시 | 종료된 챌린지 코드로 신입 RPC를 부르면 `invalid_status`이고 **`crew_links`가 0행이다** (친구만 되는 상태가 없다) |
| 초대 시트 문구 | `서로 크루가 되지 않아요`가 **조건절과 함께** 있다 — 조건 없는 단정문이 남아 있으면 실패 |
| 온보딩 | 첫 화면에 `프로필 사진`·`주간 운동 목표`가 **없다** (부정 확인) |
| 온보딩 | 저장된 프로필의 `weekly_goal === 3`, `avatar_url === "🧔"` |
| 프로필 편집 시트 | 이모지 9개가 렌더되고, 주간목표를 5로 바꿔 저장하면 **홈이 `N / 5`** 로 바뀐다 (3이 아니라 5 — 뒤집힌 단언) |
| `AVATARS` | 온보딩과 편집 시트가 **같은 배열 참조**를 쓴다 (복사본이 아님) |
| 친구 행 | 알약 문자열이 `Lv.2 눈떴개` |
| `/account` | 신원 미연결이면 로그아웃 버튼이 **없고**, 연결되면 **있다** (양방향) |
| 온보딩 모드 | 신원 없으면 주 버튼 2개 + 부 버튼, 신원 있으면 **주 버튼이 없다** (양방향) |
| 플래그 | `NEXT_PUBLIC_OAUTH_PROVIDERS`가 비면 주 버튼이 **없고 부 버튼은 남는다** — 카카오가 죽어도 가입은 된다 |
| `/login` vs 온보딩 | `/login`은 `signInWithOAuth`, 온보딩은 `linkIdentity`를 부른다 (호출 스파이로 고정) |

**✅ 2026-08-08 실측 — 어디에 넣었나.** 회귀 단언은 `rls-test.mjs`가 아니라
**`challenge-invite-link-check.mjs`** 로 갔다. 그 파일이 이미 초대 링크 계약을 소유하고
있고(코드 발급·참가·경계), D5 단언("링크 참가 후 `crew_links`가 생기지 않는다")도 거기
있어서, 갈라 놓으면 다음 사람이 한쪽만 보게 된다. **`21/21 → 25/25 passed`** 로 늘었고
`🎯` 표시가 붙은 것이 핵심선이다. `rls-test.mjs` 기준선(128)은 건드리지 않았다.

클라이언트 단언은 `src/lib/crew.test.ts`(신규) · `src/app/invite/[code]/page.test.tsx`(신규) ·
`src/app/onboarding/page.test.tsx` · `src/components/challenge/invite-sheet.test.tsx`에 있다.

**⚠️ A·C 배치는 사회적 기능이므로 픽스처 두 계정으로 화면을 본다.**
`node scripts/dev-fixture.mjs create` → 크롬=A, 엣지=B. RPC가 행을 만든 것까지는 스크립트가
보지만, **초대한 쪽 친구 목록에 상대가 실제로 렌더되는지**는 화면을 봐야 잡힌다.

**⚠️ 온보딩은 자동 테스트로 못 덮는 구간이 있다.** OAuth 리다이렉트는 외부 도메인을 지나므로
`pnpm dev`에서 **실제로 카카오·구글을 눌러 돌아오는 것까지** 사람이 봐야 한다. 확인할 것:
① 동의 후 모드 2가 뜨는가 ② 닉네임 저장 후 `/home`에 내 기록이 있는가(계정이 갈리지
않았다는 증거) ③ 동의 화면을 닫으면 모드 1로 조용히 돌아오는가 ④ 초대 링크 → 카카오 →
돌아온 뒤에도 초대가 이어지는가.

---

## 8. 배치 순서

**⚠️ 2026-08-08 2차 결정으로 순서가 바뀌었다.** 카카오가 온보딩 첫 화면에 들어오면서
**B가 C의 배관에 의존**하게 됐다. C를 나중에 하면 온보딩을 두 번 고쳐야 한다.

| 배치 | 내용 | 마이그레이션 | 상태 (2026-08-08) |
|---|---|---|---|
| 1 | **D** 단계 알약 | 없음 | ✅ 커밋 `35faa13` · **미배포** |
| 2 | **A** 친구 초대 링크 + **챌린지 신입 자동 연결**(§3.6) | `0061` · `0062` · `0063` | 🟡 DB ✅ · 코드 ✅ · 게이트 4종 ✅ · 회귀 25/25 ✅ · **화면 확인 대기** |
| 3 | **C** 카카오·구글 배관 + `/account` + `/login` | 없음 | ⬜ 미착수 — §5.3 사용자 설정 7단계가 선행 |
| 4 | **B** 온보딩 개편 + 자산 2장 + **프로필 편집 시트**(§4.3) | 없음 | ⬜ 미착수 — 배치 3 의존 |

- **1은 단독으로 오늘 배포 가능하다.**
- **2**는 DB 적용 → 개발 서버 두 계정 확인 → 배포 순서를 지킨다. C를 기다리지 않는다
- **3**은 §5.3의 7단계가 끝난 뒤에만 배포한다. `/account`·`/login`에만 버튼이 생기므로
  실패해도 신규 가입은 막히지 않는다 — **여기서 왕복을 먼저 검증한 뒤 4로 간다**
- **4**는 온보딩 첫 화면을 건드리므로 가장 위험하다. 3에서 리다이렉트가 실제로 도는 것을
  확인한 뒤에 손댄다. `NEXT_PUBLIC_OAUTH_PROVIDERS`를 비운 채 배포하면 부 버튼(닉네임)만
  보이므로 **주 버튼 없이 먼저 내보내고 플래그로 켜는 것도 가능하다**

B의 **프로필 편집 시트**는 온보딩에서 이모지·주간목표를 빼는 것과 **같은 배치여야 한다**
(§4.3) — 순서가 갈리면 그 사이 사용자가 두 값을 바꿀 방법이 없다.

`0061`·`0062`·`0063`은 **모두 "지금 Run해도 안전"** 쪽이다 — 새 컬럼·새 RPC·기존 RPC 덮어쓰기이고,
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
| A의 §3.6만 | 온보딩이 `joinChallengeWithCode`(옛 경로)를 부르게 되돌리고 초대 시트 문구를 원복한다. `join_challenge_as_newcomer`는 아무도 부르지 않으면 무해하다. 이미 맺어진 연결은 `remove_crew`로 각자 푼다 |
| C | `NEXT_PUBLIC_OAUTH_PROVIDERS`를 비운다 — 배포 없이 버튼이 사라진다. 이미 붙은 신원은 그대로 유효하고 로그인도 계속 된다 |

## 10. 받아들이는 절충

- **친구 초대에 수락 단계가 없다.** 코드를 아는 사람은 즉시 친구가 된다. 링크가 유출되면
  모르는 사람이 친구가 될 수 있다 — 대신 코드를 **재발급하는 자리**를 두지 않았다(YAGNI).
  실제로 필요해지면 `issue_my_invite_code`에 강제 재발급 인자를 더한다
- **§3.6의 연결도 챌린지가 끝나도 남는다.** `crew_links`에는 `challenge_id`가 없다 —
  `0051`이 지적한 그 성질 그대로다. 내가 앱에 직접 데려온 사람이라면 남는 쪽이 맞다고
  보지만, 틀렸을 때의 탈출구는 `remove_crew`(크루 해제)가 이미 있다
- **§3.6은 방장 한 사람만 연결한다.** 신입이 다른 참가자들과도 친구가 되고 싶으면
  닉네임 검색으로 요청해야 한다. 참가자 전원을 묶는 것이 `D5`가 폐기된 이유다
- **개인 그룹이 조용히 생긴다.** 사용자는 "내 크루"라는 그룹이 생긴 것을 모른다.
  화면에 그룹 이름을 안 쓰기로 이미 정했으므로(2026-08-07) 눈에 띄지 않는다
- **온보딩 첫 화면의 CTA가 3개가 된다.** 시안은 1개였다. 주 버튼(카카오·구글)과
  부 버튼(닉네임)의 시각적 무게를 확실히 갈라 "무엇이 권장인지"가 한눈에 보이게 한다.
  그래도 시안보다 복잡한 화면인 것은 사실이고, 그 대가로 **기록이 1분째부터 안전해진다**
- **카카오·구글이 둘 다 없는 사용자는 여전히 익명이다.** 부 버튼으로 들어와
  `/account`에서도 연결하지 않으면 브라우저 데이터와 함께 사라진다. 그 사람에게는
  관리자 스크립트가 유일한 탈출구로 남는다
- **네이버를 뺐다.** Supabase 기본 제공자가 아니어서 작업 성격이 다르다.
  필요해지면 커스텀 OIDC로 별도 설계한다
