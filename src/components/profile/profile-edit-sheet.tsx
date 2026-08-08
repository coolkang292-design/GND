"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  AVATARS,
  DEFAULT_AVATAR,
  DEFAULT_WEEKLY_GOAL,
  clampWeeklyGoal,
} from "@/lib/domain/avatars";
import { getMyProfile, upsertMyProfile } from "@/lib/crew";

/**
 * 프로필 편집 — 닉네임 · 이모지 (설계 §4.3).
 *
 * ⚠️⚠️ **이건 새 기능이 아니라 온보딩에서 뺀 것을 옮겨 놓은 자리다. 지우지 마라.**
 * 2026-08-08에 온보딩 첫 화면을 카카오·구글만 남기고 정리하면서 이모지 선택과
 * 주간목표 스테퍼가 빠졌다. `upsertMyProfile`을 부르는 곳은 그때까지 **온보딩
 * 한 곳뿐**이었으므로, 이 시트가 없으면
 *   · `avatar_url`이 전원 `🧔`로 **영구 고정**된다 (12곳이 이 값을 렌더한다)
 *
 * ⚠️ **주간 목표 스테퍼는 2026-08-08 사용자 지시로 뺐다.**
 * *"주간 운동표는 챌린지에서 세팅하는 걸로 하자"* — 목표는 프로필이 아니라
 * 챌린지의 것이라는 판단이다(챌린지에 이미 `user_goals`가 있다).
 *
 * 화면에서만 뺀 것이고 `weekly_goal` 컬럼은 not null이라 **계속 저장한다** —
 * 열 때 읽은 값을 그대로 다시 넣는다(기본 3). 여기서 안 넣으면 저장할 때마다
 * 값이 날아간다.
 *
 * ⚠️ **이제 이 값을 화면에 쓰는 곳은 없다** (2026-08-08 정리). 홈 `WeeklyStats`와
 * 기록 캘린더의 주간 기준은 진행 중 챌린지의 `user_goals.planned_days`에서 온다
 * (`getMyWeeklyGoalDays`). `weekly_goal` 컬럼은 not null이라 여기서 계속 쓰기만
 * 하고 아무도 읽지 않는다 — **다시 화면에 끌어다 쓰지 마라.** 바꿀 자리가 없는
 * 숫자로 달성률을 매기던 게 이 정리의 이유다.
 *
 * 닉네임 중복(23505)은 `upsertMyProfile`이 이미 사람 말로 바꿔 준다 — 여기서
 * 다시 판정하지 않는다. 두 곳에서 판정하면 문구가 갈린다.
 */
export function ProfileEditSheet({ onSaved }: { onSaved?: () => void }) {
  const { userId } = useAuth();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<string>(DEFAULT_AVATAR);
  const [weeklyGoal, setWeeklyGoal] = useState(DEFAULT_WEEKLY_GOAL);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 열 때 현재 값을 읽는다. 미리 읽어 두면 다른 기기에서 바꾼 값이 낡은 채로
  // 화면에 남고, 저장 시 그 낡은 값으로 덮어쓴다.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await getMyProfile(userId);
        if (cancelled || !p) return;
        setNickname(p.nickname ?? "");
        setAvatar(p.avatar_url || DEFAULT_AVATAR);
        setWeeklyGoal(clampWeeklyGoal(p.weekly_goal ?? DEFAULT_WEEKLY_GOAL));
      } catch {
        if (!cancelled) setError("프로필을 불러오지 못했어요");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  async function save() {
    if (!userId || busy) return;
    const nick = nickname.trim();
    if (!nick) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertMyProfile({
        id: userId,
        nickname: nick,
        avatar_url: avatar,
        weekly_goal: weeklyGoal,
      });
      setDone(true);
      // 저장 뒤 부모에게 알린다. `/profile`은 이걸 받아 GrowthHub를 리마운트한다.
      //
      // ⚠️ **바꾼 이모지가 이 화면에 반영되는 건 아니다.** GrowthHub는 `profiles`를
      // 읽지 않는다 — 이 화면 어디에도 `avatar_url`이 안 그려진다(2026-08-08 실측).
      // 이모지가 보이는 곳은 홈 크루 카드·챌린지 참가자 목록이고, 둘 다 마운트 때
      // 프로필을 읽으므로 탭을 옮기면 새 값이 나온다.
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between rounded-card border border-line bg-surface px-3.5 py-3.5 shadow-card"
      >
        <span className="text-[14px] font-extrabold">프로필 편집</span>
        <span className="text-[13px] text-muted">이름 · 이모지 ›</span>
      </button>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">프로필 편집</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="닫기"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm"
        >
          ✕
        </button>
      </div>

      {!ready ? (
        <p className="mt-3 text-xs text-muted">불러오는 중…</p>
      ) : (
        <>
          <p className="mt-4 mb-2 text-[11px] font-bold text-muted">
            프로필 사진
          </p>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAvatar(a);
                  setDone(false);
                }}
                aria-pressed={avatar === a}
                className={`flex h-11 w-11 items-center justify-center rounded-full border text-2xl ${
                  avatar === a
                    ? "border-accent bg-accent-weak"
                    : "border-line bg-surface-2"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-[11px] font-bold text-muted">닉네임</p>
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setDone(false);
            }}
            maxLength={20}
            placeholder="닉네임"
            className="w-full rounded-card-sm border border-line bg-surface-2 px-4 py-3 text-[15px] outline-none focus:border-accent"
          />

          {error && (
            <p className="mt-3 text-[13px] text-warn" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="mt-3 text-[13px] text-good" role="status">
              저장했어요 ✓
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="mt-5 h-11 w-full rounded-full bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </>
      )}
    </section>
  );
}
