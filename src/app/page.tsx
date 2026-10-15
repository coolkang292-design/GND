import { redirect } from "next/navigation";
import { UTM_KEYS } from "@/lib/domain/acquisition";
import { APP_LANDING_PATH } from "@/lib/domain/landing";
import { INTERNAL_PARAM, INTERNAL_PARAM_VALUES } from "@/lib/posthog/exclusion";

/**
 * `/` → `/home`. **utm 파라미터를 함께 넘긴다.**
 *
 * ⚠️⚠️ **이 전달을 빼지 마라 (2026-08-17 개발 서버에서 잡았다).**
 * 이건 서버 사이드 리다이렉트라 302 응답에서 쿼리스트링이 통째로 사라진다.
 * 클라이언트 JS가 한 줄도 돌기 전에 없어지므로, `AcquisitionTracker`가 아무리
 * 일찍 실행돼도 잡을 값이 없다 — 실제로 `?utm_source=kakao`로 들어왔는데
 * `source: null, landing: "/record"`으로 기록됐다.
 *
 * 단위 테스트는 이걸 못 잡는다. `buildAcquisition`은 넘겨준 문자열을 정확히
 * 파싱했고 전부 통과했다. **화면을 열어야 보이는 종류의 고장이다.**
 *
 * utm만 넘긴다 — 들어온 파라미터를 통째로 실어 나르면 남의 링크에 붙은 값이
 * 우리 주소로 옮겨 붙는다.
 *
 * ⚠️ 예외 하나: 내부(QA) 표시 `gnd_internal`(값 `0`·`1`만). 2026-10-12 PostHog v2 검토에서
 *    같은 이유로 사라지는 것을 잡았다 — QA가 `/?gnd_internal=1`로 들어오면 표시가 안 붙어
 *    실사용자 숫자에 섞인다. 그 밖의 값은 `exclusion.ts`가 알아듣지 않으므로 넘기지 않는다.
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

  const rawInternal = sp[INTERNAL_PARAM];
  const internal = Array.isArray(rawInternal) ? rawInternal[0] : rawInternal;
  if (internal && (INTERNAL_PARAM_VALUES as readonly string[]).includes(internal)) {
    forward.set(INTERNAL_PARAM, internal);
  }

  const qs = forward.toString();
  redirect(qs ? `${APP_LANDING_PATH}?${qs}` : APP_LANDING_PATH);
}
