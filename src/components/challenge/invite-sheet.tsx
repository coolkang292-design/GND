"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { uploadRecruitPhoto } from "@/lib/avatar";
import { UiIcon } from "@/components/ui-icon";
import {
  RECRUIT_NOTE_MAX_LENGTH,
  setChallengeDiscoverable,
  setChallengeRecruitImage,
  setChallengeRecruitNote, inviteToChallenge, issueChallengeInviteCode } from "@/lib/challenge";
// 0038이 만든 닉네임 정확 일치 검색. 단일 결과 또는 null을 돌려준다(배열 아님).
// isSearchable 게이트가 있어 빈 입력은 조회 없이 null이 된다.
import { searchProfileByNickname } from "@/lib/crew-link";

/** invite_to_challenge의 오류 코드를 사람 말로 */
export function inviteError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("already_invited")) return "이미 초대했거나 참가 중이에요";
  if (msg.includes("not_host")) return "방장만 초대할 수 있어요";
  if (msg.includes("self_invite")) return "본인은 초대할 수 없어요";
  if (msg.includes("target_not_found")) return "그 닉네임을 찾지 못했어요";
  if (msg.includes("invalid_status")) return "시작한 챌린지에는 초대할 수 없어요";
  return `초대 실패: ${msg}`;
}

/**
 * 챌린지 초대 — 닉네임으로 찾아 초대한다.
 *
 * host + setup에서만 렌더한다. 서버(invite_to_challenge)가 같은 두 조건을 이미
 * 강제하므로 이건 화면 편의지 경계가 아니다 — 경계는 RPC에 있다.
 */
export function InviteSheet({
  challengeId,
  myRole,
  status,
  discoverable,
  recruitNote,
  recruitImageUrl,
  onInvited,
}: {
  challengeId: string;
  myRole: "host" | "member";
  status: string;
  /** 피드에서 참가자를 모집 중인가 (0085) */
  discoverable: boolean;
  /** 저장된 모집글 (0087) */
  recruitNote: string | null;
  /** 저장된 모집 사진 (0087) */
  recruitImageUrl: string | null;
  onInvited: () => void;
}) {
  const { userId } = useAuth();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  /** 방금 만든 링크가 개발 서버 주소인가 (다른 기기에서 안 열린다) */
  const [localOnly, setLocalOnly] = useState(false);
  /*
    피드 모집 (0085).

    ⚠️ **새 화면을 만들지 않고 여기 둔다.** 닉네임 초대·링크 초대·피드 공개는
       전부 "참가자를 모으는 방법"이다. 다른 화면에 두면 방장이 셋 중 둘만 안다.
  */
  const [open, setOpen] = useState(discoverable);
  const [openBusy, setOpenBusy] = useState(false);
  /*
    모집글 (0087, 사용자 지시 "공개 모집을 할 때는 모집글을 작성하게").

    ⚠️ 토글과 달리 **저장 버튼이 있다.** 글자마다 요청을 보낼 수는 없다.
  */
  const [note, setNote] = useState(recruitNote ?? "");
  const [noteBusy, setNoteBusy] = useState(false);
  /*
    모집 사진 (0087).

    ⚠️ **고르는 즉시 올리고 저장한다** — 프로필 사진과 같은 규약이다
       (`profile-edit-sheet.tsx`). 저장 버튼을 기다리면 "보이는 것"과
       "저장된 것"이 갈린다.

    ⚠️ 미리보기를 `URL.createObjectURL`로 앞당기지 않는다. 올라간 실제 URL만
       그리면 업로드가 실패했는데 성공한 것처럼 보이는 일이 불가능해진다.
  */
  const [image, setImage] = useState<string | null>(recruitImageUrl);
  const [imageBusy, setImageBusy] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  async function pickImage(file: File | undefined) {
    if (!file || !userId || imageBusy) return;
    setImageBusy(true);
    setMessage(null);
    try {
      const url = await uploadRecruitPhoto(userId, file);
      await setChallengeRecruitImage(challengeId, url);
      setImage(url);
      setMessage("모집 사진을 올렸어요");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "사진을 올리지 못했어요");
    } finally {
      setImageBusy(false);
      // 같은 파일을 다시 고를 수 있게 비운다 — 안 비우면 onChange가 안 뜬다
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  }

  async function removeImage() {
    if (imageBusy) return;
    setImageBusy(true);
    try {
      await setChallengeRecruitImage(challengeId, null);
      setImage(null);
    } catch {
      setMessage("사진을 지우지 못했어요");
    } finally {
      setImageBusy(false);
    }
  }

  async function saveNote() {
    if (noteBusy) return;
    if (note.trim().length > RECRUIT_NOTE_MAX_LENGTH) {
      setMessage(`모집글은 ${RECRUIT_NOTE_MAX_LENGTH}자까지 쓸 수 있어요`);
      return;
    }
    setNoteBusy(true);
    try {
      await setChallengeRecruitNote(challengeId, note);
      setMessage("모집글을 저장했어요");
    } catch {
      setMessage("모집글을 저장하지 못했어요");
    } finally {
      setNoteBusy(false);
    }
  }

  async function toggleDiscoverable(next: boolean) {
    if (openBusy) return;
    setOpenBusy(true);
    setOpen(next); // 낙관적 반영
    try {
      await setChallengeDiscoverable(challengeId, next);
      setMessage(
        next
          ? "피드에 모집 카드가 올라갔어요"
          : "피드에서 내렸어요 — 새로 들어올 수 없어요",
      );
    } catch (e) {
      setOpen(!next); // 롤백
      // 0089: 방장 1인당 동시에 열 수 있는 공개 모집은 1건이다. 이유를 말해 주지
      // 않으면 "왜 안 되지?"만 남고, 사용자는 이미 열어 둔 모집이 있다는 것을
      // 떠올리지 못한다 — 다른 챌린지 화면에 있으니 눈앞에 없다.
      setMessage(
        e instanceof Error && e.message === "recruit_already_open"
          ? "이미 공개 모집 중인 챌린지가 있어요 — 그걸 내리고 다시 열어 주세요"
          : "바꾸지 못했어요",
      );
    } finally {
      setOpenBusy(false);
    }
  }

  /**
   * 참가자(방장 아님)는 **링크만** 쓴다 (0091, 사장님 지시 2026-08-31).
   *
   * ⚠️ 닉네임 초대·모집 공개·모집글·모집사진은 방장 것으로 남는다. 서버도
   *    `invite_to_challenge`가 `not_host`로 막는다 — 화면만 열면 눌리는데 안 되는
   *    버튼이 된다.
   *
   * ⚠️ 시작한 뒤에는 아래 방장 분기와 **같은 이유로** 닫힌다. 여기서 status를
   *    다시 안 보고 아래 공통 분기를 타게 두면 순서가 꼬이므로 여기서 막는다.
   */
  if (myRole !== "host") {
    if (status !== "setup") return null;
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name="trophy" size={20} />
          친구 초대
        </h3>
        <p className="mt-0.5 text-[11px] text-muted">
          링크를 보내면 같이 할 수 있어요. 시작 전에만 들어올 수 있어요.
        </p>
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => void handleShareLink()}
            disabled={linkBusy}
            className="h-10 w-full rounded-card-sm border border-line bg-surface-2 text-[13px] font-bold disabled:opacity-40"
          >
            {linkBusy ? "링크 만드는 중…" : "🔗 초대 링크 복사하기"}
          </button>
          {link && (
            <div className="mt-2 rounded-card-sm bg-surface-2 px-2.5 py-2">
              <p className="text-[10px] font-bold text-faint">상대에게 보낼 링크</p>
              <p className="mt-0.5 break-all text-[11px] text-muted">{link}</p>
            </div>
          )}
          {localOnly && (
            <p className="mt-1.5 rounded-card-sm border border-warn/40 bg-surface-2 px-2.5 py-2 text-[11px] font-bold text-warn">
              ⚠️ 개발 서버 주소예요. <b>다른 기기(폰)에서는 안 열려요</b> —
              &ldquo;localhost&rdquo;는 그 기기 자신을 가리켜요. 배포된
              뒤에는 실제 주소로 나가요.
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-muted">
            <b className="text-text">이미 GND를 쓰는 사람</b>은 링크로 참가해도 서로
            크루가 되지 않아요. 이름과 랭킹은 이 챌린지 안에서만 보여요.{" "}
            <b className="text-text">GND가 처음인 사람</b>은 나와 친구가 돼요.
          </p>
          {message && (
            <p className="mt-2 text-[11px] font-bold text-accent">{message}</p>
          )}
        </div>
      </section>
    );
  }

  // 시작한 뒤에는 초대가 닫힌다 — 중도 합류는 점수가 불공정해지기 때문이고,
  // 서버(invite_to_challenge·join_challenge_with_code)가 invalid_status로 막는다.
  //
  // 이때 영역을 통째로 숨기면 "왜 초대가 없지?"가 된다. 자리는 유지하고 이유를
  // 적는다 — 규칙을 감추지 말고 알려준다.
  if (status !== "setup") {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name="trophy" size={20} />
          챌린지 초대
        </h3>
        <p className="mt-0.5 text-[11px] text-muted">
          {status === "active"
            ? "이미 시작해서 초대가 닫혔어요. 중간에 합류하면 점수가 공정하지 않아서예요."
            : "끝난 챌린지예요. 새 챌린지를 만들어 초대해 보세요."}
        </p>
      </section>
    );
  }

  /** 링크 만들기 + 클립보드 복사. 코드 발급은 서버가 멱등이라 눌러도 안 바뀐다. */
  async function handleShareLink() {
    if (linkBusy) return;
    setLinkBusy(true);
    setMessage(null);
    try {
      const code = await issueChallengeInviteCode(challengeId);
      // 0091: 링크를 준 사람을 실어 보낸다. 참가자도 링크를 뿌릴 수 있게 되면서
      // **신입이 누구와 친구가 되는지**가 여기서 정해진다. 서버가 "그 방의
      // 참가자인가"를 확인하므로 위조해도 방 밖 사람과는 못 이어진다.
      const url =
        `${window.location.origin}/challenge?join=${code}` +
        // ⚠️ `useAuth()`의 userId를 쓴다. prop으로 또 받지 않는다 — 같은 값을
        //    두 곳에서 받으면 언젠가 한쪽만 갱신된다.
        (userId ? `&by=${encodeURIComponent(userId)}` : "");
      setLink(url);
      // 개발 서버에서 만든 링크는 **다른 기기에서 안 열린다** — `localhost`는
      // "그 기기 자신"이라 폰에서 열면 폰을 찾는다. 2026-08-31에 사장님이
      // 실제로 겪었다("테스트 계정에서 링크를 만드니까 실 계정에서 접속 자체가
      // 안 되네"). 코드 문제가 아니라 주소 문제인데, 화면이 말해 주지 않으면
      // 참가 기능이 고장난 것으로 읽힌다.
      setLocalOnly(/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(url));
      // 클립보드는 권한·컨텍스트에 따라 실패할 수 있다. 실패해도 링크는 화면에
      // 띄워 두므로 손으로 복사하면 된다 — 조용히 사라지게 두지 않는다.
      try {
        await navigator.clipboard.writeText(url);
        setMessage("링크를 복사했어요 — 붙여넣기로 공유하세요 🔗");
      } catch {
        setMessage("아래 링크를 길게 눌러 복사하세요");
      }
    } catch (e) {
      setMessage(inviteError(e));
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleInvite() {
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await searchProfileByNickname(nickname.trim());
      if (!found) {
        setMessage("그 닉네임을 찾지 못했어요");
        return;
      }
      await inviteToChallenge(challengeId, found.id);
      setMessage(`${found.nickname}님을 초대했어요 🏆`);
      setNickname("");
      onInvited();
    } catch (e) {
      setMessage(inviteError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
        <UiIcon name="trophy" size={20} />
        챌린지 초대
      </h3>
      <p className="mt-0.5 text-[11px] text-muted">
        닉네임으로 찾아 초대해요. 시작 전에만 초대할 수 있어요.
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
          className="min-w-0 flex-1 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleInvite()}
          disabled={busy || !nickname.trim()}
          className="shrink-0 rounded-card-sm bg-accent px-3.5 py-2 text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          {busy ? "초대 중…" : "초대"}
        </button>
      </div>
      {/*
        피드에서 참가자 구하기 (0085) — 초대 링크 바로 위.

        ⚠️ `setup`에서만 보인다. 시작한 뒤에는 이 컴포넌트가 위에서 이미
           `status !== "setup"` 분기로 빠져나간다.

        ⚠️ 껐다 켤 수 있어야 해서 참가에 `invite_code`를 쓰지 않는다. 코드로
           참가시키면 **모집을 끈 뒤에도 그 코드로 계속 들어온다.**
      */}
      <div className="mt-3 border-t border-line pt-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={open}
            disabled={openBusy}
            onChange={(e) => void toggleDiscoverable(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold">
              피드에서 참가자 구하기
            </span>
            <span className="mt-0.5 block text-[11px] text-muted">
              GND 피드에 이 챌린지가 뜨고, 크루가 아닌 사람도 참여할 수 있어요.
              끄면 새로 들어올 수 없어요.
            </span>
          </span>
        </label>

        {/*
          모집글은 **켰을 때만** 보인다 (0087). 꺼진 상태에서 글부터 쓰게 하면
          "왜 안 뜨지"가 된다 — 켜는 것이 먼저다.

          ⚠️ 토글과 달리 저장 버튼이 있다. 글자마다 요청을 보낼 수 없다.
        */}
        {open && (
          <div className="mt-2.5">
            <p className="mb-1.5 text-[11px] font-bold text-muted">
              모집글{" "}
              <span className="text-faint">
                {note.trim().length}/{RECRUIT_NOTE_MAX_LENGTH}
              </span>
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={RECRUIT_NOTE_MAX_LENGTH}
              rows={2}
              aria-label="모집글"
              placeholder="주 3회 이상 꾸준히 하실 분 찾아요. 초보 환영!"
              className="w-full resize-none rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void saveNote()}
              disabled={noteBusy}
              className="mt-1.5 h-9 w-full rounded-card-sm border border-line bg-surface-2 text-[12.5px] font-bold disabled:opacity-50"
            >
              {noteBusy ? "저장 중…" : "모집글 저장"}
            </button>
            <p className="mt-1 text-[11px] text-faint">
              이름만 보고는 어떤 사람을 찾는지 알 수 없어요. 한두 줄이면 충분해요.
            </p>

            {/* 모집 사진 (0087) — 피드 게시물처럼 사진이 있으면 눈에 띈다.
                고르는 즉시 올라가고 저장된다(저장 버튼 없음). */}
            <div className="mt-2.5">
              {image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image}
                  alt="모집 사진 미리보기"
                  className="mb-1.5 aspect-[16/9] w-full rounded-card-sm object-cover"
                />
              )}
              <input
                ref={imageFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void pickImage(e.target.files?.[0])}
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => imageFileRef.current?.click()}
                  disabled={imageBusy}
                  className="h-9 flex-1 rounded-card-sm border border-line bg-surface-2 text-[12.5px] font-bold disabled:opacity-50"
                >
                  {imageBusy
                    ? "올리는 중…"
                    : image
                      ? "📷 사진 바꾸기"
                      : "📷 모집 사진 넣기"}
                </button>
                {image && (
                  <button
                    type="button"
                    onClick={() => void removeImage()}
                    disabled={imageBusy}
                    className="h-9 flex-none rounded-card-sm border border-line bg-surface-2 px-3 text-[12.5px] font-bold text-faint disabled:opacity-50"
                  >
                    지우기
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 크루 밖 사람을 부르려면 닉네임을 정확히 알아야 하는데, 그걸 알려면
          어차피 밖에서 연락해야 한다. 링크가 그 자리를 대신한다. */}
      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => void handleShareLink()}
          disabled={linkBusy}
          className="h-10 w-full rounded-card-sm border border-line bg-surface-2 text-[13px] font-bold disabled:opacity-40"
        >
          {linkBusy ? "링크 만드는 중…" : "🔗 초대 링크 복사하기"}
        </button>
        {link && (
          // 라벨이 없으면 주소창처럼 보인다 — 실제로 "주소에 join이 남아 있다"는
          // 오해를 샀다. 이건 상대에게 보낼 링크이고, 코드가 들어 있어야 한다.
          <div className="mt-2 rounded-card-sm bg-surface-2 px-2.5 py-2">
            <p className="text-[10px] font-bold text-faint">상대에게 보낼 링크</p>
            <p className="mt-0.5 break-all text-[11px] text-muted">{link}</p>
          </div>
        )}
        {/* ⚠️ 2026-08-08(0063)에 이 약속이 **절반만 참**이 됐다. 고치지 않으면
            화면이 거짓말을 한다.

            옛 문구: "링크로 참가해도 서로 크루가 되지는 않아요."
            그 약속은 0051이 D5를 지우면서 생겼는데(2026-07-31 사용자 신고 —
            다른 챌린지 멤버가 크루 목록에 섞였다), 0063이 **신규 가입자에 한해**
            방장과 친구를 맺게 했다. 조건이 문구에 있어야 참이다.

            ⚠️ 조건절을 빼고 단정문으로 되돌리지 마라 — `invite-sheet.test.tsx`가
            조건절의 존재를 단언한다. */}
        {localOnly && (
          <p className="mt-1.5 rounded-card-sm border border-warn/40 bg-surface-2 px-2.5 py-2 text-[11px] font-bold text-warn">
            ⚠️ 개발 서버 주소예요. <b>다른 기기(폰)에서는 안 열려요</b> —
            &ldquo;localhost&rdquo;는 그 기기 자신을 가리켜요. 배포된
            뒤에는 실제 주소로 나가요.
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-muted">
          <b className="text-text">이미 GND를 쓰는 사람</b>은 링크로 참가해도 서로
          크루가 되지 않아요. 이름과 랭킹은 이 챌린지 안에서만 보여요.{" "}
          <b className="text-text">GND가 처음인 사람</b>은 나와 친구가 돼요.
        </p>
      </div>

      {message && (
        <p className="mt-2 text-[11px] font-bold text-accent">{message}</p>
      )}
    </section>
  );
}
