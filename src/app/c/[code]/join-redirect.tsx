"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 공유 링크(`/c/[code]`)로 온 **사람**을 기존 참가 경로로 보낸다 (2026-09-20).
 *
 * ⚠️⚠️⚠️ **서버 `redirect()`를 쓰면 안 된다.** 서버가 307을 주면 카카오
 *    스크래퍼가 `/challenge?join=`으로 따라가는데, 그 주소는 `"use client"`
 *    페이지라 **`og:` 태그가 없다** — 카드가 통째로 깨진다. 이 페이지가
 *    존재하는 이유가 바로 그 태그인데 리다이렉트가 그걸 무효로 만든다.
 *
 *    클라이언트에서 옮기면 스크래퍼는 자바스크립트를 안 돌리므로 **태그만 읽고
 *    간다.** 사람만 옮겨진다. 이것이 이 컴포넌트의 존재 이유 전부다.
 *
 * ⚠️ `push`가 아니라 `replace`다. `push`면 참가한 뒤 기기 뒤로가기가 이 중간
 *    페이지로 돌아오고, 그러면 여기서 또 앞으로 보내 **뒤로가기가 먹지 않는다.**
 *
 * ⚠️ 여기서 참가를 **시도하지 마라.** 참가는 `/challenge?join=`이 한다
 *    (`challenge/page.tsx:219`). 두 곳에서 하면 `join_challenge_with_code`가
 *    두 번 불리고, 이 저장소는 같은 종류의 중복으로 이미 데인 적이 있다.
 */
export function JoinRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return null;
}
