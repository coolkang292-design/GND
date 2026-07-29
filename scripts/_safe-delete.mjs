/**
 * 검증 스크립트 공용 삭제 가드.
 *
 * 이 저장소의 검증 스크립트는 **프로덕션 Supabase**에 직접 붙는다. 스테이징이
 * 없어서 그렇다. 그래서 스크립트 버그 하나가 실사용자 계정을 지울 수 있고,
 * profiles·workout_sessions·point_transactions가 전부 auth.users를
 * on delete cascade로 물고 있어 복구가 불가능하다.
 *
 * 막는 방식은 닉네임 하드코딩이 아니라 **시작 시점 스냅샷**이다.
 *
 *   실행이 시작될 때 존재하던 계정 = 이 실행이 만들지 않았음 = 삭제 금지
 *
 * 닉네임 목록을 박아두면 새로 가입한 실사용자가 보호받지 못한다. 스냅샷은
 * 그 문제가 없다 — 앞으로 가입할 사람도 자동으로 보호된다.
 *
 * 사용법:
 *
 *   import { createDeleteGuard } from "./_safe-delete.mjs";
 *   const guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });
 *   // 계정을 만들 때마다
 *   guard.register(user.id);
 *   // 정리할 때
 *   await guard.cleanup();
 */

/** 조회 실패 시 삭제를 전부 막기 위한 표식 (fail-closed). */
const SNAPSHOT_FAILED = Symbol("snapshot-failed");

async function fetchExistingUserIds(url, serviceKey) {
  const ids = new Set();
  // auth 유저 목록이 원천이다. profiles는 프로필을 안 만든 계정을 놓친다.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${url}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) throw new Error(`auth 목록 조회 실패 (${res.status})`);
    const body = await res.json();
    const users = body?.users ?? [];
    for (const u of users) ids.add(u.id);
    if (users.length < 200) break;
  }
  return ids;
}

export async function createDeleteGuard({ url, serviceKey }) {
  let preexisting;
  try {
    preexisting = await fetchExistingUserIds(url, serviceKey);
    console.log(`🛡  삭제 가드: 기존 계정 ${preexisting.size}개를 보호 대상으로 잠갔습니다`);
  } catch (e) {
    // 스냅샷을 못 뜨면 "무엇이 실계정인지" 모르는 상태다. 그 상태에서 삭제를
    // 진행하는 것보다 정리를 포기하고 떠돌이 테스트 계정을 남기는 편이 낫다.
    preexisting = SNAPSHOT_FAILED;
    console.error(`🛡  삭제 가드: 스냅샷 실패 (${e.message}) — 이번 실행은 아무것도 삭제하지 않습니다`);
  }

  const created = new Set();

  function register(id) {
    if (!id) throw new Error("guard.register: id가 비어 있습니다");
    created.add(id);
  }

  /** 지워도 되는 id인지 판정. 문제가 있으면 이유를 돌려준다(없으면 null). */
  function reasonToRefuse(id) {
    if (preexisting === SNAPSHOT_FAILED) return "시작 시점 스냅샷을 못 떴다";
    if (!id) return "id가 비어 있다";
    if (!created.has(id)) return "이 실행이 만든 계정이 아니다";
    if (preexisting.has(id)) return "실행 시작 시점에 이미 존재하던 계정이다";
    return null;
  }

  async function cleanup() {
    let deleted = 0;
    const refused = [];
    for (const id of created) {
      const why = reasonToRefuse(id);
      if (why) {
        refused.push({ id, why });
        continue;
      }
      const res = await fetch(`${url}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (res.ok) deleted++;
      else refused.push({ id, why: `삭제 응답 ${res.status}` });
    }

    if (refused.length === 0) {
      console.log(`🛡  삭제 가드: 이번 실행이 만든 ${deleted}개를 정리했습니다`);
      return { deleted, refused };
    }

    console.error(`🛡  삭제 가드: ${deleted}개 정리, ${refused.length}개 거부`);
    for (const r of refused) console.error(`     거부 ${r.id} — ${r.why}`);
    console.error(
      "     거부된 계정은 남아 있습니다. 실계정을 지울 뻔한 것이므로 원인을 확인하세요.",
    );
    return { deleted, refused };
  }

  /**
   * 기존 deleteAuthUser(id) 자리에 그대로 끼워 넣는 드롭인 교체본.
   *
   * register()를 안 부르는 스크립트를 위한 모드다. 스냅샷에 없는 계정만 지우므로
   * "실행 시작 시점에 있던 계정"은 전부 보호된다 — 실계정을 지우는 사고는 이걸로
   * 막힌다.
   *
   * ⚠ 한계: 스크립트가 도는 도중에 **다른 경로로** 새 계정이 생기면(실사용자가
   *   마침 그때 가입) 그 계정은 스냅샷에 없어 삭제 대상이 될 수 있다. 창이
   *   좁지만 0은 아니다. register()+cleanup()을 쓰는 쪽이 그 구멍까지 막는다
   *   (cheer-points-check.mjs가 그 방식이다).
   */
  async function deleteIfCreatedThisRun(id) {
    if (preexisting === SNAPSHOT_FAILED) {
      console.error(`🛡  삭제 거부 ${id} — 시작 시점 스냅샷을 못 떴다`);
      return { ok: false, refused: "snapshot_failed" };
    }
    if (preexisting.has(id)) {
      console.error(`🛡  삭제 거부 ${id} — 실행 시작 시점에 이미 존재하던 계정이다`);
      return { ok: false, refused: "preexisting" };
    }
    const res = await fetch(`${url}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    return { ok: res.ok, status: res.status };
  }

  return {
    register,
    cleanup,
    reasonToRefuse,
    deleteIfCreatedThisRun,
    createdCount: () => created.size,
  };
}
