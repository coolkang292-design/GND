"use client";

/**
 * 등록된 운동이 0개일 때의 기록 화면 (사용자 지시 2026-08-06).
 *
 * **여기서 중요한 건 안 그리는 것들이다.** 완료 볼륨 `0kg` · 이전 대비 ·
 * 세트 사이 휴식 · 타바타 · 복구 안내는 전부 "지금 할 일"과 무관하다 —
 * 아직 잴 볼륨도, 쉴 세트도, 시작할 운동도 없다. 그 판정은 기록 페이지가
 * 하고(`isEmpty`), 이 컴포넌트는 남는 하나를 그린다.
 */
export function RecordEmptyState({
  hasHistory,
  onAdd,
  onLoadRecent,
}: {
  /**
   * 완료한 운동이 하나라도 있나.
   *
   * ⚠️ 이력이 없는 사람에게 '최근 운동 불러오기'를 띄우면 눌러도 빈 목록이다 —
   * 막다른 길을 주는 대신 아예 안 보인다.
   */
  hasHistory: boolean;
  onAdd: () => void;
  onLoadRecent: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-card border border-line bg-surface px-5 py-10 text-center shadow-card">
        <p className="text-3xl">🏋️</p>
        <p className="mt-3 text-base font-extrabold">
          아직 추가된 운동이 없어요
        </p>
        <p className="mt-1.5 text-[12.5px] leading-5 text-muted">
          운동을 선택하면 세트와 무게를
          <br />
          쉽게 기록할 수 있어요
        </p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="h-14 rounded-card bg-accent text-[15px] font-extrabold text-accent-ink"
      >
        ＋ 첫 운동 추가하기
      </button>

      {hasHistory && (
        <button
          type="button"
          onClick={onLoadRecent}
          className="h-12 rounded-card border border-accent/50 bg-surface text-sm font-bold text-accent"
        >
          🕘 최근 운동 불러오기
        </button>
      )}

      <p className="text-center text-[11.5px] text-muted">
        🎓 초보자도 쉽게 시작할 수 있게{" "}
        <span className="font-bold text-accent">추천 운동</span>부터 안내해드려요
      </p>
    </section>
  );
}
