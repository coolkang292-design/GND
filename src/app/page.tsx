import { redirect } from "next/navigation";
import { UTM_KEYS } from "@/lib/domain/acquisition";

/**
 * `/` → `/home`. **utm 파라미터를 함께 넘긴다.**
 *
 * ⚠️⚠️ **이 전달을 빼지 마라 (2026-08-17 개발 서버에서 잡았다).**
 * 이건 서버 사이드 리다이렉트라 302 응답에서 쿼리스트링이 통째로 사라진다.
 * 클라이언트 JS가 한 줄도 돌기 전에 없어지므로, `AcquisitionTracker`가 아무리
 * 일찍 실행돼도 잡을 값이 없다 — 실제로 `?utm_source=kakao`로 들어왔는데
 * `source: null, landing: "/home"`으로 기록됐다.
 *
 * 단위 테스트는 이걸 못 잡는다. `buildAcquisition`은 넘겨준 문자열을 정확히
 * 파싱했고 전부 통과했다. **화면을 열어야 보이는 종류의 고장이다.**
 *
 * utm만 넘긴다 — 들어온 파라미터를 통째로 실어 나르면 남의 링크에 붙은 값이
 * 우리 주소로 옮겨 붙는다.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const forward = new URLSearchParams();

  for (const key of UTM_KEYS) {
    const raw = sp[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) forward.set(key, value);
  }

  const qs = forward.toString();
  redirect(qs ? `/home?${qs}` : "/home");
}
