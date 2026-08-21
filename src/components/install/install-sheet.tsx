"use client";

import Image from "next/image";

/**
 * 홈 화면 설치 안내 시트 — **보여주기만 한다.** 언제 뜰지는 `InstallGate`가 정한다.
 *
 * 나누어 둔 이유: 판정·저장소 없이 "아이폰에서 몇 단계가 보이는가"를 테스트로
 * 잠글 수 있어야 한다. 화면 확인은 사람이 하더라도 **단계 개수**는 기계가 센다.
 *
 * ⚠️ 문구의 단일 원천은 계획서 §11이다. 여기를 고치면 거기도 고쳐라.
 */

export type SheetVariant =
  /** 신원이 없다 — 설치보다 로그인이 먼저다 */
  | "login-first"
  /** 카톡 등 iOS 인앱 브라우저 — 사파리로 내보낸다 */
  | "escape-ios"
  /** 안드로이드 인앱 브라우저 — 크롬으로 내보낸다 */
  | "escape-android"
  /** iOS의 크롬·파폭 — 사파리로 옮겨 달라 (인앱은 아니다) */
  | "escape-ios-other"
  /** iOS 사파리 — ··· → 공유 → 홈 화면에 추가 4단계 */
  | "install-ios"
  /** 안드로이드 + 설치 이벤트 있음 — 버튼 하나 */
  | "install-android-prompt"
  /** 안드로이드인데 이벤트가 없다 — 손으로 하는 2단계 */
  | "install-android-manual";

type Step = {
  text: React.ReactNode;
  hint?: string;
  /** 못 찾을 만한 단계에만 사진을 붙인다 (§13-2) */
  shot?: { src: string; alt: string; width: number; height: number };
};

const SHOT = {
  kakaoShare: {
    src: "/onboarding/install/step-kakao-share.webp",
    alt: "카톡 화면 맨 아래 오른쪽 끝의 공유 버튼",
    width: 640,
    height: 74,
  },
  openSafari: {
    src: "/onboarding/install/step-open-safari.webp",
    alt: "공유 시트 왼쪽 아래의 'Safari로 열기'",
    width: 640,
    height: 254,
  },
  safariMore: {
    src: "/onboarding/install/step-safari-more.webp",
    alt: "사파리 하단바 오른쪽 끝의 점 3개(···) 버튼",
    width: 640,
    height: 93,
  },
  addHome: {
    src: "/onboarding/install/step-add-home.webp",
    alt: "사파리 공유 시트의 '홈 화면에 추가'",
    width: 640,
    height: 106,
  },
} as const;

function Em({ children }: { children: React.ReactNode }) {
  return <b className="text-accent">{children}</b>;
}

type Copy = {
  title: string;
  desc: string;
  steps: Step[];
  /**
   * **그다음에 무엇이 기다리는가.**
   *
   * ⚠️ 사장님 지시(2026-08-22): *"사파리에서 홈화면 추가까지 안내가 되는 게
   *    낫지 않아?"*. 카톡 안내만 보면 사파리로 옮긴 뒤 무엇을 해야 하는지
   *    모른 채 끊긴다 — 여정이 두 화면에 걸쳐 있으면 **첫 화면이 지도를 줘야 한다.**
   */
  next?: React.ReactNode;
  /** 아래를 가리키는 빨간 화살표를 그릴 것인가 (공유 버튼이 화면 밖 바로 아래에 있을 때) */
  pointDown: boolean;
  note?: React.ReactNode;
  /**
   * ⚠️⚠️ **실제로 무언가를 하는 버튼만 둔다** (2026-08-22 사장님 지시 —
   *    *"버튼 입력 자체를 없애는 게 맞지 않아?"*).
   *
   *    "다 했어요"처럼 **닫기만 하는 버튼**은 사용자에게 선언을 요구한다. 그 선언은
   *    검증할 수 없고(정말 설치했는지 우리는 모른다), 틀린 선언이 사람을 가뒀다.
   *    설치 여부는 **다음 실행에 `standalone`으로** 저절로 알 수 있다 — 물어볼
   *    이유가 없다.
   *
   *    닫기는 ✕와 바깥 탭이다. 버튼이 아니다.
   */
  primary?: string;
  secondary?: string;
};

function copyFor(variant: SheetVariant): Copy {
  switch (variant) {
    case "login-first":
      /**
       * ⚠️⚠️ **익명 사용자에게 침묵하지 않는다** (2026-08-22 사장님 지시 —
       *    *"로그인을 했든 안 했든 앱이 안 깔려 있으면 나가게 세팅된 게 아닌가?"*).
       *
       * 옛 판은 신원이 없으면 아무것도 안 띄웠다. 익명으로 설치하면 설치본에서
       * 그 계정으로 못 돌아와 기록이 갈리기 때문인데, **막는 게 답이 아니었다.**
       * 안 깔린 사람에게는 전부 말을 걸되, 익명이면 순서를 하나 앞세운다.
       *
       * ⚠️ 여기에 로그인 버튼을 직접 두지 마라. 익명 세션이 있는 상태에서
       *    `signInWithOAuth`를 쓰면 **계정이 갈린다**(`identity.ts` 상단 표).
       *    `linkIdentity`를 쓰는 `/account`로 보낸다.
       */
      return {
        title: "먼저 로그인해 주세요",
        desc: "홈 화면에 놓기 전에 딱 한 단계예요",
        steps: [],
        pointDown: false,
        note: (
          <>
            지금은 <b className="text-text">이 브라우저에만</b> 계정이 있어요.
            카카오·구글을 연결해 두면 앱을 깔거나 폰을 바꿔도{" "}
            <b className="text-text">기록이 그대로예요.</b>
          </>
        ),
        primary: "계정 연결하러 가기",
      };

    case "escape-ios":
      /**
       * ⚠️⚠️ **이 안내는 로그인/가입에 성공한 뒤에만 뜬다** (2026-08-21 사장님 결정).
       *
       * 처음 판은 로그인 **전에** 띄웠다. iOS는 카톡 인앱 → 사파리 → 설치본으로
       * 저장소가 세 겹이라, 카톡에서 로그인하면 사파리에서 또 해야 해서
       * 로그인이 3번이 되기 때문이었다.
       *
       * **그 계산이 틀렸다.** 카톡 링크를 처음 누른 사람은 앱을 아직 아무것도
       * 못 봤다. 첫 화면부터 "여기선 앱을 못 깔아요"를 띄우면 그냥 나간다.
       * 반면 추가 로그인 1회는 **카카오 버튼 한 번**이고 계정도 같다 — 훨씬 싸다.
       * 안내는 이미 앱을 써 본 사람에게 해야 먹힌다.
       */
      return {
        title: "이제 홈 화면에 놓을 차례예요",
        desc: "카톡 안에서는 앱을 못 깔아요",
        steps: [
          {
            text: (
              <>
                맨 아래 <Em>공유 버튼</Em>을 누르세요
              </>
            ),
            hint: "빨간 칸이 그 버튼이에요",
            shot: SHOT.kakaoShare,
          },
          {
            text: (
              <>
                <Em>Safari로 열기</Em>를 누르세요
              </>
            ),
            hint: "나침반 그림이에요",
            shot: SHOT.openSafari,
          },
        ],
        pointDown: true,
        next: (
          <>
            사파리로 옮기면 <b className="text-text">공유 → 홈 화면에 추가</b>{" "}
            안내가 이어서 나와요.
          </>
        ),
        // ⚠️ 사파리에서 또 로그인해야 한다는 걸 **미리** 말한다. 안 말하면
        //    로그인 화면을 다시 보고 "아까 한 게 날아갔나?" 하고 되돌아온다.
        note: "사파리에서 카카오 버튼 한 번만 더 누르면 끝이에요. 기록은 그대로예요.",
        // 닫기 버튼은 없다 — ✕와 바깥 탭. 주소 복사는 실제로 무언가를 한다.
        primary: "주소 복사하기",
      };

    case "escape-android":
      return {
        title: "크롬으로 열어 주세요",
        desc: "카톡 브라우저에서는 앱 설치가 안 돼요",
        steps: [],
        pointDown: false,
        primary: "크롬으로 열기",
        secondary: "주소 복사하기",
      };

    case "escape-ios-other":
      return {
        title: "사파리로 열어 주세요",
        desc: "아이폰은 사파리에서만 홈 화면에 추가할 수 있어요",
        steps: [
          {
            text: (
              <>
                주소를 복사해 <Em>사파리</Em>에 붙여넣으세요
              </>
            ),
            hint: "아래 '주소 복사하기'를 누르면 복사돼요",
          },
        ],
        pointDown: false,
        primary: "주소 복사하기",
      };

    case "install-ios":
      /**
       * ⚠️⚠️ **4단계다. 3단계가 아니다** (2026-08-21 사장님 실물 확인으로 정정).
       *
       * 처음엔 "맨 아래 공유 버튼"으로 시작했는데 **첫 단계부터 틀렸었다.**
       * 카톡의 `Safari로 열기`로 넘어온 사파리는 하단바가 평소와 다르다 —
       * `◀ 카카오톡` 배너가 붙은 상태에서는 **공유 버튼이 없고** `···`뿐이고,
       * 공유는 그 안에 들어 있다. 실제 순서:
       *   카톡 공유 → Safari로 열기 → **···** → **공유** → 홈 화면에 추가 → 추가
       *
       * ⚠️ 단계를 줄이려고 ①②를 합치지 마라. 두 번의 탭이고, 두 번째 탭은
       *    메뉴가 열린 **다른 화면**에서 일어난다.
       */
      return {
        title: "홈 화면에 GND 놓기",
        desc: "4번만 누르면 앱처럼 열려요",
        steps: [
          {
            text: (
              <>
                오른쪽 아래 <Em>점 3개(···)</Em>를 누르세요
              </>
            ),
            // ⚠️ 카톡에서 방금 ⬆️를 눌렀기 때문에 여기서도 ⬆️를 찾는다.
            //    "그거 아니다"를 먼저 말해 줘야 헤매지 않는다.
            hint: "카톡에서 눌렀던 공유 버튼이 아니에요",
            shot: SHOT.safariMore,
          },
          {
            text: (
              <>
                맨 위 <Em>공유</Em>를 누르세요
              </>
            ),
            // 메뉴가 열리면 제일 위에 크게 있다 — 사진 없이도 못 놓친다(§13-2).
            hint: "메뉴가 열리면 제일 위에 있어요",
          },
          {
            text: (
              <>
                쭉 내려서 <Em>홈 화면에 추가</Em>
              </>
            ),
            hint: "손가락으로 목록을 위로 밀어요",
            shot: SHOT.addHome,
          },
          {
            text: (
              <>
                오른쪽 위 <Em>추가</Em>를 누르세요
              </>
            ),
            hint: "홈 화면에 GND 아이콘이 생겨요",
          },
        ],
        pointDown: true,
        // ⚠️⚠️ 이 줄을 빼지 마라. 없으면 설치본의 로그인 화면을 보고 **다시
        //    가입**한다 — 그게 계정 분리다(계획서 §3-5).
        note: (
          <>
            <b className="text-text">딱 한 번만</b> 다시 로그인하면 끝이에요.
            아까 누른 <b className="text-text">카카오 버튼</b> 그대로요.
          </>
        ),
        // ⚠️⚠️ **"다 했어요" 버튼은 없앴다** (2026-08-22 사장님 지적 —
        //    *"어차피 어플을 설치하면 해당 알림이 안 뜨는 거잖아?"*). 맞는 말이다.
        //    설치하면 다음 실행부터 `standalone`으로 잡혀 **자동으로** 안 뜬다.
        //    그 버튼이 하던 유일한 일은 "했다고 말했지만 안 한 사람"을 **영구히**
        //    막는 것이었고, 그게 실제로 사람을 가뒀다(사장님 사파리).
        //    닫기는 ✕와 바깥 탭으로 한다.
      };

    case "install-android-prompt":
      return {
        title: "홈 화면에 GND 놓기",
        desc: "버튼 한 번이면 끝나요",
        steps: [],
        pointDown: false,
        // ⚠️ 안드로이드에는 재로그인 안내를 붙이지 않는다 — 크롬과 저장소를
        //    공유해서 로그인이 그대로 유지된다.
        primary: "앱 설치하기",
      };

    case "install-android-manual":
      return {
        title: "홈 화면에 GND 놓기",
        desc: "2번만 누르면 앱처럼 열려요",
        steps: [
          {
            text: (
              <>
                오른쪽 위 <Em>점 3개(⋮)</Em>를 누르세요
              </>
            ),
          },
          {
            text: (
              <>
                <Em>홈 화면에 추가</Em>를 누르세요
              </>
            ),
            hint: "'앱 설치'로 보이기도 해요",
          },
        ],
        pointDown: false,
        // install-ios 와 같은 이유로 버튼이 없다
      };
  }
}

export function InstallSheet({
  variant,
  busy = false,
  onClose,
  onPrimary,
  onSecondary,
}: {
  variant: SheetVariant;
  busy?: boolean;
  /** ✕ · 바깥 탭 — **닫기는 버튼이 아니다** */
  onClose: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  const c = copyFor(variant);

  return (
    /* ⚠️ `items-end`로 **아래에 붙인다.** 가운데 띄우면 안내가 가리키는
       하단바 버튼(카톡 ⬆️ · 사파리 ···)에서 시선이 멀어진다. */
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0"
      role="dialog"
      aria-modal="true"
      aria-label={c.title}
      /* 바깥을 탭하면 닫힌다. 시트 안쪽 탭이 새어 올라오지 않게 target을 본다. */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ⚠️⚠️ **버튼을 스크롤 밖에 둔다.** 아이폰 사파리의 4단계 시트는 사진까지
          넣으면 730px가 넘는데, 폰의 실제 가시 영역은 700px 안팎이다. 통째로
          스크롤시키면 "다 했어요"가 화면 밖으로 밀려 **아무도 못 누른다.**
          단계는 밀려도 되지만 버튼은 항상 보여야 한다. */}
      <section className="flex max-h-[95vh] w-full max-w-md flex-col rounded-t-[20px] border-t border-line bg-surface p-4 pb-4 shadow-card">
        <div className="mx-auto mb-2 h-1 w-9 flex-none rounded-full bg-line" />

        <header className="flex flex-none items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-card-sm bg-accent text-[13px] font-black text-accent-ink">
            GND
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold">{c.title}</p>
            <p className="mt-0.5 text-xs text-muted">{c.desc}</p>
          </div>
          {/* ⚠️ 닫는 방법이 눈에 보여야 한다. 안 보이면 갇혔다고 느낀다 —
              그게 이 화면이 고치려는 바로 그 문제였다. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line bg-surface-2 text-muted"
          >
            ✕
          </button>
        </header>

        {c.steps.length > 0 && (
          <ol className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {c.steps.map((s, i) => (
              <li
                key={i}
                className="flex-none rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-accent text-[12px] font-black text-accent-ink">
                    {i + 1}
                  </span>
                  <span className="text-[13.5px] font-bold leading-snug">
                    {s.text}
                    {s.hint && (
                      <small className="mt-0.5 block text-[11.5px] font-medium text-muted">
                        {s.hint}
                      </small>
                    )}
                  </span>
                </div>
                {s.shot && (
                  <Image
                    src={s.shot.src}
                    alt={s.shot.alt}
                    width={s.shot.width}
                    height={s.shot.height}
                    className="mt-1.5 w-full rounded-lg border border-line"
                    unoptimized
                  />
                )}
              </li>
            ))}
          </ol>
        )}

        {/* ⚠️⚠️ **이 줄도 스크롤 밖이다.** 설치 뒤 재로그인 안내가 접혀 있으면
            사람들은 설치본의 로그인 화면을 보고 **다시 가입**한다 — 계정이 갈리는
            그 사고를 막는 한 줄이라, 단계보다 먼저 보여야 한다. */}
        {c.next && (
          <p className="mt-2 flex-none rounded-card-sm border border-line bg-surface-2 px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
            ➡️ {c.next}
          </p>
        )}

        {c.note && (
          <p className="mt-3 flex-none rounded-card-sm border border-accent-weak bg-accent-weak/40 px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
            💡 {c.note}
          </p>
        )}

        {c.primary && onPrimary && (
          <button
            type="button"
            disabled={busy}
            onClick={onPrimary}
            className="mt-3 w-full flex-none rounded-card-sm bg-accent py-3 text-[15px] font-extrabold text-accent-ink disabled:opacity-50"
          >
            {c.primary}
          </button>
        )}

        {c.secondary && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="mt-1.5 w-full flex-none py-1.5 text-[13px] text-muted"
          >
            {c.secondary}
          </button>
        )}

        {/* ⚠️ 공유 버튼은 **브라우저 UI**라 그 위에 표시를 그릴 수 없다. 대신
            우리 화면 맨 아래에서 그쪽을 가리킨다 — 사진과 달리 이건 안 낡는다.
            카톡·사파리 모두 공유 버튼이 하단 바 **오른쪽 끝**이다. */}
        {/* ⚠️⚠️ **되돌아올 문의 이정표.** 안내를 닫고 나면 다시 여는 방법을
            아무도 모른다 — 실제로 "다 했어요"를 눌러 갇힌 일이 있었다
            (2026-08-22). 문을 만들었으면 **어디 있는지도 말해야** 한다. */}
        <p className="mt-2 flex-none text-center text-[11px] leading-relaxed text-faint">
          이 안내를 놓쳤다면 언제든{" "}
          <b className="text-muted">내 정보 → ⚙️ → 📲 홈 화면에 앱 설치</b>
        </p>

        {c.pointDown && (
          <p className="mt-1.5 flex-none text-right text-[11.5px] font-extrabold text-[#ff6b6b]">
            바로 아래 이 버튼! ↓
          </p>
        )}
      </section>
    </div>
  );
}
