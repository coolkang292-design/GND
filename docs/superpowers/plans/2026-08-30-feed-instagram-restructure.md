# 피드 탭 인스타그램식 재편 — 제1원칙 분석과 계획

작성: 2026-08-30 · 상태: **Phase A·B 구현 완료 — 화면 확인 대기**
개정: 2026-08-30 전문가 검토에서 **치명적 결함 3 · 중대 2**를 잡아 설계를 고쳤다 (§10).
      사용자 지적으로 **캡션(A-0)**이 범위에 들어왔다 (§5 Phase A-0).
목적(사용자 확인): **운동을 매개로 크루끼리 소셜 커뮤니케이션을 강화한다.**
"인스타그램 구성"은 목적이 아니라 그 수단이다. 아래 분석은 인스타의 어떤 요소가
그 목적에 실제로 기여하는지를 가려낸다.

---

## 1. 문제의 본질

**핵심 문제:** 크루가 서로의 운동을 **보기는** 하는데 **말을 주고받지 못한다.**

**성공 기준(측정 가능):**

| 지표 | 지금 | 목표 |
|---|---|---|
| 완료된 운동 1건에 남는 **텍스트** 수 | **구조적으로 0** (남길 곳이 없다) | > 0 |
| 텍스트의 **왕복** 여부 | 편도 (받은 사람이 답할 곳이 없다) | 왕복 |
| 알림 → **그 게시물** 도달률 | **0%** (피드 최상단으로만 간다) | 100% |
| 진행 중 세션이 먹는 자리 | 1명당 세로 ~180px, 3명이면 첫 화면을 다 먹는다 | 1줄(가로 링) |

### 지금 GND에서 "말"이 갈 수 있는 경로 — 전수

| 경로 | 언제 | 무엇이 오가나 | 왕복 | 코드 |
|---|---|---|---|---|
| 응원 `cheers` | 운동 **중**에만 | 이모지 4종 + **30자 한마디**, 세션당 3회 | ❌ 답할 곳 없음 | `send_cheer` RPC |
| 리액션 `reactions` | 완료 후 | 🔥👏❤️ — **말이 없다** | ❌ | `toggleReaction` |
| 찌르기 `pokes` | 아무 때 | **말이 없다** | ❌ | `poke_user` |
| 알림 | — | 받기만 | ❌ | `notifications` |

> **결론.** GND에서 사람의 문장이 흐르는 통로는 **운동 중 30자 한마디 하나뿐**이고
> 그마저 편도다. 소통이 약한 원인은 "피드가 인스타처럼 안 생겨서"가 아니라
> **완료된 게시물에 댓글이 없어서**다. 레이아웃은 증상이고 이게 원인이다.

---

## 2. 가정 검증

| 가정 | 도전 | 판정 |
|---|---|---|
| "인스타처럼 보이면 소통이 는다" | 인스타의 대화는 레이아웃이 아니라 **댓글 스레드 + 알림 왕복**에서 난다. 카드 모양만 바꾸면 보기 좋은 벙어리 피드가 된다 | **수정** — 레이아웃은 3순위, 댓글이 1순위 |
| "댓글은 새 테이블이 필요하다" | `cheers`가 이미 `(session_id, sender_id, receiver_id, message, created_at)`이다. **구조적으로 이미 댓글 테이블**이고, 다른 건 RPC가 건 정책(`status='active'`·3회·30자)뿐이다 | **폐기** — 테이블 재사용 |
| "댓글 읽기 정책을 새로 짜야 한다" | `cheers_select_related`가 이미 `session_crew_shared(session_id)`를 허용한다 — 크루원은 그 세션의 응원을 **이미 전부 읽을 수 있다**. `cheers_delete_own`으로 자기 것 삭제도 열려 있다 | **폐기** — RLS 변경 0 |
| "팔로우를 인스타식 단방향으로 바꿔야 한다" | `crew_links`는 **상호 수락 대칭**이고 RLS 정책 74개·함수 80개가 이 전제 위에 있다. 단방향으로 바꾸면 가시성 판정 전체가 흔들린다 | **폐기** — 그래프는 손대지 않는다 |
| "게시물엔 사진이 있어야 한다" | GND 게시물의 본체는 **운동 데이터**(종목·세트·볼륨)다. 사진은 옵션이고 사진 없는 기록이 다수다 | **수정** — 사진 없는 카드 유지, 대신 사진 유도 |
| "스토리는 새로 만들어야 한다" | `ActiveWorkoutCards`가 이미 **휘발성 + 실시간 + 답장(응원)**이다. 인스타 스토리의 세 성질을 다 갖췄고 모양만 세로 카드다 | **폐기** — 표시만 바꾼다 |
| "DM이 필요하다" | DM은 별개 제품(스레드·읽음·목록·알림 전부 새로). 게시물 댓글도 없는 상태에서 DM부터는 순서가 거꾸로다 | **이번 범위에서 폐기** |
| "무한 스크롤이 필요하다" | 커서 페이지네이션(`before`)이 이미 있다. `IntersectionObserver` 하나면 끝 | **유지(싸다)** |

---

## 3. 불변 사실 (ground truths)

1. **대화는 텍스트가 왕복해야 성립한다.** 편도는 대화가 아니라 알림이다.
2. 왕복하려면 셋이 다 있어야 한다 — ① 남길 곳 ② 알림 ③ **알림에서 그 자리로 돌아오는 길**. 지금 GND는 ③이 없다 (`PUSH_URL_BY_TYPE`가 유형→고정 주소라 `reference_id`를 안 쓴다).
3. 게시물의 식별자는 `workout_sessions.id`다. `reactions`·`cheers`·`workout_images`가 전부 여기 매달려 있다 — **댓글도 여기 매달면 된다.**
4. 소셜 그래프는 `crew_links` 상호 대칭이고 모든 조회를 RLS가 크루로 좁힌다. 공개 게시물·외부 공유는 구조적으로 불가능하다.
5. 인증사진은 **private 버킷 + 서명 URL**(`signFirstImages`)이다. 링크 공유가 안 된다.
6. 진행 중 세션은 **지금 이 순간에만** 존재한다 — 대화가 가장 잘 붙는 순간이고, 지나면 사라진다.

---

## 4. 인스타 요소 → GND 자산 대조 (재사용 판정)

| 인스타 요소 | GND에 이미 있는 것 | 판정 |
|---|---|---|
| 스토리 트레이(가로 링) | `feed/active-workout-cards.tsx` — 진행 중 세션 + 60초 폴링 | **표시만 교체** |
| 스토리 답장 | 응원 4버튼 + ✍️ 한마디 (`sendCheer`) | **그대로 이식** |
| 게시물 헤더(아바타·이름·시간) | `FeedItemCard` 헤더 + `Avatar` + `timeAgo` | **그대로** |
| 게시물 미디어 | `photoUrl` + `PhotoStamp` + `ImageLightbox`(이미 있음) | **비율/탭 동작만** |
| 좋아요 | `ReactionBar` 🔥👏❤️ 낙관적 토글 + 롤백 | **스타일만** |
| **댓글** | **없음 — 진짜 공백** | **`cheers` 재사용** |
| 캡션 | `title` · `exerciseSummary()` · `recordNote` · `tabataMinutes` | **그대로** |
| 알림 | `notifications` + 벨 + 푸시 + Realtime 배너 | **유형 1개 추가** |
| 프로필 | `MemberProfileSheet`(561줄 — 배지·레벨·이력) | **그대로** |
| 사진 그리드 / 탐색 | `getCrewFeed(…, photoOnly)` — **구현돼 있는데 아무도 안 쓴다** | **호출만 하면 됨** |
| 검색 | `crew/crew-search-result.tsx` 닉네임 검색 | **그대로** |
| 무한 스크롤 | 커서 `before` + `loadMore()` | **버튼→관찰자** |
| 북마크 / 외부 공유 / 릴스 / DM | — | **하지 않는다** (§7) |

> 새로 만들어야 하는 것은 **댓글 스레드 UI 1개**와 **스토리 줄 1개**뿐이다.
> **새 테이블은 0개**다.

---

## 5. 실행 계획

효과 순서로 배치했다. A와 B가 목적(대화 왕복)을 직접 달성하고, C·D는 그 대화가
잘 보이게 만드는 포장이다. **A만 해도 목적의 절반은 달성된다.**

### Phase A-0 — 캡션: `workout_sessions.title` 재사용 (마이그레이션 0)

**사용자 지적 (2026-08-30).** "지금 세팅에는 게시물에 코멘트를 다는 기능이 없지 않나?"
맞다. 그리고 이건 댓글과 **다른 것**이다 — 캡션은 게시물의 말, 댓글은 대화다.
**캡션이 없으면 게시물이 순수 운동 데이터라 답할 거리가 없고, 그러면 댓글도 안 달린다.**
Phase A의 전제 조건이다.

확인한 사실:

| | 상태 |
|---|---|
| `workout_sessions.title text check (char_length <= 60)` | **0004부터 존재** |
| `getCrewFeed`의 select | **이미 `title`을 가져오고 있다** (`FeedItem.title`) |
| `item.title`을 렌더하는 곳 | **0곳** (grep 0건) — 가져와서 버리고 있었다 |
| `title`을 쓰는 곳 | **0곳** |
| 쓰기 권한 | `sessions_update_own`(0004:234)이 주인의 UPDATE를 이미 연다 |

→ **마이그레이션이 필요 없다.**

#### ⚠️ 입력은 원탭 칩이다 — 자유 입력창이 아니다 (사용자 결정 2026-08-30)

> "인증사진을 찍는 시점은 운동을 하고 매우 피곤한 상태잖아. 입력을 최대한
> 간소하게, 예를 들면 클릭 베이스로."

인스타는 캡션을 **소파에서** 쓴다. GND는 **방금 운동을 끝낸 사람**이 쓴다 —
땀나고 숨차고 한 손에 폰을 든 상태다. 같은 자유 입력창을 놓으면 그 비용을
감당할 사람만 쓰고 나머지는 비워 두는데, 캡션이 비면 위의 전제가 무너진다.

**지친 사람이 지불할 수 있는 비용은 탭 1회다.**

- 칩 6개 가로 한 줄. 축은 "얼마나 힘들었나" — 크루가 가장 잘 받아치는 신호다
- **확인 버튼 없음.** 누르는 즉시 저장(낙관적 반영 + 실패 시 롤백)
- 같은 칩을 다시 누르면 **해제** — 잘못 누른 것을 되돌릴 길이 없으면 원탭은 위험하다
- `✍️ 직접 쓰기`는 **접혀 있고** 원하는 사람만 편다
- **칩은 코드가 아니라 문구를 저장한다.** 코드로 저장하면 목록을 바꾸는 순간 옛 게시물이 뜻을 잃는다

| 파일 | 내용 |
|---|---|
| `src/lib/domain/session-caption.ts` (신규) | 칩 목록 · `normalizeCaption` · `isValidCaption` · `toggleChip` — 순수 함수 |
| `src/components/feed/caption-picker.tsx` (신규) | 칩 UI. **완료 화면과 피드 본인 카드가 같은 것을 쓴다** |
| `src/lib/workout.ts` | `updateSessionCaption` — 직접 UPDATE (RPC 불필요) |
| `src/components/feed/feed-item.tsx` | 캡션 렌더 + 본인 게시물이면 칩 |
| `src/app/(tabs)/record/page.tsx` | 완료 화면, **인증사진보다 위**에 칩 한 줄 |

두 자리에 다 두는 이유 — 완료 직후가 자연스러운 순간이지만, 그때 안 단 사람과
**옛 게시물 전부**가 영영 캡션 없이 남는다 (`LatePhotoButton`과 같은 사상).

---

### Phase A — 댓글: `cheers` 테이블 재사용 (효과 최대)

**재사용:** `cheers` 테이블 · `cheers_select_related` RLS · `cheers_delete_own` RLS ·
`session_crew_shared()` · `notify()` · `toSocialError()` · `timeAgo()` · `Avatar`

**새로 쓰는 것**

| 파일 | 내용 | 분량 |
|---|---|---|
| `supabase/migrations/0082_session_comments.sql` | ① `message` 길이 CHECK 30→200 완화 ② `sender_id <> receiver_id` CHECK 제거(본인 게시물 답글 허용) ③ `notifications_type_check`에 `comment_received` 추가 — **0078의 허용목록 재작성 패턴 그대로** ④ RPC `post_session_comment(p_session_id, p_body)` | ~90줄 SQL |
| `src/lib/social.ts` (추가) | `fetchSessionThreads(sessionIds)` — `cheers` **직접 select**(RLS가 크루로 좁히므로 RPC 불필요) · `getSessionThread()` · `postSessionComment()` · `deleteMyComment()` | ~110줄 |
| `src/components/feed/comment-thread.tsx` | 스레드 + 입력창. `ReactionBar`의 낙관적 반영·롤백 패턴 복사 | ~120줄 |

**RPC가 기존 `send_cheer`와 다르게 거는 정책** (구조가 아니라 정책만 다르다)

| | `send_cheer` (유지) | `post_session_comment` (신규) |
|---|---|---|
| 세션 상태 | `active`만 | `completed` 허용 |
| 본인 세션 | 금지 (`own_session`) | **허용** — 답글이 되어야 왕복이 성립 |
| 횟수 | 세션당 3회 | 제한 없음 (10초 쿨다운만) |
| 길이 | 30자 | 200자 |
| 포인트 | 지급 | **지급 안 함** — 댓글로 포인트를 벌면 도배가 이득이 된다 |
| 알림 | `cheer_received` | `comment_received` |

> ⚠️ `send_cheer`의 `own_session` 가드는 **건드리지 않는다.**
> 이 단언을 갖고 있는 곳: `scripts/rls-test.mjs:472` · `crew-link-check.mjs:396` ·
> `cheer-points-check.mjs:333`. 셋 다 **RPC 가드**를 검사하므로 테이블 CHECK를
> 없애도 회귀가 안 난다.

**응원과 댓글을 한 스레드에 섞는다 (결정 완료).** 운동 중 받은 "💪 힘내"는 그 운동에
대한 말이 맞고, 나누면 사용자에게는 대화가 두 군데로 쪼개져 보인다. 표시 규칙만
나눈다 — **메시지가 있는 행은 댓글 줄로**, 메시지 없는 이모지 응원은 스레드 맨 위에
**한 줄로 접는다**(`🔥3 💪1 · 응원 4`).

**피드 목록에 댓글 수 붙이기** — `fetchReactions(sessionIds)`와 **같은 모양**으로
`fetchSessionComments(sessionIds)`를 하나 더. 20건짜리 페이지의 세션 id로 한 번
질의해 클라이언트에서 접는다(카운트 + 최신 2줄 미리보기). **왕복 +1회.**

**검증:** 픽스처 A·B 두 계정. A 완료 → B가 댓글 → **A 알림 벨에 뜨는가** →
A가 답글 → **B 알림에 뜨는가**. (CLAUDE.md §사회적 기능)

---

### Phase B — 알림에서 그 게시물로 돌아오는 길 (루프 닫기)

지금 리액션 알림을 눌러도 `/feed` 최상단으로 간다. **누가 무엇에 반응했는지 못 찾는다.**
`notifications.reference_id`에 세션 id가 이미 들어 있는데 라우팅이 안 쓴다.

| 파일 | 변경 |
|---|---|
| `src/lib/domain/push.ts` | `pushPayloadFor()`에 `referenceId?` 인자 추가. `comment_received`·`reaction_received`·`record_beaten` → `/feed?session=<id>` |
| `src/components/notification-bell.tsx` | `TYPE_ICON`에 `comment_received: "💬"` (이 Record는 exhaustive라 **빠뜨리면 컴파일이 먼저 막는다**) · `pushPayloadFor`에 `n.reference_id` 전달 |
| `src/lib/social.ts` | `getCrewFeed`에 `sessionId?` 옵션 — 같은 select 문자열에 `.eq("id", …)` 하나 |
| `src/app/(tabs)/feed/page.tsx` | `?session=`이 있으면 그 카드를 **상단에 고정**하고 댓글을 펼친 채로 연다. 주소에서 파라미터를 지운다 — `record/page.tsx`의 `?suggest` 처리와 같은 수법 |

**재사용:** `reference_id`(이미 저장 중) · `?suggest` 딥링크 선례 · 기존 커서 질의

---

### Phase C — 스토리 트레이 (진행 중 = 대화가 가장 잘 붙는 순간)

지금 진행 중 카드는 1명당 세로 ~180px다. 3명이 운동 중이면 **첫 화면에 게시물이
하나도 안 보인다.** 인스타 스토리 줄로 바꾸면 같은 정보가 1줄에 들어가고,
탭하면 시트에서 응원한다.

| 파일 | 변경 |
|---|---|
| `src/lib/hooks/use-active-crew-sessions.ts` (신규) | `ActiveWorkoutCards`의 `useEffect`(조회 + 60초 폴링)를 **그대로 들어낸 훅**. 홈이 `sessions`를 넘겨 쓰는 지금 구조가 유지된다 |
| `src/components/feed/story-tray.tsx` (신규) | 가로 스크롤 아바타 + 초록 링 + `{minutesSince}분` |
| `src/components/feed/active-workout-cards.tsx` | 응원 4버튼 + ✍️ 한마디 블록(`ActiveWorkoutCard` 본문)을 **시트에서도 쓸 수 있게** 분리만. 홈 화면은 **그대로 카드** |

**재사용:** `sendCheer` · `CheerPointModal` · `cheerErrorMessage` · `minutesSince` · `Avatar`
**⚠️ 홈 화면 회귀 주의:** 이 컴포넌트는 홈과 공용이다. 홈의 카드 표시를 깨뜨리지 않는다.

---

### Phase D — 게시물 카드 인스타화 (표시만, 새 질의 0)

| 항목 | 지금 | 바꿀 것 | 근거 |
|---|---|---|---|
| 사진 비율 | `aspect-[4/3]` | `aspect-[4/5]` | 세로 화면에서 사진이 크게 보이고 스크롤당 1게시물이 온다 |
| 사진 탭 | 없음 | `ImageLightbox` 연결 | **이미 만들어져 있다** |
| 더블탭 | 없음 | ❤️ 토글 | `ReactionBar`의 `toggle("like")` 재사용 |
| 액션 행 | 반응 3칩 | 🔥👏❤️ + 💬 + 수 | Phase A 결과 노출 |
| 캡션 | 요약 버튼 | `**닉네임** 종목 요약` + `상세 ▼` 유지 | 인스타 캡션 형식 |
| 날짜 헤더 `📅 8월 30일 · 운동 3` | 있음 | **유지** | 인스타엔 없지만 운동 앱에는 "며칠 했나"가 핵심이다. 인스타를 베끼자고 버리지 않는다 |
| 사진 없는 기록 | 요약 카드 | **유지** + 사진 유도 | `late-photo-button.tsx`가 이미 있다 |
| 더 보기 버튼 | 버튼 | `IntersectionObserver` | `loadMore()` 그대로 |
| 사진 그리드 | 없음 | `getCrewFeed(…, photoOnly=true)` 3열 | **파라미터가 이미 구현돼 있다** |

---

## 6. 단계별 비용·효과

| 단계 | 새 파일 | 마이그레이션 | 새 테이블 | 목적 기여 |
|---|---|---|---|---|
| A 댓글 | 1 | 1 | **0** | ★★★ 말을 남길 곳이 생긴다 |
| B 딥링크 | 0 | 0 | 0 | ★★★ 왕복이 닫힌다 |
| C 스토리 | 2 | 0 | 0 | ★★ 지금 운동 중인 사람에게 말이 붙는다 |
| D 카드 | 1 | 0 | 0 | ★ 읽기 편해진다 |

---

## 7. 하지 않는 것 — 그리고 왜

| 인스타 기능 | 안 하는 이유 |
|---|---|
| **DM** | 별개 제품이다. 게시물 댓글도 없는데 DM부터는 순서가 거꾸로다. 댓글이 붙고 사용량을 본 뒤 다시 판단한다 |
| **북마크/저장** | 남의 운동을 저장해서 나중에 볼 이유가 없다 |
| **외부 공유** | 인증사진이 private 버킷 + 서명 URL이고 RLS가 크루 밖 조회를 막는다. 구조적으로 불가능하다 |
| **단방향 팔로우** | `crew_links`가 상호 대칭이고 RLS 74개가 그 전제 위에 있다 |
| **릴스/동영상** | 업로드·인코딩·스토리지 비용이 전부 새로 든다 |
| **광고/추천 피드** | 크루는 폐쇄 그래프다. 추천할 모수가 없다 |

---

## 8. 위험

| 위험 | 대비 |
|---|---|
| 댓글 도배 | 포인트를 **주지 않는다**(응원과 다른 점). 10초 쿨다운 유지. 본인 삭제는 `cheers_delete_own`으로 이미 열려 있다 |
| `sender_id <> receiver_id` CHECK 제거가 응원 회귀를 부름 | RPC 가드(`own_session`)는 그대로 둔다. `rls-test.mjs:403`이 이걸 계속 검사한다 |
| 홈 화면 회귀 (Phase C) | `ActiveWorkoutCards`는 홈 공용. 홈은 카드 그대로 두고 훅만 분리 |
| 알림 유형 추가 누락 | `notification-bell.tsx`의 `TYPE_ICON`은 exhaustive `Record`라 컴파일이 막는다. **`push.ts`의 `PUSH_URL_BY_TYPE`는 `Record<string,string>`이라 안 막는다** — 손으로 챙긴다(그 파일 주석에 이미 경고돼 있다) |
| 피드 왕복 증가 | 페이지당 +1회(20건 묶음). 리액션 집계와 같은 패턴 |
| 마이그레이션 Run 시점 | 0082는 **전부 안전**(제약 완화 + 새 RPC + 허용목록 확장). 운영 앱이 참조하지 않으므로 개발 확인 전에 먼저 Run해도 된다 |

---

## 9. 반드시 지킬 순서

1. 0082 마이그레이션을 **사용자가 SQL Editor에서 Run**
2. `node scripts/dev-fixture.mjs create` → `pnpm dev`
3. **A·B 두 계정으로 화면 확인** (댓글·알림은 사회적 기능이다 — 한 계정으로 보면 절반만 본 것)
4. `pnpm verify:regression` · lint · typecheck · test · build
5. `pnpm db:snapshot`으로 `docs/db-current-schema.sql` 갱신
6. `release-notes.data.json`에 항목 추가 — **배포 전에**
7. 커밋 → 푸시 → 배포 → 프로덕션 실물 확인


---

## 10. 전문가 검토에서 잡은 결함 — 구현 전 (2026-08-30)

초안을 코드로 검증했더니 **치명 3 · 중대 2**가 나왔다. 초안 점수 **86/100**이고,
깎인 곳은 전부 §설계 완결성이었다. 아래는 무엇이 틀렸고 어떻게 고쳤는지다.

### 🔴 치명 #1 — 알림이 게시물 주인에게만 가서 왕복이 안 닫힌다

`cheers.receiver_id`는 세션 주인이다. B가 A 글에 댓글 → A에게 알림 ✅.
**A가 답글 → receiver가 또 A라서 A가 자기 알림을 받고 B는 영영 모른다.**
"왕복"을 성공 기준으로 걸어 놓고 알림 팬아웃을 설계하지 않았다.

**고침** — `post_session_comment`가 **세션 주인 + 앞선 댓글 작성자 전원**에게
알린다(작성자 본인 제외). 말 없는 이모지 응원만 한 사람은 **제외**한다 — 소음이다.

### 🔴 치명 #2 — 폰 잠금화면 푸시는 여전히 피드 꼭대기로 간다

`src/app/api/push/notify/route.ts`의 select에 `reference_id`가 없었다.
`push.ts`만 고치면 **앱 안 알림함은 게시물로 가는데 푸시는 `/feed` 최상단으로**
가는 반쪽 상태가 된다. 초안은 이 파일을 언급조차 안 했다.

**고침** — 라우트 select에 `reference_id` 추가 + `pushPayloadFor`에 전달.

### 🔴 치명 #3 — `cheer_received`를 딥링크에 넣으면 없는 게시물로 간다

`reference_id`가 무엇인지가 유형마다 다르다:

| 유형 | `reference_id` | 딥링크 |
|---|---|---|
| `reaction_received` | `new.session_id` — **세션** | ✅ |
| `record_beaten` | `p_session_id` — **세션** | ✅ |
| `comment_received` (0082) | `p_session_id` — **세션** | ✅ |
| `cheer_received` | **`c.id` — cheers 행 id** | ❌ **넣으면 안 된다** |

**고침** — `SESSION_DEEP_LINK_TYPES` 집합으로 셋만 딥링크한다. 응원은 애초에
**진행 중** 세션이라 게시물이 아직 없으므로 `/feed`가 맞는 목적지다.
`push.test.ts`에 회귀 단언을 넣었다.

### 🟠 중대 #4 — `notification_settings.cheers` 재사용 시 댓글 알림이 조용히 죽는다

`send_cheer`가 `coalesce(ns.cheers, true)`로 알림을 건다. 댓글이 같은 스위치를
쓰면 "응원 알림 끔"이 **댓글 알림까지** 끈다 — 사용자는 그걸 끈 적이 없다.

**고침** — `notification_settings.comments boolean not null default true` 추가
(순수 추가). `NotificationSettings` 타입에도 반영.

### 🟠 중대 #5 — 응원 3회 제한 카운터에 댓글이 섞인다

`send_cheer`의 `select count(*) from cheers where session_id and sender_id`가
**행 종류를 안 가린다.** 지금은 안전하다 — 응원은 `active`, 댓글은 `completed`라
한 세션에서 시간순으로 겹치지 않는다. 하지만 **진행 중 세션에도 댓글을 허용하면
댓글 3개로 응원이 잠긴다.**

**고침** — `cheer_type` 허용목록에 `'comment'`를 넣어 데이터가 스스로를 설명하게
하고, 0082에 못을 박았다: *"진행 중 댓글을 허용하려거든 그 count에
`and cheer_type <> 'comment'`를 먼저 넣어라."* `send_cheer` 자체는 **건드리지
않았다** — 60줄 함수를 손으로 옮겨 적는 위험이 지금 없는 문제를 막는 값보다 크다.

### 그 밖에

- **딥링크 실패 경로.** 지워졌거나 크루가 끊긴 게시물로 들어오면 아무 말 없이
  그냥 피드가 떴다 → `"missing"` 상태를 따로 두고 *"지금은 볼 수 없는 운동이에요"*.
- **`useSearchParams` 금지.** 이 저장소가 세 번 거부한 훅이다(Suspense 경계).
  `useEffect`+`setState`도 `react-hooks/set-state-in-effect`가 막는다 →
  `login/page.tsx`의 `useSyncExternalStore` 수법을 따랐다.
- **주소를 지우지 않는다.** `history.replaceState`로 `?session=`을 지우면 다음
  렌더의 스냅샷이 달라져 **고정 카드가 스스로 사라진다.**

### 검증해서 사실로 확인된 초안 전제 (전부 참)

- `session_crew_shared`가 `visibility='group'` + (주인 본인 OR 크루) → **완료 세션 댓글 읽기가 이미 열려 있다. RLS 변경 0**
- `cheers`에 INSERT 정책 없음 → SECURITY DEFINER RPC만 쓸 수 있다
- `cheers_delete_own` 존재 → 본인 댓글 삭제에 새 코드가 필요 없다
- `NotificationRow.reference_id`가 타입에 있고 `select("*")`로 온다
- `TYPE_ICON`이 exhaustive `Record` → 유형 추가 시 **컴파일이 먼저 막았다** (실제로 막혔다)
- 0078이 `notifications_type_check` 최신 → 허용목록 23개 확정

---

## 11. 구현 상태 (2026-08-30)

| | 상태 |
|---|---|
| 마이그레이션 0082 | 파일 작성 완료 · **사용자 Run 대기** |
| Phase A-0 캡션 | 코드 완료 (마이그레이션 불필요) |
| Phase A 댓글 | 코드 완료 · 0082 Run 후 동작 |
| Phase B 딥링크 | 코드 완료 |
| Phase C 스토리 · D 카드 | **미착수** |

검증: `typecheck` ✅ · `eslint` ✅ · `vitest` 2693 → **2703건 통과** ✅ · `next build` ✅
**화면 확인은 아직 안 했다** — 0082 Run과 픽스처 로그인이 선행돼야 한다.


---

## 12. 댓글 가시성과 액션 줄 (2026-08-30, 사용자 질문에서 나옴)

### 질문: "내가 특정 크루에게 댓글을 달면 그 크루의 친구들도 볼 수 있나?"

**답: 볼 수 있다.** 댓글 가시성은 **게시물을 따라간다.**

A의 글에 내가 댓글을 달았을 때:

| 읽는 사람 | 댓글 내용 | 작성자 이름 (0083 전) |
|---|---|---|
| A (글 주인) | ✅ | ✅ |
| A의 크루 **이면서 나와도 크루** | ✅ | ✅ |
| A의 크루, 나와는 크루 아님 — **같은 그룹** | ✅ | ✅ |
| A의 크루, **나와 크루도 그룹도 아님** | ✅ | ❌ **"크루원"** |
| A와 크루가 아닌 사람 | ❌ | — |

⚠️ **이건 0082가 만든 게 아니다.** `cheers_select_related`가 0011/0039부터
`session_crew_shared`를 허용했고, **운동 중 응원 한마디가 이미 똑같이 동작했다.**
0082는 같은 규칙을 댓글로 넓혔을 뿐이다.

### 발견한 어긋남 — 읽기 범위 ≠ 이름 범위

```
댓글 읽기  cheers_select_related       → session_crew_shared   = 글 주인의 크루
이름 읽기  profiles_select_own_or_crew → is_crew_with OR shares_group_with
                                       = 내 크루 / 같은 그룹
```

운영 데이터로 계산: **읽을 수 있는 제3자 11쌍 중 3쌍**이 이름을 못 본다.
화면은 `who?.nickname ?? "크루원"`으로 떨어져 **누가 한 말인지 모르는 댓글**이 남는다.

### 결정 (사용자 2026-08-30): 이름을 보이게 한다 — 단, RPC로

> ⚠️⚠️ **`profiles` 테이블 정책을 넓히지 않았다.** 그 길이 더 짧았지만,
> `profiles`에는 닉네임·아바타만 있는 게 아니다 — `invite_code` · `invited_by` ·
> `acquisition_source/medium/campaign/referrer/landing` (0079·0080).
> 정책을 넓히면 **초대 코드와 마케팅 유입 데이터까지** 크루의 크루에게 열린다.
> 사용자가 승인한 것은 "이름"이지 그것이 아니다.

`0083_comment_author_names.sql` — `get_session_comment_authors(uuid[])`가
**id·nickname·avatar_url 세 칸만** 돌려준다. 문지기는 `session_crew_shared`로,
**댓글 읽기 정책과 같은 함수**를 쓴다 → 규칙이 하나다: *댓글을 읽을 수 있으면
이름도 읽을 수 있다.* 조건을 베껴 적으면 언젠가 한쪽만 고쳐져 같은 버그가
반대 방향으로 난다.

말 없는 이모지 응원은 제외한다 — 화면에서 `🔥3 💪1` 익명 집계라 이름이 필요 없다.

### 액션 줄 — 인스타식 민무늬 아이콘 (사용자 결정 + 첨부 화면)

> "감정을 남기는 것도 심플하게 남기면 좋을듯, 첨부된 인스타처럼"
> "공유하기만 빼면 되겠네"

**바꾼 것: 알약(pill) → 민무늬 아이콘.** 전에는 🔥👏❤️ 셋이 각각
`rounded-full border bg-surface-2` 알약이라 카드에서 제일 무거운 덩어리였다.
인스타 액션 줄은 선 아이콘만 나란히 있고 테두리도 채움도 없다.

**안 바꾼 것: 감정 개수.** 인스타의 그 줄도 아이콘이 넷이다(♡ 💬 ➤ 🔖).
여기도 🔥 👏 ❤️ + 💬로 **넷이라 밀도가 같다.** 무거웠던 원인은 개수가 아니라
알약이었다. 감정 셋을 남기는 편이 목적(소셜 커뮤니케이션)에 맞고, 이미 쌓인
fire·clap 반응의 뜻도 잃지 않는다.

**넣지 않은 것: 공유(➤)·북마크(🔖).** 사용자 지시이기도 하고, §7의 근거 그대로다 —
인증사진이 private 버킷 + 서명 URL이라 **외부 공유가 구조적으로 불가능**하다.

상태는 테두리 대신 **투명도**로 말한다(`opacity-40 grayscale`) — 탭바 아이콘과
같은 수법이다. 0인 반응은 숫자를 안 그린다(`0 0 0`이 줄을 채우면 지저분하다).
아이콘이 작아도 세로 패딩으로 손가락이 닿는 높이를 유지한다.
