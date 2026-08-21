# plans/ — 계획서

## 규칙 하나

**여기 있는 문서는 "무엇을 할 것인가"의 기록이지 "지금 무엇이 사실인가"가 아니다.**
현행 사실은 **코드**와 `docs/db-current-schema.sql` 두 곳에만 있다.

## 왜 나눴나 (2026-08-21)

계획서 48건이 한 폴더에 있었고 합쳐서 41,249줄이었다 — `src` 전체(73,722줄)의 절반이 넘는다.
전부 상단에 이 배너를 달고 있었다:

> **For agentic workers:** REQUIRED SUB-SKILL: … **implement this plan task-by-task**

이미 배포돼 몇 주째 돌고 있는 기능의 계획서가 새 세션을 여는 에이전트에게
"나를 구현하라"고 말하고 있었다. `grep`은 이 문서들을 코드보다 먼저 물어 온다.

그래서 보관본으로 내리고 배너를 **"보관됨 — 실행하지 마라"**로 바꿨다.

## ⚠️ 체크박스를 완료 신호로 읽지 마라

**빈 체크박스는 미완료를 뜻하지 않는다.** 실행하면서 표시하지 않았을 뿐이다.

2026-08-21에 48건을 전수 조사한 결과다:

| 계획서 | 체크 상태 | 실제 |
|---|---|---|
| `2026-07-27-badge-catalog-and-point-economy` | 0 / 66 | `badge_definitions` 운영 스키마에 있음 — **배포됨** |
| `2026-07-28-crew-link-graph` | 0 / 73 | `crew_links` 운영 스키마에 있음 — **배포됨** |
| `2026-07-29-cheer-points` | 0 / 30 | `send_cheer` 운영 스키마에 있음 — **배포됨** |

48건 중 46건에 미체크가 남아 있었다. 체크박스는 신호가 아니라 노이즈다.
**무언가 끝났는지 알고 싶으면 코드와 `db-current-schema.sql`을 봐라.**

## 지금 무엇이 어디에 있나

| 위치 | 무엇 | 개수 |
|---|---|---|
| `plans/` | **진행 중**인 것만 | 4 |
| `plans/archive/` | 실행이 끝난 것 | 44 |

`plans/`에 남긴 4건과 그 근거:

| 파일 | 왜 남겼나 |
|---|---|
| `2026-08-01-avatar-coordinate-layer-pipeline.md` | `feature/avatar-coordinate-v2` 미병합 11커밋 |
| `2026-08-01-avatar-shop-clickable-mockup.md` | `public/avatar-mock/`·`docs/design-sources/avatar-shop/` 미추적 — 작업 중 |
| `2026-08-07-exercise-picker-image-assets.md` | `codex/exercise-picker-images` 미병합 7커밋 |
| `2026-08-19-five-feature-review.md` | 2026-08-20에 갱신됨 |

## 새 계획서를 쓸 때

`plans/`에 만든다. **그 작업이 배포되면 `plans/archive/`로 옮기고** 상단 배너를
보관 안내로 바꾼다. 옮길 때 참조하는 문서(`PROGRESS.md`·`HANDOFF-*`·`specs/*`)의
경로도 같이 고친다 — 안 고치면 다음 사람이 없는 파일을 찾는다.

## 관련

- 계획서의 **근거**는 `specs/`에 있다. 그쪽은 설계 문서라 오래돼도 읽을 값이 있어 나누지 않았다.
- 인수인계서는 `docs/superpowers/HANDOFF-*.md`.
- 읽는 순서와 함정은 `AGENTS.md` §시작 순서.
