"use client";

import { UiIcon } from "@/components/ui-icon";

/**
 * 챌린지가 하나도 없을 때의 첫 화면 (2026-08-17 사용자 승인).
 *
 * ── 왜 바꿨나 ────────────────────────────────────────────────────────────
 * 옛 화면을 개발 서버에서 실측했다(390×844, 챌린지 0개인 신규 계정):
 *
 *   · 내용은 y=276에서 끝나고 그 아래 **510px(화면의 60%)가 빈 검정**이었다
 *   · 화면 전체 단어 **31개**
 *   · `친구`·`초대`·`링크`·`카톡` 등장 **0회**
 *
 * 앱이 존재하는 이유가 첫 화면에 한 글자도 없었다. 대신 아직 아무것도 안 한
 * 사람에게 `참가자 각자 자기 목표(KPI)`와 `전원 설정 완료 시 시작` 규칙을 먼저
 * 읽혔고, 버튼은 `＋ 새 챌린지 만들기 (기간·목표 설정)`으로 **결과가 아니라
 * 작업량을 예고**했다.
 *
 * 운영 DB도 같은 말을 했다 — 챌린지 18개 중 14개가 참가자 1명, 전 기간 초대 알림
 * 1건, 초대 링크로 들어온 신규 가입자 0명.
 *
 * ── 규칙 ─────────────────────────────────────────────────────────────────
 * ⚠️ **KPI·전원 설정·게이트를 여기에 다시 쓰지 마라.** 없앤 게 아니라 **처음
 *    필요해지는 순간**(목표 화면)으로 옮긴 것이다. 여기서 미리 설명하면 아무것도
 *    안 한 사람이 규칙부터 읽는 옛 화면으로 되돌아간다.
 *    `start-card.test.tsx`가 부정 단언으로 막는다.
 *
 * ⚠️ **`친구가 들어온 뒤에 같이 정해요`를 빼지 마라.** 폼이 사라진 게 아니라
 *    미뤄졌다는 약속이다. 이 줄이 없으면 나중에 목표 화면을 만났을 때 속았다고
 *    느낀다.
 *
 * ⚠️ **주 버튼 라벨에 괄호를 넣지 마라.** 괄호는 이 화면에서 늘 비용을 예고했다
 *    (`(기간·목표 설정)`). 버튼은 눌렀을 때 **되는 것**을 말한다.
 *
 * ⚠️ **보조 버튼을 지우지 마라.** 지금 부를 친구가 없는 사람의 탈출구다. 없애면
 *    "친구가 있어야만 쓸 수 있는 앱"이 된다.
 */
export function ChallengeStartCard({
  busy,
  onInviteFirst,
  onCreateAlone,
}: {
  /** 방을 만들고 링크를 발급하는 동안 — 두 번 누르면 빈 챌린지가 둘 생긴다 */
  busy: boolean;
  onInviteFirst: () => void;
  onCreateAlone: () => void;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="flex items-center gap-1.5 text-base font-extrabold">
        <UiIcon name="trophy" size={20} />
        친구부터 부르면 시작돼요
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
        카톡으로 링크 하나만 보내면 돼요.
        <br />
        기간과 목표는 친구가 들어온 뒤에 같이 정해요.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onInviteFirst}
          disabled={busy}
          className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          {busy ? "만드는 중…" : "친구 불러서 시작하기"}
        </button>
        {/* ⚠️ 주 버튼과 같은 금색으로 채우지 마라. 둘 다 채우면 무엇을 먼저
            눌러야 할지 안 보인다 — 온보딩의 제공자 버튼이 같은 이유로
            첫 번째만 채운다(`onboarding/page.tsx`). */}
        <button
          type="button"
          onClick={onCreateAlone}
          disabled={busy}
          className="h-11 rounded-card border border-line bg-surface-2 text-[13px] font-bold text-muted disabled:opacity-60"
        >
          혼자 먼저 만들어 둘게요
        </button>
      </div>
    </section>
  );
}
