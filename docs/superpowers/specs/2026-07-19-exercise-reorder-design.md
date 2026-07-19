# 운동 순서 이동 설계

## 목표

기록 화면에서 운동 카드 제목을 약 0.5초 길게 누르면 "운동 순서 이동" 바텀시트가 열리고, 드래그 핸들로 운동 순서를 바꾸거나 운동을 삭제할 수 있다. 준비 단계·운동 중 언제든 가능하다. (사용자 확정: 0.5초 · 드래그 핸들 · 항상 가능, 2026-07-19)

## 확인된 현재 구조

- `WorkoutDraft.exercises: LocalExercise[]` — 각 운동은 고유 `key`(uuid)를 가진다. 화면 카드·완료 세트·휴식 타이머 sourceKey 모두 이 key 기준이라 **배열 순서 변경은 기록·타이머에 영향 없다**.
- 카드는 `draft.exercises.map` 순서로 렌더되고 React key가 uuid라 순서 변경 시 입력 상태(uncontrolled input)도 보존된다.
- draft는 변경 즉시 localStorage에 저장되고, 완료 시 배열 순서대로 DB에 기록된다.

## 설계

1. **도메인** `src/lib/domain/reorder.ts` (TDD): `moveItem(list, from, to)` — 불변 이동, 범위 밖·제자리면 원본 그대로 반환.
2. **길게 누르기 훅** `src/hooks/use-long-press.ts` (TDD): pointerdown 후 500ms 유지 시 콜백. 10px 이상 이동(스크롤)·pointerup/leave/cancel 시 취소. contextmenu 억제.
3. **시트** `src/components/record/exercise-reorder-sheet.tsx`: 기존 시트 스타일. 운동마다 `부위 | 이름` + 🗑 + ≡. ≡를 pointer로 잡아 끌면 행이 따라오고 지나친 칸만큼 실시간 스왑, 놓으면 확정(`onMove(from,to)`). 핸들에 `touch-action: none`. 🗑는 완료 세트가 있으면 confirm 후 `onRemove(key)`. 바깥 탭·닫기로 종료.
4. **연결** `record/page.tsx`: 카드 헤더(제목 줄)에 길게 누르기 → 시트 open. onMove는 `moveItem`으로 `setDraft`, onRemove는 기존 `removeExercise` 재사용.

## 오류 처리

- 드래그 중 pointercancel(전화 수신 등) 시 원래 순서로 복귀 없이 현재까지의 이동만 확정한다(부분 이동도 유효한 순서).
- 운동이 1개뿐이어도 시트는 열리되 이동은 자연히 무의미하다.

## 테스트

- moveItem: 앞→뒤·뒤→앞·제자리·범위 밖·빈 배열.
- use-long-press: 500ms 유지 시 1회 발동, 이동·조기 해제 시 미발동.
- 실기기: 준비 단계와 운동 중 각각 — 길게 눌러 시트 열기, 드래그로 순서 변경, 카드 순서 반영, 완료 세트 유지, 새로고침 후 순서 유지, 🗑 삭제.
- 전체 게이트 후 배포.

## 제외 범위

- 세트 단위 순서 변경, 카드 자체를 직접 드래그(시트 방식만), 진동 피드백, 정렬 자동화
