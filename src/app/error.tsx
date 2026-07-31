"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BugReportSheet } from "@/components/bug-report-sheet";
import { noteTrail } from "@/lib/domain/bug-trail";

/**
 * 페이지가 죽었을 때의 화면.
 *
 * **이 파일이 없으면 Next 기본 화면이 뜨고 신고할 방법이 없다.** 앱이 하얗게
 * 죽은 순간이야말로 신고가 가장 필요한 때인데, 지금까지는 그 자리에 아무것도
 * 없었다(`error.tsx`·`global-error.tsx` 0개).
 *
 * 던져진 예외는 흔적과 신고 맥락 양쪽에 싣는다 — 사용자는 "안 돼요"라고만 쓸
 * 것이고, 그 한 줄만으로는 재현할 수 없다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    noteTrail("fail", "crash", error.message);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <header className="pt-2">
        <h1 className="text-[19px] font-extrabold tracking-tight">
          화면을 여는 데 실패했어요
        </h1>
        <p className="mt-1 text-[12.5px] text-muted">
          잠시 후 다시 시도해보세요. 계속 그러면 아래로 알려주세요.
        </p>
      </header>

      <button
        type="button"
        onClick={reset}
        className="w-full rounded-card-sm bg-accent px-4 py-3 text-sm font-extrabold text-accent-ink"
      >
        다시 시도
      </button>

      <BugReportSheet
        route={pathname ?? null}
        extraContext={{
          crash: error.message?.slice(0, 500),
          // digest는 서버 컴포넌트 예외를 서버 로그와 잇는 유일한 열쇠다.
          digest: error.digest ?? null,
        }}
      />
    </div>
  );
}
