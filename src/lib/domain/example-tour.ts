import type { BreakdownExercise, BreakdownSet } from "@/components/workout/set-breakdown";
import type { FeedItem, ReactionType } from "@/lib/social";
import { summarizeVolume, type VolumeSet } from "@/lib/domain/volume";
import type { SessionThread, ThreadComment } from "@/lib/domain/session-comments";
import { evolutionAvatarSrc, type CharacterVariant } from "@/lib/domain/character-variant";

/**
 * "챌린지는 이렇게 흘러가요" 예시 화면의 대본 (2026-11-26, `/feed/example`).
 *
 * 크루가 0명인 새 회원은 피드가 비어 있어서 챌린지 안에서 무슨 일이 일어나는지 볼 길이 없다.
 * 진짜 회원의 운동을 보여 주면 "크루만 본다"는 약속이 깨지므로 **가짜 회원의 하루**를 보여 준다.
 *
 * ⚠️ 아무 DB에도 쓰지 않고 아무 DB에서도 읽지 않는다. 운영 DB에 가짜 계정을 만들면
 *    닉네임 검색에 뜨고 통계가 섞이고 "프로필 8개" 기준선이 틀어진다.
 * ⚠️ id는 전부 `example-`로 시작한다. 진짜 사용자 id(uuid)와 모양이 달라서
 *    `character-faces`가 서버에 묻지 않고, 혹시 어딘가로 새도 서버가 거절한다.
 * ⚠️ 말투는 2026-11-26 실제 피드(캡션·댓글)의 **말투만** 따랐다 — 짧은 반말, ㅋㅋ, 순위 농담,
 *    퇴근·피곤 같은 생활 이야기. 실제 회원 문장은 한 줄도 옮기지 않았다.
 * ⚠️ 사진은 `public/example-tour/`의 연출 사진이다(GPT 생성, 실제 회원 아님).
 *    작업지시서: `docs/example-tour-photo-prompts.md`
 * ⚠️ 날짜는 `now` 기준으로 움직이고 내용은 고정이다 — 언제 열어도 "어제 하루"로 읽힌다.
 */

export const EXAMPLE_ID_PREFIX = "example-";

type Person = {
  id: string;
  nickname: string;
  /** 얼굴 그림이 안 뜰 때만 보이는 대체 이모지 (진짜 프로필과 같은 규칙) */
  avatarUrl: string;
  /**
   * 진화 캐릭터 (2026-11-26 사용자 지시 "프로필을 캐릭터 진화용으로").
   * 진짜 회원처럼 프로필 자리에 그 단계의 얼굴이 뜬다. 단계는 이야기에 맞췄다 —
   * 꾸준한 사람일수록 높고, 어제 처음 온 유진은 1단계.
   */
  character: { stage: number; variant: CharacterVariant };
};

/** 예시 회원 6명 — 닉네임은 실제 회원들처럼 별명으로 */
export const EXAMPLE_PEOPLE = {
  jieun: { id: "example-jieun", nickname: "한강새벽런", avatarUrl: "🏃‍♀️", character: { stage: 4, variant: "female" } },
  minsu: { id: "example-minsu", nickname: "하체는배신안함", avatarUrl: "🏋️", character: { stage: 5, variant: "male" } },
  sora: { id: "example-sora", nickname: "폼롤러요정", avatarUrl: "🧘‍♀️", character: { stage: 3, variant: "female" } },
  hyunwoo: { id: "example-hyunwoo", nickname: "퇴근후페달", avatarUrl: "🚴", character: { stage: 3, variant: "male" } },
  yujin: { id: "example-yujin", nickname: "헬린이1일차", avatarUrl: "🌱", character: { stage: 1, variant: "female" } },
  weekend: { id: "example-weekend", nickname: "주말에몰아서", avatarUrl: "😴", character: { stage: 2, variant: "male" } },
} as const satisfies Record<string, Person>;

/**
 * 예시 회원의 얼굴 그림 — `primeCharacterFaces`에 넣으면 `UserAvatar`가 서버에 묻지 않고 바로 쓴다.
 * 경로는 진짜 회원과 같은 `evolutionAvatarSrc`가 만든다.
 */
export function exampleCharacterFaces(): [string, string | null][] {
  return Object.values(EXAMPLE_PEOPLE).map((p) => [
    p.id,
    evolutionAvatarSrc(p.character.stage, p.character.variant),
  ]);
}

type Key = keyof typeof EXAMPLE_PEOPLE;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 오늘 0시(기기 시간대) */
function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 어제 `h:m` */
function yesterdayAt(now: Date, h: number, m: number): Date {
  const d = new Date(startOfToday(now).getTime() - DAY_MS);
  d.setHours(h, m, 0, 0);
  return d;
}

function minutesAfter(base: Date, min: number): Date {
  return new Date(base.getTime() + min * 60 * 1000);
}

// ── 세트 만들기 ───────────────────────────────────────────────

function set(partial: Partial<BreakdownSet>): BreakdownSet {
  return { weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0, done: true, ...partial };
}

function weight(name: string, rows: [kg: number, reps: number][]): BreakdownExercise {
  return {
    name,
    exerciseType: "weight",
    measure: "reps",
    sets: rows.map(([kg, reps]) => set({ weightKg: kg, reps })),
  };
}

function timed(name: string, secondsPerSet: number[]): BreakdownExercise {
  return {
    name,
    exerciseType: "bodyweight",
    measure: "time",
    sets: secondsPerSet.map((s) => set({ durationMin: Math.floor(s / 60), durationSec: s })),
  };
}

function cardio(name: string, km: number, minutes: number): BreakdownExercise {
  return {
    name,
    exerciseType: "cardio",
    measure: null,
    sets: [set({ distanceKm: km, durationMin: minutes, durationSec: minutes * 60 })],
  };
}

/** 피드가 쓰는 것과 같은 집계 함수로 숫자 줄을 만든다 — 여기서 따로 계산하지 않는다 */
function volumeOf(exercises: BreakdownExercise[]) {
  const sets: VolumeSet[] = exercises.flatMap((ex) =>
    ex.sets.map((s) => ({
      exerciseType: ex.exerciseType,
      isCompleted: s.done !== false,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSeconds: s.durationSec ?? s.durationMin * 60,
      distanceMeters: s.distanceKm * 1000,
    })),
  );
  return summarizeVolume(sets);
}

// ── 댓글 만들기 ───────────────────────────────────────────────

type Line = { id: string; by: Key; body: string; after: number; replies?: Omit<Line, "replies">[] };

function thread(postedAt: Date, lines: Line[], cheers: SessionThread["cheerTally"] = []): SessionThread {
  const toComment = (l: Omit<Line, "replies">, parentId: string | null): ThreadComment => ({
    id: `example-c-${l.id}`,
    senderId: EXAMPLE_PEOPLE[l.by].id,
    body: l.body,
    createdAt: minutesAfter(postedAt, l.after),
    fromCheer: false,
    parentId,
    editedAt: null,
    replies: [],
  });
  return {
    comments: lines.map((l) => ({
      ...toComment(l, null),
      replies: (l.replies ?? []).map((r) => toComment(r, `example-c-${l.id}`)),
    })),
    cheerTally: cheers,
    cheerTotal: cheers.reduce((sum, c) => sum + c.count, 0),
  };
}

const PEOPLE_MAP: FeedItem["people"] = new Map(
  Object.values(EXAMPLE_PEOPLE).map((p) => [p.id, { nickname: p.nickname, avatarUrl: p.avatarUrl }]),
);

function reactions(likes: number): Record<ReactionType, number> {
  return { like: likes, fire: 0, clap: 0 };
}

function photo(name: string, order = 0) {
  return { id: `example-photo-${name}`, url: `/example-tour/${name}.webp`, source: "camera" as const, sortOrder: order };
}

type PostInput = {
  key: string;
  who: Key;
  at: Date;
  minutes: number;
  caption: string | null;
  exercises: BreakdownExercise[];
  photos: ReturnType<typeof photo>[];
  streak: number;
  recordNote?: string;
  likers: Key[];
  thread: SessionThread;
};

function post(p: PostInput): FeedItem {
  const person = EXAMPLE_PEOPLE[p.who];
  const sessionId = `example-session-${p.key}`;
  return {
    sessionId,
    sessionIds: [sessionId],
    cursorAt: p.at,
    userId: person.id,
    nickname: person.nickname,
    avatarUrl: person.avatarUrl,
    title: p.caption,
    completedAt: p.at,
    durationMinutes: p.minutes,
    exerciseNames: p.exercises.map((e) => e.name),
    volume: volumeOf(p.exercises),
    photos: p.photos,
    streak: p.streak,
    recordNote: p.recordNote ?? null,
    progressNote: null,
    progressEvent: null,
    tabataMinutes: null,
    breakdown: p.exercises,
    reactions: reactions(p.likers.length),
    myReactions: new Set(),
    thread: p.thread,
    likers: p.likers.map((k) => EXAMPLE_PEOPLE[k].id),
    people: PEOPLE_MAP,
  };
}

/**
 * 어제 하루의 피드 — **최신이 위** (진짜 피드와 같은 순서).
 * 아침 러닝 → 오후 첫 운동 → 퇴근 후 자전거 → 저녁 하체 → 자기 전 스트레칭.
 */
export function buildExampleFeed(now: Date): FeedItem[] {
  const jieunAt = yesterdayAt(now, 7, 12);
  const yujinAt = yesterdayAt(now, 15, 24);
  const hyunwooAt = yesterdayAt(now, 19, 41);
  const minsuAt = yesterdayAt(now, 21, 3);
  const soraAt = yesterdayAt(now, 22, 47);

  return [
    post({
      key: "sora",
      who: "sora",
      at: soraAt,
      minutes: 24,
      caption: "자기 전에 스트레칭이라도.. 출석은 해야지",
      exercises: [timed("폼롤러 마사지", [300, 300]), timed("햄스트링 스트레칭", [60, 60, 60]), timed("플랭크", [45, 45])],
      photos: [photo("sora-stretch")],
      streak: 2,
      likers: ["hyunwoo", "jieun", "yujin"],
      thread: thread(soraAt, [
        {
          id: "s1",
          by: "hyunwoo",
          body: "스트레칭도 출석 인정이냐ㅋㅋ",
          after: 6,
          replies: [{ id: "s1r", by: "sora", body: "플랭크 했잖아 인정해줘", after: 9 }],
        },
      ]),
    }),
    post({
      key: "minsu",
      who: "minsu",
      at: minsuAt,
      minutes: 58,
      caption: "💀 오늘 다 털렸다",
      exercises: [
        weight("바벨 스쿼트", [[60, 10], [70, 8], [80, 6], [85, 5], [70, 8]]),
        weight("루마니안 데드리프트", [[60, 10], [60, 10], [60, 10], [60, 8]]),
        weight("덤벨 런지", [[16, 12], [16, 12], [16, 10]]),
      ],
      photos: [photo("minsu-squat", 0), photo("minsu-dumbbell", 1)],
      streak: 3,
      recordNote: "바벨 스쿼트 85kg",
      likers: ["jieun", "yujin", "hyunwoo", "sora", "weekend"],
      thread: thread(
        minsuAt,
        [
          { id: "m1", by: "jieun", body: "내일 계단 조심ㅋㅋㅋ", after: 4 },
          {
            id: "m2",
            by: "yujin",
            body: "85.. 저는 오늘 봉만 들었는데",
            after: 12,
            replies: [{ id: "m2r", by: "minsu", body: "다 봉부터 시작함 ㅋㅋ 꾸준히만 하면 됨", after: 20 }],
          },
        ],
        [
          { type: "fire", count: 2 },
          { type: "power", count: 1 },
        ],
      ),
    }),
    post({
      key: "hyunwoo",
      who: "hyunwoo",
      at: hyunwooAt,
      minutes: 35,
      caption: "퇴근하고 바로 옴. 오늘도 겨우 출석",
      exercises: [cardio("실내 자전거", 14.2, 35)],
      photos: [photo("hyunwoo-bike")],
      streak: 4,
      likers: ["minsu", "jieun"],
      thread: thread(hyunwooAt, [
        {
          id: "h1",
          by: "minsu",
          body: "2등 자리 내놔라 ㅡㅡ",
          after: 15,
          replies: [{ id: "h1r", by: "hyunwoo", body: "못 줌 ㅋㅋㅋ", after: 18 }],
        },
      ]),
    }),
    post({
      key: "yujin",
      who: "yujin",
      at: yujinAt,
      minutes: 41,
      caption: "첫 인증! 잘 부탁드려요🙏",
      exercises: [
        weight("랫 풀다운", [[25, 12], [25, 12], [25, 10]]),
        weight("레그 프레스", [[60, 12], [60, 12], [60, 12]]),
        cardio("트레드밀 걷기", 1.5, 15),
      ],
      photos: [photo("yujin-mirror")],
      streak: 1,
      likers: ["jieun", "minsu", "sora", "hyunwoo"],
      thread: thread(yujinAt, [
        { id: "y1", by: "jieun", body: "환영해요!! 첫날 40분이면 잘한거예요", after: 8 },
        {
          id: "y2",
          by: "sora",
          body: "저도 처음엔 기구 쓰는 법 몰라서 엄청 헤맸어요ㅋㅋ",
          after: 31,
          replies: [{ id: "y2r", by: "yujin", body: "레그프레스 의자 맞추는 데만 5분 걸림ㅋㅋ", after: 40 }],
        },
      ]),
    }),
    post({
      key: "jieun",
      who: "jieun",
      at: jieunAt,
      minutes: 32,
      caption: "🔥 컨디션 좋았다",
      exercises: [cardio("러닝", 5.2, 32)],
      photos: [photo("jieun-run")],
      streak: 6,
      likers: ["minsu", "sora", "hyunwoo"],
      thread: thread(
        jieunAt,
        [
          {
            id: "j1",
            by: "hyunwoo",
            body: "아침 7시에 이게 되나..",
            after: 95,
            replies: [{ id: "j1r", by: "jieun", body: "전날 밤에 신발 꺼내두면 됨ㅋㅋ", after: 110 }],
          },
        ],
        [{ type: "clap", count: 2 }],
      ),
    }),
  ];
}

// ── 챌린지 줄거리 ─────────────────────────────────────────────

export type ExampleStanding = {
  who: Person;
  /** 지금까지 한 운동 횟수 */
  done: number;
  /** 지금까지의 목표 횟수 (주 3회 × 지난 주 수) */
  target: number;
};

export type ExampleChallenge = {
  title: string;
  startDate: Date;
  endDate: Date;
  /** 오늘이 며칠째인가 (1부터) */
  day: number;
  totalDays: number;
  participants: Person[];
  goals: string[];
  standings: ExampleStanding[];
  result: { finishers: number; total: number; workouts: number; cheers: number; comments: number };
};

/** 3주 챌린지의 9일째 */
export function buildExampleChallenge(now: Date): ExampleChallenge {
  const today = startOfToday(now);
  const day = 9;
  const totalDays = 21;
  const startDate = new Date(today.getTime() - (day - 1) * DAY_MS);
  const endDate = new Date(startDate.getTime() + (totalDays - 1) * DAY_MS);
  const p = EXAMPLE_PEOPLE;
  const target = 4; // 1주차 3회 + 2주차 2일째까지 1회
  return {
    title: "3주 동안 주 3회 운동",
    startDate,
    endDate,
    day,
    totalDays,
    participants: [p.jieun, p.minsu, p.hyunwoo, p.sora, p.yujin, p.weekend],
    goals: ["주 3회 운동", "유산소 주 90분", "하체 운동 주 2회"],
    standings: [
      { who: p.jieun, done: 6, target },
      { who: p.hyunwoo, done: 5, target },
      { who: p.minsu, done: 5, target },
      { who: p.sora, done: 4, target },
      { who: p.weekend, done: 2, target },
      { who: p.yujin, done: 1, target },
    ],
    result: { finishers: 5, total: 6, workouts: 71, cheers: 186, comments: 94 },
  };
}

/** 이 id가 예시 화면의 가짜 것인가 */
export function isExampleId(id: string): boolean {
  return id.startsWith(EXAMPLE_ID_PREFIX);
}
