import type { GoalType } from "@/lib/domain/goal-score";

export type Challenge = {
  id: string;
  group_id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  /**
   * 사진 인증한 운동만 집계 (0014).
   *
   * ⚠️ **"항상 true"가 아니다** (2026-08-31 정정). 옛 주석이 그렇게 적혀 있었고
   *    그 때문에 "구조상 false는 불가능"이라는 잘못된 판단이 한 번 나왔다.
   *    `create_challenge_room`은 `SECURITY DEFINER`라 `challenges_insert_member`
   *    정책의 `photo_required = true`를 지나가고, 시그니처가
   *    `p_photo_required boolean`이라 **false를 저장할 수 있다.**
   *    지금 운영 값이 전부 true인 것은 그렇게 만들어 왔을 뿐이다.
   */
  photo_required: boolean;
  status: "setup" | "active" | "ended" | "cancelled";
  created_by: string;
  created_at: string;
  /**
   * 초대 코드 (0064). `create_challenge_room`이 **방을 만들 때 같이 넣어** 준다 —
   * 방을 만든 직후에는 `issue_challenge_invite_code`를 다시 부를 필요가 없다.
   *
   * ⚠️ `null`일 수 있다. 코드 유니크 충돌이 10번 난 폴백 경로에서 코드 없이 방만
   * 만들기 때문이다(RPC 주석: "방이 안 만들어지면 사용자는 아무것도 못 한다").
   * 그때는 `issue_challenge_invite_code`로 나중에 받는다.
   */
  invite_code: string | null;
  /**
   * 피드에서 참가자를 모집해도 되는가 (0085).
   *
   * ⚠️ "챌린지 내부가 공개"라는 뜻이 **아니다.** 모집 카드에 이름과 시작일만
   *    나가고, 참가는 `join_discoverable_challenge`가 따로 검사한다.
   *
   * ⚠️ 기본값 false다. 모든 챌린지에 `invite_code`가 있으므로 "코드가 있다 =
   *    공개"로 판단했다면 **비공개 챌린지가 전부 노출된다.**
   */
  discoverable: boolean;
  /**
   * 모집글 (0087). 피드 모집 카드에 이름 아래로 들어간다.
   *
   * ⚠️ DB CHECK가 150자다. 카드 한 장에 두세 줄로 들어가는 길이 — 길어지면
   *    가로 스크롤 한 줄이라는 전제가 깨진다.
   */
  recruit_note: string | null;
  /** 모집 사진 (0087). `avatars` 버킷 공개 URL */
  recruit_image_url: string | null;
};

export type UserGoal = {
  id: string;
  user_id: string;
  challenge_id: string;
  group_id: string;
  goal_type: GoalType;
  target_value: number;
  unit: string | null;
  planned_days: number;
  qualifier: number | null; // *_days: 하루 최소 종목 수
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  nickname: string;
  avatar_url: string | null; // 이모지 문자 또는 storage 경로
  weekly_goal: number;
  timezone: string;
  created_at: string;
  updated_at: string;
  /**
   * 한 줄 소개 (0085). DB CHECK가 120자.
   *
   * ⚠️ `profiles`의 SELECT 정책은 **넓히지 않았다.** 이 값이 남에게 보이는 길은
   *    `get_crew_member_profile`(본인/크루/같은 챌린지) 하나뿐이다 —
   *    이 테이블엔 `invite_code`와 `acquisition_*`가 같이 산다.
   */
  bio: string | null;
  /** DB CHECK: https:// 로 시작 + 200자. 도메인 검증은 `domain/profile-links.ts` */
  instagram_url: string | null;
  youtube_url: string | null;
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
  measure: "reps" | "time" | null; // 맨몸 횟수형/시간형 (그 외 null)
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
  measure: "reps" | "time" | null;
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
