# 크루 연결 그래프 — 닉네임 검색 · 상호 수락 설계

작성일: 2026-07-28
관련 문서: `docs/superpowers/plans/2026-07-24-routines-friend-level-friend-requests.md`(§1 결정 **F1을 뒤집는다**) ·
`docs/superpowers/specs/2026-07-26-crew-member-profile-sheet-design.md`(프로필 시트 재사용)

---

## 1. 목표

**"같은 그룹에 속했으니 크루"** 를 **"서로 수락했으니 크루"** 로 바꾼다.

사용자는 상대의 **닉네임을 검색해 크루 요청을 보내고**, 상대가 **수락해야** 서로가
크루가 된다. 크루가 되어야만 지금 크루원에게 가던 **모든 알림**(운동 시작·응원·콕·
반응·열람·기록 갱신·레벨업)이 서로에게 오간다. 크루가 아니면 피드에도 프로필에도
서로가 보이지 않는다.

**왜 지금 바꾸는가.** 지금 GND는 지인 3명이 크루 하나(`리얼GND`)에 모여 쓰는
구조다. 유료로 열어 모르는 사람들이 가입하기 시작하면, 그룹 하나에 사람이 쌓이는
순간 **가입만 했을 뿐인 남의 운동 알림이 서로에게 쏟아진다.** 신규 가입자가 서로
독립적으로 쓰다가 **자기가 고른 사람만** 크루로 들이게 만드는 것이 이 설계의 전부다.

### 1.1 용어 — "크루"로 통일

사용자에게 보이는 말도, 코드·DB 식별자도 **크루(crew)** 로 쓴다. "친구"라는 말은
UI·코드·문서 어디에도 새로 쓰지 않는다. 개념이 하나인데 이름이 둘이면 화면과 코드가
따로 논다.

| 개념 | 이름 | 비고 |
|---|---|---|
| 상호 수락된 1:1 연결 | **크루 연결** `crew_links` | 이 설계가 새로 만드는 것 |
| 그 연결의 신청 이력 | **크루 요청** `crew_requests` | 〃 |
| 챌린지 참가 단위 | `groups` · `group_members` | **이름 유지, 의미만 축소** — 이제 챌린지 전용 |

`groups`는 지우지 않는다. 챌린지가 아직 그룹 기반이기 때문이다(§13). 다만 이 설계
이후 `group_members`는 **더 이상 "누가 내 크루인가"를 답하지 않는다.**

---

## 2. 현황과 격차

| 영역 | 현재 | 필요한 것 |
|---|---|---|
| 관계의 근거 | `group_members` 행 존재 = 크루 | 상호 수락된 `crew_links` 행 존재 = 크루 |
| 관계 판정 | `shares_group_with(uid)` — 호출부 **7곳** | `is_crew_with(uid)`로 교체 (§5) |
| 다수 대상 알림 | `group_members` 조인 **3곳** — 운동 시작 · 기록 갱신 · 레벨업 (§7) | `crew_links` 조인 |
| 1:1 알림 4종 | 대상은 이미 특정, 권한만 그룹 기준 | 쿼리 그대로, 권한 검사만 교체 |
| 피드 | `getGroupFeed(groupId)` + RLS 2곳(`0004:161`·`0004:214`) | 크루 기준 조회로 교체 (§8) |
| 사람 찾기 | **없음**. `profiles` SELECT는 본인 + 같은 그룹만(`0001:81`) | 닉네임 정확 일치 검색 RPC (§6) |
| 요청·수락 흐름 | **없음** | 요청·수락·거절·취소·해제 RPC (§6) |
| 크루 리스트 화면 | **없음**. 홈 크루 카드가 그룹 멤버를 나열할 뿐 | 내 정보 › 크루 (§9) |
| 아침 브리핑 본문 | "어제 크루 친구 N명이 운동했어요" | **본문 자체를 제거** (§11) |

마이그레이션은 **0037까지 운영 적용됨(수정 금지)**. 이 설계는 **0038**을 쓴다.

---

## 3. 핵심 결정

| # | 결정 | 이유 |
|---|---|---|
| D1 | 그룹은 남기고 **크루 연결 그래프를 새로 만든다** | 챌린지·랭킹·동의 게이트(0025)가 전부 그룹 기반이다. 그룹을 지우면 이번 스펙이 챌린지 재설계까지 삼킨다. |
| D2 | **요청 이력과 연결 상태를 다른 테이블로 분리** | 한 테이블에 `status`로 두면 권한 검사마다 `status='accepted'` 필터가 붙는다. **한 곳에서 빠뜨리면 거절한 사람에게 알림이 가는 조용한 버그**가 된다. 연결은 행의 존재만으로 참이어야 한다. |
| D3 | `crew_links`는 `user_a < user_b`로 **정규화(쌍당 1행)** | 대칭 관계를 두 행으로 저장하면 한쪽만 지워진 반쪽 상태가 생긴다. DB가 강제하게 한다. |
| D4 | 닉네임 검색은 **정확 일치 1행만** | 앞글자 검색을 열면 전체 가입자 명단을 훑을 수 있다. 유료 확장 시 그대로 위험이 된다. 닉네임은 0017에서 이미 유일값이라 정확 일치로 충분하다. |
| D5 | 검색 결과에 **`relation` 5값을 서버가 실어 준다** | 버튼이 `요청`/`수락`/`요청됨`/`이미 크루`/`나예요` 중 뭘 그릴지를 클라가 추측하지 않는다. 왕복 1회. |
| D6 | **역방향 요청이 오면 자동 수락** | A→B 요청 중에 B→A 요청이 오면 양쪽이 서로를 원한 것이다. "둘 다 요청했는데 아무 일도 안 일어남"은 사용자가 원인을 알 수 없는 함정이다. |
| D7 | **거절·취소·해제는 알림을 보내지 않는다** | 거절당한 사실을 통보하면 지인 기반 앱에서 관계가 상한다. 조용히 끝낸다. |
| D8 | 알림 팬아웃에서 **`group_id is not null` 조건을 제거** | 지금 혼자모드 유저는 알림이 한 건도 나가지 않는다(§7.1). 크루 기준으로 바뀌면 그룹 없이도 크루만 있으면 나가야 한다. |
| D9 | 기존 크루원은 **자동으로 서로 연결** | 리얼GND 3명이 전환 직후에도 지금과 똑같은 화면을 본다. 체감상 끊김이 없다. |
| D10 | `profiles` SELECT RLS만 **그룹 조건을 남긴다** | 챌린지 랭킹판에 참가자 닉네임이 떠야 한다. 챌린지 개편 때 사라질 **한시적 잔여물**이다(§14). |
| D11 | 차단은 이번에 넣지 않는다 | 지인 3명 단계에선 과잉. 해제만으로 충분하다. |
| D12 | **거절 후 7일간 재요청 금지** | 거절은 조용하고(D7) 차단도 없으니(D11), 이 가드가 없으면 요청↔거절을 무한 반복하며 상대에게 알림을 계속 꽂을 수 있고 받는 쪽에 방어 수단이 없다. 콕 찌르기의 24h 쿨다운(0011)과 같은 결의 장치다. 에러 코드는 `request_exists`를 **재사용**한다 — 보내는 쪽에 "이미 요청을 보냈어요"로만 보여야 거절당했다는 사실이 드러나지 않는다(D7 유지). |
| D13 | **쌍 단위 advisory lock**으로 요청·수락을 직렬화 | 없으면 셋이 한꺼번에 터진다: ① 서로 동시에 수락할 때 락 순서가 엇갈려 `40P01` 데드락 ② 서로 동시에 요청할 때 역방향을 못 봐 **D6 자동수락이 불발**(정확히 D6가 막으려던 상황이 재현된다) ③ 빠른 두 번 탭이 `request_exists` 대신 raw `23505`를 뱉는다. `pg_advisory_xact_lock(hashtext(정렬된 쌍))` 하나가 셋을 함께 막는다. |
| D14 | 수락 알림 실패는 **연결을 되돌리지 않는다** | 연결이 본체고 알림은 곁가지다. 알림 실패는 결정적으로 재현되므로(예: 후속 마이그레이션이 `notifications_type_check`에서 `crew_accepted`를 빠뜨림) 감싸지 않으면 그 두 계정은 **영영 크루가 될 수 없다**. 0029에서 알림 insert 하나가 운동 완료 트랜잭션을 통째로 롤백시킨 전례가 있다. 반대로 `send_crew_request`의 알림은 **감싸지 않는다** — 거기선 알림이 곧 전달 수단이라 못 보내면 요청도 없던 일이 되는 게 맞다. |

---

## 4. 데이터 모델 — `0038_crew_link_graph.sql`

### 4.1 `crew_requests` — 요청 이력

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `requester_id` | uuid NOT NULL → `profiles(id)` on delete cascade | 보낸 사람 |
| `addressee_id` | uuid NOT NULL → `profiles(id)` on delete cascade | 받은 사람 |
| `status` | text NOT NULL default `'pending'` | `pending`·`accepted`·`rejected`·`canceled` CHECK |
| `created_at` | timestamptz NOT NULL default `now()` | |
| `responded_at` | timestamptz NULL | 수락·거절·취소 시각 |

- `check (requester_id <> addressee_id)`
- **부분 유니크 인덱스** `crew_requests_pending_unique on (requester_id, addressee_id) where status = 'pending'`
  — 진행 중 요청은 방향당 1건. 거절 뒤 재요청은 허용된다(이력은 남고 새 행이 생긴다).
- 인덱스 `(addressee_id, status)` — 받은 요청 목록 조회용.

### 4.2 `crew_links` — 수락된 연결

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_a` | uuid NOT NULL → `profiles(id)` on delete cascade | |
| `user_b` | uuid NOT NULL → `profiles(id)` on delete cascade | |
| `created_at` | timestamptz NOT NULL default `now()` | |

- PK `(user_a, user_b)`, `check (user_a < user_b)` — **쌍 하나 = 행 하나**(D3).
- 인덱스 `crew_links_user_b_idx on (user_b)` — 역방향 조회용.

### 4.3 RLS

두 테이블 모두 RLS 활성화 + **직접 INSERT/UPDATE/DELETE 권한 없음.** 쓰기는 전부
§6의 정의자 RPC를 통한다. SELECT만 연다:

- `crew_requests`: `requester_id = auth.uid() or addressee_id = auth.uid()`
- `crew_links`: `user_a = auth.uid() or user_b = auth.uid()`

### 4.4 알림 유형 2종 추가

`notifications_type_check`를 확장한다(0034에 이어 이번이 두 번째 확장).

| 타입 | 제목 | 탭하면 |
|---|---|---|
| `crew_request` | `OO님이 크루 요청을 보냈어요` | `/crew` |
| `crew_accepted` | `OO님과 크루가 됐어요 🤝` | `/crew` |

`NotificationRow['type']`(`src/lib/social.ts:24`)과 인앱 알림함 라우팅 표에도 같이
추가한다.

---

## 5. 관계 판정 — 함수 하나 교체

```sql
is_crew_with(uid) -- crew_links에 (least(auth.uid(),uid), greatest(...)) 행이 있는가
```

`stable security definer set search_path = public`. `shares_group_with`와 같은 형태라
호출부는 이름만 바뀐다.

| 호출부 | 위치 | 교체 후 의미 |
|---|---|---|
| 콕 찌르기 | `0028_poke_requires_workout.sql:28` | 크루만 찌를 수 있다 |
| 성과 열람권 | `0012_record_view_rpc.sql:29` | 크루만 열람 |
| `record_views` INSERT RLS | `0011_social.sql:179` | 〃 |
| 크루원 프로필 시트 | `0026_crew_member_profile.sql:30` | 크루의 레벨·배지만 |
| 배지 프로필 | `0032_badge_point_engine.sql:382` | 〃 |
| `profiles` SELECT RLS | `0001_identity_crew.sql:81` | **예외** — 아래 |

`0011_social.sql:394`에도 `poke_user`의 옛 정의가 있으나 **0028이 `create or replace`로
대체한 상태**다. 살아 있는 정의는 0028뿐이므로 0011은 건드리지 않는다(§7.2).

`profiles` SELECT만 `id = auth.uid() or is_crew_with(id) or shares_group_with(id)`로
둔다(D10). 챌린지 랭킹에 참가자 닉네임이 떠야 하기 때문이다. **새는 정보는 닉네임과
아바타뿐**이고, 레벨·배지·기록은 위 표대로 이미 크루 전용이다.

---

## 6. RPC 계약

전부 `security definer`. `anon`·`authenticated`의 테이블 직접 쓰기는 막혀 있으므로
이 함수들이 유일한 쓰기 경로다.

### 6.1 `search_profile_by_nickname(p_nickname text)`

`lower(btrim())`으로 정규화해 **정확 일치 1행**을 반환한다.

```
returns table (id uuid, nickname text, avatar_url text,
               relation text, request_id uuid)
```

`relation` 5값 — `self` · `crew` · `request_sent` · `request_received` · `none`.
`request_id`는 `request_sent`·`request_received`일 때만 채워진다 — 수락·취소 버튼이
곧바로 `accept_crew_request(id)`를 부를 수 있어야 하기 때문이다(그 외에는 null).
일치하는 사람이 없으면 0행(에러 아님) → 화면은 "그런 닉네임을 쓰는 사람이 없어요".

### 6.2 상태 변경 RPC

| RPC | 하는 일 | 에러 코드 |
|---|---|---|
| `send_crew_request(p_target_id)` | pending 요청 생성 + `crew_request` 알림. **역방향 pending이 있으면 그 요청을 수락 처리**(D6). 거절당한 뒤 **7일간 재요청 불가**(D12) | `self_request` `already_crew` `request_exists` `target_not_found` |
| `accept_crew_request(p_request_id)` | addressee만 가능. `crew_links` 삽입 + status `accepted` + `crew_accepted` 알림 | `not_addressee` `not_pending` |
| `reject_crew_request(p_request_id)` | status `rejected`. **알림 없음** | `not_addressee` `not_pending` |
| `cancel_crew_request(p_request_id)` | requester만. status `canceled`. **알림 없음** | `not_requester` `not_pending` |
| `remove_crew(p_target_id)` | `crew_links` 행 삭제. **알림 없음** | `not_crew` |
| `get_my_crew()` | 내 크루 목록 — `{id, nickname, avatar_url, total_xp, current_level, current_stage}` | — |
| `get_incoming_crew_requests()` | 받은 pending 요청 + 보낸 사람 프로필 | — |

`get_my_crew()`가 레벨까지 함께 주는 이유: `user_progress`는 본인 전용 RLS라
클라가 직접 읽을 수 없다. 0026이 이미 쓴 정의자 패턴을 그대로 따른다 — **권한 검사가
한 곳에 모이고 왕복이 1회**다.

에러 코드는 `SocialErrorCode`(`src/lib/social.ts:46`)에 추가한다. `not_crew`는
**이미 있는 코드를 재사용**한다(의미가 그대로 "크루가 아님"이다).

---

## 7. 알림 전환

| 알림 | 지금 | 바뀜 |
|---|---|---|
| 운동 시작 | `group_members` 조인 | `crew_links` 조인 |
| 기록 갱신 | `group_members` 조인 | `crew_links` 조인 |
| 레벨업·진화 | `group_members` 조인 | `crew_links` 조인 |
| 응원·콕·반응·열람 | 대상 1명 | 쿼리 그대로, **권한 검사만** §5로 |
| 랭킹 변동·챌린지 시작/종료 | 그룹 기준 | **그대로** (챌린지는 범위 밖) |
| 배지 획득 | **본인에게만** (`0036:102`) | 그대로 |
| 앱 업데이트 | 전체 | 그대로 |
| 아침 브리핑 | 본문에 크루 집계 | **본문 제거** (§11) |

### 7.1 같이 고치는 버그 — 혼자모드는 알림이 0건이었다

두 팬아웃 모두 `s.visibility = 'group' and s.group_id is not null` 게이트를 통과해야
발송된다. **혼자모드 유저는 `group_id`가 null이라 지금 알림이 한 건도 나가지 않는다.**
크루 기준으로 바뀌면 그룹이 없어도 크루만 있으면 나가야 하므로 `group_id` 조건을
제거한다(D8). 이게 "혼자 시작 → 나중에 크루 추가"라는 흐름을 실제로 성립시킨다.
`visibility = 'group'`(=공개) 조건은 유지한다.

### 7.2 함정 — 고칠 정의는 "가장 나중에 덮어쓴 것"이다

이 저장소는 마이그레이션마다 `create or replace function`으로 같은 함수를 덮어쓴다.
**옛 번호의 파일을 고치면 아무 일도 일어나지 않는다.** 이번에 손댈 함수의 현행 정의는
아래가 전부다. 계획 단계에서 **각 함수를 `grep -rn "function public.<name>"`으로 다시
확인한 뒤** 최신 번호의 것만 옮겨 쓴다.

| 함수 | 정의된 이력 | **현행(고칠 것)** |
|---|---|---|
| `mark_record_beaten` | 0018 → 0020 → 0021 → 0032 | **`0032_badge_point_engine.sql:355`** |
| `poke_user` | 0011 → 0028 | **`0028_poke_requires_workout.sql`** |
| `get_crew_member_profile` | 0026 → 0032 | **`0032_badge_point_engine.sql:382`** |
| `evaluate_badges` | 0032 → 0036 | `0036` — 배지 알림은 본인 대상이라 **수정 없음** |
| `start_workout` | 0011 | `0011_social.sql:239` |
| `apply_xp_and_progress` | 0029 | `0029_level_up_notification.sql:149` |

---

## 8. 피드·기록 열람 범위

- `getGroupFeed(groupId, ...)` → **`getCrewFeed(myUserId, ...)`**:
  `user_id ∈ (내 크루 ∪ 나)` + `visibility='group'` + `status='completed'`.
  `group_id` 필터는 사라진다.
- RLS **2곳 모두** 교체 — 하나만 바꾸면 피드에 껍데기만 뜬다:
  - `sessions_select_own_or_crew` (`0004:214`)
  - `workout_session_crew_visible(sid)` (`0004:161`) — 운동·세트·인증사진이 이걸 통해 연쇄로 열린다
  둘 다 `group_id is not null and is_group_member(group_id, auth.uid())`
  → `is_crew_with(user_id)`.
- `sessions_insert_own_draft`의 `group_id` 조건은 **손대지 않는다** — 그룹은 챌린지 몫으로 남는다.
- `getCrewProfiles(groupId)`(`src/lib/crew.ts:74`) → **`getMyCrew()`**. 홈 크루 카드·
  `crew-latest-workout.tsx`·`active-workout-cards.tsx` 호출부가 함께 바뀐다.

**노출 범위 명시:** 크루를 맺으면 상대의 **과거 공개 기록까지 함께 보인다.** 지금 크루에
가입할 때와 동일한 동작이라 새로 생기는 노출은 없다. "맺은 이후 기록만" 같은 시점
필터는 넣지 않는다 — 복잡도 대비 얻는 것이 없다.

---

## 9. 화면 — 내 정보 › 크루

프로필 탭에 **크루** 메뉴 행을 추가한다(받은 요청이 있으면 개수 뱃지). 진입 →
`/crew` 페이지(`src/app/crew/page.tsx`, 탭 밖 라우트).

**구성 (위에서부터)**

1. **크루 찾기** — 닉네임 입력 → 정확 일치 1명 → `relation`에 따라 버튼이 갈린다
   | relation | 버튼 |
   |---|---|
   | `none` | `크루 요청` |
   | `request_received` | `수락하기` (거절 보조 버튼) |
   | `request_sent` | `요청됨` (비활성) |
   | `crew` | `이미 크루` (비활성) |
   | `self` | `나예요` (비활성) |
2. **받은 요청** — 있을 때만 노출. 행마다 수락 / 거절
3. **내 크루 N명** — 아바타·닉네임·레벨·🔥연속. 탭하면 **기존 `MemberProfileSheet`를
   그대로 재사용**. 우측 `⋯` → 크루 해제(확인 후 실행)
4. **빈 상태** — "아직 크루가 없어요. 닉네임으로 크루를 찾아보세요"

낙관적 UI는 쓰지 않는다. 요청·수락은 되돌리기가 애매하므로 **버튼 로딩 상태**로
처리하고 서버 응답 후 목록을 갱신한다.

---

## 10. 기존 크루 이관

`0038` 말미에서 **같은 그룹에 있던 모든 쌍**을 `crew_links`로 채운다.

```sql
insert into crew_links (user_a, user_b)
select least(a.user_id, b.user_id), greatest(a.user_id, b.user_id)
from group_members a
join group_members b on a.group_id = b.group_id and a.user_id < b.user_id
on conflict do nothing;
```

`on conflict do nothing`이라 재실행해도 안전하다(멱등). 리얼GND 3명 → **3쌍**.
실행 직후 세 사람이 보는 화면은 지금과 같다.

---

## 11. 아침 브리핑 — 본문 제거

브리핑 본문은 전부 크루 집계에서 나온다. 사용자 결정에 따라 **본문 자체를 없애고
제목(스트릭 문구)만 보낸다.**

삭제 대상:

- `crewFriendsWorkedYesterday()` · `briefingBody()` (`src/lib/domain/briefing.ts:42`·`73`)
- `BriefingUser.crewMemberIds` 필드 (`briefing.ts:23`)
- `src/app/api/briefing/route.ts:56`의 `group_members` 조회와 `:92`의 조립
- `Briefing.body`는 타입에 남기되 **항상 `null`** — 알림 INSERT 경로(`route.ts:116`)와
  푸시 페이로드를 건드리지 않기 위함이다.

`src/lib/domain/briefing.test.ts`의 본문 단언 3건(`:114`·`:120`·`:128`)은 "본문은 항상
null" 단언으로 대체한다.

---

## 12. 에러 처리

- RPC는 전부 `raise exception`으로 §6의 코드 문자열을 던진다. 클라는 기존
  `toSocialError()`가 코드를 뽑아 토스트 문구로 매핑한다 — **새 예외 처리 경로를
  만들지 않는다.**
- 검색 0행은 에러가 아니라 빈 결과다. "없는 닉네임"과 "서버 오류"를 사용자가 구분할 수
  있어야 한다.
- 크루 해제 직후 상대 화면에 남아 있던 프로필 시트는 다음 조회에서 권한 오류가 난다.
  `not_crew`를 받으면 "크루가 아니에요"로 닫는다.

---

## 13. 테스트 전략

| 층 | 대상 | 방법 |
|---|---|---|
| 순수 도메인 | `src/lib/domain/crew-link.ts` — 쌍 정규화, `relation` 판정, 빈·공백 검색어 방어 | vitest |
| 컴포넌트 | 크루 페이지 빈 상태 / 받은 요청 뱃지 / 검색 결과 버튼 5상태 | `renderToStaticMarkup` SSR |
| 실 DB | `scripts/crew-link-check.mjs` — anon 3계정 | 요청→수락→**역방향 자동 수락**→중복 요청 차단→**비크루의 프로필·콕·열람 차단**→해제 후 알림 차단 |
| 회귀 고정 | ① 팬아웃 **3종 각각**(운동 시작·기록 갱신·레벨업)이 크루 아닌 사람에게 **가지 않을 것** ② **그룹 없는 유저도** 크루에게는 알림이 **갈 것**(§7.1) | 실 DB 스크립트 |

팬아웃은 3종을 **따로따로** 확인한다. 셋이 서로 다른 마이그레이션에 흩어져 있어(§7.2)
하나를 빠뜨려도 나머지 둘이 통과하면 눈치채지 못한다.

기존 `scripts/crew-profile-check.mjs`·`poke-levelup-check.mjs`는 그룹 기반으로 계정을
엮으므로, 크루 연결을 맺도록 **셋업 부분만 갱신**한다(단언은 그대로 통과해야 한다 —
통과하지 않으면 그게 회귀다).

**게이트(커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
마이그레이션은 사용자가 SQL Editor에 **수동 Run** 후 실 DB 스크립트로 검증한다.

---

## 14. 알려진 잔여물

챌린지가 그룹 기반으로 남아 있어 생기는 것들이다. **챌린지 개편 스펙에서 함께
사라진다.**

1. `profiles` SELECT RLS의 `or shares_group_with(id)` (D10) — 같은 챌린지 그룹이면
   닉네임·아바타가 보인다.
2. `groups`·`group_members`·초대코드 흐름이 그대로 남는다. 사용자에게는 챌린지
   참가 경로로만 보이도록 문구를 정리한다.
3. 랭킹 변동·챌린지 시작/종료 알림은 여전히 그룹 전원에게 간다.

---

## 15. 범위 밖

- **챌린지 개편** — "내가 만들고 크루를 초대하는 방"으로 바꾸는 것. 전원 목표 + 전원
  동의 게이트(0025)·랭킹·목표 승인을 동시에 손대야 해서 별도 스펙으로 뺀다.
- 차단(block) (D11), 크루 추천, 크루 수 상한, QR·링크로 크루 맺기, 앞글자 검색(D4).
