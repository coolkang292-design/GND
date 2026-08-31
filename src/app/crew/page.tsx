"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CrewList } from "@/components/crew/crew-list";
import { CrewSearchResult } from "@/components/crew/crew-search-result";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import {
  acceptCrewRequest,
  getIncomingCrewRequests,
  getMyCrew,
  rejectCrewRequest,
  removeCrew,
  searchProfileByNickname,
  sendCrewRequest,
} from "@/lib/crew-link";
import { permanentAccountMessage } from "@/lib/domain/account-gate";
import {
  isSearchable,
  type CrewMember,
  type CrewRequest,
  type CrewSearchResult as Result,
} from "@/lib/domain/crew-link";
import { SocialError } from "@/lib/social";

export default function CrewPage() {
  const { userId, loading, configured } = useAuth();
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [requests, setRequests] = useState<CrewRequest[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<CrewMember | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [crew, inbox] = await Promise.all([
      getMyCrew(),
      getIncomingCrewRequests(),
    ]);
    setMembers(crew);
    setRequests(inbox);
  }, []);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [crew, inbox] = await Promise.all([
          getMyCrew(),
          getIncomingCrewRequests(),
        ]);
        if (cancelled) return;
        setMembers(crew);
        setRequests(inbox);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  function toast(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  function withPending<T>(key: string, run: () => Promise<T>) {
    setPendingIds((s) => new Set(s).add(key));
    return run().finally(() =>
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      }),
    );
  }

  async function search() {
    if (!isSearchable(query)) return;
    setSearching(true);
    setSearched(false);
    try {
      setResult(await searchProfileByNickname(query));
      setSearched(true);
    } catch {
      toast("검색에 실패했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setSearching(false);
    }
  }

  async function act(target: Result) {
    await withPending(target.id, async () => {
      try {
        if (target.relation === "request_received" && target.requestId) {
          await acceptCrewRequest(target.requestId);
          toast(`${target.nickname}님과 크루가 됐어요 🤝`);
        } else {
          const status = await sendCrewRequest(target.id);
          toast(
            status === "accepted"
              ? `${target.nickname}님과 크루가 됐어요 🤝`
              : `${target.nickname}님에게 요청을 보냈어요`,
          );
        }
        await reload();
        setResult(await searchProfileByNickname(query));
      } catch (e) {
        const code = e instanceof SocialError ? e.code : null;
        // request_exists는 거절 후 7일 쿨다운에도 쓰인다(0038). 거절당한 사실이
        // 드러나지 않도록 문구를 나누지 않는다.
        // 0094: 익명 계정은 크루 요청을 보낼 수 없다. "안 된다"로 끝내지 않고
        //        다음에 뭘 하면 되는지까지 한 문장에 담는다.
        if (code === "permanent_account_required")
          toast(permanentAccountMessage("crew"));
        else if (code === "already_crew") toast("이미 크루예요");
        else if (code === "request_exists") toast("이미 요청을 보냈어요");
        else if (code === "target_not_found") toast("그 사람을 찾을 수 없어요");
        else toast("요청을 보내지 못했어요");
      }
    });
  }

  async function accept(request: CrewRequest) {
    await withPending(request.requestId, async () => {
      try {
        await acceptCrewRequest(request.requestId);
        toast(`${request.nickname}님과 크루가 됐어요 🤝`);
        await reload();
      } catch {
        toast("수락하지 못했어요");
      }
    });
  }

  async function reject(request: CrewRequest) {
    await withPending(request.requestId, async () => {
      try {
        await rejectCrewRequest(request.requestId);
        await reload();
      } catch {
        toast("거절하지 못했어요");
      }
    });
  }

  async function remove(member: CrewMember) {
    if (!confirm(`${member.nickname}님과 크루를 해제할까요?`)) return;
    await withPending(member.id, async () => {
      try {
        await removeCrew(member.id);
        toast("크루를 해제했어요");
        await reload();
      } catch {
        toast("해제하지 못했어요");
      }
    });
  }

  if (!configured) return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 pb-10">
      <header className="flex items-center justify-between gap-2 pt-3 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">크루</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            서로 수락한 사람끼리 운동 소식을 주고받아요
          </p>
        </div>
        <Link
          href="/profile"
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted"
        >
          닫기
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="닉네임을 정확히 입력하세요"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-2 text-[14px]"
          />
          <button
            type="button"
            disabled={!isSearchable(query) || searching}
            onClick={() => void search()}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-[13px] font-extrabold text-accent-ink disabled:bg-line disabled:text-muted"
          >
            찾기
          </button>
        </div>
        {result && (
          <CrewSearchResult
            result={result}
            pending={pendingIds.has(result.id)}
            onAction={(r) => void act(r)}
          />
        )}
        {searched && !result && (
          <p className="px-1 text-[12.5px] text-muted">
            그 닉네임을 쓰는 사람이 없어요. 닉네임은 정확히 일치해야 찾을 수
            있어요.
          </p>
        )}
      </section>

      {ready && (
        <CrewList
          members={members}
          requests={requests}
          pendingIds={pendingIds}
          onAccept={(r) => void accept(r)}
          onReject={(r) => void reject(r)}
          onRemove={(m) => void remove(m)}
          onSelect={(m) => setSelected(m)}
        />
      )}

      {notice && (
        <p className="fixed inset-x-4 bottom-6 mx-auto max-w-md rounded-full bg-black/80 px-4 py-2.5 text-center text-[13px] font-bold text-white">
          {notice}
        </p>
      )}

      {selected && (
        <MemberProfileSheet
          userId={selected.id}
          nickname={selected.nickname}
          avatarUrl={selected.avatarUrl}
          viewerId={userId ?? undefined}
          source="crew"
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
