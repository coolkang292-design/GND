import Link from "next/link";
import { APP_LANDING_PATH } from "@/lib/domain/landing";

export const metadata = { title: "개인정보 처리방침 · GND" };

/**
 * 개인정보 처리방침 — **로그인 없이 볼 수 있어야 한다** (외부 파일럿 P0-1).
 *
 * ⚠️⚠️ **`(tabs)` 밖이고 `NO_ANON_ROUTES`에 들어 있다** (`auth-provider.tsx`).
 *    둘 다 이유가 있다:
 *      · `(tabs)` 안이면 `OnboardingGate`가 프로필 없는 사람을 온보딩으로 밀어낸다.
 *        방침을 **읽으러 온 사람**에게 가입을 시키는 꼴이라 앞뒤가 안 맞는다.
 *      · `NO_ANON_ROUTES`가 아니면 `AuthProvider`가 이 화면에서도 익명 계정을
 *        발급한다. **개인정보 처리방침을 읽었다는 이유로 계정이 생기는** 것은
 *        이 문서가 약속하는 내용 자체와 모순되고, 운영 DB에 유령 계정을 쌓는다.
 *
 * ⚠️ **여기 적힌 것은 전부 실제 코드·운영 DB에서 확인한 것이다.** 2026-09-03에
 *    스키마(`information_schema.columns`)·`auth.identities`·`storage.buckets`를
 *    직접 조회해 맞췄다. 기능을 추가·제거하면 **이 문서도 같이 고쳐라** —
 *    갈라지면 사용자에게 거짓말이 된다 (CLAUDE.md §같은 사실을 두 곳에 두지 않는다).
 */

/**
 * ⚠️⚠️ **[운영자 확인 필요]** — 2026-09-03 기준 저장소·`.env`·문서 어디에도
 * 운영 연락처(회사명·사업자번호·문의 이메일)가 **없다.** 그래서 비워 둔다.
 *
 * ⛔ **임의의 이메일을 지어내지 마라.** 받는 사람이 없는 주소를 적는 것은
 *    통로가 없는 것보다 나쁘다 — 사용자는 보냈다고 믿고 기다린다.
 *
 * 값이 정해지면 **여기만** 채우면 화면 아래 「문의」 줄이 나타난다.
 */
const OPERATOR_CONTACT: string | null = null;

/** 최종 개정일. 내용을 고치면 **반드시 같이 올린다.** */
const LAST_UPDATED = "2026년 9월 3일";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-extrabold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-[12.5px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

/** 목록 한 줄 — 「무엇을」 굵게, 설명을 그 아래. */
function Item({ what, detail }: { what: string; detail: string }) {
  return (
    <li className="flex flex-col">
      <b className="text-[12.5px] font-bold text-fg">{what}</b>
      <span>{detail}</span>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <Link
          href={APP_LANDING_PATH}
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-lg"
        >
          ←
        </Link>
        <h1 className="text-base font-extrabold">개인정보 처리방침</h1>
      </header>

      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="text-[11px] text-faint">최종 개정일 · {LAST_UPDATED}</p>

        {/* 시범 운영이라는 사실을 맨 위에 둔다. 뒤에 묻으면 안 읽는다. */}
        <section className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-[12.5px] leading-relaxed text-muted">
            <b className="text-fg">GND는 지금 소규모 시범 운영(파일럿) 중입니다.</b>{" "}
            정식 서비스가 아니며, 아래에 적힌 것보다 더 많은 정보를 모으지 않습니다.
            방침이 바뀌면 앱 안에서 알려드립니다.
          </p>
        </section>

        <Section title="1. 어떤 정보를 처리하나요">
          <ul className="flex flex-col gap-2.5">
            <Item
              what="계정 · 로그인 정보"
              detail="계정 식별자와, 연결한 로그인 수단(카카오·구글 계정 연결 정보 또는 이메일 주소와 비밀번호). 카카오·구글의 비밀번호는 GND가 받지도 저장하지도 않습니다."
            />
            <Item
              what="프로필"
              detail="닉네임, 프로필 사진, 한 줄 소개, 주간 목표, 시간대, 직접 적어 넣은 인스타그램·유튜브 주소, 초대 코드와 나를 초대한 사람."
            />
            {/* ⚠️ avatars 버킷은 **public**이다(운영 실측). 인증사진만 비공개라고
                적고 이걸 안 적으면 사용자가 프로필 사진도 비공개라고 오해한다. */}
            <Item
              what="프로필 사진 · 모집 사진이 공개되는 범위"
              detail="프로필 사진과 챌린지 모집 사진은 주소를 아는 사람이면 볼 수 있는 공개 저장소에 올라갑니다. 크루 밖 사람에게도 보여야 하는 사진이라 그렇습니다. 운동 인증사진은 이와 달리 비공개입니다."
            />
            <Item
              what="운동 기록"
              detail="운동 종목·세트·무게·횟수·시간, 운동 시작과 완료 시각, 루틴과 프로그램 참여 내역."
            />
            <Item
              what="운동 인증사진"
              detail="직접 올린 사진과 촬영 시각, 카메라로 찍었는지 앨범에서 골랐는지 여부. 인증사진은 비공개 저장소에 두고, 볼 권한이 있는 사람에게만 한시적으로 열리는 주소로 보여줍니다."
            />
            <Item
              what="크루 · 챌린지 관계"
              detail="크루 요청과 수락 이력, 함께 있는 그룹, 챌린지 참가·목표·동의 내역, 응원·리액션·콕 찌르기, 프로필과 기록을 열어 본 이력."
            />
            <Item
              what="차단 · 신고"
              detail="차단한 사람 목록과, 다른 사용자를 신고한 내용."
            />
            <Item
              what="알림 · 푸시"
              detail="앱 안 알림 내역과 알림 설정. 푸시를 켰다면 브라우저가 발급한 푸시 주소와 암호화 키를 저장합니다."
            />
            <Item
              what="성장 기록"
              detail="XP·레벨·배지·포인트와 그 적립 내역, 잠금 해제한 항목, 스트릭 보호권 사용 내역."
            />
            <Item
              what="유입 경로"
              detail="앱에 처음 들어온 경로 — 링크에 붙은 캠페인 값(utm_source·utm_medium·utm_campaign), 직전 사이트 주소의 도메인 부분만, 첫 진입 화면의 형태. 검색어가 붙는 전체 주소나 초대 코드 원문은 저장하지 않습니다."
            />
            <Item
              what="오류 신고"
              detail="신고 버튼으로 보낸 내용과, 함께 실려 가는 화면 위치·브라우저 종류·화면 크기·언어·시간대·앱 빌드 시각·직전 동작 기록. 운동 기록이나 사진은 신고에 포함되지 않습니다."
            />
          </ul>
        </Section>

        <Section title="2. 무엇에 쓰나요">
          <ul className="flex list-disc flex-col gap-1.5 pl-4">
            <li>운동 기록·크루·챌린지 같은 서비스 기능을 제공하기 위해</li>
            <li>같은 계정으로 다시 들어올 수 있게 하고, 기록을 잃지 않게 하기 위해</li>
            <li>크루가 서로의 운동을 확인하고 응원할 수 있게 하기 위해</li>
            <li>알림과 푸시를 보내기 위해</li>
            <li>오류를 찾아 고치기 위해</li>
            <li>
              어떤 경로로 들어온 사람이 실제로 앱을 쓰는지 파악하기 위해(시범 운영
              규모를 정하는 데 씁니다)
            </li>
          </ul>
          <p className="mt-1">
            <b className="text-fg">광고에 쓰지 않습니다.</b> 개인정보를 팔거나 광고
            목적으로 외부에 넘기지 않습니다.
          </p>
        </Section>

        <Section title="3. 얼마나 보관하고, 언제 지우나요">
          <ul className="flex list-disc flex-col gap-1.5 pl-4">
            <li>계정이 살아 있는 동안 보관합니다.</li>
            <li>
              삭제를 요청하면 계정과 그에 연결된 기록·사진·관계 정보를 지웁니다.
            </li>
            <li>
              지운 뒤에도{" "}
              <b className="text-fg">다른 사람의 기록에 해당하는 것</b>은 남습니다.
              함께한 챌린지의 집계나 크루가 이미 받은 알림이 그렇습니다.
            </li>
            <li>
              시범 운영 기간에는{" "}
              <b className="text-fg">
                앱에서 스스로 누르는 자동 탈퇴 기능이 아직 없습니다.
              </b>{" "}
              아래 방법으로 요청하면 운영자가 직접 처리합니다.
            </li>
          </ul>
        </Section>

        <Section title="4. 함께 쓰는 외부 서비스">
          <p>서비스를 돌리기 위해 아래를 씁니다. 이것이 전부입니다.</p>
          <ul className="mt-1 flex flex-col gap-2.5">
            <Item
              what="Supabase"
              detail="계정·운동 기록·사진을 저장하고 로그인을 처리합니다. 데이터베이스는 대한민국(서울) 지역에 있습니다."
            />
            <Item
              what="Vercel"
              detail="앱을 인터넷에 서비스합니다(호스팅). 접속 과정에서 통상적인 서버 접속 기록이 남습니다."
            />
            <Item
              what="카카오 로그인"
              detail="카카오로 로그인을 선택한 경우에만, 계정 연결에 필요한 정보를 카카오에서 받습니다."
            />
            <Item
              what="구글 로그인"
              detail="구글로 로그인을 선택한 경우에만, 계정 연결에 필요한 정보를 구글에서 받습니다."
            />
            <Item
              what="브라우저 푸시"
              detail="푸시 알림을 켠 경우, 알림은 사용하는 브라우저·운영체제 제조사(애플·구글 등)의 푸시 서버를 거쳐 기기에 도착합니다. 웹 푸시의 표준 동작입니다."
            />
          </ul>
          <p className="mt-1">
            분석 도구(구글 애널리틱스 등)나 광고 추적 도구는{" "}
            <b className="text-fg">쓰지 않습니다.</b> 유입 경로는 위 1번에 적은
            범위에서 GND가 직접 기록합니다.
          </p>
        </Section>

        <Section title="5. 삭제나 열람을 요청하려면">
          <p>
            <b className="text-fg">앱 안에서 요청할 수 있습니다.</b> 로그인한 상태로{" "}
            <b className="text-fg">프로필 → ⚙️ → 계정 → 「내 데이터 삭제 요청」</b>에
            적어 보내면 운영자에게 바로 전달됩니다. 어느 계정에서 온 요청인지 함께
            전달되므로 따로 신원을 증명할 필요가 없습니다.
          </p>
          <p>
            요청할 수 있는 것: <b className="text-fg">계정과 데이터 전체 삭제</b>,{" "}
            <b className="text-fg">인증사진만 삭제</b>,{" "}
            <b className="text-fg">내 데이터 열람</b>.
          </p>
          <p>
            로그인이 되지 않아 앱에 들어올 수 없다면, GND를 알려 준 크루장에게 말해
            주세요. 운영자에게 전달됩니다.
          </p>
          {OPERATOR_CONTACT && (
            <p>
              문의: <b className="text-fg">{OPERATOR_CONTACT}</b>
            </p>
          )}
        </Section>

        <Section title="6. 만 14세 미만">
          <p>
            GND는 만 14세 미만을 대상으로 하지 않으며 가입을 권하지 않습니다. 만 14세
            미만의 정보가 수집된 것을 알게 되면 지웁니다.
          </p>
        </Section>

        <p className="px-1 pb-2 text-[11px] leading-relaxed text-faint">
          이 방침은 GND 시범 운영에 적용됩니다. 내용이 바뀌면 최종 개정일을 고치고 앱
          안에서 알려드립니다.
        </p>
      </div>
    </main>
  );
}
