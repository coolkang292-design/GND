"use client";

import { useMemo, useState } from "react";
import type { ChurnRisk, UserStatus } from "@/lib/domain/analytics";

/**
 * 클라이언트로 내려보내는 필드는 화면·CSV에 실제로 쓰는 것만이다.
 * userId·이메일·원본 타임스탬프는 서버에서 잘라내고 보내지 않는다 —
 * 화면에 안 쓰는 값이 RSC 페이로드에 묻어 나가지 않게 한다.
 */
export interface UserTableRow {
  nickname: string;
  avatar: string;
  stageName: string;
  level: number;
  workoutsInPeriod: number;
  streakDays: number;
  lastActiveLabel: string;
  status: UserStatus;
  churnRisk: ChurnRisk;
}

const STATUSES: (UserStatus | "전체")[] = ["전체", "활성", "주의", "휴면"];

function statusClass(s: UserStatus): string {
  if (s === "활성") return "active";
  if (s === "주의") return "warn";
  return "sleep";
}

function riskClass(r: ChurnRisk): string {
  if (r === "낮음") return "low";
  if (r === "중간") return "mid";
  return "high";
}

/** CSV 셀에 쉼표·따옴표·줄바꿈이 있으면 열이 밀린다 */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function UserTable({
  rows,
  periodDays,
}: {
  rows: UserTableRow[];
  periodDays: number;
}) {
  const [status, setStatus] = useState<UserStatus | "전체">("전체");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === "전체" || r.status === status) &&
          (r.nickname.includes(query) || r.stageName.includes(query)),
      ),
    [rows, status, query],
  );

  function exportCsv() {
    const head = [
      "사용자",
      "성장 단계",
      "레벨",
      `${periodDays}일 운동`,
      "연속 기록",
      "마지막 활동",
      "상태",
      "이탈 위험",
    ].join(",");
    const body = visible.map((r) =>
      [
        r.nickname,
        r.stageName,
        r.level,
        r.workoutsInPeriod,
        r.streakDays,
        r.lastActiveLabel,
        r.status,
        r.churnRisk,
      ]
        .map(csvCell)
        .join(","),
    );
    // BOM을 붙여야 엑셀이 한글을 안 깬다
    const blob = new Blob(["﻿" + [head, ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gnd-users-${periodDays}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel table-panel" id="users">
      <div className="panel-title table-top">
        <div>
          <p className="kicker">USER HEALTH</p>
          <h2>사용자 활동 현황</h2>
        </div>
        <div className="filters">
          <button className="ghost" onClick={exportCsv}>
            ↓ CSV 내보내기
          </button>
          <label className="search">
            ⌕&nbsp;
            <input
              placeholder="이름 또는 단계 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value.trim())}
            />
          </label>
          <div className="status-buttons">
            {STATUSES.map((s) => (
              <button
                key={s}
                className={s === status ? "on" : ""}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>사용자</th>
              <th>성장 단계</th>
              {/* 기간을 바꾸면 헤더 문구도 같이 바뀐다 — 90일인데 "28일"이면 틀린 화면 */}
              <th>{periodDays}일 운동</th>
              <th>스트릭</th>
              <th>마지막 활동</th>
              <th>상태</th>
              <th>이탈 위험</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 24, color: "#858893" }}>
                  조건에 맞는 사용자가 없습니다.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.nickname}>
                  <td>
                    <div className="user">
                      <span className="avatar">{r.avatar}</span>
                      <b>{r.nickname}</b>
                    </div>
                  </td>
                  <td>
                    <span className="pill level">
                      {r.stageName} · Lv.{r.level}
                    </span>
                  </td>
                  <td>
                    <b>{r.workoutsInPeriod}회</b>
                  </td>
                  <td>{r.streakDays ? `🔥 ${r.streakDays}일` : "—"}</td>
                  <td>{r.lastActiveLabel}</td>
                  <td>
                    <span className={`pill ${statusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <span className={`risk ${riskClass(r.churnRisk)}`}>
                      {r.churnRisk}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
