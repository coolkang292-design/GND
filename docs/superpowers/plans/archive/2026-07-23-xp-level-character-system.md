# XP·35레벨·7단계 캐릭터 진화 시스템 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 유효 운동 완료 시 서버에서 XP를 계산·지급하고, 누적 XP로 35레벨·7단계 캐릭터를 진화시켜 홈·내 정보·완료 화면에 성장 정보를 표시한다.

**Architecture:** ①순수 계산 함수(`progression.ts`·`xp.ts`)로 레벨/XP를 결정(서버·클라 공유, TDD) ②`complete_workout_v2` SECURITY DEFINER RPC가 완료+XP+레벨+보상을 한 트랜잭션으로 처리(위조 불가) ③홈은 카드 1개만 추가, 내 정보는 성장 허브로 재구성. **기존 챌린지 레벨(`level.ts`, 임시 1~5)과 완전히 별개** — 이번 성장 레벨은 `progression.ts`(영구 1~35)에 격리한다.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase(Postgres RLS + plpgsql RPC), TypeScript, vitest, Tailwind, pnpm.

**설계 근거:** `docs/superpowers/specs/2026-07-23-xp-level-character-system-design.md` (이 계획은 그 설계를 그대로 구현한다).

---

## 파일 구조 (생성/수정)

**Phase A — 엔진(backend)**
- Create `supabase/migrations/0022_xp_level_system.sql` — 5 테이블 + RLS + seed + RPC
- Create `src/lib/domain/progression.ts` — 레벨/단계/진행률 순수 함수
- Create `src/lib/domain/progression.test.ts`
- Create `src/lib/domain/xp.ts` — XP 계산 순수 함수(타바타 분기)
- Create `src/lib/domain/xp.test.ts`
- Create `src/lib/progression.ts` — 클라 조회(ProgressSummary/내역/해금/타임라인)
- Modify `src/lib/workout.ts` — `completeWorkoutV2` 래퍼 추가
- Create `scripts/xp-test.mjs` — 실 DB 통합/RLS 테스트
- Create `scripts/recalculate-user-progress.mjs` — 원장 기준 진행 복구(dry-run 기본, Task 8B)

**Phase B — 화면(frontend)**
- Add `public/characters/char-1.png … char-7.png`, `public/characters/fallback.png`
- Create `src/components/home/character-card.tsx`
- Modify `src/components/home/home-client.tsx` — 카드 삽입
- Create `src/components/profile/growth-hub.tsx` (+ 하위: `stage-carousel.tsx`, `current-stage.tsx`, `level-benefits.tsx`, `next-stage-preview.tsx`, `growth-timeline.tsx`)
- Create `src/components/profile/xp-guide-sheet.tsx` — XP 획득 방법 시트
- Create `src/components/record/xp-result-modal.tsx` — 완료/레벨업/진화 모달
- Modify `src/app/(tabs)/profile/page.tsx` — 성장 허브 + 알림설정 톱니 이동
- Modify `src/app/(tabs)/record/page.tsx` — 완료 시 v2 호출 + 모달

---

## 레벨 컷·단계 상수 (구현 전 참조)

| Lv | 누적XP | Lv | 누적XP | Lv | 누적XP | Lv | 누적XP | Lv | 누적XP |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
|1|0|8|1800|15|5400|22|11000|29|18600|
|2|200|9|2200|16|6000|23|12000|30|19800|
|3|400|10|2600|17|6800|24|13000|31|21000|
|4|600|11|3000|18|7600|25|14000|32|22250|
|5|800|12|3600|19|8400|26|15000|33|23500|
|6|1000|13|4200|20|9200|27|16200|34|24750|
|7|1400|14|4800|21|10000|28|17400|35|26000|

단계(stage_index / stage_key / stage_name): 1~5 `1/gaenodap/개노답`, 6~10 `2/nuntteotgae/눈떴개`, 11~15 `3/ildanhagae/일단하개`, 16~20 `4/mulgogagae/물고가개`, 21~25 `5/michyeobogae/미쳐보개`, 26~30 `6/paneuljjagae/판을짜개`, 31~35 `7/jeonseorigae/전설이개`.

---

# Phase A — XP·레벨 엔진

### Task 1: 0022 마이그레이션 — 테이블 + RLS

**Files:**
- Create: `supabase/migrations/0022_xp_level_system.sql`

- [ ] **Step 1: 테이블·RLS 작성** (파일 상단부)

기존 0020 패턴(=`create table if not exists` → `enable row level security` → `revoke all` → `grant select` → 본인 select 정책)을 따른다. 클라는 어떤 XP 테이블도 직접 쓰지 못한다.

```sql
-- 0022: XP·35레벨·7단계 캐릭터 진화 시스템
-- 설계: docs/superpowers/specs/2026-07-23-xp-level-character-system-design.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

-- ── level_definitions (전역 읽기, 수정 금지) ──────────────────
create table if not exists public.level_definitions (
  level smallint primary key,
  required_total_xp integer not null check (required_total_xp >= 0),
  stage_index smallint not null check (stage_index between 1 and 7),
  stage_key text not null,
  stage_name text not null,
  character_path text not null,
  reward_key text,
  reward_label text,
  reward_status text not null default 'active'
    check (reward_status in ('active', 'coming_soon', 'data_only')),
  created_at timestamptz not null default now()
);
create unique index if not exists level_definitions_required_xp_unique
  on public.level_definitions (required_total_xp);
alter table public.level_definitions enable row level security;
revoke all on public.level_definitions from anon, authenticated;
grant select on public.level_definitions to authenticated;
drop policy if exists "level_definitions_read" on public.level_definitions;
create policy "level_definitions_read" on public.level_definitions
  for select to authenticated using (true);

-- ── user_progress (본인 select만, 변경은 definer RPC) ─────────
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  current_level smallint not null default 1 check (current_level between 1 and 35),
  current_stage smallint not null default 1 check (current_stage between 1 and 7),
  streak_shield_count integer not null default 0 check (streak_shield_count >= 0),
  last_level_up_at timestamptz,
  last_stage_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
revoke all on public.user_progress from anon, authenticated;
grant select on public.user_progress to authenticated;
drop policy if exists "user_progress_own_select" on public.user_progress;
create policy "user_progress_own_select" on public.user_progress
  for select to authenticated using (user_id = auth.uid());

-- ── xp_transactions (본인 select만) ──────────────────────────
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  transaction_type text not null
    check (transaction_type in ('earn', 'reverse', 'admin_adjustment')),
  reason text not null check (reason in (
    'workout_completed', 'workout_photo', 'weekly_goal',
    'historical_backfill', 'workout_reversal', 'admin_adjustment',
    'level_compensation'
  )),
  reward_group text,
  source_type text not null,
  source_id text not null,
  effective_date date not null,
  rule_version text not null default 'xp_v1',
  metadata jsonb not null default '{}'::jsonb,
  reversed_transaction_id uuid references public.xp_transactions (id),
  created_at timestamptz not null default now()
);
create unique index if not exists xp_transactions_source_unique
  on public.xp_transactions (user_id, reason, source_type, source_id)
  where transaction_type = 'earn';
create unique index if not exists xp_daily_workout_reward_unique
  on public.xp_transactions (user_id, effective_date, reward_group)
  where transaction_type = 'earn' and reward_group = 'daily_workout';
create index if not exists xp_transactions_user_recent
  on public.xp_transactions (user_id, created_at desc);
alter table public.xp_transactions enable row level security;
revoke all on public.xp_transactions from anon, authenticated;
grant select on public.xp_transactions to authenticated;
drop policy if exists "xp_transactions_own_select" on public.xp_transactions;
create policy "xp_transactions_own_select" on public.xp_transactions
  for select to authenticated using (user_id = auth.uid());

-- ── user_unlocks (본인 select만) ─────────────────────────────
create table if not exists public.user_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  unlock_key text not null,
  source_level smallint not null,
  status text not null default 'unlocked'
    check (status in ('unlocked', 'coming_soon')),
  metadata jsonb not null default '{}'::jsonb,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, unlock_key)
);
alter table public.user_unlocks enable row level security;
revoke all on public.user_unlocks from anon, authenticated;
grant select on public.user_unlocks to authenticated;
drop policy if exists "user_unlocks_own_select" on public.user_unlocks;
create policy "user_unlocks_own_select" on public.user_unlocks
  for select to authenticated using (user_id = auth.uid());

-- ── streak_shield_transactions (본인 select만) ───────────────
create table if not exists public.streak_shield_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  reason text not null,
  source_type text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists streak_shield_source_unique
  on public.streak_shield_transactions (user_id, reason, source_type, source_id);
alter table public.streak_shield_transactions enable row level security;
revoke all on public.streak_shield_transactions from anon, authenticated;
grant select on public.streak_shield_transactions to authenticated;
drop policy if exists "streak_shield_own_select" on public.streak_shield_transactions;
create policy "streak_shield_own_select" on public.streak_shield_transactions
  for select to authenticated using (user_id = auth.uid());
```

- [ ] **Step 2: 원장 원칙 주석 추가** (파일 상단 헤더 주석에 명시)

XP 정합성의 기준 원칙 — 마이그레이션 파일 상단과 설계 문서에 함께 남긴다:

- **`xp_transactions`가 XP의 공식 원장(source of truth)이다.**
- `user_progress.total_xp`는 빠른 조회를 위한 **캐시**일 뿐이다(원장 SUM으로 언제든 재계산 가능 — Task 8B).
- XP 거래는 **원칙적으로 수정·삭제하지 않는다.**
- 정정은 기존 거래를 고치는 대신 **`reverse` 또는 `admin_adjustment` 거래를 추가**하는 방식으로 처리한다.
- **이번 XP 규칙 버전은 `xp_v1`** 이며 모든 earn 거래의 `rule_version`에 기록된다. 규칙이 바뀌면 버전을 올려 과거 지급과 구분한다.

- [ ] **Step 3: 커밋** (RPC·seed는 다음 태스크에서 같은 파일에 이어 붙인다)

```bash
git add supabase/migrations/0022_xp_level_system.sql
git commit -m "feat: 0022 XP·레벨 시스템 테이블·RLS"
```

---

### Task 2: level_definitions 35레벨 seed

**Files:**
- Modify: `supabase/migrations/0022_xp_level_system.sql` (테이블 정의 아래에 append)

- [ ] **Step 1: seed insert 추가**

레벨별 보상 라벨은 설계 §13.1을 따른다. 캐릭터 진화 레벨(1·6·11·16·21·26·31)의 `reward_key`는 `stage_evolve_N`.

```sql
-- ── 35레벨 정의 seed (idempotent) ────────────────────────────
-- reward_status: 이번 스프린트에 실제 동작하는 보상만 'active'. 미구현 보상은
-- 'coming_soon' (UI에서 "준비 중" 표시, 실사용 기능처럼 노출 금지 — Task 11).
insert into public.level_definitions
  (level, required_total_xp, stage_index, stage_key, stage_name, character_path, reward_key, reward_label, reward_status)
values
  (1,0,1,'gaenodap','개노답','/characters/char-1.png','stage_evolve_1','XP 시스템 시작, 개노답 캐릭터','active'),
  (2,200,1,'gaenodap','개노답','/characters/char-1.png','xp_history','XP 획득 내역 화면 해금','active'),
  (3,400,1,'gaenodap','개노답','/characters/char-1.png','weekly_xp_summary','주간 XP 요약 해금','active'),
  (4,600,1,'gaenodap','개노답','/characters/char-1.png','next_stage_preview','다음 진화 미리보기 해금','active'),
  (5,800,1,'gaenodap','개노답','/characters/char-1.png','streak_shield_5','불꽃 보호권 1개','active'),
  (6,1000,2,'nuntteotgae','눈떴개','/characters/char-2.png','stage_evolve_2','눈떴개 캐릭터 진화','active'),
  (7,1400,2,'nuntteotgae','눈떴개','/characters/char-2.png','stats_7d','최근 7일 성장 통계','coming_soon'),
  (8,1800,2,'nuntteotgae','눈떴개','/characters/char-2.png','compare_prev_week','전주 대비 비교','coming_soon'),
  (9,2200,2,'nuntteotgae','눈떴개','/characters/char-2.png','duration_dist','운동시간 분포 통계','coming_soon'),
  (10,2600,2,'nuntteotgae','눈떴개','/characters/char-2.png','streak_shield_10','불꽃 보호권 1개','active'),
  (11,3000,3,'ildanhagae','일단하개','/characters/char-3.png','stage_evolve_3','일단하개 캐릭터 진화','active'),
  (12,3600,3,'ildanhagae','일단하개','/characters/char-3.png','routine_slot_1','운동 루틴 저장 슬롯 1개 추가','coming_soon'),
  (13,4200,3,'ildanhagae','일단하개','/characters/char-3.png','copy_last_workout','지난 운동 복사 바로가기 해금','coming_soon'),
  (14,4800,3,'ildanhagae','일단하개','/characters/char-3.png','challenge_template_1','개인 챌린지 템플릿 1개 저장','coming_soon'),
  (15,5400,3,'ildanhagae','일단하개','/characters/char-3.png','streak_shield_15','불꽃 보호권 1개','active'),
  (16,6000,4,'mulgogagae','물고가개','/characters/char-4.png','stage_evolve_4','물고가개 캐릭터 진화','active'),
  (17,6800,4,'mulgogagae','물고가개','/characters/char-4.png','stats_4w','최근 4주 성장 통계','coming_soon'),
  (18,7600,4,'mulgogagae','물고가개','/characters/char-4.png','exercise_pr_summary','종목별 개인 기록 요약','coming_soon'),
  (19,8400,4,'mulgogagae','물고가개','/characters/char-4.png','weekly_growth_card','주간 성장 카드 공유','coming_soon'),
  (20,9200,4,'mulgogagae','물고가개','/characters/char-4.png','streak_shield_20','불꽃 보호권 1개','active'),
  (21,10000,5,'michyeobogae','미쳐보개','/characters/char-5.png','stage_evolve_5','미쳐보개 캐릭터 진화','active'),
  (22,11000,5,'michyeobogae','미쳐보개','/characters/char-5.png','stats_12w','최근 12주 성장 통계','coming_soon'),
  (23,12000,5,'michyeobogae','미쳐보개','/characters/char-5.png','challenge_concurrent_1','개인 챌린지 동시 진행 수 +1','coming_soon'),
  (24,13000,5,'michyeobogae','미쳐보개','/characters/char-5.png','challenge_advanced','개인 챌린지 고급 조건 해금','coming_soon'),
  (25,14000,5,'michyeobogae','미쳐보개','/characters/char-5.png','streak_shield_25','불꽃 보호권 2개','active'),
  (26,15000,6,'paneuljjagae','판을짜개','/characters/char-6.png','stage_evolve_6','판을짜개 캐릭터 진화','active'),
  (27,16200,6,'paneuljjagae','판을짜개','/characters/char-6.png','routine_slot_2','운동 루틴 저장 슬롯 추가','coming_soon'),
  (28,17400,6,'paneuljjagae','판을짜개','/characters/char-6.png','stats_6m','최근 6개월 성장 통계','coming_soon'),
  (29,18600,6,'paneuljjagae','판을짜개','/characters/char-6.png','monthly_report','월간 성장 리포트 카드','coming_soon'),
  (30,19800,6,'paneuljjagae','판을짜개','/characters/char-6.png','streak_shield_30','불꽃 보호권 2개','active'),
  (31,21000,7,'jeonseorigae','전설이개','/characters/char-7.png','stage_evolve_7','전설이개 캐릭터 진화','active'),
  (32,22250,7,'jeonseorigae','전설이개','/characters/char-7.png','stats_all','전체 기간 성장 통계','coming_soon'),
  (33,23500,7,'jeonseorigae','전설이개','/characters/char-7.png','challenge_concurrent_2','개인 챌린지 동시 진행 수 +1','coming_soon'),
  (34,24750,7,'jeonseorigae','전설이개','/characters/char-7.png','legend_report','전설 성장 리포트','coming_soon'),
  (35,26000,7,'jeonseorigae','전설이개','/characters/char-7.png','eternal_flame','영원한 불꽃 배지, 불꽃 보호권 3개','active')
on conflict (level) do update set
  required_total_xp = excluded.required_total_xp,
  stage_index = excluded.stage_index,
  stage_key = excluded.stage_key,
  stage_name = excluded.stage_name,
  character_path = excluded.character_path,
  reward_key = excluded.reward_key,
  reward_label = excluded.reward_label,
  reward_status = excluded.reward_status;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0022_xp_level_system.sql
git commit -m "feat: 0022 35레벨 정의 seed"
```

---

### Task 3: progression.ts — 레벨/단계/진행률 순수 함수

**Files:**
- Create: `src/lib/domain/progression.ts`
- Test: `src/lib/domain/progression.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { LEVEL_DEFS, getLevelFromTotalXp, getLevelProgress } from "./progression";

describe("LEVEL_DEFS", () => {
  it("35개, 오름차순 컷", () => {
    expect(LEVEL_DEFS).toHaveLength(35);
    expect(LEVEL_DEFS[0]).toMatchObject({ level: 1, requiredTotalXp: 0, stageName: "개노답" });
    expect(LEVEL_DEFS[34]).toMatchObject({ level: 35, requiredTotalXp: 26000, stageName: "전설이개" });
  });
});

describe("getLevelFromTotalXp", () => {
  it.each([
    [0, 1, "개노답"], [199, 1, "개노답"], [200, 2, "개노답"],
    [800, 5, "개노답"], [1000, 6, "눈떴개"], [2999, 10, "눈떴개"],
    [3000, 11, "일단하개"], [6000, 16, "물고가개"], [10000, 21, "미쳐보개"],
    [15000, 26, "판을짜개"], [21000, 31, "전설이개"], [26000, 35, "전설이개"],
    [99999, 35, "전설이개"],
  ])("%i XP → Lv.%i %s", (xp, level, stage) => {
    const d = getLevelFromTotalXp(xp);
    expect(d.level).toBe(level);
    expect(d.stageName).toBe(stage);
  });
  it("음수/NaN 예외", () => {
    expect(() => getLevelFromTotalXp(-1)).toThrow();
    expect(() => getLevelFromTotalXp(NaN)).toThrow();
  });
});

describe("getLevelProgress — 구간 기준", () => {
  it("Lv.4 구간(600~800) 740 XP → 70%", () => {
    const p = getLevelProgress(740);
    expect(p.currentLevel).toBe(4);
    expect(p.xpIntoLevel).toBe(140);
    expect(p.xpForLevel).toBe(200);
    expect(Math.round(p.percent)).toBe(70);
    expect(p.xpToNextLevel).toBe(60);
  });
  it("Lv.35는 100%·다음 없음", () => {
    const p = getLevelProgress(30000);
    expect(p.currentLevel).toBe(35);
    expect(p.percent).toBe(100);
    expect(p.nextLevelRequiredXp).toBeNull();
    expect(p.xpToNextLevel).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/domain/progression.test.ts`
Expected: FAIL (`progression.ts` 없음)

- [ ] **Step 3: 구현**

```ts
/**
 * 영구 성장 레벨(1~35)·7단계 순수 함수. **챌린지 레벨(level.ts)과 무관.**
 *
 * 기준 데이터 원칙:
 * - **공식 기준 데이터는 `public.level_definitions`(DB)다.**
 * - 아래 `LEVEL_DEFS`는 클라이언트 즉시 계산용 **정적 미러**일 뿐이다.
 * - 두 정의가 어긋나면 홈/내 정보 표시와 서버 지급이 불일치한다.
 * - 그래서 실 DB 테스트(Task 7)에서 DB와 이 미러의 아래 필드가
 *   하나라도 다르면 테스트를 실패시킨다:
 *   level · required_total_xp · stage_index · stage_key · stage_name · character_path
 */
export type StageKey =
  | "gaenodap" | "nuntteotgae" | "ildanhagae" | "mulgogagae"
  | "michyeobogae" | "paneuljjagae" | "jeonseorigae";

export interface LevelDefinition {
  level: number;
  requiredTotalXp: number;
  stageIndex: number;
  stageKey: StageKey;
  stageName: string;
  characterPath: string;
}

const STAGES: [StageKey, string][] = [
  ["gaenodap", "개노답"], ["nuntteotgae", "눈떴개"], ["ildanhagae", "일단하개"],
  ["mulgogagae", "물고가개"], ["michyeobogae", "미쳐보개"], ["paneuljjagae", "판을짜개"],
  ["jeonseorigae", "전설이개"],
];

const CUTS = [
  0, 200, 400, 600, 800, 1000, 1400, 1800, 2200, 2600, 3000, 3600, 4200, 4800,
  5400, 6000, 6800, 7600, 8400, 9200, 10000, 11000, 12000, 13000, 14000, 15000,
  16200, 17400, 18600, 19800, 21000, 22250, 23500, 24750, 26000,
];

export const LEVEL_DEFS: LevelDefinition[] = CUTS.map((xp, i) => {
  const level = i + 1;
  const stageIndex = Math.ceil(level / 5); // 1~5→1, 6~10→2 …
  const [stageKey, stageName] = STAGES[stageIndex - 1];
  return {
    level,
    requiredTotalXp: xp,
    stageIndex,
    stageKey,
    stageName,
    characterPath: `/characters/char-${stageIndex}.png`,
  };
});

export const MAX_LEVEL = 35;

export function getLevelFromTotalXp(totalXp: number): LevelDefinition {
  if (!Number.isFinite(totalXp) || totalXp < 0) {
    throw new Error("totalXp must be a non-negative finite number");
  }
  let matched = LEVEL_DEFS[0];
  for (const d of LEVEL_DEFS) {
    if (totalXp >= d.requiredTotalXp) matched = d;
    else break;
  }
  return matched;
}

export interface LevelProgress {
  currentLevel: number;
  currentStageIndex: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpIntoLevel: number;
  xpForLevel: number;
  xpToNextLevel: number;
  percent: number; // 0~100
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const cur = getLevelFromTotalXp(totalXp);
  const next = LEVEL_DEFS[cur.level] ?? null; // level은 1-index, 배열은 0-index → 다음은 [cur.level]
  if (!next) {
    return {
      currentLevel: cur.level, currentStageIndex: cur.stageIndex, stageName: cur.stageName,
      characterPath: cur.characterPath, nextLevelRequiredXp: null,
      xpIntoLevel: 0, xpForLevel: 0, xpToNextLevel: 0, percent: 100,
    };
  }
  const xpIntoLevel = totalXp - cur.requiredTotalXp;
  const xpForLevel = next.requiredTotalXp - cur.requiredTotalXp;
  return {
    currentLevel: cur.level, currentStageIndex: cur.stageIndex, stageName: cur.stageName,
    characterPath: cur.characterPath, nextLevelRequiredXp: next.requiredTotalXp,
    xpIntoLevel, xpForLevel, xpToNextLevel: next.requiredTotalXp - totalXp,
    percent: (xpIntoLevel / xpForLevel) * 100,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/domain/progression.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat: 영구 성장 레벨·단계·진행률 순수 함수 (챌린지 레벨과 분리)"
```

---

### Task 4: xp.ts — 운동 XP 계산 순수 함수 (타바타 분기)

**Files:**
- Create: `src/lib/domain/xp.ts`
- Test: `src/lib/domain/xp.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { getDurationXp, minutesFromSeconds, calculateWorkoutXp } from "./xp";

describe("getDurationXp — 시간 구간 경계(분)", () => {
  it.each([
    [0,0],[9,0],[10,0],[19,0],[20,10],[39,10],[40,20],[59,20],
    [60,30],[89,30],[90,40],[120,40],[359,40],
  ])("%i분 → %i XP", (min, xp) => expect(getDurationXp(min)).toBe(xp));
});

// 서버 시간(초)은 내림해 정수 분으로 만든다. RPC의 floor(sec/60)과 동일 로직.
describe("초 단위 경계 → 내림 분 → 시간 XP", () => {
  it.each([
    [1199, 19, 0],  // 19분 59초 → 19분 → 0
    [1200, 20, 10], // 20분 00초 → 20분 → 10
    [2399, 39, 10], // 39분 59초 → 39분 → 10
    [2400, 40, 20], // 40분 00초 → 40분 → 20
    [5399, 89, 30], // 89분 59초 → 89분 → 30
    [5400, 90, 40], // 90분 00초 → 90분 → 40
    [21599, 359, 40], // 359분 59초 → 359분 → 40
  ])("%i초 → %i분 → %i XP", (sec, min, xp) => {
    expect(minutesFromSeconds(sec)).toBe(min);
    expect(getDurationXp(minutesFromSeconds(sec))).toBe(xp);
  });
  it("360분 00초(21600초) → XP 지급 거부", () => {
    const min = minutesFromSeconds(21600);
    expect(min).toBe(360);
    const r = calculateWorkoutXp({ ...base, durationMinutes: min });
    expect(r.totalXp).toBe(0);
    expect(r.rejectionReason).toBe("DURATION_TOO_LONG");
  });
});

const base = {
  isValidWorkout: true, durationMinutes: 30, isPlanCompleted: false,
  isRecordComplete: false, hasVerificationPhoto: false,
  hasReceivedDailyWorkoutXp: false, isTabata: false,
};

describe("calculateWorkoutXp", () => {
  it("기본 완료 100 + 시간만", () => {
    expect(calculateWorkoutXp({ ...base }).totalXp).toBe(110);
  });
  it("45분 전보너스 = 160", () => {
    const r = calculateWorkoutXp({ ...base, durationMinutes: 45, isPlanCompleted: true, isRecordComplete: true, hasVerificationPhoto: true });
    expect(r.totalXp).toBe(160);
  });
  it("95분 전보너스 = 180 (1회 최대)", () => {
    const r = calculateWorkoutXp({ ...base, durationMinutes: 95, isPlanCompleted: true, isRecordComplete: true, hasVerificationPhoto: true });
    expect(r.totalXp).toBe(180);
  });
  it("무효 운동 = 0", () => {
    const r = calculateWorkoutXp({ ...base, isValidWorkout: false });
    expect(r.totalXp).toBe(0);
    expect(r.rejectionReason).toBe("INVALID_WORKOUT");
  });
  it("당일 이미 수령 = 0", () => {
    const r = calculateWorkoutXp({ ...base, hasReceivedDailyWorkoutXp: true });
    expect(r.totalXp).toBe(0);
    expect(r.rejectionReason).toBe("DAILY_XP_ALREADY_AWARDED");
  });
  it("타바타는 유효, 계획·기록 보너스 없음", () => {
    const r = calculateWorkoutXp({ ...base, isTabata: true, durationMinutes: 16, isPlanCompleted: true, isRecordComplete: true });
    expect(r.baseXp).toBe(100);
    expect(r.planXp).toBe(0);
    expect(r.recordXp).toBe(0);
    expect(r.durationXp).toBe(0); // 16분 < 20분
    expect(r.totalXp).toBe(100);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/lib/domain/xp.test.ts` → FAIL

- [ ] **Step 3: 구현**

```ts
/** 운동 1회 XP 순수 계산. 서버 RPC와 동일 로직을 공유한다(표시·검증용). */
export interface WorkoutXpInput {
  isValidWorkout: boolean;
  durationMinutes: number;
  isPlanCompleted: boolean;
  isRecordComplete: boolean;
  hasVerificationPhoto: boolean;
  hasReceivedDailyWorkoutXp: boolean;
  isTabata: boolean;
}
export interface WorkoutXpBreakdown {
  baseXp: number; durationXp: number; planXp: number;
  recordXp: number; photoXp: number; totalXp: number;
  rejectionReason?: string;
}

export function getDurationXp(durationMinutes: number): number {
  if (durationMinutes >= 90) return 40;
  if (durationMinutes >= 60) return 30;
  if (durationMinutes >= 40) return 20;
  if (durationMinutes >= 20) return 10;
  return 0;
}

/** 서버 경과 초 → 내림 정수 분. RPC의 floor(sec/60)과 동일해야 한다. */
export function minutesFromSeconds(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}

/** 6시간(360분) 이상은 이상치로 보고 XP를 지급하지 않는다. */
export const MAX_XP_DURATION_MINUTES = 360;

const ZERO: WorkoutXpBreakdown = {
  baseXp: 0, durationXp: 0, planXp: 0, recordXp: 0, photoXp: 0, totalXp: 0,
};

export function calculateWorkoutXp(input: WorkoutXpInput): WorkoutXpBreakdown {
  if (!input.isValidWorkout) return { ...ZERO, rejectionReason: "INVALID_WORKOUT" };
  if (input.durationMinutes >= MAX_XP_DURATION_MINUTES) return { ...ZERO, rejectionReason: "DURATION_TOO_LONG" };
  if (input.hasReceivedDailyWorkoutXp) return { ...ZERO, rejectionReason: "DAILY_XP_ALREADY_AWARDED" };

  const baseXp = 100;
  const durationXp = getDurationXp(input.durationMinutes);
  // 타바타는 구성이 고정 → 계획/기록 보너스 제외(설계 §3.1)
  const planXp = !input.isTabata && input.isPlanCompleted ? 20 : 0;
  const recordXp = !input.isTabata && input.isRecordComplete ? 10 : 0;
  const photoXp = input.hasVerificationPhoto ? 10 : 0;
  const totalXp = baseXp + durationXp + planXp + recordXp + photoXp;
  return { baseXp, durationXp, planXp, recordXp, photoXp, totalXp };
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test src/lib/domain/xp.test.ts` → PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/xp.ts src/lib/domain/xp.test.ts
git commit -m "feat: 운동 XP 계산 순수 함수 (타바타 분기)"
```

---

### Task 5: complete_workout_v2 RPC — 완료+XP 원자 처리 (멱등)

**Files:**
- Modify: `supabase/migrations/0022_xp_level_system.sql` (append RPC)

핵심 규칙: 유효성 판정(타바타 분기), 시간은 **floor(초/60)**, KST effective_date, 당일 1회, 레벨/단계 재계산·보상은 **공통 함수 `apply_xp_and_progress`**에 위임, **완료된 세션 재호출은 멱등 재생 응답**. `is_valid_workout`은 클라 직접 실행 불가.

- [ ] **Step 1: 내부 유효성 함수 (외부 실행 금지)**

```sql
-- ── 유효 운동 판정 (내부 전용: authenticated도 직접 실행 불가) ──
-- 세션 소유자 검증을 함수 내부에도 둔다(타인 session_id 조회 차단).
create or replace function public.is_valid_workout(p_session_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_tabata_minutes int; v_owner uuid; v_completed_sets int;
begin
  select tabata_minutes, user_id into v_tabata_minutes, v_owner
  from workout_sessions where id = p_session_id;
  if not found or v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_tabata_minutes is not null then
    return true; -- 타바타는 완료 자체로 유효(세트 실적 0이라 세트 검사 면제)
  end if;
  select count(*) into v_completed_sets
  from workout_sets ws
  join workout_exercises we on we.id = ws.workout_exercise_id
  where we.session_id = p_session_id and ws.is_completed;
  return v_completed_sets >= 3;
end $$;

-- 클라이언트는 이 함수를 직접 호출할 수 없다. complete_workout_v2(SECURITY
-- DEFINER)가 소유자로서 내부 호출하므로 authenticated 실행 권한은 필요 없다.
revoke all on function public.is_valid_workout(uuid) from public, anon, authenticated;
```

- [ ] **Step 2: 공통 XP·진행 적용 함수 (Task 6·향후 주간/관리자와 공유)**

책임(설계 §17): ①XP 거래 insert ②user_progress row lock ③total_xp 갱신 ④이전·신규 레벨/단계 계산 ⑤last_level_up_at/last_stage_up_at 갱신 ⑥통과한 모든 레벨 보상 생성 ⑦보호권 지급(순서 엄수) ⑧unlockedRewards·levelUp·stageUp 반환. 보호권 지급 순서(修正11): unlock insert → **신규 unlock일 때만** shield 거래 insert → **shield 거래 성공 시에만** count 증가 → 실패 시 전체 롤백.

```sql
create or replace function public.apply_xp_and_progress(
  p_user_id uuid, p_amount int, p_reason text, p_reward_group text,
  p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inserted boolean := false;
  v_prev_xp int; v_new_xp int;
  v_prev_level int; v_new_level int;
  v_prev_stage int; v_new_stage int;
  v_reward record; v_unlocked jsonb := '[]'::jsonb;
  v_new_unlock int; v_shield_ins int; v_shield_amt int;
begin
  insert into user_progress (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select total_xp, current_level, current_stage
    into v_prev_xp, v_prev_level, v_prev_stage
  from user_progress where user_id = p_user_id for update;
  v_new_xp := v_prev_xp;

  -- 1) 원장 insert (중복 방지 인덱스가 병렬/재시도 방어)
  begin
    insert into xp_transactions
      (user_id, amount, transaction_type, reason, reward_group,
       source_type, source_id, effective_date, rule_version, metadata)
    values (p_user_id, p_amount, 'earn', p_reason, p_reward_group,
            p_source_type, p_source_id, p_effective_date, 'xp_v1', coalesce(p_metadata, '{}'::jsonb));
    v_inserted := true;
    v_new_xp := v_prev_xp + p_amount;
  exception when unique_violation then
    v_inserted := false; -- 이미 지급됨 → 진행 변경 없음
  end;

  if not v_inserted then
    return jsonb_build_object('inserted', false, 'amount', 0,
      'newTotalXp', v_prev_xp, 'previousLevel', v_prev_level, 'newLevel', v_prev_level,
      'previousStage', v_prev_stage, 'newStage', v_prev_stage,
      'levelUp', false, 'stageUp', false, 'unlockedRewards', '[]'::jsonb);
  end if;

  -- 2) 레벨/단계 재계산 (컷 = level_definitions)
  select level, stage_index into v_new_level, v_new_stage
  from level_definitions where required_total_xp <= v_new_xp
  order by required_total_xp desc limit 1;

  update user_progress set
    total_xp = v_new_xp, current_level = v_new_level, current_stage = v_new_stage,
    last_level_up_at = case when v_new_level > v_prev_level then now() else last_level_up_at end,
    last_stage_up_at = case when v_new_stage > v_prev_stage then now() else last_stage_up_at end,
    updated_at = now()
  where user_id = p_user_id;

  -- 3) 통과한 레벨 보상 (prev < lv <= new) — 한 번에 여러 레벨도 모두 지급
  for v_reward in
    select level, reward_key, reward_label from level_definitions
    where level > v_prev_level and level <= v_new_level and reward_key is not null
    order by level asc
  loop
    -- 3-1) unlock (중복 시 무시)
    insert into user_unlocks (user_id, unlock_key, source_level)
    values (p_user_id, v_reward.reward_key, v_reward.level)
    on conflict (user_id, unlock_key) do nothing;
    get diagnostics v_new_unlock = row_count;

    if v_new_unlock > 0 then
      v_unlocked := v_unlocked || jsonb_build_object('key', v_reward.reward_key, 'label', v_reward.reward_label);

      -- 3-2) 보호권: 신규 unlock일 때만, 거래 성공 시에만 count 증가
      if v_reward.reward_key like 'streak_shield%' or v_reward.reward_key = 'eternal_flame' then
        v_shield_amt := case when v_reward.level >= 31 then 3 when v_reward.level >= 25 then 2 else 1 end;
        insert into streak_shield_transactions (user_id, amount, reason, source_type, source_id)
        values (p_user_id, v_shield_amt, 'level_reward', 'level', v_reward.level::text)
        on conflict (user_id, reason, source_type, source_id) do nothing;
        get diagnostics v_shield_ins = row_count;
        if v_shield_ins > 0 then
          update user_progress set streak_shield_count = streak_shield_count + v_shield_amt
          where user_id = p_user_id;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('inserted', true, 'amount', p_amount,
    'newTotalXp', v_new_xp, 'previousLevel', v_prev_level, 'newLevel', v_new_level,
    'previousStage', v_prev_stage, 'newStage', v_new_stage,
    'levelUp', v_new_level > v_prev_level, 'stageUp', v_new_stage > v_prev_stage,
    'unlockedRewards', v_unlocked);
end $$;

revoke all on function public.apply_xp_and_progress(uuid, int, text, text, text, text, date, jsonb)
  from public, anon, authenticated;
```

- [ ] **Step 3: complete_workout_v2 (완료 + 멱등 + floor 시간 + 사진 검증)**

```sql
create or replace function public.complete_workout_v2(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;

  -- ── 멱등 처리(修正6) ──────────────────────────────────────
  if s.status = 'cancelled' then
    raise exception 'invalid_status:cancelled';
  elsif s.status = 'completed' then
    select amount into v_orig from xp_transactions
    where user_id = s.user_id and reason = 'workout_completed'
      and source_type = 'workout' and source_id = p_session_id::text
    limit 1;
    if v_orig is null then
      -- 완료됐는데 XP 거래가 없음 = 불완전 처리. 조용히 0 처리하지 않는다.
      raise exception 'incomplete_xp_processing';
    end if;
    -- 이미 지급됨 → 재생 응답
    return (
      select jsonb_build_object(
        'idempotentReplay', true, 'awarded', false,
        'originalXpAwarded', v_orig.amount,
        'currentTotalXp', up.total_xp, 'currentLevel', up.current_level,
        'currentStage', up.current_stage, 'rejectionReason', 'XP_ALREADY_AWARDED')
      from user_progress up where up.user_id = s.user_id
    );
  elsif s.status <> 'active' then
    raise exception 'invalid_status:%', s.status;
  end if;

  -- ── 정상 완료 (status = active) ───────────────────────────
  -- floor(초/60) 정수 분 (修正5). started_at은 active 진입 시 항상 존재.
  update workout_sessions
  set status = 'completed', completed_at = now(),
      duration_minutes = floor(extract(epoch from now() - s.started_at) / 60)::int
  where id = p_session_id
  returning * into s;

  v_dur := s.duration_minutes;
  v_tabata := s.tabata_minutes is not null;
  -- 유효성: 세트/타바타 + 시각 존재 + 0 <= 분 < 360 (360분↑은 XP 0, 완료 기록은 유지)
  v_valid := public.is_valid_workout(p_session_id)
             and s.started_at is not null and s.completed_at is not null
             and v_dur >= 0 and v_dur < 360;

  v_eff := (now() at time zone 'Asia/Seoul')::date;
  select exists (
    select 1 from xp_transactions
    where user_id = s.user_id and transaction_type = 'earn'
      and reward_group = 'daily_workout' and effective_date = v_eff
  ) into v_has_daily;

  if v_valid and not v_has_daily then
    v_base := 100;
    v_time := case when v_dur >= 90 then 40 when v_dur >= 60 then 30
                   when v_dur >= 40 then 20 when v_dur >= 20 then 10 else 0 end;
    if not v_tabata then
      v_plan := 0; -- 계획-실행 필수판정 스키마 없음 → 0 (설계 §5)
      v_rec := case when exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
        ) and not exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed and ws.reps is null
        ) then 10 else 0 end;
    end if;
    -- 사진(修正9): verification_status가 아니라 workout_images 실재로 판정.
    -- 이 스키마는 업로드 성공 시에만 행이 생기고(image_path not null),
    -- 삭제는 하드 삭제라 "처리 중/실패/삭제" 상태 컬럼이 없다 → 행 존재 = 정상 사진.
    v_photo := case when exists (
      select 1 from workout_images wi
      where wi.session_id = p_session_id and wi.user_id = s.user_id and wi.image_path is not null
    ) then 10 else 0 end;
    v_total := v_base + v_time + v_plan + v_rec + v_photo;
  end if;

  -- XP 적용은 공통 함수에 위임
  if v_total > 0 then
    v_prog := public.apply_xp_and_progress(
      s.user_id, v_total, 'workout_completed', 'daily_workout',
      'workout', p_session_id::text, v_eff,
      jsonb_build_object('base_xp', v_base, 'duration_xp', v_time, 'plan_xp', v_plan,
        'record_xp', v_rec, 'photo_xp', v_photo, 'duration_minutes', v_dur,
        'duration_source', 'server_elapsed', 'is_tabata', v_tabata));
    if not (v_prog->>'inserted')::boolean then v_total := 0; end if;
  else
    insert into user_progress (user_id) values (s.user_id) on conflict (user_id) do nothing;
    select jsonb_build_object('newTotalXp', total_xp, 'previousLevel', current_level,
      'newLevel', current_level, 'previousStage', current_stage, 'newStage', current_stage,
      'levelUp', false, 'stageUp', false, 'unlockedRewards', '[]'::jsonb)
    into v_prog from user_progress where user_id = s.user_id;
  end if;

  return jsonb_build_object(
    'idempotentReplay', false,
    'awarded', v_total > 0, 'xpAwarded', v_total,
    'breakdown', jsonb_build_object('baseXp', v_base, 'durationXp', v_time,
      'planXp', v_plan, 'recordXp', v_rec, 'photoXp', v_photo),
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards'
  );
end $$;

revoke all on function public.complete_workout_v2(uuid) from public, anon;
grant execute on function public.complete_workout_v2(uuid) to authenticated;
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0022_xp_level_system.sql
git commit -m "feat: complete_workout_v2 멱등 + apply_xp_and_progress 공통 함수 + floor 시간"
```

---

### Task 6: award_workout_photo_xp RPC — 사진 후등록 (공통 함수 사용)

**Files:**
- Modify: `supabase/migrations/0022_xp_level_system.sql` (append)

+10 XP만 더하고 끝내지 않는다(修正10). 레벨/단계/보상/보호권은 **`apply_xp_and_progress`가 일괄 처리**한다. 사진 판정은 `workout_images` 실재로 한다(修正9).

- [ ] **Step 1: RPC 작성**

```sql
create or replace function public.award_workout_photo_xp(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_eff date;
  v_prog jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  if s.status <> 'completed' or s.deleted_at is not null then
    raise exception 'invalid_status';
  end if;

  -- 사진 실재 검증(修正9): workout_images 행 존재(=업로드 성공, image_path not null).
  -- 이 스키마엔 처리중/실패/삭제 상태가 없다 → 행 없으면 사진 XP 0.
  if not exists (
    select 1 from workout_images wi
    where wi.session_id = p_session_id and wi.user_id = s.user_id and wi.image_path is not null
  ) then
    return jsonb_build_object('awarded', false, 'reason', 'no_photo');
  end if;

  if s.completed_at < now() - interval '30 minutes' then
    return jsonb_build_object('awarded', false, 'reason', 'too_late');
  end if;

  -- 해당 운동이 당일 기본 XP 대상이었어야 사진 XP 인정
  if not exists (
    select 1 from xp_transactions
    where user_id = s.user_id and source_type = 'workout'
      and source_id = p_session_id::text and reason = 'workout_completed'
  ) then
    return jsonb_build_object('awarded', false, 'reason', 'not_daily_workout');
  end if;

  v_eff := (s.completed_at at time zone 'Asia/Seoul')::date;

  -- 공통 함수: insert + 레벨/단계/보상/보호권 일괄. 동일 세션 사진 XP는
  -- xp_transactions source 유니크로 1회만(inserted=false면 이미 지급).
  v_prog := public.apply_xp_and_progress(
    s.user_id, 10, 'workout_photo', null,
    'workout', p_session_id::text, v_eff, jsonb_build_object('photo_xp', 10));

  if not (v_prog->>'inserted')::boolean then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  return jsonb_build_object('awarded', true, 'xpAwarded', 10,
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards');
end $$;

revoke all on function public.award_workout_photo_xp(uuid) from public, anon;
grant execute on function public.award_workout_photo_xp(uuid) to authenticated;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0022_xp_level_system.sql
git commit -m "feat: award_workout_photo_xp — 공통 함수 사용 + workout_images 검증"
```

---

### Task 7: 실 DB 통합·RLS 테스트 스크립트

**Files:**
- Create: `scripts/xp-test.mjs`

기존 `scripts/rls-test.mjs` 패턴(익명 유저 생성 + REST/RPC 호출 + 픽스처 정리)을 따른다. **정리까지 책임진다**(교훈 13).

- [ ] **Step 1: 스크립트 작성** — 아래 시나리오를 검증한다. (기존 rls-test.mjs의 `anonUser()`·`api()` 헬퍼를 복사해 재사용)

검증 항목:
1. 신규 유저 → 세션 생성(웨이트, 3세트 reps 채움) → `start_workout` → `complete_workout_v2` → `awarded=true`, `xpAwarded>=110`, `newLevel` 정확.
2. 같은 유저 당일 2번째 운동 → `complete_workout_v2` → `xpAwarded=0`(DAILY 중복).
3. **멱등(修正6)**: 완료된 동일 세션에 `complete_workout_v2` 재호출 → 서버 오류가 아니라 `idempotentReplay=true`, `awarded=false`, `rejectionReason='XP_ALREADY_AWARDED'`. **xp_transactions는 1건, total_xp는 1회만 증가.** 동일 요청 병렬 2회도 동일.
4. RLS: A가 B의 `user_progress`/`xp_transactions` select → 0행. A가 `user_progress` 직접 PATCH(`total_xp=999999`) → 실패. **A가 `xp_transactions` 직접 insert → 실패.**
5. `level_definitions` select는 인증 유저 가능, PATCH는 실패.
6. 타바타 세션(`tabata_minutes=16`, 세트 reps 없음) → `complete_workout_v2` → `awarded=true`, `xpAwarded=100`.
7. **DB↔TS 미러 일치(修正3)**: `level_definitions` 35행을 조회해 `LEVEL_DEFS`와 `level·required_total_xp·stage_index·stage_key·stage_name·character_path`가 전부 일치. 하나라도 다르면 실패.
8. **360분+ 거부(修正5)**: `started_at`을 6시간+ 과거로 조작한 세션 완료 → `xpAwarded=0`(완료 기록 자체는 남음).
9. **사진 XP(修正9)**: (a) `workout_images` 없음 → 사진 XP 0 (b) 정상 사진 존재 → `workout_completed`에 photo_xp 10 포함 (c) 완료 30분 이내 후등록 → `award_workout_photo_xp` → +10 (d) 재호출 → `already_awarded`(1회만). *스키마상 세션당 사진 1장·처리중/삭제 상태 컬럼 없음 → "처리중/삭제" 케이스는 행 부재(=0)로 수렴.*
10. **사진 후등록 레벨업(修正10)**: 후등록 +10으로 레벨/단계가 오르면 `levelUp`/`stageUp`/보상/보호권이 응답과 DB에 반영.
11. **다중 레벨 통과**: `admin`으로 큰 XP를 한 번에 넣는 대신, 컷을 여러 개 넘는 완료 1건 시 `user_unlocks`에 통과한 모든 레벨 보상이 생성.
12. **보호권 중복 없음(修正11)**: 동일 레벨 보상 재적용 시 `streak_shield_transactions` 추가 없음, `streak_shield_count` 불변.
13. **내부 함수 보호(修正7)**: 인증 유저가 `is_valid_workout`을 직접 RPC 호출 → 권한 실패. 타 유저 `session_id`로도 조회 불가.
14. 종료 시 생성한 계정·크루·세션 전부 삭제(service_role). **잔여물 0**(교훈 13).

- [ ] **Step 2: 실행**

Run: `node scripts/xp-test.mjs`
Expected: 모든 항목 ✅, 잔여물 0

- [ ] **Step 3: 커밋**

```bash
git add scripts/xp-test.mjs
git commit -m "test: XP 시스템 실 DB 통합·RLS 검증"
```

> ⚠️ 이 태스크 실행 전 **0022 마이그레이션을 Supabase SQL Editor에 붙여넣어 적용**해야 한다(프로젝트 관례: 마이그레이션은 수동 적용).

---

### Task 8: 클라이언트 조회·완료 래퍼

**Files:**
- Modify: `src/lib/workout.ts` (completeWorkoutV2 추가)
- Create: `src/lib/progression.ts`

- [ ] **Step 1: workout.ts에 v2 래퍼 추가** (`completeWorkout` 아래)

```ts
export interface WorkoutXpResult {
  idempotentReplay: boolean;
  awarded: boolean;
  xpAwarded?: number;
  breakdown?: { baseXp: number; durationXp: number; planXp: number; recordXp: number; photoXp: number };
  newTotalXp?: number;
  previousLevel?: number; newLevel?: number;
  previousStage?: number; newStage?: number;
  levelUp?: boolean; stageUp?: boolean;
  unlockedRewards?: { key: string; label: string }[];
  // 멱등 재생 응답(修正6·10) 필드
  originalXpAwarded?: number;
  currentTotalXp?: number; currentLevel?: number; currentStage?: number;
  rejectionReason?: string;
}

/** 완료 + XP를 원자 처리하는 신규 경로. 세션 객체 대신 XP 결과를 반환한다. */
export async function completeWorkoutV2(sessionId: string): Promise<WorkoutXpResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("complete_workout_v2", { p_session_id: sessionId });
  if (error) throw error;
  return data as WorkoutXpResult;
}
```

- [ ] **Step 2: progression.ts (클라 조회) 작성**

**修正14 원칙**: `data`가 null인 것(신규 사용자, 정상)과 `error`(네트워크·권한 오류)를 **구분**한다. 오류는 삼키지 않고 throw한다 — 홈은 성장 카드만 오류 상태로 처리하고 운동 기능은 유지, 내 정보는 다시 시도 UI를 띄운다. RLS가 본인 행만 반환하므로 **`userId` 인자는 제거**하고 현재 인증 세션을 기준으로 조회한다.

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getLevelProgress } from "@/lib/domain/progression";

/** Asia/Seoul 기준 오늘(YYYY-MM-DD). */
function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export interface ProgressSummary {
  totalXp: number;
  currentLevel: number;
  currentStage: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  streakShieldCount: number;
  hasReceivedTodayWorkoutXp: boolean; // 修正15
}

/** 홈·내 정보 공용 요약. RLS로 본인 행만 조회. error는 throw, data null은 신규(0 XP). */
export async function getProgressSummary(): Promise<ProgressSummary> {
  const supabase = getSupabaseBrowserClient();
  const [{ data, error }, todayXp] = await Promise.all([
    supabase.from("user_progress")
      .select("total_xp, current_stage, streak_shield_count")
      .maybeSingle(),
    supabase.from("xp_transactions")
      .select("id", { count: "exact", head: true })
      .eq("reason", "workout_completed")
      .eq("effective_date", todayKst()),
  ]);
  if (error) throw error;
  if (todayXp.error) throw todayXp.error;

  const totalXp = data?.total_xp ?? 0; // data null = 신규 사용자
  const p = getLevelProgress(totalXp);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: p.currentStageIndex,
    stageName: p.stageName,
    characterPath: p.characterPath,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    streakShieldCount: data?.streak_shield_count ?? 0,
    hasReceivedTodayWorkoutXp: (todayXp.count ?? 0) > 0,
  };
}

export interface XpTransactionRow {
  id: string; amount: number; reason: string;
  metadata: Record<string, number | boolean>; createdAt: string;
}

/** 내 정보 XP 획득 내역 최근 20건. error는 throw. */
export async function getRecentXpTransactions(): Promise<XpTransactionRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("xp_transactions")
    .select("id, amount, reason, metadata, created_at")
    .eq("transaction_type", "earn")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, amount: r.amount, reason: r.reason,
    metadata: r.metadata, createdAt: r.created_at,
  }));
}

/** 해금된 unlock_key 집합. error는 throw. */
export async function getMyUnlocks(): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("user_unlocks").select("unlock_key");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.unlock_key));
}
```

- [ ] **Step 3: 타입체크·커밋**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/lib/workout.ts src/lib/progression.ts
git commit -m "feat: completeWorkoutV2 래퍼 + 성장 조회 헬퍼"
```

---

### Task 8B: 진행 복구(재계산) 스크립트

캐시(`user_progress.total_xp`)가 원장(`xp_transactions` SUM)과 어긋났을 때 안전하게 정정하는 운영 도구. **원장이 공식 원천**이므로 원장 기준으로 캐시·레벨·단계를 다시 계산한다.

**Files:**
- Create: `scripts/recalculate-user-progress.mjs`

- [ ] **Step 1: 스크립트 작성** — `rls-test.mjs`의 env 로딩 + service_role 클라이언트 패턴을 재사용한다.

기능·옵션:
- `xp_transactions`를 사용자별 `SUM(amount)` 집계 → `user_progress.total_xp`와 비교.
- 불일치 시 `level_definitions` 컷으로 레벨·단계 재계산.
- **기본은 dry-run**(아무것도 쓰지 않음). `--apply`일 때만 `user_progress` 갱신.
- `--user-id <uuid>`: 특정 사용자만. `--all`: 전체 사용자.
- **음수 XP 합계면 자동 수정하지 않고 그 사용자는 건너뛰며 경고**(원장 손상 신호).
- 수정 전·후 값을 출력.

출력 항목: 검사 사용자 수 · 불일치 사용자 수 · (사용자별) 캐시 XP · 원장 XP · 기존 레벨/단계 · 복구 예정 레벨/단계.

- [ ] **Step 2: dry-run 실행 확인**

Run: `node scripts/recalculate-user-progress.mjs --all`
Expected: 불일치 0 (정상 시), 아무 데이터도 변경하지 않음

- [ ] **Step 3: 커밋**

```bash
git add scripts/recalculate-user-progress.mjs
git commit -m "chore: user_progress 원장 기준 재계산 스크립트 (dry-run 기본)"
```

---

# Phase B — 화면 (홈 / 내 정보 / 완료)

> 이 페이즈는 Phase A가 배포된 뒤 진행한다. 검증은 실기기 수동(프로젝트 관례)으로 한다.

### Task 9: 캐릭터 에셋 배치

**Files:**
- Add: `public/characters/char-1.png … char-7.png`, `public/characters/fallback.png`

- [ ] **Step 1: 매핑대로 복사** (원본은 `7단계 캐릭터/`, 생성시각 ≠ 단계순 주의)

```bash
mkdir -p public/characters
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_09_23.png" public/characters/char-1.png  # 개노답
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_09_08.png" public/characters/char-2.png  # 눈떴개
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_09_05.png" public/characters/char-3.png  # 일단하개
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_09_02.png" public/characters/char-4.png  # 물고가개
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_08_58.png" public/characters/char-5.png  # 미쳐보개
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_08_54.png" public/characters/char-6.png  # 판을짜개
cp "7단계 캐릭터/ChatGPT Image 2026년 7월 22일 오전 06_09_41.png" public/characters/char-7.png  # 전설이개
cp public/characters/char-1.png public/characters/fallback.png  # 임시 fallback
```

- [ ] **Step 2: (선택) WebP 최적화** — 용량이 크면 `char-*.png`를 WebP로 변환하고 경로를 `.webp`로 맞춘다(설계 §12). 1차는 PNG 그대로 진행 가능.

- [ ] **Step 3: 커밋**

```bash
git add public/characters
git commit -m "assets: 7단계 캐릭터 + fallback 배치"
```

---

### Task 10: 홈 "나의 캐릭터 카드"

**Files:**
- Create: `src/components/home/character-card.tsx`
- Modify: `src/components/home/home-client.tsx`

- [ ] **Step 1: 카드 컴포넌트 작성** — `ProgressSummary`를 받아 캐릭터·레벨·구간 진행바·"성장 보기 >"(→ `/profile`) 표시. 목업 좌하단 "나의 캐릭터" 카드와 동일 구성.

```tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import type { ProgressSummary } from "@/lib/progression";

export function CharacterCard({ summary }: { summary: ProgressSummary }) {
  const pct = Math.min(100, Math.round(summary.levelProgressPercent));
  return (
    <Link href="/profile" className="block rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Image src={summary.characterPath} alt={`${summary.stageName} 캐릭터`}
          width={64} height={85} className="rounded-card-sm object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = "/characters/fallback.png"; }} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold text-accent">Lv.{summary.currentLevel}</p>
          <p className="text-xs text-muted">{summary.stageName} 단계</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }}
              role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {summary.nextLevelRequiredXp === null
              ? "최고 레벨 달성"
              : `다음 레벨까지 ${summary.xpToNextLevel} XP`}
          </p>
          {/* 修正15: 오늘 XP 상태 한 줄 (이번 주 XP는 표시 안 함) */}
          <p className="mt-0.5 text-[11px] font-semibold text-accent">
            {summary.hasReceivedTodayWorkoutXp
              ? "오늘의 운동 XP 획득 완료"
              : "오늘 운동하면 최대 180 XP"}
          </p>
        </div>
        <span className="text-xs font-bold text-accent">성장 보기 ›</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: home-client에 삽입** — `getProgressSummary`를 기존 `Promise.all`에 추가하고, `KingCard` 아래에 `<CharacterCard>` 렌더. (import 추가, state `summary` 추가)

```tsx
// import 추가
import { CharacterCard } from "@/components/home/character-card";
import { getProgressSummary, type ProgressSummary } from "@/lib/progression";
// state 추가 (summary + 오류 상태 — 修正14: 성장 카드만 오류 처리, 운동 기능은 유지)
const [summary, setSummary] = useState<ProgressSummary | null>(null);
const [summaryError, setSummaryError] = useState(false);
// Promise.all 확장: getProgressSummary() 추가(인자 없음). try/catch로 setSummaryError(true).
// JSX: <KingCard .../> 아래에
{summary && <CharacterCard summary={summary} />}
{summaryError && (
  <p className="rounded-card-sm border border-line bg-surface px-3 py-2.5 text-xs text-muted">
    성장 정보를 불러오지 못했어요.
  </p>
)}
```

- [ ] **Step 3: 실기기/프리뷰 확인** — 개발 서버(`.claude/launch.json`의 `next-dev`)로 홈에서 카드가 뜨고 "성장 보기"가 `/profile`로 이동하는지, 이미지 로드/진행바 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/components/home/character-card.tsx src/components/home/home-client.tsx
git commit -m "feat: 홈 나의 캐릭터 카드"
```

---

### Task 11: 내 정보 성장 허브

**Files:**
- Create: `src/components/profile/growth-hub.tsx` (+ 하위 컴포넌트)
- Modify: `src/app/(tabs)/profile/page.tsx`

목업 오른쪽 구성을 그대로 만든다. 데이터: `getProgressSummary` + `LEVEL_DEFS`(정적) + `getRecentXpTransactions` + `getMyUnlocks`.

- [ ] **Step 1: growth-hub 컴포넌트** — 아래 섹션을 위→아래로 배치:
  1. **7단계 캐러셀**(`LEVEL_DEFS`를 stageIndex로 묶어 7칸, 현재 단계 강조 테두리, 잠긴 단계 `grayscale`+자물쇠). 가로 스크롤.
  2. **현재 단계 카드**: 캐릭터, `개노답 Lv.N`, 상태 설명(단계별 문구 상수), 구간 진행바+`%`, `다음 레벨까지 N XP`, "7단계 안내 ›"(캐러셀로 스크롤).
  3. **레벨 혜택**: `level_definitions`(DB)에서 `reward_label`·`reward_status`를 읽어 표시. 해금 여부는 `getMyUnlocks()`로 판정. **`reward_status='coming_soon'` 보상은 실제 사용 가능한 기능처럼 노출하지 말고 "준비 중" 배지로 표시**(修正2). `active`만 해금/사용 가능으로 표현. (reward 필드는 정적 `LEVEL_DEFS` 미러에 없으므로 DB에서 조회 — `progression.ts` 클라에 `getLevelRewards()` 추가: `level, reward_key, reward_label, reward_status` select.)
  4. **다음 단계 미리보기**: 다음 stageIndex 캐릭터+설명+`Lv.(다음단계 시작) 달성 시 해금`.
  5. **성장 타임라인**: 완료 레벨(체크)·현재(강조)·잠금(자물쇠) 세로 목록.
  6. **"XP 획득 방법 보기"** 버튼 → Task 13 시트 오픈.

단계 설명 문구 상수(설계 §7 표 기반):
```ts
export const STAGE_DESCRIPTIONS: Record<number, { name: string; desc: string }> = {
  1: { name: "개노답", desc: "생각은 많지만 아직 움직이지 않는 상태. 작은 행동 하나가 탈출의 시작이다." },
  2: { name: "눈떴개", desc: "문제를 깨닫고 처음 움직이기 시작한 상태." },
  3: { name: "일단하개", desc: "완벽하지 않아도 바로 행동하는 상태." },
  4: { name: "물고가개", desc: "목표 하나를 물고 놓지 않는 상태." },
  5: { name: "미쳐보개", desc: "실행에 완전히 빠져든 상태." },
  6: { name: "판을짜개", desc: "결과로 새로운 판을 만드는 상태." },
  7: { name: "전설이개", desc: "실행 자체가 정체성이 된 상태." },
};
```

- [ ] **Step 2: profile/page.tsx 재구성** — 헤더 아래에 `<GrowthHub />`를 메인으로 두고, 기존 `PushSettings`+알림 토글은 우상단 톱니(⚙️) 클릭 시 열리는 설정 섹션으로 이동(간단히 `showSettings` 토글로 접기). **修正14: 성장 데이터 조회 실패 시 "다시 시도" 버튼 UI를 표시**(색상만이 아니라 텍스트로도 오류를 알림 — 접근성).

- [ ] **Step 3: 실기기 확인** — 캐러셀 스크롤, 잠긴 단계 실루엣, 진행바, 타임라인, 톱니→알림설정 동작.

- [ ] **Step 4: 커밋**

```bash
git add src/components/profile src/app/\(tabs\)/profile/page.tsx
git commit -m "feat: 내 정보 성장 허브 (7단계·현재단계·혜택·타임라인)"
```

---

### Task 12: XP 획득 방법 시트

**Files:**
- Create: `src/components/profile/xp-guide-sheet.tsx`

- [ ] **Step 1: 시트 작성** — "XP 획득 방법 보기" 탭 시 열리는 바텀시트/모달. **이번 스프린트에 실제 지급되는 것만 "획득 가능"으로, 미구현은 "준비 중"으로 표시**(修正17: 지급 안 되는 XP를 지급되는 것처럼 안내하지 않는다).

  **지금 획득 가능**:
  - 기본 완료 **100**
  - 시간 보너스 표(20분↑ +10 / 40분↑ +20 / 60분↑ +30 / 90분↑ +40, 상한 40)
  - 기록 완성 **+10**
  - 인증사진 **+10**
  - **하루 1회 제한** 안내(KST 기준, 2번째 운동부터 XP 0·기록은 반영)
  - 타바타는 완료 자체로 **100**

  **준비 중(이번 스프린트 미지급)**:
  - **주간 목표 +100** — 주간 달성 판정 구조가 아직 없어 이번 범위 제외(修正17-B). "준비 중"으로만 안내.
  - **계획 완료 +20** — 계획-실행 필수판정 연결이 없어 현재 0 지급(설계 §5). "준비 중"으로 안내.

- [ ] **Step 2: 실기기 확인** — 버튼 탭 → 시트 오픈/닫기, 스크롤, 접근성(키보드 닫기).

- [ ] **Step 3: 커밋**

```bash
git add src/components/profile/xp-guide-sheet.tsx
git commit -m "feat: XP 획득 방법 안내 시트"
```

---

### Task 13: 운동 완료 XP/레벨업/진화 모달

**Files:**
- Create: `src/components/record/xp-result-modal.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: 모달 작성 (순차 이벤트 큐 방식 — 修正16)** — 한 화면에 모든 내용을 동시에 쏟지 않고, **하나의 모달 컨테이너 안에서 단계만 전환**한다.

`WorkoutXpResult`로 이벤트 배열을 만든다(해당하는 것만 포함):
```ts
type XpEvent =
  | { type: "xp" }          // 항목별 +XP 합계(breakdown)
  | { type: "level_up" }    // Lv.a → Lv.b
  | { type: "stage_up" }    // 캐릭터 전환(이전→새 단계)
  | { type: "reward" };     // 해금 보상 목록
// 순서: xp → level_up(levelUp일 때) → stage_up(stageUp일 때) → reward(unlockedRewards 있을 때)
```
요구사항:
- 현재 이벤트 인덱스를 state로 두고 **"다음"** 버튼으로 진행, 마지막은 **"확인"**.
- 상단에 **"모두 확인"(건너뛰기)** 제공 → 즉시 닫기.
- **XP만 받은 경우(레벨업·진화·보상 없음) 한 단계만** 표시하고 바로 "확인".
- `idempotentReplay=true`(재호출)면 모달을 띄우지 않는다.
- 전환 애니메이션 300~500ms 페이드 + **`prefers-reduced-motion` 존중**(감소 설정이면 애니메이션 없이 즉시 전환).

- [ ] **Step 2: record/page.tsx 완료 경로 교체** — `handleFinish`에서 `completeWorkout`(구) 대신 `completeWorkoutV2`를 호출하고 반환 `WorkoutXpResult`로 모달을 띄운다. 기존 `markRecordBeaten` 호출은 유지(별도 흐름). 완료 실패 시 기존 에러 처리 유지.

```tsx
// 기존: const s = await completeWorkout(draft.sessionId);
// 변경:
const xp = await completeWorkoutV2(draft.sessionId);
setXpResult(xp);            // 모달 오픈
// record-beaten 판정은 기존대로 이어서 실행
```

- [ ] **Step 3: 실기기 확인** — 실제 운동 완료 → XP 합계 표시, 레벨업/진화 케이스, 홈 카드·내 정보 즉시 반영, 중복 클릭 시 XP 1회.

- [ ] **Step 4: 커밋**

```bash
git add src/components/record/xp-result-modal.tsx src/app/\(tabs\)/record/page.tsx
git commit -m "feat: 운동 완료 XP·레벨업·진화 모달 + v2 완료 경로"
```

---

### Task 14: 최종 게이트 + 배포

**마이그레이션 파일 정책 (修正18 — 배포 전 반드시 확인):**
- `0022`가 **아직 어떤 DB(개발·스테이징·운영)에도 적용되지 않았다면** → `0022_xp_level_system.sql` 직접 수정 가능(Task 1~6이 같은 파일을 이어 붙이는 것도 이 전제).
- `0022`가 **한 곳이라도 적용됐다면** → 기존 파일 수정 금지. 이후 변경은 **새 마이그레이션으로 분리**한다. 예: `0023_xp_system_hardening.sql`, `0024_weekly_goal_xp.sql`, `0025_xp_recovery_admin.sql`.
- **적용된 마이그레이션을 고쳐 이력을 왜곡하지 않는다.**

- [ ] **Step 1: 전체 게이트**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: 전부 통과. 기존 테스트(챌린지 레벨 `level.test.ts` 포함)가 깨지지 않아야 한다.

- [ ] **Step 2: 0022 마이그레이션 운영 적용** — Supabase SQL Editor에 `0022_xp_level_system.sql` 전체 붙여넣기 → Run(1회). `scripts/xp-test.mjs` 실 DB 통과 재확인.

- [ ] **Step 3: 실기기 검수** — 홈 카드·내 정보 허브·완료 모달·레벨업·진화·XP 방법 시트를 실기기(320px~, safe-area)에서 확인. **사용자 실기기 확인 후** 다음 단계로.

- [ ] **Step 4: 배포** — main 반영 → Vercel 배포 → 배포 URL 200 + 캐릭터 이미지 로드 확인.

- [ ] **Step 5: PROGRESS.md 갱신** — 완료 항목·검증 실측치 기록.

---

## Self-Review 체크리스트 (실행자용)

- [ ] 설계 §2 XP 규칙 → Task 4/5 반영
- [ ] 설계 §3.1 타바타 분기 → Task 4(순수)·Task 5(RPC `is_valid_workout`)·Task 7 시나리오6
- [ ] 설계 §4 duration 재사용 → Task 5(세션 `duration_minutes` 사용, floor 재계산 안 함)
- [ ] 설계 §7 챌린지 레벨과 분리 → `progression.ts` 신규 모듈, `level.ts` 미변경
- [ ] 설계 §9.1 원자성 → `complete_workout_v2` 단일 트랜잭션
- [ ] 설계 §10 RLS → Task 1 정책 + Task 7 검증4·5
- [ ] 설계 §11 화면 → 홈 카드(Task 10)·성장 허브(Task 11)·완료 모달(Task 13)
- [ ] 설계 §11.2 XP 획득 방법 시트 → Task 12
- [ ] 설계 §12 fallback·에셋 → Task 9
- [ ] 하루/주간 중복 → Task 5(daily 인덱스) + Task 7 시나리오2·3
- [ ] 단계 명칭 = 놀이안 → Task 2 seed / Task 3 STAGES / Task 11 STAGE_DESCRIPTIONS 일치
- [ ] 멱등(修正6) → Task 5 replay + Task 7 항목3
- [ ] 공통 함수(修正8) → `apply_xp_and_progress`를 Task 5·6이 공유
- [ ] 사진 판정 = workout_images(修正9) → Task 5·6 + Task 7 항목9
- [ ] 내부 함수 잠금(修正7) → Task 5 `is_valid_workout` revoke + Task 7 항목13
- [ ] DB↔TS 미러 일치(修正3) → Task 7 항목7

> **주간 목표 +100 XP는 이번 스프린트 범위에서 제외한다(修正17-B).** 현재 코드에 주간 달성 판정·스냅샷·지급 구조가 없고(있는 것은 `profiles.weekly_goal` 목표치와 클라 계산 `WeeklyStats`뿐), "임의로 새 주간 구조를 만들지 말라"는 지침에 따라 제외한다. XP 안내 시트(Task 12)에 **"준비 중"**으로만 표시한다. 추후 도입 시 별도 마이그레이션(`0024_weekly_goal_xp.sql`)에서 `apply_xp_and_progress`를 재사용해 구현한다.
