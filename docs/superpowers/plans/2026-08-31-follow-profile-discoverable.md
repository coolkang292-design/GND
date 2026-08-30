# 따라하기 · 프로필 소개 · 공개 챌린지 — 최종 구현 계획

작성: 2026-08-31 · **개정 2회** (검토 반영) · 상태: **구현 대기 (배포 금지 — 별도 승인)**
선행: `2026-08-30-feed-instagram-restructure.md` (댓글·대댓글·좋아요·딥링크, 배포 완료)

**이번 원칙:** 새 기능을 만드는 것이 아니라 **이미 있는 기능의 입구와 연결을 재사용**한다.
피드의 목적은 인스타 복제가 아니라 **"남의 운동을 봄 → 사람에게 관심 → 행동함 → 같이 운동함"**
루프를 닫는 것이다.

**범위는 정확히 3개.** Follow · DM · 공개 운동 피드 · 릴스 · 스토리 · 자유게시물 ·
추천 알고리즘은 **이번에 절대 넣지 않는다.**

---

## 0. 선행 검증 결과 (실물 확인)

코드와 운영 DB를 직접 조회했다. 적힌 것을 믿지 않고 대조한 결과다.

| 전제 | 판정 | 근거 |
|---|---|---|
| 캡션 0행 버그가 남아 있나 | **아니오** | `title` 유효값 2건. `.select("id")` 가드 적용됨 |
| `getSessionExerciseStructure` 재사용 | ✅ | 실재. 소유자 필터 없음 → RLS에 맡김 |
| 미완료 세트 제외 | ✅ **이미 됨** | 함수 내부 `withCompletedSetsOnly()` |
| 복사 시 `done` 초기화 | ✅ 이미 됨 | 주석: "지난 운동 복사용이라 done을 초기화함" |
| `mergeImportedExercises` 재사용 | ✅ | 이름 정규화 후 중복 제외, 뒤에 붙임 |
| 친구 세션 종목·세트 읽기 | ✅ | `exercises_select_own_or_crew` · `sets_select_own_or_crew` |
| 남의 세션을 `source_session_id`로 저장 | ❌ **RLS가 거부** | `workout_plans_insert_own` WITH CHECK에 `(source_session_id IS NULL) OR owns_workout_session(...)` |
| 초대코드 참가가 그룹 가입도 시키나 | **아니오** | `join_challenge_with_code`는 `challenge_participants`만. `crewLinked: 0` |
| 그룹 밖 참가자가 목표 설정 가능 | ✅ | `goals_insert_own_setup`에 `is_challenge_participant(...) OR is_group_member(...)` |
| `challenges.discoverable` 존재 | 없음 | 컬럼 목록 확인 |
| `profiles.bio/instagram/youtube` | 없음 | 컬럼 목록 확인 |
| 비참가자가 챌린지 조회 | ❌ 불가 | `challenges_select_member` = 참가자 OR 그룹원 |
| `/challenge?open=<id>` | ✅ | `challenge/page.tsx:213` |

---

## 0-A. 이전 검토안에서 **철회·수정**한 것 4가지

### 🔴 철회 ① — `photo_required`를 카드에서 빼자던 것

**틀렸다.** 근거로 삼았던 `challenges_insert_member` WITH CHECK의 `photo_required = true`는
**직접 테이블 INSERT에만** 걸린다. 앱은 그 경로를 쓰지 않는다 —
`create_challenge_room`이 **`SECURITY DEFINER`라 RLS를 지나가고**, 시그니처가
`p_photo_required boolean`이며 `challenge.ts:432`가 `input.photoRequired ?? true`를 그대로 넘긴다.

> 운영 챌린지가 전부 `true`인 것은 **지금까지 그렇게 만들었을 뿐**이고,
> 시스템은 `false`를 지원한다. 데이터의 우연을 구조로 착각한 판단이었다.

**→ RPC 반환값에 `photo_required`를 유지한다.** MVP 카드에서 표시를 생략하는 것은 자유지만,
반환에서 빼면 나중에 사진 비필수 챌린지가 생길 때 **카드가 거짓말을 한다.**

### 🔴 수정 ② — 참가 RPC의 잠금을 **`challenges` 행 `FOR UPDATE`**로 (2차 개정)

**1차 개정에서 내가 틀렸다.** "`join_challenge_with_code`의 advisory lock을 복사하면
안전하다"고 썼는데, 운영 DB의 두 함수를 실제로 대조하니 **서로 다른 것을 잠근다.**

| 함수 | `challenges` 행 `FOR UPDATE` | advisory lock |
|---|---|---|
| `start_challenge` | ✅ **건다** | ❌ 안 쓴다 |
| `join_challenge_with_code` | ❌ **안 건다** (그 `for update`는 `challenge_participants`에 걸려 있다) | ✅ 쓴다 |

**advisory lock은 상대도 같은 advisory lock을 쓸 때만 직렬화된다.**
`start_challenge`는 안 쓰므로 **둘은 서로를 전혀 막지 않는다.** 남는 틈:

```
참가자: status=setup 확인
   ↓
방장:  start_challenge가 challenges 행을 FOR UPDATE로 잠그고 active로 변경
   ↓
참가자: 이미 읽은 setup을 믿고 participant INSERT   ← 시작된 챌린지에 중도 합류
```

**→ 신규 RPC는 `challenges` 행 자체를 `FOR UPDATE`로 잠근다.**

```
① id + discoverable 로 1차 조회
② select * from challenges where id = ... FOR UPDATE   ← start_challenge와 같은 자원
③ 이 잠금 안에서 discoverable 재확인 · status=setup 재확인
④ participant 처리
```

이러면 양쪽 순서 모두 안전하다:
- 참가가 먼저 잠금 → `start_challenge`가 기다렸다가 **새 참가자를 포함해** 시작 조건을 검사
- 시작이 먼저 잠금 → 참가가 기다렸다가 `active`를 읽고 **거절**

⚠️ **`join_challenge_with_code`도 0085에서 같이 고친다.** 공개 참가만 고치면
**링크 참가에는 같은 race가 그대로 남는다.** 기존 함수의 advisory lock은
지우지 않고 `challenges ... FOR UPDATE` 한 줄을 **더한다** — 있던 방어를 빼지 않는다.

### 🔴 수정 ③ — 신규 RPC의 `anon` 실행을 막는다 (그리고 **내가 만든 것도 고친다**)

운영 DB를 조회했더니 `is_challenge_participant` · `is_group_member` ·
`owns_workout_session` · `session_crew_shared`가 **`anon`에게 EXECUTE가 열려 있다.**
Postgres가 함수에 **PUBLIC EXECUTE를 기본으로 준다**는 사실을 아무도 안 걷어냈기 때문이다.

⚠️ **그리고 어제 내가 만든 것도 같다:**

| 함수 | 판정 |
|---|---|
| `post_session_comment` (0082/0084) | **anon 실행 가능** ⚠️ |
| `get_session_actor_profiles` (0084) | **anon 실행 가능** ⚠️ |
| `edit_session_comment` (0084) | **anon 실행 가능** ⚠️ |

`grant execute ... to authenticated`만 쓰고 **PUBLIC을 revoke하지 않았다.**

지금 새는 데이터는 없다 — 셋 다 `auth.uid()`가 null이면 예외를 던지거나
`session_crew_shared`가 false로 떨어져 0행을 준다. 하지만 **다음 사람이 이 패턴을
복사하면 그때는 샌다.** 0085에서 **되돌려 잠그고**, 새 RPC는 처음부터 잠근 채 만든다.

```sql
revoke execute on function public.X(...) from public, anon;
grant  execute on function public.X(...) to authenticated;
```

### 🟠 수정 ④ — 따라하기 버튼은 액션 줄이 아니라 **운동 상세 영역**에

`reaction-bar.tsx`에 오늘 결정이 주석으로 박혀 있다 — 액션 줄은 **❤️ 💬 둘만**,
공유·북마크는 의도적으로 뺐다. 거기에 `따라하기`를 끼우면 그 결정을 스스로 깬다.

- ❤️ 💬 = **사람과 소통하는** 버튼
- 따라하기 = **운동을 실행하는** 버튼

성격이 다르다. **`WorkoutSummary`(종목·세트 상세) 영역**에 둔다.

---

## 0-C. 2차 검토에서 추가로 잡힌 것 (전부 실물 확인함)

### 🔴 필수 ⑤ — 친구 **타바타** 따라하기는 지금 설계로는 깨진다

1차 계획서에 "타바타는 기존 복원 규칙 그대로"라고 썼는데, **그 규칙이 남의 세션에는 안 닿는다.**

- `addPastSession(sessionId)`는 **`pastSessions` 클로저에서 세션을 찾아**
  `tabataResumeFromSession()`에 넣는다 (`record/page.tsx:1354` 주석이 명시)
- 그 `pastSessions`는 `getCompletedSessions(userId)`가 채우는데 **`.eq("user_id", userId)`**
  — **내 세션만**이다
- `tabata_minutes`를 실어 오는 것도 그 함수뿐이다
- **`getSessionExerciseStructure`는 `workout_exercises`만 읽어 `tabata_minutes`를 모른다**

→ 친구 세션은 `pastSessions`에 없으니 타바타인 줄 모르고 **일반 복사로 떨어진다.**
`🔥 8분 타바타`를 따라했는데 **맨몸운동 몇 개짜리 일반 화면**이 된다. 사용자가 가장 빨리
발견할 종류의 오류다.

**고침 — 거대한 기능이 아니라 메타 한 줄을 더 읽는다.**

```
/record?copy=<sessionId>
   ↓ workout_sessions에서 tabata_minutes 한 칸 조회 (RLS: sessions_select_own_or_crew)
   ├ null   → 기존 getSessionExerciseStructure() 경로
   └ 값 있음 → 기존 tabataResumeFromSession() 경로
```

`getSessionCopySource(sessionId)`를 하나 두고 **세션 메타 1회 + 기존 구조 함수 호출**로
합친다. 새 복사 로직은 만들지 않는다.
⚠️ 그러므로 **"따라하기는 스키마 변경 0"은 맞지만 "코드 수정 0에 가깝다"는 틀렸다.**

### 🔴 필수 ⑥ — 공개 챌린지에 **나가는 문**이 없다

운영 DB를 확인했다. `challenge_participants`에는 **SELECT 정책 하나뿐**이고
INSERT/UPDATE/DELETE 정책이 **아예 없다** — 모든 쓰기가 RPC를 지난다. 그런데
참가·초대수락·초대거절·시작·종료·취소는 있어도 **일반 참가자가 setup에서 나가는 RPC가 없다.**

초대 링크는 누가 일부러 보내 준 것이라 참을 만했다. 하지만 **공개 모집은 "발견 → 참여하기"**다.
**잘못 눌러도 나갈 수 없는 구조는 공개에서 반드시 사고가 된다.**

**→ `leave_setup_challenge(p_challenge_id uuid)` 추가.** 기능 추가라기보다
**공개 참가의 되돌리기 버튼**이다.

```
본인만 · 방장(host)은 불가 · status=setup일 때만
challenges 행 FOR UPDATE (위 ②와 같은 이유)
내 user_goals 정리 · 내 동의(approval) 정리
challenge_participants 내 행 삭제
```

### 🟠 목록 RPC 명세 3가지 보강

1. **`participant_count`는 `status='joined'`만 센다.** `challenge_participants.status`는
   `invited / joined / dropped` 세 종류다. `count(*)`로 세면 초대·탈락이 쌓이는 순간
   **카드 숫자가 부풀어 오른다.**
2. **정렬과 상한.** 피드는 가로 한 줄인데 공개 챌린지가 500개면 500개를 받을 이유가 없다.
   `order by start_date asc, created_at desc limit 12`.
3. **`already_joined`일 때의 UI를 정한다.** 지금대로면 이미 참가한 사람이 `참여하기`를
   눌러 서버에서 `already_joined` 오류를 본다. **목록에서 감추지 않고 버튼을
   `참가 중 · 보기`로 바꿔 `/challenge?open=`만 실행한다** — 감추면 자기가 참가한 방이
   갑자기 사라진 것처럼 보인다.

### 🟠 타입·시그니처 갱신 (계획서에 빠져 있었다)

`src/lib/types.ts`를 확인했다. 0085 뒤에 **반드시 같이 고친다**:

```ts
Challenge  + discoverable: boolean
Profile    + bio: string | null
           + instagram_url: string | null
           + youtube_url: string | null
```

⚠️ 겸사겸사 `Challenge.photo_required`의 주석 **"새 챌린지는 항상 true"를 고친다** —
`create_challenge_room`이 `false`를 저장할 수 있으므로 **사실이 아니다.** 이 주석이
1차 검토에서 내가 틀린 판단을 하게 만든 원인 중 하나다.

**`upsertMyProfile`의 새 필드는 optional로 넣는다.** 지금 입력은 `id·nickname·avatar_url·
weekly_goal` 넷이고 `...input` 스프레드로 upsert한다. `bio?`·`instagram_url?`·`youtube_url?`로
확장하면 **기존 호출부를 강제로 고칠 필요가 없다.** 편집 화면에서만 값 또는 `null`을 넘긴다.

### 🟠 URL 방어의 역할 분담을 정확히 쓴다

1차 계획서의 "DB가 최후의 방어선"은 과장이다. 정확히는:

| | 무엇을 막나 |
|---|---|
| **DB CHECK** | 위험한 스킴(`javascript:`·`data:`)과 **길이** |
| **클라이언트 `profile-links.ts`** | Instagram/YouTube **실제 도메인** 검증 |

`https://evil.com`은 **DB에는 저장된다.** XSS 위험은 거의 없어지지만
**데이터 정합성까지 DB가 보장하지는 않는다.** MVP로는 이 분담이 맞다.

---

## 0-B. ~~기록해 두는 기존 부채~~ → **철회** (2026-08-31 구현 중 확인)

1·2차 계획서에 *"방장이 API를 직접 호출해 `status`를 바꿀 여지가 있다"*고 부채로
적었다. **틀렸다.**

운영 DB를 확인하니 `authenticated`의 `challenges` 권한은
`DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE`뿐 — **UPDATE가 아예 없다.**
RLS 정책(`challenges_update_creator`)은 있지만 **GRANT가 없어서 도달하지 못한다.**

> **RLS 정책 = 어떤 행을 건드릴 수 있나 · GRANT = 그 작업 자체를 할 수 있나.**
> 둘 다 있어야 한다. 정책만 보고 "쓸 수 있다"고 판단한 것이 오류였다.

### 그래서 `discoverable` 토글도 **RPC 없이는 안 된다** (0086)

같은 이유로 "토글에 RPC가 필요 없다"는 판단도 틀렸다. 직접 UPDATE는
`42501 permission denied`로 죽는다 — 흉내 내서 실제로 잡았다.

**0086이 컬럼 하나에만 UPDATE를 연다:**
`grant update (discoverable) on public.challenges to authenticated;`

⚠️ **테이블 전체를 열지 않는다.** 이 스키마가 이미 그렇게 한다 —
`workout_sessions`도 테이블 UPDATE는 없고 컬럼 8개
(`title`·`memo`·`visibility`·`deleted_at` 등)만 열려 있고,
`completed_at`·`status`처럼 서버 시간이 진실인 칸은 빠져 있다.
(캡션 저장이 되던 것도 `title`이 마침 그 목록에 있었기 때문이다.)

---

## 1. 마이그레이션 0085 (하나로 묶는다)

### ① `challenges.discoverable`

```sql
alter table public.challenges
  add column if not exists discoverable boolean not null default false;
```

**의미는 "챌린지 내부가 공개"가 아니라 "피드에서 참가자를 모집해도 된다"다.**
기존 18개는 전부 `false`가 된다 — `invite_code`가 있다고 공개로 판단하면
**비공개 챌린지가 전부 노출되는 사고**가 난다.

부분 인덱스 하나: `create index ... on challenges (start_date) where discoverable and status='setup'`

### ② `profiles` 3컬럼 — **DB에서도 길이·스킴을 막는다**

```sql
alter table public.profiles
  add column if not exists bio text,
  add column if not exists instagram_url text,
  add column if not exists youtube_url text;

alter table public.profiles
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 120),
  add constraint profiles_instagram_url_ok
    check (instagram_url is null or (instagram_url ~ '^https://' and char_length(instagram_url) <= 200)),
  add constraint profiles_youtube_url_ok
    check (youtube_url is null or (youtube_url ~ '^https://' and char_length(youtube_url) <= 200));
```

⚠️ **클라이언트 검증만으로는 부족하다.** 앱 화면을 거치지 않고 Supabase REST를 직접
부르는 경로가 있다 — `profiles`는 본인 UPDATE가 열려 있으므로 **DB가 최후의 방어선**이다.
`^https://`를 DB에서 막으면 `javascript:`·`data:`는 애초에 저장되지 않는다.

전부 nullable — 기존 사용자에게 영향 0.

### ③ `get_crew_member_profile`에 3칸 추가

⚠️ **손으로 옮겨 적지 않는다.** 60줄이 넘는 운영 함수라 전사(轉寫) 오류 위험이 크다.
`pg_get_functiondef()`로 **현행 정의를 그대로 받아** `jsonb_build_object`에 키 3개만
프로그램으로 끼워 넣어 마이그레이션 파일을 만든다.

문지기는 **그대로 둔다** — 본인/크루/같은 챌린지가 아니면 `not_crew`.
`profiles` SELECT 정책은 **넓히지 않는다** (거기엔 `invite_code`·`acquisition_*`가 같이 산다).

### ④ `list_discoverable_challenges()` — 최소 반환

반환: `id · name · start_date · end_date · photo_required · participant_count ·
host_id · host_nickname · host_avatar_url · already_joined`

**반환하지 않는 것: `invite_code` · `group_id` · `user_goals` · 점수 · 랭킹 ·
참가자 명단 · `profiles`의 다른 필드.**

조건: `discoverable = true` AND `status = 'setup'`.
**`participant_count`는 `status='joined'`만 센다** (`invited`·`dropped`를 세면 숫자가 부푼다).
정렬·상한: `order by start_date asc, created_at desc` **`limit 12`**.
`already_joined`를 같이 주므로 참가 여부를 물으러 한 번 더 가지 않는다 —
**참가 중이면 감추지 말고 버튼을 `참가 중 · 보기`로 바꾼다.**

### ⑤ `join_discoverable_challenge(p_challenge_id uuid)`

**`challenges` 행을 `FOR UPDATE`로 잠근다** (§0-A 수정 ②).

```
v_me := auth.uid();  없으면 not_authenticated
select 1 from challenges where id = p_challenge_id and discoverable;  없으면 not_discoverable
select * into c from challenges where id = p_challenge_id for update;   ← 핵심
  if not c.discoverable  → not_discoverable   (방장이 방금 껐을 수 있다)
  if c.status <> setup   → invalid_status:%   (방금 시작됐을 수 있다)
select ... from challenge_participants ... for update;  이미 joined면 already_joined
insert ... on conflict (challenge_id,user_id) do update set status=joined, joined_at=now();
```

⚠️ 참가가 **crew 관계를 만들지 않는다** (`join_challenge_with_code`도 `crewLinked: 0`).

### ⑤-b `join_challenge_with_code`에도 같은 잠금을 더한다

기존 링크 참가에도 **같은 race가 있다.** advisory lock은 그대로 두고
`select * into c from challenges where id = c.id **for update**;` 한 줄을 더한다.
있던 방어를 빼지 않는다.

### ⑤-c `leave_setup_challenge(p_challenge_id uuid)`

§0-C 필수 ⑥. 본인만 · 방장 불가 · `setup`만 · `challenges` 행 `FOR UPDATE` ·
내 `user_goals`·동의 정리 후 참가 행 삭제.

### ⑥ 권한 잠그기 — 신규 + **0082~0084 소급**

```sql
revoke execute on function public.list_discoverable_challenges()        from public, anon;
revoke execute on function public.join_discoverable_challenge(uuid)     from public, anon;
revoke execute on function public.leave_setup_challenge(uuid)           from public, anon;
revoke execute on function public.post_session_comment(uuid,text,uuid)  from public, anon;
revoke execute on function public.edit_session_comment(uuid,text)       from public, anon;
revoke execute on function public.get_session_actor_profiles(uuid[])    from public, anon;
grant  execute ... to authenticated;   -- 각각
```

**적용 순서 안전성:** 전부 넓히거나(새 컬럼·기본값 false) 좁히는(revoke) 변경이라
**배포 전에 Run해도 안전하다.** revoke는 운영 앱이 `authenticated`로 부르므로 영향 없다.

---

## 2. 기능 1 — 이 운동 따라하기 (스키마 변경 0)

**UX:** 피드 카드 운동 상세 영역 → `이 운동 따라하기` → `/record?copy=<sessionId>`
→ 완료한 종목·세트가 기록 draft에 담김 → 사용자가 확인 → 기존 `운동 시작`으로 시작.

**버튼을 누르는 순간 서버 active session을 만들지 않는다.**

| 재사용 | 어떻게 |
|---|---|
| `getSessionExerciseStructure(sessionId)` | **그대로.** 완료 세트만·`done` 초기화가 이미 들어 있다 |
| RLS | **그대로.** 크루 가시성으로 친구 세션이 읽힌다 |
| `mergeImportedExercises(current, imported)` | **그대로.** 이름 중복 제거 후 뒤에 붙임 |
| `toDraftExercises` / draft 구조 | 그대로 |
| `?suggest` 1회 소비 패턴 | `?copy` 분기로 모방 (`copyConsumedRef`) |
| `tabataResumeFromSession` | **그대로.** 단 진입 경로를 새로 연다 (§0-C ⑤) |
| `getSessionCopySource` | **신규(얇음).** 세션 `tabata_minutes` 1칸 + 기존 구조 함수 호출 |

**규칙**
- URL·localStorage에 운동 JSON을 싣지 않는다. **session id 하나만** 넘기고 DB·RLS를 재사용한다.
- **`sourceSessionId`는 남의 세션이면 반드시 `null`.** 따라하기는 draft에 담을 뿐이라
  `workout_plans` INSERT가 일어나지 않지만, 사용자가 그 draft를 **예정표에 저장**하면
  `handleScheduleFromPast` 경로로 plan이 생긴다. 그때 남의 id가 들어가면 **RLS가 INSERT를 통째로 거부**한다.
- 남의 기록을 내 **기록 갱신 비교 기준**으로 쓰지 않는다.
- 진행 중 active workout이 있으면 **그 draft를 덮어쓰지 않는다.**
- 웨이트 kg/reps · 유산소 거리/시간 · 시간형 맨몸 **초 단위**를 잃지 않는다.
- ⚠️ **타바타는 갈림길을 먼저 탄다** (§0-C 필수 ⑤). `pastSessions`는 내 세션뿐이라
  친구 타바타가 일반 복사로 새는 것을 막아야 한다.

---

## 3. 기능 2 — 프로필 소개 + Instagram/YouTube

새 프로필 페이지를 만들지 않는다.

| 재사용 | 수정 |
|---|---|
| `ProfileEditSheet` | 닉네임·사진 아래에 입력 3칸. **저장 버튼은 기존 것 그대로** |
| `upsertMyProfile` | 필드 3개 추가 |
| `get_crew_member_profile` | jsonb에 키 3개 (문지기 유지) |
| `MemberProfileSheet` | 닉네임·아바타 아래, 레벨·성과보다 **앞** |
| `types.ts` | `Profile`에 3필드 · `Challenge`에 `discoverable` · **`photo_required` 주석 정정** |
| `upsertMyProfile` | 새 필드는 **optional** — 기존 호출부를 안 건드린다 |

**신규 — `src/lib/domain/profile-links.ts` (순수 함수 + 단위 테스트)**
`https://`만 허용 · 길이 상한 · Instagram/YouTube 호스트 검증 · 빈 문자열 → `null` 정규화.
값이 없는 항목은 렌더하지 않는다. 링크는 새 탭 + `rel="noopener noreferrer"`.

**`MemberProfileSheet` 하나만 고치면 피드·크루·챌린지 전 진입점에 동시에 반영된다.**

---

## 4. 기능 3 — 같이 할 공개 챌린지

**위치:** `ActiveWorkoutCards` **아래**, 날짜별 운동 피드 **위**. 가로 스크롤 한 줄.
운동 게시물 사이에 챌린지 카드를 **반복 삽입하지 않는다.**

**카드:** 방장 아바타 + 닉네임 · 챌린지 이름 · 시작일 · 참가자 N명 · `참여하기`.
0개면 **영역 자체를 렌더하지 않는다.**

⚠️ **크루가 0명인 신규 사용자에게도 보여야 한다.** `getCrewFeed` 결과가 0이라고
공개 챌린지 조회까지 숨기면, 이 기능이 가장 필요한 사람에게 안 보인다.

**모집 켜기:** 기존 `InviteSheet`의 초대 링크 영역 근처에 토글
`피드에서 참가자 구하기`. 닉네임 초대·링크 초대·피드 공개는 전부 "참가자 모집 방법"이라
한자리에 있어야 한다. **방장 + `setup`에서만** 보인다.

⚠️ 직접 UPDATE로 하되 **0086의 컬럼 GRANT가 있어야 한다** (§0-B). 정책만으로는
`42501`로 죽는다. 저장 확인은 `.select("id")`로 한다 — 0행이어도 PostgREST는
오류를 주지 않는다(2026-08-30 캡션이 그 함정으로 조용히 실패했다).

**참여하기** → `join_discoverable_challenge` → 성공 → `/challenge?open=<id>`.
목표 설정·참가자·시작 흐름은 기존 화면 그대로.

⚠️ 공개 카드에 **`invite_code`를 절대 노출하지 않는다.** 노출하면 방장이 모집을 끈 뒤에도
그 코드로 계속 들어온다.

---

## 5. 검증 게이트 3개 (여기서 예상과 다르면 계획이 틀린 것이다)

1. **그룹 밖 참가 → 목표 설정** — 픽스처 B가 A의 공개 챌린지에 참가한 뒤 `user_goals`를 넣을 수 있는가
2. **시작과 동시에 참가** — `status`를 `active`로 바꾼 직후 참가 시도가 `invalid_status`로 거부되는가
3. **비참가자의 RPC 직접 호출** — 관계없는 사용자가 목표·랭킹·`invite_code`·다른 프로필 필드에 닿지 못하는가
4. **친구 타바타 따라하기** — `/record?copy=`로 열 때 **매번 같은 타바타 코스**가 복원되는가
5. **나가기** — setup에서 참가 후 나가면 참가자 수가 줄고, 방장은 나갈 수 없는가

---

## 6. 테스트 목록

**따라하기** — 웨이트 · 유산소 · 시간형 맨몸(초) · 타바타 · 미완료 세트 제외 ·
같은 종목 중복 처리 · active 중 클릭 시 현재 운동 보존 · 없거나 권한 없는 세션 ·
새로고침 시 두 번 담기지 않음 · **남의 session id가 `source_session_id`로 저장되지 않음**

**프로필** — 소개 없음 · 120자 · 잘못된 URL · `javascript:` 차단 · 정상 Instagram/YouTube ·
링크 없으면 버튼 없음 · 크루/같은 챌린지 조회 · **관계없는 사용자에게 새 노출 없음** ·
기존 닉네임·사진 수정 회귀 없음

**공개 챌린지** — 기존 비공개 노출 0 · `discoverable+setup`만 · active 전환 즉시 제외 ·
방장이 끄면 목록 제외 **및 join 거절** · 중복 참가 방지 · 내부 데이터 접근 불가 ·
크루 0명도 조회 가능 · 참가 후 `?open=`이 정확한 챌린지를 엶 ·
**참가자 수가 `joined`만 센다**(invited/dropped 제외) · **목록 12개 상한과 정렬** ·
**`already_joined`면 버튼이 `참가 중 · 보기`** · **setup 나가기** · **방장은 나갈 수 없음** ·
**시작과 동시 참가 시 `invalid_status`**

**일부러 고장내서 잡히는지 확인할 것 (3개)**
- `withCompletedSetsOnly`를 우회 → 미완료 세트 제외 테스트가 실패해야 한다
- `sourceSessionId`에 남의 id를 넣음 → 저장 테스트가 실패해야 한다
- 목록 RPC에서 `status='setup'` 조건 제거 → active 제외 테스트가 실패해야 한다
- 참가 RPC에서 `for update`를 빼고 동시 요청 → 중도 합류 테스트가 실패해야 한다
- 타바타 갈림길을 지우고 친구 타바타 복사 → 코스 복원 테스트가 실패해야 한다

---

## 7. 완료 보고 항목

① 수정 파일 ② 신규 마이그레이션 ③ 재사용한 기존 코드 ④ 새로 만든 코드와 **왜 재사용이
불가능했는지** ⑤ RLS/RPC 보안 검증 ⑥ 테스트 결과 ⑦ lint·typecheck·build
⑧ 브라우저 검증(**390px**) ⑨ 일부러 고장내서 잡은 회귀 사례 ⑩ 배포 전 남은 위험

## 8. 순서

0085 Run(사용자) → 따라하기 → 프로필 → 공개 챌린지. 단계마다 테스트 + 브라우저 확인 후 커밋.
**운영 배포는 하지 않는다 — 별도 승인.**
