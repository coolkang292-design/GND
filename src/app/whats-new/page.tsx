import Link from "next/link";
import { RELEASE_NOTES, parseHighlight } from "@/lib/domain/release-notes";

export const metadata = { title: "새 소식 · GND" };

/** 새 소식 — 배포 알림 클릭 시 도달하는 릴리스 노트 상세. 최신순. */
export default function WhatsNewPage() {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <Link
          href="/home"
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-lg"
        >
          ←
        </Link>
        <h1 className="text-base font-extrabold">새 소식</h1>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        {RELEASE_NOTES.map((r) => (
          <section
            key={r.id}
            className="rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <p className="text-[11px] font-bold text-faint">{r.date}</p>
            <h2 className="mt-1 text-lg font-extrabold">{r.title}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{r.summary}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {r.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug">
                  <span aria-hidden className="flex-none font-extrabold text-accent">
                    ·
                  </span>
                  {/* ⚠️ `{h}`를 그대로 그리지 마라. 데이터에 `**굵게**`·`` `코드` ``가
                      들어 있어서, 그러면 화면에 별표와 백틱이 그대로 보인다
                      (2026-08-08까지 실제로 그렇게 보이고 있었다). */}
                  <span>
                    {parseHighlight(h).map((t, j) =>
                      t.kind === "strong" ? (
                        <strong key={j} className="font-extrabold">
                          {t.text}
                        </strong>
                      ) : t.kind === "code" ? (
                        <code
                          key={j}
                          className="rounded bg-surface-2 px-1 py-0.5 text-[12px]"
                        >
                          {t.text}
                        </code>
                      ) : t.kind === "link" ? (
                        /* 공지에서 바로 그 화면으로 보낸다. 경로가 앱 안이라는
                           보증은 파서가 한다(release-notes.ts) — 여기서 다시
                           검사하지 않는 대신, 그 규칙을 무르지 마라. */
                        <Link
                          key={j}
                          href={t.href}
                          className="font-extrabold text-accent underline underline-offset-2"
                        >
                          {t.text}
                        </Link>
                      ) : (
                        <span key={j}>{t.text}</span>
                      ),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
