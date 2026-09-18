import {
  PERMANENT_ACCOUNT_REQUIRED,
  permanentAccountMessage,
} from "@/lib/domain/account-gate";

/**
 * 챌린지 RPC 오류 → 사람 말 (2026-09-18에 `challenge/page.tsx`에서 옮겼다).
 *
 * 챌린지 탭이 목록·상세·만들기·목표 설정으로 나뉘면서 여러 컴포넌트가 같은 문구를
 * 써야 해졌다. 화면마다 따로 적으면 같은 오류가 곳마다 다르게 읽힌다.
 *
 * ⛔ 기본 화면에 **KPI·동의** 같은 내부 용어를 다시 쓰지 마라(목표 단순화 규칙).
 *    서버 코드(`kpi_incomplete`·`consent_incomplete`)는 그대로고 문구만 바꿨다.
 */
export function errorMessage(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" &&
          e !== null &&
          "message" in e &&
          typeof e.message === "string"
        ? e.message
        : "알 수 없는 오류";
  // 0094: 익명 계정은 챌린지 방을 만들 수 없다. 다음 할 일까지 한 문장에 담는다.
  if (msg.includes(PERMANENT_ACCOUNT_REQUIRED)) {
    return permanentAccountMessage("challenge");
  }
  if (msg.includes("kpi_incomplete")) {
    return `아직 목표를 정하지 않은 참가자가 있어요 (${msg.split(":")[1] ?? ""})`;
  }
  if (msg.includes("consent_incomplete")) {
    return `일찍 시작하려면 모두가 목표를 확인해야 해요 (${msg.split(":")[1] ?? ""})`;
  }
  if (msg.includes("not_ended_yet")) return "아직 종료일이 지나지 않았어요";
  // 0044: create_challenge_room이 challenges.group_id(not null)를 채워야 해서
  // 그룹 없는 사람은 여기서 막힌다. 0062부터 개인 그룹을 만들어 주므로 드물다.
  if (msg.includes("no_group_yet"))
    return "아직 크루가 없어요. 홈에서 크루를 만들거나 참여해 주세요";
  if (msg.includes("already_joined")) return "이미 참가한 챌린지예요";
  if (msg.includes("invalid_invite_code")) return "링크가 올바르지 않아요";
  if (msg.includes("not_host")) return "방장만 할 수 있어요";
  if (msg.includes("not_invited")) return "초대받지 않은 챌린지예요";
  if (msg.includes("not_discoverable")) return "모집이 끝난 챌린지예요";
  if (msg.includes("invalid_status"))
    return "챌린지 상태가 맞지 않아요. 새로고침해 주세요";
  // 0044가 challenges_one_live 인덱스를 지웠으므로 그 오류는 더 이상 안 나온다.
  // 분기를 남겨두면 다음 사람이 개수 제한이 아직 있다고 오해한다.
  return `오류: ${msg}`;
}
