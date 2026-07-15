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

export type ExerciseType = "weight" | "bodyweight" | "cardio";

export type BodyPart =
  | "가슴"
  | "등"
  | "하체"
  | "어깨"
  | "팔"
  | "코어"
  | "유산소";

export type CatalogExercise = {
  id: string;
  name: string;
  body_part: BodyPart;
  exercise_type: ExerciseType;
  is_custom: boolean;
  created_by: string | null; // null = 기본 시드
  created_at: string;
};

export type SessionStatus = "draft" | "active" | "completed" | "cancelled";

export type WorkoutSession = {
  id: string;
  user_id: string;
  group_id: string | null;
  workout_type: string | null;
  title: string | null;
  started_at: string | null; // RPC(서버시간)만 기록
  completed_at: string | null;
  duration_minutes: number | null;
  intensity: number | null;
  memo: string | null;
  visibility: "group" | "private";
  status: SessionStatus;
  deleted_at: string | null;
  verification_status: "none" | "photo_uploaded" | "camera_verified";
  verification_source: string | null;
  server_uploaded_at: string | null;
  client_captured_at: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type WorkoutExercise = {
  id: string;
  session_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  sort_order: number;
  memo: string | null;
  previous_workout_exercise_id: string | null;
  created_at: string;
};

export type WorkoutSet = {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  is_completed: boolean;
  completed_at: string | null; // 트리거(서버시간)만 기록
};
