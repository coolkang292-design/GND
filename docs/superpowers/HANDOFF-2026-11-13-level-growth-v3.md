# 인수인계 — '내 성장' v3 + 진화 조건 설계 (2026-11-13)

> 상태: **구현 거의 끝 · 화면 확인·실데이터 비교표 아직 · 푸시·배포 안 함 · 운영 DB에는 0131·0132 적용됨**
> 브랜치 `feat/level-growth-v2` (워크트리 `C:\Users\SAMSUNG\workout-app\.worktrees\level-growth-v2`, 기준 `main` `ae4ac8b`)
> 설계: `docs/superpowers/specs/2026-11-13-evolution-gate-design.md` · 계획(일부 낡음): `docs/superpowers/plans/2026-11-13-level-growth-v2.md`

⚠️ 원본 체크아웃(`C:\Users\SAMSUNG\workout-app`)은 `feat/posthog-funnel` 브랜치에 **미커밋 변경이 많다.** 거기서 작업하거나 git 명령을 치지 마라. 진화 관련 파일은 `main`에만 있다.

## 1. 한 줄 요약

'내 성장'을 "처음 3번 vs 최근 3번"에서 **"현재 단계에 들어올 때까지의 종목별 최고 기록 vs 이번 단계 최고 기록"**으로 바꿨다. 기준을 넘은 종목만 성장 기록이 되고 종합 평균 %는 없다. 진화(단계 상승)마다 기준이 새로 잡힌다. **서버 진화 판정·진화 카드 문구는 그대로다.**

## 2. 확정된 규칙 (사용자 결정)

| 항목 | 내용 |
|---|---|
| 단계 | 5레벨 = 1단계 (개노답 Lv.1–5 · 꿈틀러 · 시동러 · 꾸준러 · 불꽃러 · 대장 · 전설 Lv.31–35). 진화 = Lv.6·11·16·21·26·31 진입 |
| 기준 | 단계 첫 레벨의 `entered_at`(`user_level_history`) **이전(<=)** 종목별 최고 기록. 60일 제한·3일 중앙값·확정 대기 **없음** |
| 현재 | 진입 **이후(>)** 종목별 최고 기록 |
| 성장 기록 | 현재 > 기준일 때만. 같거나 낮으면 없음. 기준 없는 종목은 "비교 불가"(0% 아님). 단계 안에서 기준은 안 움직인다(60→66→70 = 60 대비 +16.7%) |
| 지표 | 중량 = 추정 1RM `무게×(1+반복/30)`(반복 1~30), 맨몸 = 반복 수, 시간 = 초. **인터벌 블록(sort_order 0~3)·유산소·미완료·무게 0 중량 종목 제외.** 같은 이름·같은 종류끼리만 비교 |
| 종합 % | **쓰지 않는다**(향상된 종목만 평균 내면 과장). 카드는 "성장한 운동 N종목" + 목록 |
| 진화 조건 | 앞으로 **경험치+운동 습관+내 성장 3가지 모두** 충족해야 진화(서버 적용은 **별도 승인 필요**, 설계 문서만 있음). 레벨은 계속 XP로만 오른다 |
| 필요 성장 종목 수 | `N = max(1, ceil(M × 비율))`, M = 이전 단계에서 기록한 종목 수. 비율 초안 4단계 15% · 5단계 20% · 6단계 25% · 7단계 30%, 5~7단계는 추가 미션 1·2·3개 |

## 3. 운영 DB 변경 (적용·검증 완료, 에이전트가 MCP로 적용)

- **0131** `user_level_history`(레벨 진입 이력) · `level_growth_baselines` · 트리거 `trg_record_level_entry`(`user_progress.current_level` 상승 시 이력 기록, 실패해도 운동 완료는 안 막음 — warning) · RPC `freeze_level_baselines`. 정책은 본인 SELECT만. 적용 전후 `apply_xp_and_progress`·`complete_workout_v2` 본문 해시(`9aab554e…`)와 세션·XP 합계 **불변**을 확인했다.
- **0132** 원장(`xp_transactions`) 누적으로 과거 레벨 진입 시점 복원 55행(`reconstructed`), 7명 전원 `행 수 = 레벨-1`·`last_level_up_at` 일치. 오뎅끼데스까 Lv.19 진입 = 2026-11-09 08:22:08 KST.
- 회귀 스크립트 `scripts/level-history-parity-check.mjs`(readonly, 26건) 등록. 일부러 고장 내 5건 실패하는 것까지 확인. 워크트리에서도 통과(`node scripts/level-history-parity-check.mjs`).
- ⚠️ v3는 `level_growth_baselines`·`freeze_level_baselines`를 **쓰지 않는다.** 지우려면 `drop`이라 **사용자 승인 후**(설계 문서 열린 질문 3과 연결 — 스냅샷을 택하면 재사용 가능).
- ⚠️ **`pnpm db:snapshot`을 아직 안 돌렸다** → `docs/db-current-schema.sql`이 0131·0132 이전 상태. 마무리 때 실행하고 커밋할 것.

## 4. 코드 (커밋 `6ad3e82`…`b936d2c`, 푸시 안 함)

| 파일 | 역할 |
|---|---|
| `src/lib/domain/level-growth.ts` (+test) | 순수 계산. `toMetricPoints`(필터) · `computeStageGrowth({points, stageEnteredAtMs, previousStageEnteredAtMs})` → `growths/unchangedCount/unmatched/comparableCount/previousStageExerciseCount` |
| `src/lib/domain/level-growth-copy.ts` (+test) | 표시 문구(재촉 문구 없음) |
| `src/lib/level-growth.ts` (+test) | `getMyStageGrowth({userId, level})` — 본인 데이터만, `range` 페이징(상한 초과 시 던짐), RPC·기준선 테이블 미사용 |
| `src/components/profile/level-growth-card.tsx` (+2 test) | '내 성장 · N단계' 카드. 상위 3개 + 토글, 종합 % 없음 |
| `src/lib/flags.ts`, `growth-hub.tsx`, `growth-hub.flag.client.test.tsx` | `NEXT_PUBLIC_GROWTH_V2=1`일 때만 성장 허브에 카드(커밋 `c7e83aa`) |
| `src/lib/domain/level-growth.live.test.ts` | 실데이터 기존/신규 비교표(읽기 전용, `GROWTH_LIVE_NICK` 없으면 skip, `--silent=false`로 실행해야 표가 보인다). 커밋·실행 완료(`24e3a27`) |

건드리지 않은 것(검토로 확인): `evolution-status-card.tsx` · `evolution.ts` · `evolution-growth.ts` · `evolution-guidance.ts` · 서버 진화 로직.

## 5. 남은 일 (순서대로)

완료(2026-11-13): ① 에이전트 수정 직접 검증(19개 파일 151건 통과·typecheck) ② 실데이터 비교표(계획서 "검증 기록" 절) ③ 개발 서버 화면 확인 — **픽스처 A(헬스장주주, Lv.10=2단계)**로 확인: 카드 1개, 진화 카드 바로 아래, 성장 0종목·비교 불가 9종목이 SQL 대조와 **일치**(인터벌·유산소 종목 없음), 토글 열림/접힘 동작, 플래그를 끄면 카드 0개·기존 진화 카드 그대로.

개발 서버: `.claude/launch.json`은 **원본 폴더(`C:\Users\SAMSUNG\workout-app\.claude\launch.json`)**에 `gnd-growth-v2`(포트 3700) 항목을 추가했다(gitignore 대상). 환경변수는 `.env*`를 Claude가 못 쓰므로 임시 래퍼(`…\scratchpad\dev-growth-v2.mjs`, 기본 `NEXT_PUBLIC_GROWTH_V2=1`)로 주입한다 — 새 세션에서는 이 파일이 없을 수 있으니 같은 방식으로 다시 만들거나 사용자가 터미널에서 `NEXT_PUBLIC_GROWTH_V2=1 pnpm dev -p 3700`을 띄운다. 로그인은 사용자가 패널에서 직접 해야 한다(비밀번호를 Claude가 입력할 수 없다). `/profile` 직접 진입은 `/record`로 보내지므로 하단 탭 '내 정보'를 눌러 들어가고, 카드는 접힌 '내 성장 상세' 안에 있다.

**성장 기록 표시 화면 확인(완료)**: 사용자가 오뎅끼데스까로 로그인한 개발 서버에서 확인 — 4단계 카드 "성장한 운동 6종목", 상위 3개(덤벨 레터럴 레이즈 +26.8% · 덤벨 숄더 프레스 +22.1% · 랫풀다운 +7.5%), 비교 불가 12개(그중 오버헤드 프레스는 점프 사유)가 `level-growth.live.test.ts`·SQL 대조와 일치. 진화 카드 ③의 "+2.5% / +8.0%"는 **옛(v1) 계산**이며 진화 카드는 건드리지 않았으므로 아직 남아 있다(한 화면에 '내 성장'이 두 군데 — 아래 6절 질문 7).

**점프 규칙(2026-11-13 추가, 커밋 `1502191`)**: 기준 대비 +100% **초과**(정확히 2배까지는 성장)는 성장 기록이 아니라 '비교하지 않는 운동'(사유 `jump`)으로 보낸다. 오뎅끼데스까 오버헤드 프레스 10kg×10(10/04, 사용자 말로는 시험 삼아 든 것/기구 다름) → 25kg×10 = +150%가 계기. **원본 기록은 수정·삭제하지 않았다.** 25kg 기록은 4단계 진입 이후라 이번 단계 기준이 될 수 없고, 5단계 진화 시점에 자동으로 기준이 된다. 부작용: 초보자의 정상적인 2배 초과 향상도 이번 단계에서는 비교하지 않고 다음 단계부터 기준이 된다.

1. (완료) 에이전트 수정 검증.
2. (완료) 실데이터 비교표.
3. (일부 완료) 개발 서버 화면 확인 — 위 참고.
4. `pnpm lint` · `pnpm test`(전체) · `pnpm build` · `pnpm verify:regression --tier readonly`(순차, accounts 티어와 동시 금지). `xp-test`(accounts 티어, 운영에 익명 계정 생성)는 아직 안 돌렸다 — 돌린 뒤 `node scripts/dev-fixture.mjs status`로 남은 프로필을 센다(기준 8개).
5. `PROGRESS.md` · `release-notes.data.json`(배포 **전에** 넣는다) · `pnpm db:snapshot`.
6. 사용자에게 보고 → 승인 후 `main` 병합 → 푸시(배포 승인에 포함) → 배포(CLAUDE.md §배포 절차, `--scope gnd4`) → 운영 환경변수 `NEXT_PUBLIC_GROWTH_V2` 추가 여부는 별도 판단. **지금까지 푸시·배포·`--send` 발송 없음.**

## 6. 사용자 결정 대기 (설계 문서 §8 열린 질문)

1. `M` 보정 — 이전 단계에서 2일 이상 한 종목만 세는가?
2. `current_stage` 쓰기를 `apply_xp_and_progress`에서 별도 함수로 옮기는 것을 승인하는가(지시서 8절 예외)?
3. 단계 진입 기준을 스냅샷으로 고정할 것인가, 매번 재계산할 것인가(후자면 위 테이블·RPC drop 승인 필요)?
4. 미션 종류·단계별 개수, 인터벌·유산소 미션의 측정 방식.
5. 문턱 %·비율은 표본이 한 계정에 치우쳐 있다 → 출시 후 조정 절차.
6. 진화 대기 중 크루 알림 문구.
7. **진화 카드 ③ 칸 처리**: 플래그를 켜면 진화 카드의 옛 "+2.5% / +8.0%"와 새 '내 성장' 카드가 한 화면에 같이 보인다. (a) 설계 확정 때까지 둔다(새 카드는 플래그 끔 상태로 배포 보류) (b) 플래그가 켜졌을 때 ③ 칸만 "아래 '내 성장' 카드 참고" 안내로 바꾼다.
8. **비율 초안 재조정**: 오뎅끼데스까는 이전 단계 종목 수 M=18, +8% 이상 종목 3개라 5단계 비율 20%(N=4)면 탈락한다. 15%(N=3)면 통과.
9. **점프 임계값(+100%)** 유지 여부 — 기구가 바뀐 경우 외에 정상 향상까지 제외하는 부작용 감수 여부.

운영 데이터 근거(2026-11-13): 완료된 Lv.3+ 구간 45개 중 성장 종목 1개 이상 9개(20%), 3개 이상 4개(9%) — 대부분 오뎅끼데스까 1명. **성장 조건을 필수로 걸 때 측정 불가 사용자의 대체 경로가 반드시 필요**하다.

## 7. 함정·주의

- **`.env.local`은 Claude가 읽거나 복사할 수 없다**(권한 차단). 이번에 사용자가 워크트리로 직접 복사했다. 다른 워크트리에서 필요하면 사용자에게 `cp C:/Users/SAMSUNG/workout-app/.env.local <워크트리>/.env.local`을 부탁할 것. 읽기 전용 스크립트는 원본 폴더를 cwd로 두고 워크트리 스크립트 경로를 주면 돌릴 수 있다.
- 사용자 화면의 "아래 3가지를 모두 채우면 진화할 수 있어요"는 **지금 사실이 아니다**(서버는 XP만). 근거: 근육은퇴근중(픽스처)이 운동 2일·2주로 3단계에 올랐다. 서버 적용 전에는 문구를 바꾸든 두든 이 불일치를 사용자에게 상기시킬 것.
- 기준선 조회는 세션을 페이지로 읽는다(PostgREST `max_rows`가 `limit`을 깎는다). 상한(20페이지)에 걸리면 **던진다** — 부분 데이터로 계산하지 않는다.
- 레벨 하나는 7~12일이라 레벨 단위 비교는 비교 종목이 2~8개뿐이다 → 기준은 **단계 단위**.
- 이 저장소 커밋 메시지는 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`로 끝낸다. LF→CRLF 경고는 무시해도 된다.
- 계획서(`plans/2026-11-13-level-growth-v2.md`) 앞부분(v2.1: 60일·3일 중앙값·확정 대기·기준선 스냅샷)은 **낡았다.** 맨 아래 "2026-11-13 설계 변경 (v3)" 절과 이 문서·설계 문서가 현행이다. 0.x절의 실측 데이터(원장 복원·인터벌 구조)는 여전히 유효.
- 이전 서브에이전트 보고는 모델 출력이다 — 완료 보고를 믿지 말고 테스트·diff로 직접 확인할 것(이번에도 그렇게 했다).

## 8. 검증한 것 / 못 한 것

확인: 단위 테스트(마지막 확인 시 level-growth 관련 5개 파일 포함 113~140건 통과) · typecheck · 이력 대조 스크립트 26건 · 0131·0132 객체 재조회 · 진화 관련 금지 파일 미변경(diff).
**[미검증]** 개발 서버 화면(카드가 실제로 어떻게 보이는지) · 전체 `pnpm test`/lint/build · `xp-test` 회귀 · 실데이터 비교표 · 플래그 배선(미커밋) 이후의 테스트 · 모바일 실기기.

## 9. 롤백

앱: `NEXT_PUBLIC_GROWTH_V2`를 끄면 성장 카드가 사라지고 화면은 이전 그대로다(배포는 아직 안 했으니 현재는 해당 없음). DB: 새 테이블·트리거는 아무 화면도 읽지 않아 그대로 둬도 무해하다. 트리거를 끄려면 `drop trigger trg_record_level_entry on public.user_progress`(사용자 승인 후).
