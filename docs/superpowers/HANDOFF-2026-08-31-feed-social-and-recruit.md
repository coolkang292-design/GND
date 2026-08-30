# 인수인계 — 피드 소셜화 · 따라하기 · 프로필 · 챌린지 모집 (2026-08-31)

> ## ⚠️ §3 "남은 작업"은 **더 이상 최신이 아니다** (2026-09-01)
>
> A~E를 전부 처리했다. 무엇이 어떻게 됐는지와 **지금 남은 것**은
> [`HANDOFF-2026-09-01-safety-feed-goals.md`](./HANDOFF-2026-09-01-safety-feed-goals.md)를
> 보라. 이 문서의 §3만 보고 "회귀 2건이 실패 중이다"·"차단이 없다"로 판단하면 틀린다.
>
> **§4 함정 8개와 §5 검증 방법, §6 결정들은 그대로 유효하다** — 그래서 이 문서를
> 지우지 않았다.

## 0. 한 줄

피드를 "보기만 하는 곳"에서 **말이 오가는 곳**으로 바꿨다. 댓글·대댓글·좋아요
명단·기분 캡션, 친구 운동 따라하기, 프로필 소개·SNS, 챌린지 공개 모집과 생명주기
알림까지 **운영 배포 완료**. 마이그레이션 `0082`~`0088` 7개 전부 적용됐다.

---

## 1. 현재 위치와 상태

- 로컬 `main` = `origin/main` = **`c661c42`** (`git rev-list --left-right --count` → `0 0`)
- 운영 배포: `gnd-ct7lm3gem-gnd4.vercel.app` → `gnd-one.vercel.app`, `Ready`
- 마이그레이션: **0082~0088 전부 Run 완료**, 항목별 확인 쿼리로 대조함
- DB 스냅샷 `docs/db-current-schema.sql`: 갱신됨 (함수 87 · 정책 76 · 인덱스 91)
- 검증: `tsc` · `eslint` · `vitest 2808` · `next build` 전부 통과

```text
c661c42 docs: 릴리스 노트 — 챌린지 모집 · 따라하기 · 프로필 소개 · DB 스냅샷
4f474ca feat: 챌린지 시작·취소·참가 알림 · 프로필 편집 자리와 문구
a5c12fd feat: 챌린지 모집 탭 — 모집글·사진·상세
714436b feat: 홈에서 캐릭터를 눌러 소개·링크를 쓴다
1ceda08 feat: 피드에서 같이 할 챌린지를 찾는다
9549bb0 feat: 친구 운동 따라하기 · 프로필 소개와 SNS 링크
2c98383 docs: 릴리스 노트 — 크루의 운동에 말 걸기 · DB 스냅샷 갱신
d2d3687 feat: 피드에서 크루끼리 말을 주고받는다
```

설계 문서 두 개가 **판단의 원천**이다. 여기 요약된 것보다 자세하다:
- `docs/superpowers/plans/2026-08-30-feed-instagram-restructure.md`
- `docs/superpowers/plans/2026-08-31-follow-profile-discoverable.md`

---

## 2. 마이그레이션이 한 일 (0082~0088)

| | 무엇 | 새 테이블 |
|---|---|---|
| 0082 | 댓글 — **`cheers` 재사용**(구조가 이미 댓글이었다) · `post_session_comment` | 0 |
| 0083 | 댓글 작성자 이름 RPC (지금은 0084가 대체, 함수는 삭제됨) | 0 |
| 0084 | 대댓글(`parent_id`) · 댓글 수정(`edited_at`) · 좋아요/댓글 작성자 이름 | 0 |
| 0085 | `challenges.discoverable` · `profiles` 소개/SNS 3컬럼 · 공개 모집 RPC 3개 · **anon EXECUTE 소급 revoke** | 0 |
| 0086 | `discoverable` **컬럼 GRANT** (§5 ①) | 0 |
| 0087 | 모집글·모집사진 + 컬럼 GRANT + 목록 RPC 확장 | 0 |
| 0088 | 시작·취소·새 참가자 알림 + 챌린지 딥링크 | 0 |

**새 테이블은 하나도 안 만들었다.** 댓글은 `cheers`, 캡션은 0004부터 놀고 있던
`workout_sessions.title`, 모집 사진은 기존 `avatars` 버킷을 그대로 썼다.

---

## 3. 남은 작업 — 우선순위 순

### 🔴 A. 회귀 스크립트 2건이 실패 상태다 (기존 문제, 이번 작업과 무관)

`pnpm verify:regression --tier readonly`가 `실패 2`로 끝난다. 둘 다 매니페스트에
`knownFailure`로 적힌 **2026-08-19부터의 실패**이고, 이번 변경과 무관함을
확인했다. 하지만 **실패가 남아 있으면 진짜 회귀를 가린다.**

**A-1. `admin-dashboard-check` — 4건 실패**
`.env.local`의 `ADMIN_USER_IDS` 5개 중 4개가 auth에 없는 uuid(지워진 익명 세션
잔재)다. 유효한 1개와 `ADMIN_ACCESS_KEY`가 있어 `/admin`은 정상이다.
**고치는 법: `.env.local`에서 죽은 uuid 4개를 지우면 26/26이 된다.**

**A-2. `challenge-aggregation-parity` — 2건 실패**
`Test11` 챌린지에서 `dev-테스터B`가 **그룹에는 있는데 참가는 안 했다.** 단언이
"그룹원 전원이 참가한다"를 전제하는데, 크루원이 챌린지를 건너뛰는 것은 정상이다.
**고치는 법: 단언을 고치거나 `Test11`을 지운다.**

> ⚠️ **이 단언은 곧 더 자주 깨진다.** 공개 모집이 열리면서 이제 **참가자가
> 그룹원이 아닌** 경우가 생긴다(정상). 지금 실패는 그 반대 방향이지만, 단언
> 자체가 "참가자 집합 == 그룹원 집합"을 전제하므로 **양방향 모두 틀렸다.**
> 고칠 때 이 점을 같이 반영할 것.

### 🟠 B. 공개 모집의 안전장치가 없다

공개 모집으로 **모르는 사람**이 들어오게 됐는데 GND에는 아직:

| | 상태 |
|---|---|
| 사용자 차단(block) | **없음** (`send_crew_request` 주석: "차단도 없어서(D11)") |
| 사용자 신고 | **없음** (`bug_reports`는 버그용) |
| 모집글 도배 방어 | 없음 (방장 1인당 챌린지 수 제한 없음) |

지금은 노출 표면을 좁혀서 버티고 있다 — 모집글에 댓글도 DM도 없고, 연락 경로가
`send_crew_request`(7일 쿨다운) 하나뿐이다. **사람이 늘면 이게 먼저 문제가 된다.**

권장 순서: 신고 → 차단 → 모집글 만료(예: 7일)·1인 1건.

### 🟠 C. 원 계획서의 미착수 Phase (`2026-08-30-feed-instagram-restructure.md`)

**Phase C — 스토리 트레이.** 진행 중 크루 세션을 세로 카드(1명당 ~180px)에서
**가로 아바타 링 한 줄**로. 3명이 운동 중이면 지금은 첫 화면에 게시물이 안 보인다.
`ActiveWorkoutCards`는 **홈과 공용**이라 데이터 훅만 분리하고 홈은 카드로 둔다.

**Phase D — 카드 인스타화.** 사진 비율 `4/3 → 4/5` · 사진 탭에 **이미 만들어져
있는 `ImageLightbox`** 연결 · 더블탭 좋아요 · `더 보기` 버튼 → `IntersectionObserver` ·
**사진 그리드**(`getCrewFeed(…, photoOnly=true)` — 파라미터가 이미 구현돼 있는데
아무도 안 부른다).

### 🟡 D. 댓글 작성자 탭 → 크루 신청 (마이그레이션 0)

`send_crew_request(p_target_id)`는 **크루 여부를 요구하지 않는다.** 0084가 댓글
작성자의 id·닉네임을 이미 주므로 **버튼만 붙이면 동작한다.**

⚠️ 크루/같은 챌린지가 아닌 사람을 탭했을 때 기존 프로필 시트를 열면
`get_crew_member_profile`이 `not_crew`로 튕긴다 — **눌리는데 안 되는 버튼**이 된다.
크루 여부로 갈라서 "닉네임·아바타 + 크루 신청"만 보여주는 가벼운 시트가 필요하다.

### 🟡 E. 결론이 안 난 것들

- **`active` 챌린지에서 목표 수정**: 지금은 `goals_update_own_setup`의
  `challenge_in_setup`이 막는다. 열면 막판에 목표를 낮춰 100%를 만들 수 있다.
  제안했던 안: ① 올리는 것만 허용(권장) ② 자유 ③ 첫날만. **사용자 결정 필요.**
- **모집 카드 호스트의 소개가 안 보인다**: `get_crew_member_profile`의 문지기가
  크루/같은 챌린지인데 모집 호스트는 아직 둘 다 아니다. 지금은 카드에 소개를
  안 넣어서 문제가 드러나지 않는다.
- **`challenge_joined` 알림 소음**: 사람이 몰리면 방장에게 알림이 쏟아진다.
  묶어 보내기(digest)가 필요할 수 있다.

### ⚪ F. 이번 작업과 무관한 미커밋 잔여물

워킹트리에 **이전 세션 작업**이 커밋되지 않은 채 남아 있다. 검증된 적이 없어
손대지 않았고, 깨끗한 `main` 워크트리에서 배포했으므로 **운영에는 없다.**

```text
M  launch-motivation-splash.tsx/.test · launch-splash.ts/.test · analytics.ts
   HANDOFF-2026-08-17-gnd-launch-splash.md
?? src/lib/admin/snapshot.ts · snapshot-payload.ts
   docs/superpowers/plans/2026-08-25-admin-snapshot-for-ai.md
?? public/avatar-mock/ · docs/design-sources/avatar-shop/
   scripts/validate-avatar-mock-assets.mjs
```

---

## 4. ⚠️ 다음 사람이 반드시 알아야 할 함정 8개

### ① **RLS 정책이 있어도 GRANT가 없으면 못 쓴다**

이번에 가장 비싸게 배운 것이다.

```text
RLS 정책 = 어떤 **행**을 건드릴 수 있나
GRANT    = 그 **작업 자체**를 할 수 있나     ← 둘 다 있어야 한다
```

`challenges_update_creator` 정책이 있으니 `discoverable`을 직접 UPDATE하면 된다고
판단했는데, `authenticated`의 `challenges` 권한에 **UPDATE가 아예 없어서**
RLS에 닿기도 전에 `42501`로 죽었다. 0086이 컬럼 하나에만 GRANT를 준다.

이 스키마는 **컬럼 단위 GRANT**를 쓴다:
- `workout_sessions`: `deleted_at, group_id, intensity, memo, timezone, title, visibility, workout_type`
  (⚠️ `completed_at`·`status`는 **빠져 있다** — 서버 시간이 진실이라 RPC만 쓴다)
- `challenges`: `discoverable, end_date, name, recruit_image_url, recruit_note, start_date`
  (⚠️ `status`·`invite_code`는 빠져 있다)

**테이블 전체 GRANT로 바꾸지 마라.** `status`가 열리면 방장이 `start_challenge`의
목표·동의 게이트를 건너뛰고 시작할 수 있다.

### ② **`.update()`에 `.select()`를 빼지 마라 — 0행이어도 오류가 안 난다**

PostgREST가 `Prefer: return=minimal`로 보내서 **한 줄도 안 바뀌어도 `error`가
null**이다. 화면은 "저장했어요"라고 말하고 DB는 비어 있다. 실제로 완료 세션
136개 전부 `title`이 null인 채 조용히 실패했다.

`updateSessionCaption` · `setChallengeDiscoverable` · `setChallengeRecruitNote` ·
`setChallengeRecruitImage`가 전부 `.select("id")`로 0행을 잡아 던진다.

> **[미검증]** 최초 0행의 근본 원인은 끝내 못 짚었다. 개발 서버 재시작 전 옛
> 번들이 유력하다. 지금은 저장이 정상이고, 다시 실패하면 화면에 뜬다.

### ③ **`reference_id`가 무엇인지는 유형마다 다르다 — 딥링크 전에 세어 봐라**

| 유형 | `reference_id` | 딥링크 |
|---|---|---|
| `reaction_received` · `record_beaten` · `comment_received` | 세션 id | `/feed?session=` ✅ |
| `challenge_started/ended/invite/starting_soon/cancelled/joined` | 챌린지 id | `/challenge?open=` ✅ |
| **`cheer_received`** | **`cheers` 행 id** | ❌ 넣으면 없는 게시물로 간다 |
| **`challenge_dropped`** | **챌린지 id가 아니다** (운영 3건 중 0건 일치) | ❌ |
| `challenge_peek_unlocked` | 챌린지 id지만 목적지가 `/home` | ❌ 일부러 제외 |

**세어 보고 넣어라.** `push.test.ts`가 두 함정을 회귀로 고정한다.

### ④ **알림 유형을 늘리면 세 곳을 고쳐야 한다 — 한 곳만 컴파일러가 잡는다**

1. `notifications_type_check` — **허용목록이라 전체를 다시 써야 한다** (0078·0082·0088 패턴)
2. `notification-bell.tsx`의 `TYPE_ICON` — exhaustive `Record`라 **컴파일이 막는다** ✅
3. `push.ts`의 `PUSH_URL_BY_TYPE` — `Record<string,string>`이라 **안 막고 조용히 `/home`으로 떨어진다** ⚠️

### ⑤ **함수를 `drop` 후 `create`하면 EXECUTE 권한이 사라진다**

`RETURNS TABLE`의 칸이 늘면 `create or replace`가 반환 타입 변경으로 거부한다 →
drop이 필요한데, **그러면 Postgres가 PUBLIC EXECUTE를 기본으로 다시 준다.**
0085에서 걷어낸 `anon` 권한이 되살아난다. 0087이 그래서 다시 revoke한다.

⚠️ 새 SECURITY DEFINER RPC는 **처음부터** `revoke ... from public, anon` +
`grant ... to authenticated`로 만들어라. `grant`만 쓰면 PUBLIC이 남는다.

### ⑥ **친구 세션에는 `pastSessions`가 안 닿는다 (타바타)**

`addPastSession`은 `pastSessions`에서 세션을 찾아 타바타를 판정하는데, 그 목록을
채우는 `getCompletedSessions(userId)`는 `.eq("user_id", userId)` — **내 세션만**이다.
그래서 `getSessionCopySource`가 `tabata_minutes`를 먼저 읽어 갈림길을 태운다.
**이 갈림길을 지우면 친구 타바타가 맨몸운동 몇 개로 변질된다.**

### ⑦ **`workout_plans.source_session_id`에 남의 세션 id를 넣지 마라**

`workout_plans_insert_own`의 WITH CHECK에
`(source_session_id is null) or owns_workout_session(...)`이 있어 **INSERT가 통째로
거부된다.** 그리고 남의 기록이 내 기록 갱신 비교 기준이 되면 **내가 한 적 없는
무게가 내 최고 기록**이 된다. `copySourceSessionId`가 이 규칙을 갖고 있다.

### ⑧ **`avatars` 버킷에 delete 정책이 없다 — 사진이 쌓인다**

프로필 사진과 **모집 사진**이 같은 public 버킷에 타임스탬프 이름으로 쌓인다.
고정 이름으로 덮어쓰면 CDN 캐시 때문에 옛 사진이 계속 보이므로 그렇게 한 것인데,
0005에 delete 정책이 없어 클라이언트가 지울 수도 없다. 8명 규모에서는 무해하지만
**정리하려면 delete 정책 추가가 먼저다.**

---

## 5. 검증할 때 쓴 방법 (다음에도 쓸 것)

**운영 DB에서 흉내 내고 롤백.** RLS·RPC는 화면으로 못 보는 것이 많다.

```sql
do $$ ... 
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user,'role','authenticated')::text, true);
  ...단언...
  raise exception 'ROLLBACK_ON_PURPOSE';
end $$;
```

- 예외가 `ROLLBACK_ON_PURPOSE`로 끝나면 **그 앞의 단언이 전부 통과**한 것이고
  데이터는 롤백된다
- ⚠️ **알림 개수를 셀 때는 역할을 되돌려라.** `notifications`는 본인 것만 읽혀서
  흉내 낸 역할로 세면 0이 나온다 (실제로 한 번 속았다)

**일부러 고장내서 테스트가 잡는지 확인.** 이번에 5개를 확인했고 전부 잡혔다 —
친구 무게 유지 · 남의 `sourceSessionId` · 도메인 `endsWith` · 참가 `for update` 제거 ·
타바타 갈림길 제거.

---

## 6. 손대면 안 되는 결정들 (사용자가 정한 것)

- **액션 줄은 하트와 댓글 둘뿐이다.** 공유·북마크는 뺐고, 🔥·👏도 하트로 합쳤다.
  단 **옛 fire·clap 반응은 합산해서 센다** — `like`만 세면 12개 세션의 반응이
  화면에서 사라진다
- **따라하기 버튼은 액션 줄이 아니라 운동 상세 영역에.** 소통 버튼과 실행 버튼은
  성격이 다르다
- **캡션 입력은 원탭 칩.** 운동 직후는 지친 상태라 자유 입력창을 첫 화면에 두면
  대부분 비운다. 자유 입력은 접혀 있다
- **피드 카드에서는 칩이 접혀 있다.** 펼쳐 두면 편집 도구가 게시물보다 커진다
- **모집은 피드와 탭으로 갈린다.** 피드 위에 얹었더니 첫 게시물이 접힘선 밖으로
  밀렸다. 하단 탭바에는 넣지 않는다(이미 5개)
- **모집 카드는 크루 0명인 신규 사용자에게도 보여야 한다.** 피드 목록과 무관하게
  스스로 조회하는 이유다
- **프로필 편집 입구는 레벨 사진 바로 밑.** 문구는 상태별로 갈린다 —
  비었으면 얻는 것을 말하고(`✨ 나를 한 줄로 소개해요`), 채웠으면 짧게(`✏️ 내 프로필 다듬기`)
- **참가해도 크루가 되지 않는다.** "챌린지 관계 ≠ 크루 관계"
