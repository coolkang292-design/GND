/**
 * Creator Studio 로딩 골격. 페이지가 서버에서 인증·집계를 끝낼 때까지 빈 화면 대신
 * 이 골격을 먼저 보낸다 (체감 속도). 하위 `[id]`·`members`·`report` 모두 적용된다.
 */
export default function CreatorLoading() {
  return (
    <div className="flex flex-col gap-4 pb-6" role="status" aria-label="운영 화면을 불러오는 중">
      <div className="h-12 w-2/3 animate-pulse rounded-card-sm bg-surface" />
      <div className="h-28 animate-pulse rounded-card bg-surface" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-20 animate-pulse rounded-card bg-surface" />
        <div className="h-20 animate-pulse rounded-card bg-surface" />
      </div>
      <div className="h-40 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
