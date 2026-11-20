import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NotificationRow } from "@/lib/social";
import { NotificationItem } from "./notification-item";

const base: NotificationRow = {
  id: "n1",
  user_id: "me",
  actor_id: "u2",
  type: "level_up",
  reference_id: "s1",
  title: "🎉 낭만송곳니님이 진화했어요!",
  body: "시동러 → 꾸준러 · Lv.16",
  read_at: null,
  created_at: new Date().toISOString(),
};
const render = (over: Partial<NotificationRow> = {}) =>
  renderToStaticMarkup(<NotificationItem n={{ ...base, ...over }} onOpen={() => {}} />);

describe("NotificationItem — 시안의 알림함 줄", () => {
  it("진화 알림: 제목은 이모지 없이, 부제는 '시동러 → 꾸준러', 강조 줄이다", () => {
    const h = render();
    expect(h).toContain("낭만송곳니님이 진화했어요!");
    expect(h).not.toContain("🎉 낭만송곳니"); // 앞 이모지는 아이콘 칸으로 옮겼다
    expect(h).toContain("시동러 → 꾸준러 · Lv.16");
    expect(h).toContain('data-highlight="true"');
    expect(h).toContain('data-kind="evolution"');
  });

  it("진화는 💪, 레벨업은 ⬆️ 아이콘이다", () => {
    expect(render()).toContain("💪");
    const lv = render({ title: "⬆️ 낭만송곳니님이 레벨업!", body: "Lv.4 → Lv.5 달성했어요. 축하해주세요 👏" });
    expect(lv).toContain("⬆️");
    expect(lv).toContain('data-kind="level_up"');
    expect(lv).not.toContain("💪");
  });

  it("이미 읽은 레벨업·진화는 강조하지 않는다 — 새 소식만 눈에 띈다 (부정 확인)", () => {
    const h = render({ read_at: new Date().toISOString() });
    expect(h).not.toContain('data-highlight="true"');
    expect(h).toContain('data-kind="evolution"');
  });

  it("모든 줄에 시간과 › 화살표가 오른쪽에 있다", () => {
    const other = render({ type: "reaction_received", title: "철수님이 좋아요를 눌렀어요", body: null });
    expect(other).toContain("방금");
    expect(other).toContain('data-icon="chevron"');
    expect(other).not.toContain('data-highlight="true"');
    expect(other).toContain("철수님이 좋아요를 눌렀어요"); // 다른 유형의 제목은 건드리지 않는다
  });

  it("다른 유형의 제목 앞 이모지는 그대로 둔다 — 레벨업·진화만 뗀다", () => {
    expect(render({ type: "record_beaten", title: "🏅 기록 갱신! 칭찬해주세요", body: "b" })).toContain("🏅 기록 갱신! 칭찬해주세요");
  });

  it("안 읽은 알림 점은 그대로 남는다", () => {
    expect(render({ type: "poke", title: "t", body: null })).toContain("bg-accent");
    expect(render({ type: "poke", title: "t", body: null, read_at: new Date().toISOString() })).not.toContain('data-unread="true"');
  });

  it("순위 하락 알림은 본문을 3줄까지 보여준다 (기존 규칙 유지)", () => {
    expect(render({ type: "rank_drop", title: "📉 t", body: "긴 본문" })).toContain("line-clamp-3");
  });
});
