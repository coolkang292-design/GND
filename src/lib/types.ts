export type Profile = {
  id: string;
  nickname: string;
  avatar_url: string | null; // 이모지 문자 또는 storage 경로
  weekly_goal: number;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
};
