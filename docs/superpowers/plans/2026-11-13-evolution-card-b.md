# 진화 카드 디자인 개선(시안 B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 이 세션에서 인라인으로 실행한다. 체크박스(`- [ ]`)로 진행을 추적한다.

**Goal:** 서버 진화 카드를 큰 숫자 타일(달성)·막대 줄(남은 조건)·초과 배지로 다시 그려 직관성과 초과 달성의 성취감을 높인다.

**Architecture:** 표시 규칙(배수·배지·부제·막대 %·헤더 문구)을 React 없는 순수 함수 `buildEvolutionCardModel`에 모으고, 컴포넌트는 모델을 그리기만 한다. 서버·DB·규칙은 변경 없음. 설계서: `docs/superpowers/specs/2026-11-13-evolution-card-b-design.md`.

**Tech Stack:** Next.js 16 · React · TypeScript · Tailwind v4(앱 토큰 `accent`·`good`·`warn`·`surface-2`·`line`) · Vitest.

**브랜치/위치:** `feat/evolution-card-b`, 워크트리 `C:\Users\SAMSUNG\workout-app\.worktrees\level-growth-v2`.

## 파일 구조
- Create `src/lib/domain/evolution-card-model.ts` — 순수 모델. `buildEvolutionCardModel(status: StageGateStatus): EvolutionCardModel`.
- Create `src/lib/domain/evolution-card-model.test.ts` — 모델 단위 시험.
- Modify `src/components/profile/stage-evolution-status.tsx` — 모델을 그리는 표시 컴포넌트(헤더·칸 막대·타일·막대 줄·대체 경로).
- Modify `src/components/profile/stage-evolution-status.test.tsx` — 렌더 시험(새 구조에 맞춰 갱신, 서버 `met` 신뢰·error에서 성장 숨김·needs_baseline 0% 금지 단언 유지).
- Modify `src/components/profile/evolution-status-card.gate.client.test.tsx` — 평균 표시 단언을 새 타일 문구에 맞춤.
- Modify `src/app/globals.css` — `.evo-pop` 한 번 키프레임 + `prefers-reduced-motion` 해제.

## 모델 인터페이스 (Task 1에서 확정, 이후 Task가 그대로 사용)
```ts
type Tone = "met" | "over" | "big";
type CardTile = { key: GateCondition["key"]; label: string; value: string; target: string; tone: Tone; badge: string | null };
type CardRow = { key: GateCondition["key"]; label: string; valueText: string; percent: number; hint: string };
type CardAlternate = { text: string; valueText: string; percent: number; met: boolean; note: string | null };
type EvolutionCardModel = {
  headline: string; sub: string; bigNote: string | null; steadyNote: boolean;
  segments: boolean[]; metCount: number; total: number; celebrate: boolean;
  tiles: CardTile[]; rows: CardRow[]; alternate: CardAlternate | null;
};
```

## 규칙 요약 (설계서 §3·§4·§5의 구현 기준)
- 표시용 `ratio = current/required`, `required>0`이고 둘 다 유한할 때만. `current <= required`면 배지 없음(`tone:"met"`).
- `ratio >= 2` → `tone:"big"`, 배지 `{floor(ratio*10)/10 소수1자리}배`. 그 외 초과 → `tone:"over"`, 배지 `+{차이}{단위}`(평균은 `+{차이 소수1자리}%p`, 반올림 차이가 0이면 배지 없이 `met`).
- `met:true` → 타일, `met:false` → 막대 줄(percent는 0~99로 고정, 100% 달성은 타일이 표현). 값이 `null`이면 "기준 확인 중" 줄(0% 표시 금지).
- `state==="error"` → 성장 조건(`growth_*`)과 대체 경로 숨김. `state==="eligible" && path==="alternate"` → `growth_*` 숨김, 운동일 대체 경로가 꾸준함을 면제하면 `steady`도 숨김.
- 헤더: error / needs_baseline / eligible("진화 조건을 모두 채웠어요", `celebrate`) / 시동러까지 XP만("진화 조건이 남았어요") / 그 외 `조건 {total}개 중 {metCount}개를 채웠어요`. 남은 조건이 정확히 1개이고 `blocked`면 그 줄 힌트 앞에 "마지막 조건이에요 · ".
- `bigNote`: 크게 초과(tone big)한 조건이 1개 이상이면 `목표를 크게 넘긴 조건 {N}개`.

## Task 1: 표시 규칙 순수 함수 (TDD)
**Files:** Create `src/lib/domain/evolution-card-model.ts`, `src/lib/domain/evolution-card-model.test.ts`

- [ ] **Step 1: 실패하는 시험 작성** — 경계값(`71/60` → over `+11일`, `60/60` → met 배지 없음, `15.9/5` → big `3.1배`·`5.01/5` 평균은 배지 없음, `120/60` → big `2.0배`, `19/21` xp 미달 → 막대 줄 90%·"2레벨 남았어요"), 상태별 구성(4·5단계 days, 6·7단계 weeks+recent), `current:null` → "기준 확인 중" 0%, `error`에서 growth·대체 경로 숨김, `eligible`+`alternate`에서 growth·(면제 시)steady 숨김, 남은 조건 1개 → "마지막 조건이에요", 대체 경로 문구·면제 note.
- [ ] **Step 2: 실행해 실패 확인** — `pnpm vitest run src/lib/domain/evolution-card-model.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 최소 구현** — 위 규칙대로 `buildEvolutionCardModel` 작성(파일 상단 상수 `LABEL`·`UNIT`, 보조 `fmtValue`·`fmtTarget`·`badgeFor`·`hintFor`).
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. 고장 주입 3종(`ratio>=2` → `>2`, `current<=required` 제거, error 필터 제거)이 시험에 잡히는지 확인.
- [ ] **Step 5: 커밋** — `git add src/lib/domain/evolution-card-model*.ts && git commit -m "feat(evolution): 진화 카드 표시 규칙 순수 함수(초과 배지·막대 %·헤더 문구)"`

## Task 2: 카드 컴포넌트 + 모션 (TDD)
**Files:** Modify `src/components/profile/stage-evolution-status.tsx`, `src/components/profile/stage-evolution-status.test.tsx`, `src/app/globals.css`

- [ ] **Step 1: 렌더 시험 갱신(실패)** — 상태 5종(blocked 혼합·eligible·needs_baseline·error·xp_only) + 초과/단순달성/미달 혼합에서 다음을 단언: 타일 `data-tone`(over/big/met), 배지 텍스트(`+11일`, `3.1배`), 막대 줄 `role="progressbar"` 값(`aria-valuenow="90"`), 칸 막대 `aria-label="조건 5개 중 4개"`, error에서 "평균 성장"·`alternate-path` 없음, needs_baseline에서 "0%" 없음, eligible에서 `.evo-pop` 체크, 최종 단계 문구 유지, 대체 경로 줄(`data-testid="alternate-path"`)과 면제 문구, 꾸준함 설명 footnote.
- [ ] **Step 2: 실행해 실패 확인** — `pnpm vitest run src/components/profile/stage-evolution-status.test.tsx` → FAIL.
- [ ] **Step 3: 구현** — 컴포넌트를 모델 렌더로 교체(헤더 → 칸 막대 → bigNote → sub → 타일 2열 `ul.grid-cols-2` → 막대 줄 `ul` → 대체 경로 → 하단 문구·버튼). 타일 색: met `border-line bg-surface-2`, over `border-good bg-good-weak`(값 `text-good`·배지 `bg-good`), big `border-accent bg-accent-weak`(값 `text-accent`·배지 `bg-accent`), 배지 글자 `text-accent-ink`. `globals.css`에 `@keyframes evo-pop`와 `.evo-pop`(0.5s 1회) + `@media (prefers-reduced-motion:reduce){.evo-pop{animation:none}}`.
- [ ] **Step 4: 통과 확인** — 같은 명령 + `pnpm vitest run src/components/profile src/components/crew` → PASS(게이트 클라이언트 시험의 평균 단언은 Task 3에서 갱신).
- [ ] **Step 5: 커밋** — `git add ... && git commit -m "feat(evolution): 진화 카드 시안 B — 달성 타일·초과 배지·남은 조건 막대"`

## Task 3: 연관 시험 정리 + 전체 검사
**Files:** Modify `src/components/profile/evolution-status-card.gate.client.test.tsx`

- [ ] **Step 1:** 서버 카드 평균 단언 `/15\.9 \/ 5%/` → 새 타일 값 `+15.9%`와 `목표 +5%`로 변경.
- [ ] **Step 2:** `pnpm lint`(오류 0) · `pnpm typecheck` · `pnpm test`(전체) · `pnpm build` 통과 확인.
- [ ] **Step 3: 커밋**

## Task 4: 개발 서버 화면 확인 (실제 서버 응답)
- [ ] 중계 서버(`scratchpad\qa`, 시나리오 `file`=오뎅끼데스까 실제 JSON, `passthrough`=실제 서버)로 성장 허브와 프로필 시트를 연다.
- [ ] 375px 모바일·데스크톱 폭에서 확인: 타일 배지 겹침·잘림 없음, 가로 스크롤 없음, 막대·칸 막대 표시, 미달 줄 힌트, 대체 경로 줄. 초과(오뎅끼: 운동 71/60 `+11일`, 평균 15.9/5 `3.1배`)와 eligible 시나리오(`eligible`/`alt_pass`)에서 체크 효과와 헤더를 눈으로 확인.
- [ ] 결과를 `plans/2026-11-13-evolution-rules-evidence-adjustment.md` §17에 기록.

## Task 5: 마무리
- [ ] `main`에 병합 준비(브랜치 `feat/evolution-card-b`) — **푸시·배포는 사용자 승인 후**(푸시는 사용자가 직접). 릴리스 노트 여부는 확인한다.

## Self-review
- 설계서 §2(구성)→Task 2, §3(규칙)→Task 1, §4(매핑)→Task 1, §5(상태)→Task 1·2 시험, §6(모션·접근성)→Task 2, §7(구조)→파일 구조, §8(검증)→Task 1~4, §9(범위 밖)→변경 파일에 없음. 빠진 요구 없음.
- 타입 일관성: `CardTile`·`CardRow`·`CardAlternate`·`EvolutionCardModel` 필드명이 Task 1·2에서 동일.
- 이 계획서는 코드를 인라인으로 싣지 않고 인터페이스·규칙·시험 항목을 고정한다. 완성 코드는 각 Task 커밋에 있다(같은 세션에서 바로 구현하므로 계획서에 중복으로 옮기지 않는다).
