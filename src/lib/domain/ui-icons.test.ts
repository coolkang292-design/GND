import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `/ui-icons/*.webp` 경로 오타를 잡는다 (2026-08-07).
 *
 * 아이콘 경로는 세 곳에 흩어져 있다 — 도메인 상수(`PART_META`·`SITUATIONS`),
 * 허브 카드의 JSX 리터럴(`exercise-picker.tsx`), 탭바의 **템플릿 문자열**
 * (`tab-${slug}${active ? "-active" : ""}.webp`).
 *
 * ⚠️ 렌더 테스트로는 이걸 못 잡는다. jsdom에서 `<Image src="/없는파일.webp">`은
 * 아무 오류 없이 통과한다 — **깨진 그림은 실제 브라우저에서만 보인다.** 그래서
 * 소스에서 경로를 긁어 파일 존재를 직접 확인한다.
 *
 * ⚠️ 탭바처럼 경로를 **조립**하는 곳은 정규식이 못 읽는다. 그건 아래에서
 * 슬러그 × 상태로 따로 확인한다.
 */

const SRC = join(process.cwd(), "src");
const ICON_DIR = join(process.cwd(), "public", "ui-icons");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("UI 아이콘 자산 — 경로가 실제 파일을 가리킨다", () => {
  const files = sourceFiles(SRC);

  it("소스에 박힌 /ui-icons 경로가 전부 존재한다", () => {
    const referenced = new Set<string>();
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/["'`](\/ui-icons\/[a-z0-9-]+\.webp)["'`]/g)) {
        referenced.add(m[1]);
      }
    }

    // ⚠️ 정규식이 아무것도 못 잡아도 `missing`은 빈 배열이라 **통과한다.**
    //    개수를 못 박아야 "검사를 안 한 것"과 "이상 없는 것"이 갈린다.
    //    부위 6 + 상황 6 + 허브 6 = 18개.
    //    (탭바 10개는 경로를 조립하므로 아래 테스트가 따로 본다)
    //
    // ⚠️ 스트릭 2 · 친구 2는 **일부러 빠져 있다** (2026-08-07 사용자 지시로 원복).
    //    `streak-on|off`·`friends`·`friends-add` 파일은 `public/ui-icons/`에 남아
    //    있지만 화면은 다시 `🔥`/`🪵`/`👥` 이모지를 쓴다. 자산이 있다고 이 수를
    //    올리지 마라 — 이 테스트가 세는 것은 **화면이 참조하는 것**이다.
    //
    // ⚠️ 2026-08-12: 16 → 15. 전신 인터벌 카드가 아이콘 대신 대표 이미지
    //    (`/program-assets/interval.webp`)를 깔면서 `hub-tabata.webp` **리터럴**이
    //    빠졌다. 아이콘 파일이 죽은 게 아니다 — `tabata-sheet.tsx`가 아직
    //    `<UiIcon name="hub-tabata">`로 쓰고, 그건 아래 테스트가 본다.
    expect(referenced.size).toBe(15);

    const missing = [...referenced].filter(
      (src) => !existsSync(join(process.cwd(), "public", src)),
    );
    expect(missing).toEqual([]);
  });

  /**
   * ⚠️ `<UiIcon name="lock" />`도 경로를 조립하므로 위 정규식이 못 읽는다.
   * 이름 오타(`lokc`)는 타입 검사도 통과하고 렌더 테스트도 통과한다 —
   * **깨진 그림으로만** 드러난다. 이름을 긁어 파일 존재를 직접 확인한다.
   */
  it("<UiIcon name=…>가 가리키는 파일이 전부 있다", () => {
    const names = new Set<string>();
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/<UiIcon[^>]*?\bname="([a-z0-9-]+)"/g)) {
        names.add(m[1]);
      }
    }
    // 챌린지 탭에서 실제로 쓰는 종류 — 비면 아무것도 검사하지 않고 통과한다
    expect(names.size).toBeGreaterThanOrEqual(8);

    const missing = [...names].filter(
      (n) => !existsSync(join(ICON_DIR, `${n}.webp`)),
    );
    expect(missing).toEqual([]);
  });

  /**
   * ⚠️ 탭바는 `tab-${slug}${active ? "-active" : ""}.webp`로 **조립**한다.
   * 위 정규식이 못 읽으므로 두 상태를 여기서 직접 만들어 확인한다.
   * 비활성만 있고 활성이 없으면 탭을 누른 순간 그림이 사라진다.
   */
  it("탭 5개에 비활성·활성 파일이 모두 있다", () => {
    const slugs = ["home", "feed", "record", "challenge", "profile"];
    const missing = slugs.flatMap((slug) =>
      [`tab-${slug}.webp`, `tab-${slug}-active.webp`].filter(
        (name) => !existsSync(join(ICON_DIR, name)),
      ),
    );
    expect(missing).toEqual([]);
  });

  /**
   * 히어로는 아이콘이 아니라 `record-assets/`에 있어 위 정규식이 못 잡는다.
   * 빈 기록 화면이 이걸 참조하므로 없으면 첫 화면에 구멍이 난다.
   */
  it("빈 기록 화면의 히어로 이미지가 있다", () => {
    const hero = join(
      process.cwd(),
      "public",
      "record-assets",
      "exercise-picker-hero.webp",
    );
    expect(existsSync(hero)).toBe(true);
    // 첫 화면에 뜨는 이미지다 — 시안 원본(1.7MB)을 그대로 넣는 실수를 막는다
    expect(statSync(hero).size).toBeLessThan(150 * 1024);
  });

  /** 자산이 커지면 첫 화면이 느려진다. 시안 크기 그대로 넣는 실수를 막는다. */
  it("아이콘 한 개가 40KB를 넘지 않는다", () => {
    const heavy = readdirSync(ICON_DIR)
      .map((n) => [n, statSync(join(ICON_DIR, n)).size] as const)
      .filter(([, size]) => size > 40 * 1024);
    expect(heavy).toEqual([]);
  });
});
