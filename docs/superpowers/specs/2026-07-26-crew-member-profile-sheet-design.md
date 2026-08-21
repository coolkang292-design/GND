# 크루원 프로필 시트 — 상대의 레벨·배지 보기 설계

작성일: 2026-07-26
관련 문서: `docs/superpowers/plans/archive/2026-07-24-routines-friend-level-friend-requests.md`(Phase 2를 대체) ·
`docs/superpowers/specs/2026-07-25-badge-points-item-shop-design.md`(배지 확장 예정)

---

## 1. 목표

피드·홈에서 크루원의 이름이나 아바타를 누르면 **그 사람의 레벨과 배지 현황**을
바텀시트로 확인할 수 있게 한다.

레벨과 배지는 자랑하라고 만든 지표인데, 지금은 본인만 볼 수 있어서 자랑할 대상이
없다. 크루원끼리 서로의 성장을 보게 만드는 것이 이 기능의 전부다.

---

## 2. 현황과 격차

| 영역 | 현재 | 필요한 것 |
|---|---|---|
| 진입점 | **없음**. 피드 카드·크루 카드 모두 이름이 클릭 불가. `/u/[id]` 라우트도 없음 | 피드·크루 카드에 클릭 진입점 |
| 레벨 데이터 | `user_progress` RLS `user_progress_own_select` — **본인 행만** 조회 | 정의자 RPC로 크루원 조회 경로 |
| 배지 데이터 | `user_badges` RLS `user_badges_own_select` — **본인 행만** 조회 | 위와 동일 |
| 레벨 표시 로직 | `domain/progression.ts:getLevelProgress(totalXp)` 완비·테스트됨 | 그대로 재사용 |
| 배지 카탈로그 | `domain/badges.ts:BADGE_CATALOG` **3개**(record_beaten 1/5/10) | 그대로 재사용 (확장은 별건) |
| 표시 UI | `home/character-card.tsx`·`record/badge-shelf.tsx` | 시트용으로 재구성 |

마이그레이션은 **0025까지 운영 적용됨(수정 금지)**. 이 기능은 **0026**을 쓴다.

> 기존 계획서(2026-07-24)가 0026을 루틴, 0027을 레벨 RPC로 배정해 뒀으나 **둘 다
> 미착수**이므로 번호를 재배정한다. 그 계획서의 Phase 2(`get_crew_member_progress`,
> 레벨만)는 이 설계가 **배지까지 포함해 대체**한다.

---

## 3. 핵심 결정

| # | 결정 | 이유 |
|---|---|---|
| P1 | 진입점은 **피드 카드 + 홈 크루 카드** 두 곳 | 크루원을 가장 자주 마주치는 자리. 챌린지 순위판은 열람권으로 잠기는 화면이라 규칙이 겹쳐 제외 |
| P2 | **크루원이면 자유 열람** (열람권 소모 없음) | 자랑이 목적인 지표를 잠그면 동기부여가 죽는다. 기존 열람권은 지금처럼 '주간 성과·챌린지 순위'만 담당 |
| P3 | 배지는 **현재 카탈로그 3개** 기준으로 먼저 만든다 | 46개+포인트 설계는 미착수. 아래 P4로 확장 시 재작업이 없다 |
| P4 | RPC는 **`badge_key`와 획득일만** 돌려주고, 이모지·이름·설명은 **클라이언트 카탈로그**가 붙인다 | 배지가 3 → 46개로 늘어도 **SQL 무수정**. 카탈로그가 나중에 DB(`badge_definitions`)로 옮겨가도 클라 매핑 지점만 교체하면 된다 |
| P5 | 레벨·배지를 **RPC 하나로** 합쳐 반환 | 왕복 2회면 시트 로딩이 두 번 깜빡이고, 권한 검사(`shares_group_with`)가 두 군데로 갈라진다 |
| P6 | 화면은 **바텀시트** (전용 페이지 아님) | 기존 앱 관례(배지·XP·성과 시트). 피드 스크롤 위치를 잃지 않고 뒤로가기 처리도 불필요 |
| P7 | XP 원장·불꽃 보호권은 **노출하지 않는다** | 레벨·배지는 자랑용 지표지만 획득 내역은 사적 정보 |
| P8 | 본인을 눌러도 **같은 시트**가 열린다 | RPC가 본인을 허용하므로 예외 분기를 만들지 않는다 |
| P9 | 미획득 배지도 **잠금 칩으로 함께** 보여준다 | 자랑(획득)과 목표 제시(미획득)를 둘 다 살리고, 기록 탭 `BadgeShelf`와 UI가 같아진다 |

---

## 4. 데이터 경로

### 4.1 정의자 RPC (0026)

```
get_crew_member_profile(p_target_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public

  1. auth.uid() is null              → raise 'not_authenticated'
  2. p_target_id <> auth.uid()
     and not shares_group_with(p_target_id) → raise 'not_crew'
  3. return jsonb_build_object(
       'totalXp',      coalesce(up.total_xp, 0),
       'currentLevel', coalesce(up.current_level, 1),
       'currentStage', coalesce(up.current_stage, 1),
       'badges',       [{ 'badgeKey', 'earnedAt' } ...]  -- earned_at 오름차순
     )
```

- 권한: `revoke all from anon, public` + `grant execute to authenticated`
- `user_progress` 행이 없으면(운동 이력 0인 신규 유저) **0 XP·Lv.1**로 반환한다.
  `getProgressSummary`가 `data null`을 신규 사용자로 처리하는 기존 관례와 같다.
- `shares_group_with`는 `0001_identity_crew.sql:61`에 이미 있다.

### 4.2 클라이언트

`src/lib/progression.ts`에 추가한다.

```ts
export interface CrewMemberProfile {
  totalXp: number;
  currentLevel: number;
  currentStage: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  badges: EarnedBadge[];
}

export async function getCrewMemberProfile(targetId: string): Promise<CrewMemberProfile>
```

- 레벨 파생값은 `getLevelProgress(totalXp)`를 그대로 쓴다 — 내 정보와 남의 정보가
  **같은 함수로 계산**되어야 두 화면의 숫자가 어긋나지 않는다.
- `badges`는 `EarnedBadge[]`(기존 타입)로 맞춘다 → `badgeShelf(earned)`를 그대로 재사용.
- 카탈로그에 없는 `badge_key`는 `badgeShelf`가 자연히 건너뛴다(기존 동작).

---

## 5. 화면

### 5.1 구성

```
┌─────────────────────────────┐
│  🐶  낭만송곳니            🔥12  │  ① 아바타·닉네임·스트릭
├─────────────────────────────┤
│ [캐릭터]  물고가개 Lv.17        │  ② 레벨 카드
│           ▓▓▓▓▓▓░░░░ 62%      │
│           다음 레벨까지 420 XP  │
│           누적 7,220 XP        │
├─────────────────────────────┤
│ 배지                    2 / 3 │  ③ 배지 진열
│ 🏅첫 기록 갱신  💪기록 갱신 5회  │
│ 🔒기록 갱신 10회                │
├─────────────────────────────┤
│           [ 닫기 ]             │
└─────────────────────────────┘
```

| 영역 | 내용 | 근거 |
|---|---|---|
| ① 헤더 | 아바타 이모지·닉네임·🔥스트릭 | 스트릭은 이미 피드에 공개된 값이라 새 노출이 아니다 |
| ② 레벨 | 캐릭터 PNG(`characterPath`) · `{stageName} Lv.N` · 진행바 · 다음 레벨까지 XP · 누적 XP | `character-card`의 표시 규칙을 따른다 |
| ③ 배지 | 획득 칩(이모지+이름) 강조 · 미획득 칩(🔒) 흐리게 · `N / 전체` 카운트 | `badge-shelf`의 칩 스타일 재사용(P9) |

- 배지 칩을 눌렀을 때의 상세 설명 시트는 **이번 범위에서 제외**한다. 시트 위에
  시트를 겹치면 닫기 동선이 꼬인다. 이름만으로 충분히 읽힌다.
- 스트릭 값은 호출부가 이미 갖고 있으면(피드 `item.streak`) 넘겨주고, 없으면
  (크루 카드) 생략한다. 시트가 스트릭을 따로 조회하지는 않는다.

### 5.2 진입점

| 화면 | 클릭 영역 | 주의 |
|---|---|---|
| 피드 사진 카드 | 하단 오버레이의 아바타+닉네임 묶음 | 반응 바(🔥👏👍)와 영역이 겹치지 않게 분리 |
| 피드 일반 카드 | 상단 헤더의 아바타+닉네임 묶음 | 위와 동일 |
| 홈 크루 카드 | 멤버 칩 본체 | **"👉 콕" 버튼은 유지** — 칩 안에 버튼이 중첩되므로 `stopPropagation` 필요 |

---

## 6. 에러·엣지 케이스

| 상황 | 처리 |
|---|---|
| `not_crew` (크루가 아닌 대상) | 시트 안에 "크루원만 볼 수 있어요" |
| `user_progress` 행 없음 | 0 XP · Lv.1 · 1단계로 표시 (§4.1) |
| 배지 0개 | "아직 획득한 배지가 없어요" + 잠금 칩 3개 |
| 조회 실패(네트워크) | 시트 안에 문구 + "다시 시도" 버튼 (`growth-hub`의 실패 처리 관례) |
| 본인 클릭 | 같은 시트가 열린다 (P8) |
| 혼자모드(크루 없음) | 피드·크루 카드 자체가 뜨지 않으므로 진입 경로가 없다 |

---

## 7. 검증

| 층 | 방법 |
|---|---|
| 도메인 | `getLevelProgress`·`badgeShelf`는 기존 테스트로 덮인다. 신규 순수 로직 없음 |
| 컴포넌트 | `renderToStaticMarkup` SSR — 닉네임·`role="dialog"`·닫기 버튼 렌더 (데이터는 effect라 SSR엔 로딩 상태만) |
| 실 DB | `scripts/crew-profile-check.mjs` — ① 같은 크루 2인 상호 조회 성공 ② 다른 크루 유저 `not_crew` ③ 배지 목록이 실제 `user_badges`와 일치 ④ 타인 `user_progress` 직접 select 0건 |
| 게이트 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |
| 실기기 | 폰에서 피드·크루 카드 양쪽 진입 → 레벨·배지 표시 확인 **후** 커밋 |

0026은 에이전트가 DDL을 못 돌리므로 **사용자가 SQL Editor에 수동 Run**한 뒤 실 DB
스크립트로 검증한다.

---

## 8. 범위 제외

- 챌린지 순위판·알림함에서의 프로필 진입 (P1)
- 전용 프로필 페이지 `/u/[id]`와 공유 URL (P6)
- 배지 칩 탭 → 상세 설명 시트 (§5.1)
- 배지 카탈로그 확장(46개)·포인트·상점 — `2026-07-25-badge-points-item-shop-design.md` 소관
- 상대의 XP 획득 내역·불꽃 보호권·주간 통계 (P7)
- 친구 신청/승인 흐름 — `2026-07-24` 계획서 Phase 3 소관
