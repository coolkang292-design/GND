import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreatorIndexPage() {
  const db = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) notFound();
  const { data, error } = await db
    .from("challenges")
    .select("id,name,status,start_date,end_date")
    .eq("created_by", user.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Creator challenges could not be loaded");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 pb-16 pt-5 text-text">
      <header className="flex items-center gap-3">
        <Link href="/challenge" className="rounded-card-sm border border-line px-3 py-2 text-sm font-bold">
          ← 챌린지
        </Link>
        <div>
          <h1 className="text-xl font-black">Creator Studio</h1>
          <p className="text-xs text-muted">내가 운영하는 챌린지만 표시합니다</p>
        </div>
      </header>
      {(data ?? []).length === 0 ? (
        <section className="rounded-card border border-line bg-surface p-6 text-center text-sm text-muted">
          운영 중인 챌린지가 없어요. 챌린지를 만들면 여기에서 관리할 수 있어요.
        </section>
      ) : (
        <section className="flex flex-col gap-2" aria-label="내 운영 챌린지">
          {(data ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/creator/${encodeURIComponent(c.id)}`}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
            >
              <div className="min-w-0">
                <p className="truncate font-extrabold">{c.name}</p>
                <p className="mt-1 text-xs text-muted">{c.start_date} ~ {c.end_date} · {c.status}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-accent">운영 관리 →</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
