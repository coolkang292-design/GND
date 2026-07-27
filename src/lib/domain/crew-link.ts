/**
 * 크루 연결 순수 함수 — 설계 docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
 * 화면·서버가 같은 규칙을 쓰도록 정규화와 버튼 판정을 여기 한 곳에 둔다.
 */

/** 서버 search_profile_by_nickname이 돌려주는 관계 5값 */
export type CrewRelation =
  | "self"
  | "crew"
  | "request_sent"
  | "request_received"
  | "none";

export type CrewSearchResult = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  relation: CrewRelation;
  requestId: string | null;
};

export type CrewMember = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  totalXp: number;
  currentLevel: number;
  currentStage: number;
};

export type CrewRequest = {
  requestId: string;
  requesterId: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: Date;
};

/** 서버의 lower(btrim(...))과 같은 규칙 — 두 곳이 갈라지면 "찾았는데 없다"가 된다 */
export function normalizeNickname(input: string): string {
  return input.trim().toLowerCase();
}

export function isSearchable(input: string): boolean {
  return normalizeNickname(input).length > 0;
}

/** DB의 user_a < user_b 정규화와 같은 규칙 */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type CrewAction = "send" | "accept" | "none";

export type CrewActionButton = {
  label: string;
  action: CrewAction;
  disabled: boolean;
};

/** 검색 결과 버튼 — 서버가 준 relation만으로 결정한다(클라가 추측하지 않는다) */
export function crewActionButton(relation: CrewRelation): CrewActionButton {
  switch (relation) {
    case "none":
      return { label: "크루 요청", action: "send", disabled: false };
    case "request_received":
      return { label: "수락하기", action: "accept", disabled: false };
    case "request_sent":
      return { label: "요청됨", action: "none", disabled: true };
    case "crew":
      return { label: "이미 크루", action: "none", disabled: true };
    case "self":
      return { label: "나예요", action: "none", disabled: true };
  }
}
