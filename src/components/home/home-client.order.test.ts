import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** 줄 나눔 기준 — 이스케이프를 소스에 직접 쓰지 않으려고 상수로 뺐다 */
const NEWLINE = String.fromCharCode(10);

/**
 * 홈의 **카드 순서**와 **없어야 할 카드**를 소스 수준에서 고정한다 (2026-08-21).
 *
 * ⚠️ 왜 렌더가 아니라 소스인가. `HomeClient`는 `useAuth`·Supabase 브라우저 클라이언트·
 * 60초 폴링에 얽혀 있어 jsdom에서 통째로 렌더하려면 조회를 넷 이상 흉내 내야 한다.
 * 그 흉내가 틀리면 **테스트가 통과해도 화면이 틀린다.** 여기서 지키려는 것은 조회
 * 결과가 아니라 "무엇을 어떤 차례로 그리는가"라 소스 순서로 충분하고, 각 카드의
 * 표시 규칙은 이미 자기 테스트 파일이 덮는다.
 *
 * ⚠️ 이 파일은 **화면 확인을 대신하지 않는다**(`CLAUDE.md`). 실제 높이·접힘선은
 * 개발 서버에서 재야 한다.
 */
describe("홈 상단 경쟁 보드 순서", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/components/home/home-client.tsx"),
    "utf8",
  );

  it("내 카드 다음에 크루 카드, 그 아래 기존 홈 카드가 온다", () => {
    const me = src.indexOf("<PersonalTodayCard");
    const crew = src.indexOf("<FriendBoardCard");
    const active = src.indexOf("<ActiveWorkoutCards");
    const challenge = src.indexOf("<ChallengeSummaryCard");
    const push = src.indexOf("<PushEnableCard");
    const invite = src.indexOf("<CrewCard");

    for (const index of [me, crew, active, challenge, push, invite]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(me).toBeLessThan(crew);
    expect(crew).toBeLessThan(active);
    expect(active).toBeLessThan(challenge);
    expect(challenge).toBeLessThan(push);
    expect(push).toBeLessThan(invite);
  });

  /**
   * ⚠️ **부정 확인.** 이 넷의 데이터는 `PersonalTodayCard`로 합쳐졌다(설계 §5).
   * 홈에 다시 렌더하면 같은 사실이 두 번 그려져 첫 화면이 밀린다 — 새 카드가
   * 생겼는지만 보면 제거를 검증한 것이 아니다.
   */
  it("옛 중복 홈 카드와 헤더 스트릭을 렌더하지 않는다", () => {
    expect(src).not.toContain("<HeaderStreak");
    expect(src).not.toContain("<CharacterCard");
    expect(src).not.toContain("<StreakCard");
    expect(src).not.toContain("<WeeklyStats");
  });

  /**
   * ⚠️ 원문 전체가 아니라 **import 줄**만 본다. 홈 주석은 다른 파일을
   * `personal-today-card.tsx`처럼 가리키기도 하는데 그건 남아도 되는 상호 참조다.
   * 여기서 막으려는 것은 "안 쓰는데 import만 남은" 상태다.
   *
   * ⚠️ 정규식으로 쓰지 마라. 템플릿 리터럴 안의 `\s`는 `s`로 접혀서
   * **아무것도 검사하지 않는 초록**이 된다(2026-08-21에 실제로 한 번 그렇게 썼다).
   */
  it("쓰지 않게 된 옛 카드를 import만 남겨 두지 않는다", () => {
    const importLines = src
      .split(NEWLINE)
      .filter((line) => line.includes('from "@/components/home/'));
    // 가짜 통과 방지 — 홈은 실제로 이 폴더에서 뭔가를 import 한다
    expect(importLines.length).toBeGreaterThan(0);
    for (const moduleName of [
      "header-streak",
      "character-card",
      "streak-card",
      "weekly-stats",
      "start-workout-cta",
    ]) {
      expect(importLines.some((line) => line.includes(moduleName))).toBe(
        false,
      );
    }
  });

  /**
   * ⚠️ 내 프로필도 **크루 행과 같은 시트**를 연다 (2026-08-21 사용자 지시 —
   * "내 프로필을 클릭하니까 설정 화면으로 랜딩되네, 다른 크루와 동일한 화면으로").
   * 홈에서 `/profile`로 보내면 같은 자리에서 같은 모양을 누른 결과가 사람마다 달라진다.
   */
  it("내 프로필도 성과 시트를 열고 설정으로 보내지 않는다", () => {
    expect(src).toContain("<MemberProfileSheet");
    expect(src).toContain("onOpenProfile=");
    expect(src).not.toContain('href="/profile"');
  });

  /**
   * ⚠️ 이번 개편은 **홈 전체 재설계가 아니다**(설계 §5). 진행 중 운동·챌린지 요약·
   * 푸시 권유·친구 초대·인증 상태·알림 벨은 그대로 남는다.
   */
  it("기존 홈 기능을 함께 지우지 않는다", () => {
    expect(src).toContain("<NotificationBell");
    expect(src).toContain("<AuthStatus");
  });

  /**
   * ⚠️ 완료 인원 요약은 **크루 카드가 스스로 센다.** 2026-08-21에 잠깐
   * `onSummaryChange`로 홈까지 끌어올렸다가, 그 값을 쓰던 비교 문구가 중복으로
   * 지워지면서 배선도 걷어냈다. 다시 끌어올릴 일이 생기면 `useCallback`으로
   * 안정화해라 — 매 렌더 새 함수가 내려가면 자식 effect가 무한히 다시 돈다.
   */
  it("크루 요약을 홈으로 끌어올리는 배선을 남겨 두지 않는다", () => {
    // ⚠️ prop **전달**만 본다. 왜 걷어냈는지 적은 주석은 남아 있어야 한다.
    expect(src).not.toContain("onSummaryChange={");
    expect(src).not.toContain("crewSummary={");
    expect(src).not.toContain("useState<CrewTodaySummary");
  });
});
