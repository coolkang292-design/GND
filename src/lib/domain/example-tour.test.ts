import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExampleChallenge,
  buildExampleFeed,
  EXAMPLE_PEOPLE,
  exampleCharacterFaces,
  isExampleId,
} from "./example-tour";

const NOW = new Date("2026-11-26T06:30:00+09:00");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("예시 화면 대본", () => {
  const feed = buildExampleFeed(NOW);

  it("게시물 5개, 최신이 위", () => {
    expect(feed).toHaveLength(5);
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1].completedAt.getTime()).toBeGreaterThan(feed[i].completedAt.getTime());
    }
  });

  it("전부 과거다 — 새벽에 열어도 '미래의 운동'이 안 생긴다", () => {
    for (const item of feed) expect(item.completedAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it("모든 id가 예시 표식을 달고, 진짜 사용자 id(uuid) 모양이 아니다", () => {
    const ids = [
      ...Object.values(EXAMPLE_PEOPLE).map((p) => p.id),
      ...feed.flatMap((i) => [i.sessionId, i.userId, ...i.likers]),
      ...feed.flatMap((i) => i.thread.comments.flatMap((c) => [c.id, c.senderId, ...c.replies.map((r) => r.senderId)])),
    ];
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) {
      expect(isExampleId(id), id).toBe(true);
      expect(UUID.test(id), id).toBe(false);
    }
  });

  it("댓글 작성자·좋아요 누른 사람이 전부 people에 있다 — 없으면 '크루원'으로 뜬다", () => {
    for (const item of feed) {
      const senders = item.thread.comments.flatMap((c) => [c.senderId, ...c.replies.map((r) => r.senderId)]);
      for (const id of [...senders, ...item.likers]) expect(item.people.has(id), id).toBe(true);
    }
  });

  it("사진 6장이 전부 public/example-tour에 있다", () => {
    const urls = feed.flatMap((i) => i.photos.map((p) => p.url));
    expect(urls).toHaveLength(6);
    for (const url of urls) {
      expect(existsSync(join(process.cwd(), "public", url)), url).toBe(true);
    }
  });

  it("숫자 줄은 피드와 같은 집계 함수로 만든다 — 민수의 하체 볼륨", () => {
    const minsu = feed.find((i) => i.userId === EXAMPLE_PEOPLE.minsu.id)!;
    // 스쿼트 60×10+70×8+80×6+85×5+70×8 = 2625, RDL 60×38 = 2280, 런지 16×34 = 544
    expect(minsu.volume.weightVolumeKg).toBe(2625 + 2280 + 544);
    expect(minsu.volume.completedSetCount).toBe(12);
  });

  it("챌린지는 오늘이 9일째인 21일짜리", () => {
    const c = buildExampleChallenge(NOW);
    expect(c.day).toBe(9);
    const days = Math.round((c.endDate.getTime() - c.startDate.getTime()) / 86_400_000) + 1;
    expect(days).toBe(21);
    expect(c.standings).toHaveLength(c.participants.length);
  });

  it("예시 회원 6명 모두 진화 캐릭터 얼굴이 있고, 그 그림 파일이 실제로 있다", () => {
    const faces = exampleCharacterFaces();
    expect(faces).toHaveLength(Object.keys(EXAMPLE_PEOPLE).length);
    for (const [id, src] of faces) {
      expect(src, id).toMatch(/^\/characters\/.*evolution_avatar_0[1-7]\.webp$/);
      expect(existsSync(join(process.cwd(), "public", src!)), src!).toBe(true);
    }
    // 어제 처음 온 사람은 1단계 — 이야기와 맞아야 한다
    expect(EXAMPLE_PEOPLE.yujin.character.stage).toBe(1);
  });
});
