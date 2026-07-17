# Phase 6 소셜 구현 계획 (피드·반응·응원·찌르기·알림함)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크루 소셜 루프(피드 → 반응 / 진행 중 → 응원 → 배너 / 찌르기 / 알림함)를 완성한다.

**Architecture:** DB는 0011(적용 완료 전제) — 알림은 definer RPC·트리거가 생성, Realtime은 notifications 단일 구독. 클라이언트는 `lib/domain/social.ts`(순수·TDD) + `lib/social.ts`(I/O) + `components/feed/*` 조합. 설계 근거: `docs/superpowers/specs/2026-07-17-phase6-social-design.md`.

**Tech Stack:** Next.js 16 App Router · TS strict · Supabase (RLS·RPC·Realtime) · Vitest

**전제:** 0011 사용자 적용 완료("Success" 확인). 미적용이면 진행 금지.

---

### Task 1: RLS 테스트 확장 (경계 먼저 고정)

**Files:**
- Modify: `scripts/rls-test.mjs` (Phase 5 블록 뒤에 Phase 6 블록 추가)

- [ ] **Step 1: Phase 6 검사 추가** — 기존 픽스처(A·B 같은 크루, C 비크루) 재사용. A가 세션 시작 → 검사:

```js
// ── Phase 6: 소셜 (events·reactions·cheers·notifications) ──
// A가 draft 생성→시작 (기존 헬퍼 재사용)
// 1) workout_events: B(크루) 조회 가능, C(비크루) 0행, 클라 직접 insert 403/42501
// 2) B가 send_cheer 성공 (201/200, cheer 행 반환)
// 3) A 본인 세션 응원 → 'own_session' 에러
// 4) C 응원 → 'session_not_found'
// 5) B 연속 응원 → 'cheer_cooldown' (10초 안 기다리고 즉시 재호출)
// 6) (10.5초 대기 후 2·3번째 응원) 4번째 → 'cheer_limit'
// 7) A의 notifications에 cheer_received 존재, B는 A의 알림 조회 0행
// 8) 클라 notifications 직접 insert 차단
// 9) A 완료 후: B가 reactions insert 성공, 중복 insert 409, C insert 차단
// 10) 반응 알림 reaction_received가 A에게 생성, 본인 반응(A→A)은 알림 없음
// 11) B의 reactions를 B가 삭제 가능, A는 B 것 삭제 불가(0행)
// 12) poke: B→A 성공, 재시도 'poke_cooldown', C→A 'not_crew', A→A 'self_poke'
// 13) notifications read_at 갱신 가능(본인), title 갱신 시도는 컬럼 권한으로 차단
```

- [ ] **Step 2: 실행** `node scripts/rls-test.mjs` → 목표 90+ 검사 전부 통과. 쿨다운 검사 때문에 총 소요 +약 21초.
- [ ] **Step 3: Commit** `test: Phase 6 소셜 RLS 검사 추가`

### Task 2: 도메인 로직 TDD — 진행 중 판정·미읽음

**Files:**
- Create: `src/lib/domain/social.ts`
- Test: `src/lib/domain/social.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { activeSessionIds, unreadCount, type SocialEvent } from "./social";

const ev = (sid: string, type: SocialEvent["event_type"], at: string): SocialEvent =>
  ({ session_id: sid, event_type: type, created_at: at });

describe("activeSessionIds", () => {
  it("started만 있으면 진행 중", () => {
    expect(activeSessionIds([ev("s1", "workout_started", "2026-07-17T10:00:00Z")])).toEqual(["s1"]);
  });
  it("completed/cancelled가 붙으면 제외", () => {
    expect(activeSessionIds([
      ev("s1", "workout_started", "2026-07-17T10:00:00Z"),
      ev("s1", "workout_completed", "2026-07-17T11:00:00Z"),
      ev("s2", "workout_started", "2026-07-17T10:30:00Z"),
      ev("s3", "workout_started", "2026-07-17T09:00:00Z"),
      ev("s3", "workout_cancelled", "2026-07-17T09:10:00Z"),
    ])).toEqual(["s2"]);
  });
  it("6시간 지난 started는 유령 세션으로 제외", () => {
    expect(activeSessionIds(
      [ev("s1", "workout_started", "2026-07-17T00:00:00Z")],
      new Date("2026-07-17T07:00:00Z"),
    )).toEqual([]);
  });
  it("빈 입력", () => { expect(activeSessionIds([])).toEqual([]); });
});

describe("unreadCount", () => {
  it("read_at null만 센다", () => {
    expect(unreadCount([{ read_at: null }, { read_at: "2026-07-17T01:00:00Z" }, { read_at: null }])).toBe(2);
  });
});
```

- [ ] **Step 2: 실행 → FAIL 확인** `pnpm test -- social`
- [ ] **Step 3: 최소 구현** — `activeSessionIds(events, now = new Date())`: 세션별 이벤트 그룹핑, started 있고 completed/cancelled 없고 started가 6h 이내면 포함(최근 시작 순). `unreadCount(rows)`: `rows.filter(r => r.read_at === null).length`.
- [ ] **Step 4: 실행 → PASS** - [ ] **Step 5: Commit** `feat: 소셜 도메인 로직(진행중 판정·미읽음) TDD`

### Task 3: I/O 레이어 `lib/social.ts`

**Files:**
- Create: `src/lib/social.ts` (패턴: 기존 `lib/workout.ts`·`lib/challenge.ts`와 동일 — browser client 사용)

- [ ] **Step 1: 함수 구현** (반환 타입 명시, 실패는 throw)

```ts
// 피드: 크루 공개 completed 세션 + 프로필·종목명·볼륨·사진 signed URL·반응 집계
export type FeedItem = { session: {...}; nickname: string; avatarUrl: string | null;
  exerciseNames: string[]; totalVolume: number; durationMinutes: number;
  photoUrl: string | null; reactions: Record<"fire"|"clap"|"like", number>;
  myReactions: Set<"fire"|"clap"|"like">; streak: number };
export async function getGroupFeed(groupId: string, before?: string): Promise<FeedItem[]>
// 구현: workout_sessions(visibility=group·completed·deleted_at null) 최신 20건
//   + workout_exercises(이름)·workout_sets(볼륨: 기존 lib/domain/volume 재사용)
//   + workout_images → createSignedUrl(기존 getLatestCrewWorkoutWithPhoto 패턴)
//   + reactions in(sessionIds) 집계 + profiles(nickname, avatar_url)
//   + streak: 유저별 completed 날짜 → lib/domain/streak 재사용(피드 등장 유저만)

export async function toggleReaction(sessionId: string, type: "fire"|"clap"|"like", on: boolean)
// on ? insert { session_id, user_id: uid, reaction_type: type } : delete eq 3필드

export async function sendCheer(sessionId: string, type: CheerType, message?: string)
// rpc("send_cheer", ...) — 에러 message에서 cheer_limit/cheer_cooldown 구분해 코드로 throw

export async function pokeUser(targetId: string) // rpc("poke_user")
export async function getActiveCrewSessions(groupId: string)
// workout_events 최근 24h → activeSessionIds() → 세션 소유자 프로필 붙여 반환
export async function getNotifications(limit = 30)
export async function markAllRead() // update read_at=now() where read_at is null (본인 RLS)
export function subscribeNotifications(uid: string, cb: (n: NotificationRow) => void)
// supabase.channel("notif").on("postgres_changes", { event: "INSERT", schema: "public",
//   table: "notifications", filter: `user_id=eq.${uid}` }, p => cb(p.new)).subscribe()
// 반환: unsubscribe 함수
```

- [ ] **Step 2:** `pnpm typecheck` 통과 - [ ] **Step 3: Commit** `feat: 소셜 I/O 레이어`

### Task 4: 피드 탭 (피드 리스트 + 반응)

**Files:**
- Create: `src/components/feed/feed-item.tsx`, `src/components/feed/reaction-bar.tsx`
- Modify: `src/app/(tabs)/feed/page.tsx` (플레이스홀더 → 전체 구현)

- [ ] **Step 1: reaction-bar** — 🔥👏❤️ 3버튼 + 카운트, 내 반응은 accent 강조. 클릭 = 낙관적 토글(로컬 즉시 반영 → toggleReaction, 실패 시 롤백). 앱 공통 토큰(`bg-surface`·`border-line`·`text-accent`) 사용, 목업 피드 카드 스타일 준수.
- [ ] **Step 2: feed-item** — 아바타·닉네임·상대시각·제목·종목 요약(최대 3개 "외 n종")·볼륨/시간 뱃지·스트릭 🔥n·인증사진(있으면, aspect-video object-cover)·reaction-bar.
- [ ] **Step 3: feed page** — `getGroupFeed` 로드·20개 페이지네이션("더 보기")·빈 상태("아직 크루 운동이 없어요")·비크루 상태(크루 참여 유도). 진행 중 카드 영역은 Task 5에서 삽입.
- [ ] **Step 4:** PC 브라우저 스모크(2계정 시드 데이터) - [ ] **Step 5: Commit** `feat: 그룹 피드 + 이모지 반응`

### Task 5: 진행 중 카드 + 응원 + Realtime 배너

**Files:**
- Create: `src/components/feed/active-workout-card.tsx`, `src/components/cheer-banner.tsx`
- Modify: `src/app/(tabs)/feed/page.tsx`, `src/app/(tabs)/home/page.tsx`, `src/app/(tabs)/layout.tsx`

- [ ] **Step 1: active-workout-card** — `getActiveCrewSessions` 데이터: 아바타·닉네임·"n분째 운동 중 🔥"·응원 버튼 4개(🔥💪👏🏁) + "✍️ 한마디"(30자 입력). 응원 성공 시 버튼 3초 비활성("보냈어요!"), `cheer_cooldown`/`cheer_limit` 에러는 토스트("잠시 후 다시"·"이 운동엔 3번까지").
- [ ] **Step 2: cheer-banner** — `(tabs)/layout.tsx`에 장착. `subscribeNotifications`로 INSERT 수신 → `type==='cheer_received'`면 상단 고정 배너(발신자·이모지·메시지) 4초 후 소멸, 그 외 타입은 🔔 뱃지 카운트 콜백. 언마운트 시 구독 해제.
- [ ] **Step 3:** 피드 상단·홈 "운동 시작하기" 아래에 진행 중 카드 삽입(진행 중인 크루원 있을 때만).
- [ ] **Step 4:** 2계정 E2E 수동: A 시작(폰) → B 피드 카드 → B 응원 → A 배너. - [ ] **Step 5: Commit** `feat: 진행중 카드·응원·Realtime 배너`

### Task 6: 찌르기 + 알림함

**Files:**
- Create: `src/components/notification-bell.tsx`
- Modify: `src/components/crew-card.tsx`(오늘 미운동 크루원에 👉 버튼), `(tabs)/layout.tsx` 헤더

- [ ] **Step 1: 찌르기** — 크루 카드 멤버 행: 오늘(KST dayKey) completed 세션 없는 크루원에 "👉 콕" 버튼 → `pokeUser`. `poke_cooldown` 에러 → 토스트("오늘은 이미 찔렀어요").
- [ ] **Step 2: notification-bell** — 헤더 🔔 + `unreadCount` 뱃지. 탭하면 바텀시트: `getNotifications` 리스트(타입 아이콘 🏋️📣👉💬🏁·제목·본문·상대시각·미읽음 점). 시트 열림 시 `markAllRead`.
- [ ] **Step 3: Commit** `feat: 찌르기 + 알림함`

### Task 7: 최종 검증 + 실기기

- [ ] `pnpm test`(unit 100+) → `pnpm lint` → `pnpm typecheck` → dev 서버 종료 상태에서 `pnpm build` → `node scripts/rls-test.mjs`(90+)
- [ ] E2E 스크립트(scratchpad, puppeteer-core): A 시작 → B 진행중 카드 → B 응원 → A 알림 수신 → A 완료 → B 피드 → B 반응 → A 뱃지. PROGRESS의 기존 E2E 흐름 재작성 참고.
- [ ] 실기기(폰): 응원 배너 수신·찌르기·알림함. **사용자 확인 후에만 커밋**(메모리 규칙).
- [ ] PROGRESS.md Phase 6 산출물 기록 + 커밋.

**후속(별도 계획):** 꾸준왕 성과 열람 UI + record_viewed 알림 + 홈 위젯(스트릭 카드·주간 stat·오늘 그룹 현황·꾸준왕) — record_views 테이블은 0011에 이미 있음.
