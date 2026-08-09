// 릴리스 노트 — "새 소식(/whats-new)"과 배포 알림의 단일 원천.
//
// 데이터는 release-notes.data.json 하나에만 둔다. 이 화면(TS)과 발송 스크립트
// (scripts/broadcast-release.mjs, node)가 같은 파일을 읽어 문구가 갈라지지 않는다.
//
// 새 기능을 배포할 때: release-notes.data.json 맨 앞에 항목 한 건 추가 →
// `node scripts/broadcast-release.mjs --send` 한 번. 스크립트가 최신 항목을 읽어
// 아직 안 보낸 것이면 전 사용자에게 알림을 보낸다(멱등).
//
// 사용자 4명·저자=개발자라 DB·어드민 툴은 만들지 않는다(YAGNI). 최신순으로 둔다.
import data from "./release-notes.data.json";

export type ReleaseNote = {
  /** 안정 식별자 — 앵커·중복발송 방어 기준 */
  id: string;
  /** 배포일 KST 'YYYY-MM-DD' */
  date: string;
  /** 화면·알림 제목 */
  title: string;
  /** 알림 본문 한 줄 요약 */
  summary: string;
  /** 상세 화면의 항목별 설명 */
  highlights: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = data;

/** 가장 최근 릴리스. 없으면 null. */
export function latestRelease(): ReleaseNote | null {
  return RELEASE_NOTES[0] ?? null;
}

/** id로 릴리스 조회. */
export function releaseById(id: string): ReleaseNote | null {
  return RELEASE_NOTES.find((r) => r.id === id) ?? null;
}

export type InlineToken =
  | { kind: "text" | "strong" | "code"; text: string }
  | { kind: "link"; text: string; href: string };

/**
 * 하이라이트 한 줄의 인라인 표기를 조각으로 나눈다 —
 * `**굵게**` · `` `코드` `` · `[텍스트](/경로)`.
 *
 * ⚠️⚠️ **링크는 `/`로 시작하는 앱 안 경로만 받는다.** `https://…`나 `//…`를 쓰면
 * 링크로 안 만들고 **글자 그대로** 남긴다(그래서 화면에서 눈에 띄고 바로 고쳐진다).
 * 이 화면은 푸시 알림을 누르면 도달하는 곳이라, 여기서 바깥으로 나가는 링크를
 * 허용하면 공지 문구 한 줄이 그대로 외부 유도 통로가 된다. 지금은 우리가 쓰는
 * 문자열뿐이지만, **"지금은 안전하다"는 나중에 안 지켜진다.** 파서가 막는 게 맞다.
 *
 * ⚠️ 2026-08-08까지 `/whats-new`는 이 문자열을 **그대로** 그렸다. 데이터에는
 * 처음부터 `**...**`가 들어 있었으므로 사용자 화면에는 별표가 그대로 보였다
 * (2026-08-08 화면 확인에서 발견). 강조가 안 먹는 정도가 아니라 **문장마다
 * 별표 네 개가 끼어 있는** 상태였다.
 *
 * 마크다운 라이브러리를 넣지 않는다 — 이 두 표기 말고는 쓰지 않고, 릴리스 노트
 * 문자열은 우리가 쓰는 것이라 임의 HTML이 들어올 자리가 없다. 대신
 * `release-notes.test.ts`가 **데이터의 표기 짝이 맞는지** 검사한다. 짝이 안 맞으면
 * 조용히 별표가 새어 나가므로 그 단언을 지우지 마라.
 */
export function parseHighlight(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // ⚠️ 링크의 주소부는 `/`로 시작해야만 매치된다. 바깥 주소는 아예 안 걸려서
  //    글자로 남는다 — 위 주석의 "앱 안 경로만" 규칙이 여기 한 곳에 있다.
  //
  // ⚠️⚠️ `(?!\/)`를 지우지 마라. `//evil.example.com`은 슬래시로 시작하지만
  //    **프로토콜 상대 URL**이라 브라우저가 바깥 호스트로 나간다. 처음 쓴
  //    정규식이 이걸 통과시켰고 테스트가 잡았다(2026-08-09).
  const pattern =
    /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;
  let last = 0;

  for (let m = pattern.exec(source); m; m = pattern.exec(source)) {
    if (m.index > last) {
      tokens.push({ kind: "text", text: source.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      tokens.push({ kind: "strong", text: m[1] });
    } else if (m[2] !== undefined) {
      tokens.push({ kind: "code", text: m[2] });
    } else {
      tokens.push({ kind: "link", text: m[3], href: m[4] });
    }
    last = m.index + m[0].length;
  }
  if (last < source.length) {
    tokens.push({ kind: "text", text: source.slice(last) });
  }
  return tokens;
}
