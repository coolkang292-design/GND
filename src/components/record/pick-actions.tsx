"use client";

/**
 * 운동 고르기 하단 바 — 추천(상황별·부위별)과 검색이 **같은 바**를 쓴다 (2026-10-05).
 *
 * ⚠️ 예전에는 둘이 선택 목록도 바도 따로였다. 추천에서 `✓ 추가됨` 2개를 만들고
 *    `운동 이름 검색`으로 넘어가면 하단이 "운동을 선택하세요"(0개)로 바뀌고,
 *    거기서 추가를 누르면 추천에서 고른 것이 빠졌다 — 사용자에게는 "추가가 안
 *    된다"로 보였다. 이제 선택은 피커 한 곳에 있고 이 바는 그 개수만 읽는다.
 *
 * 세트 설정은 **선택 단계**다 (사용자 결정 2026-10-05). `바로 추가`는 기본값
 * (3세트·10회·무게 운동 중 입력)으로 담고, 조절하고 싶은 사람만 `세트 조절`을 누른다.
 */
export function PickActions({
  count,
  onAdd,
  onAdjust,
  addLabel,
  busy = false,
}: {
  count: number;
  onAdd: () => void;
  /** 없으면 `세트 조절` 버튼을 안 낸다 — 인터벌처럼 세트를 코스가 정하는 화면 */
  onAdjust?: () => void;
  /**
   * 담는 버튼 문구 (개수 → 문구). 없으면 `운동 N개 바로 추가`.
   * 달력은 "8월 17일 계획에 N개 담기", 바꾸기는 "이 운동으로 바꾸기"를 준다 —
   * 누르면 무슨 일이 일어나는지를 버튼이 말해야 한다(2026-10-05 2단계).
   */
  addLabel?: (count: number) => string;
  /** 저장 중 — 두 버튼을 잠그고 문구를 바꾼다. 안 그러면 다시 눌러도 반응이 없다 */
  busy?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-none items-center gap-2 border-t border-line pt-3">
      {onAdjust && (
        <button
          type="button"
          onClick={onAdjust}
          disabled={count === 0 || busy}
          className="h-12 flex-none rounded-card-sm border border-accent/50 bg-transparent px-4 text-sm font-bold text-accent disabled:opacity-40"
        >
          세트 조절
        </button>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={count === 0 || busy}
        className="h-12 min-w-0 flex-1 truncate rounded-card-sm bg-accent px-3 text-sm font-extrabold text-accent-ink disabled:opacity-40"
      >
        {busy
          ? "저장하는 중…"
          : count === 0
            ? "운동을 선택하세요"
            : addLabel
              ? addLabel(count)
              : `운동 ${count}개 바로 추가`}
      </button>
    </div>
  );
}
