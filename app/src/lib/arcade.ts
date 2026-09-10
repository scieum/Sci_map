"use client";

import { CONCEPTS } from "@/data/concepts";
import { keystrokes } from "@/lib/keystrokes";
import { subjectNameOf } from "@/data/catalog";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadProgress, markConcept } from "@/lib/store";

/**
 * 개념 야구 — 타자(打字)로 타자(打者)를 세우는 게임.
 *
 * 규칙의 뼈대는 야구 그대로다. 한 타석에 개념 카드 하나가 투구로 날아오고,
 * 학생은 **정의를 읽고 표제어를 친다**. 맞히면 진루하고 놓치면 아웃이다.
 *
 * ★ 왜 정의 → 표제어인가. 이 앱에는 이미 같은 방향의 인출이 있다
 *   (data/quiz.ts 의 deriveShort). 게임이라고 다른 인출을 만들면 학생은 같은
 *   개념을 두 가지 방식으로 외우게 되고, 어느 쪽이 실제 시험에 쓰이는지
 *   알 수 없게 된다. 게임은 인출의 **포장**이지 다른 학습이 아니다.
 *
 * ★ 출제 범위는 `quizReady` 카드뿐이다. C8(사람 게이트)을 지나지 않은 카드는
 *   문항이 되지 않는다는 규칙(CLAUDE.md §9.1)이 게임이라고 느슨해지지 않는다.
 *   게이트를 지나지 않은 과목은 화면에서 "준비 중"으로 보인다 — 조용히
 *   빠지면 왜 안 나오는지 아무도 모른다.
 *
 * 이 파일은 **순수 규칙 + 저장소**다. 화면은 상태를 만들지 않고 여기 함수만
 * 부른다. 그래야 규칙을 고칠 때 화면을 헤집지 않는다.
 */

/* ────────────────────────────── 난이도 ────────────────────────────── */

export type LevelKey = "rookie" | "amateur" | "pro" | "master";

export interface Level {
  key: LevelKey;
  label: string;
  /** 한 타석의 제한 시간(초). 정의를 읽는 시간까지 포함한다 */
  seconds: number;
  /**
   * 이 타속(타/분)을 넘기면 타구가 한 단계 뻗는다.
   * 정의를 읽는 시간은 빼고 잰 값이라 순수 타자 속도에 가깝다.
   */
  targetKpm: number;
  note: string;
}

export const LEVELS: Record<LevelKey, Level> = {
  rookie: { key: "rookie", label: "초보", seconds: 24, targetKpm: 120, note: "천천히 읽고 쳐도 돼요" },
  amateur: { key: "amateur", label: "보통", seconds: 16, targetKpm: 200, note: "읽는 데 절반, 치는 데 절반" },
  pro: { key: "pro", label: "선수", seconds: 11, targetKpm: 300, note: "정의를 훑고 바로 쳐야 해요" },
  master: { key: "master", label: "마스터", seconds: 8, targetKpm: 420, note: "아는 개념만 남습니다" },
};

export const LEVEL_ORDER: LevelKey[] = ["rookie", "amateur", "pro", "master"];

/** 경기 길이 — 이닝 수 */
export const INNING_CHOICES = [1, 3, 6] as const;
export type Innings = (typeof INNING_CHOICES)[number];

/* ────────────────────────────── 투구(타석) ────────────────────────────── */

export interface Pitch {
  conceptId: string;
  /** 발문 — 개념의 정의 */
  prompt: string;
  /** 정답 — 표제어 */
  answer: string;
  /** 정답으로 인정하는 다른 표기 (영문명·구표기 별칭) */
  aliases: string[];
  subject: string;
  unit: string;
  /** 정답의 타수. 타속 계산과 난이도 어림에 쓴다 */
  strokes: number;
}

/** 게임에 쓸 수 있는 카드 — C8 을 지난 것만 (§9.1) */
const playable = () => CONCEPTS.filter((c) => c.quizReady && c.definition && c.term);

/** 과목별로 몇 장이 준비됐나. 범위 고르는 화면이 쓴다 */
export function poolBySubject(): { subject: string; count: number }[] {
  const n = new Map<string, number>();
  for (const c of CONCEPTS) {
    if (!n.has(c.subject)) n.set(c.subject, 0);
    if (c.quizReady && c.definition && c.term) n.set(c.subject, n.get(c.subject)! + 1);
  }
  return Array.from(n.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 한 경기의 투구 목록.
 *
 * 넉넉히 뽑아 둔다 — 9이닝을 무실책으로 끌면 타석이 몇 개나 설지 미리 알 수
 * 없다. 모자라면 처음으로 돌아가 다시 쓴다(같은 개념이 두 번 나오는 편이
 * 경기가 끊기는 것보다 낫다).
 */
export function drawPitches(subjects: string[], count = 120): Pitch[] {
  const wanted = new Set(subjects);
  let pool = playable();
  if (wanted.size > 0) {
    const narrowed = pool.filter((c) => wanted.has(c.subject));
    // 고른 과목에 준비된 카드가 없으면 범위를 좁히지 않는다 — 빈 경기장에
    // 학생을 세우는 것보다 전체에서 뽑는 편이 낫다
    if (narrowed.length >= 5) pool = narrowed;
  }
  const shuffled = shuffle(pool);
  const out: Pitch[] = [];
  for (let i = 0; i < count; i++) {
    const c = shuffled[i % shuffled.length];
    if (!c) break;
    out.push({
      conceptId: c.id,
      prompt: c.definition,
      answer: c.term,
      aliases: [c.english?.toLowerCase() ?? "", ...(c.aliases ?? [])].filter(Boolean),
      subject: c.subject,
      unit: c.unit,
      strokes: keystrokes(c.term),
    });
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 채점 — 데일리 단답과 **같은 잣대**다 (data/quiz.ts 의 checkShortAnswer).
 * 공백을 지우고 소문자로 맞춘다. 게임이라고 후하게 봐 주지 않는다.
 */
export function isHit(input: string, pitch: Pitch): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const v = norm(input);
  if (!v) return false;
  return v === norm(pitch.answer) || pitch.aliases.some((a) => v === norm(a));
}

/* ────────────────────────────── 경기 상태 ────────────────────────────── */

export type Hit = "out" | "single" | "double" | "triple" | "homer";

export const HIT_LABEL: Record<Hit, string> = {
  out: "아웃",
  single: "안타",
  double: "2루타",
  triple: "3루타",
  homer: "홈런",
};

/** 타구가 몇 루짜리인가. 아웃은 0 */
const BASES_OF: Record<Hit, number> = { out: 0, single: 1, double: 2, triple: 3, homer: 4 };

export interface Play {
  conceptId: string;
  term: string;
  given: string;
  hit: Hit;
  /** 이 타석의 타속. 놓쳤으면 0 */
  kpm: number;
  runs: number;
}

export interface GameState {
  innings: Innings;
  inning: number;
  outs: number;
  score: number;
  /** [1루, 2루, 3루] */
  bases: [boolean, boolean, boolean];
  combo: number;
  bestCombo: number;
  atBats: number;
  hits: number;
  /** 타속 평균을 내려고 쌓아 둔다 */
  totalStrokes: number;
  totalTypingMs: number;
  bestKpm: number;
  over: boolean;
  plays: Play[];
}

export function newGame(innings: Innings): GameState {
  return {
    innings,
    inning: 1,
    outs: 0,
    score: 0,
    bases: [false, false, false],
    combo: 0,
    bestCombo: 0,
    atBats: 0,
    hits: 0,
    totalStrokes: 0,
    totalTypingMs: 0,
    bestKpm: 0,
    over: false,
    plays: [],
  };
}

/**
 * 타구 판정 — **콤보가 타구를 키운다** (레퍼런스의 연승 부스트를 그대로 옮겼다).
 *
 *   기본        안타
 *   콤보 2      2루타
 *   콤보 3      3루타
 *   콤보 4 이상 홈런
 *   난이도 기준 타속을 넘기면 여기서 한 단계 더
 *
 * 콤보를 먼저 보고 속도를 나중에 보는 순서가 중요하다. 반대로 하면 빠르기만
 * 하면 홈런이 나와, 연달아 맞히는 일이 값을 잃는다. 이어 맞히는 것이 먼저고
 * 속도는 덤이다 — 학습에서도 그쪽이 옳다.
 *
 * @param comboBefore 이 타석 **직전까지의** 연속 정답 수
 */
export function judge(comboBefore: number, speed: number, level: Level): Hit {
  let step = 1;
  if (comboBefore >= 3) step = 4;
  else if (comboBefore >= 2) step = 3;
  else if (comboBefore >= 1) step = 2;
  if (speed >= level.targetKpm) step = Math.min(4, step + 1);
  return (["single", "double", "triple", "homer"] as const)[step - 1];
}

/**
 * 주자를 민다. 단순화한 규칙 — **모두 타구 수만큼 진루한다.**
 *
 * 실제 야구는 안타에 1루 주자가 3루까지 가기도 하지만, 그건 수비의 선택이라
 * 이 게임에는 재현할 근거가 없다. 재현할 수 없는 것을 지어내는 대신 규칙을
 * 하나로 못 박았다 — 학생이 결과를 예측할 수 있어야 콤보를 노릴 수 있다.
 */
function advance(bases: [boolean, boolean, boolean], n: number) {
  const next: [boolean, boolean, boolean] = [false, false, false];
  let runs = 0;
  for (let i = 0; i < 3; i++) {
    if (!bases[i]) continue;
    const to = i + n;
    if (to >= 3) runs++;
    else next[to] = true;
  }
  const batterTo = n - 1;
  if (batterTo >= 3) runs++;
  else next[batterTo] = true;
  return { bases: next, runs };
}

export interface AtBatResult {
  conceptId: string;
  term: string;
  given: string;
  correct: boolean;
  /** 첫 타건 → 제출 사이의 시간. 시간 초과면 0 */
  typingMs: number;
  strokes: number;
}

/** 한 타석을 처리해 다음 상태를 돌려준다. 상태는 갈아엎지 않고 새로 만든다 */
export function applyAtBat(s: GameState, r: AtBatResult, level: Level): GameState {
  if (s.over) return s;

  const speed = r.correct && r.typingMs > 0 ? Math.round((r.strokes / r.typingMs) * 60000) : 0;
  const hit: Hit = r.correct ? judge(s.combo, speed, level) : "out";

  const next: GameState = {
    ...s,
    bases: [...s.bases] as [boolean, boolean, boolean],
    plays: [...s.plays],
    atBats: s.atBats + 1,
  };

  if (hit === "out") {
    next.outs = s.outs + 1;
    next.combo = 0;
    next.plays.push({ conceptId: r.conceptId, term: r.term, given: r.given, hit, kpm: 0, runs: 0 });
    if (next.outs >= 3) {
      // 공수 교대 — 주자를 남기지 않는다
      next.outs = 0;
      next.bases = [false, false, false];
      next.inning = s.inning + 1;
      if (next.inning > s.innings) {
        next.inning = s.innings;
        next.over = true;
      }
    }
    return next;
  }

  const { bases, runs } = advance(s.bases, BASES_OF[hit]);
  next.bases = bases;
  next.score = s.score + runs;
  next.hits = s.hits + 1;
  next.combo = s.combo + 1;
  next.bestCombo = Math.max(s.bestCombo, next.combo);
  next.totalStrokes = s.totalStrokes + r.strokes;
  next.totalTypingMs = s.totalTypingMs + r.typingMs;
  next.bestKpm = Math.max(s.bestKpm, speed);
  next.plays.push({ conceptId: r.conceptId, term: r.term, given: r.given, hit, kpm: speed, runs });
  return next;
}

/** 경기 전체의 평균 타속 */
export function averageKpm(s: GameState): number {
  if (s.totalTypingMs <= 0) return 0;
  return Math.round((s.totalStrokes / s.totalTypingMs) * 60000);
}

/**
 * 점수 — 순위표에 오르는 숫자 하나.
 *
 *   득점 × 100 + 최고 콤보 × 20 + 평균 타속
 *
 * 셋을 곱하지 않고 더하는 이유: 곱하면 하나가 0일 때 전부 0이 돼, 첫 경기에서
 * 득점하지 못한 학생의 화면에 0이 찍힌다. 더하면 무엇을 잘했는지가 점수 안에
 * 남는다. 결과 화면은 이 세 항을 **쪼개서 보여 준다** — 어디서 온 점수인지
 * 모르는 숫자는 다음 판을 바꾸지 못한다.
 */
export function finalScore(s: GameState): number {
  return s.score * 100 + s.bestCombo * 20 + averageKpm(s);
}

export function scoreBreakdown(s: GameState) {
  return [
    { label: "득점", detail: `${s.score}점 × 100`, value: s.score * 100 },
    { label: "최고 콤보", detail: `${s.bestCombo}연속 × 20`, value: s.bestCombo * 20 },
    { label: "평균 타속", detail: `${averageKpm(s)}타/분`, value: averageKpm(s) },
  ];
}

/* ────────────────────────────── 내 기록 (이 기기) ────────────────────────────── */

export interface ArcadeRecord {
  plays: number;
  bestScore: number;
  bestKpm: number;
  bestCombo: number;
  bestRuns: number;
  /** 최근 경기 10개 — 대시보드의 흐름 그래프 */
  recent: { at: string; score: number; kpm: number; runs: number; level: LevelKey }[];
}

const KEY = "scisherpa-arcade-v1";

const EMPTY_RECORD: ArcadeRecord = {
  plays: 0,
  bestScore: 0,
  bestKpm: 0,
  bestCombo: 0,
  bestRuns: 0,
  recent: [],
};

export function loadRecord(): ArcadeRecord {
  if (typeof window === "undefined") return EMPTY_RECORD;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_RECORD, ...(JSON.parse(raw) as ArcadeRecord) } : EMPTY_RECORD;
  } catch {
    return EMPTY_RECORD;
  }
}

/** 경기가 끝나면 이 기기의 기록을 갱신한다. 서버는 학생이 눌러야 올라간다 */
export function saveResult(s: GameState, level: LevelKey): ArcadeRecord {
  const rec = loadRecord();
  const score = finalScore(s);
  const speed = averageKpm(s);
  const next: ArcadeRecord = {
    plays: rec.plays + 1,
    bestScore: Math.max(rec.bestScore, score),
    bestKpm: Math.max(rec.bestKpm, s.bestKpm),
    bestCombo: Math.max(rec.bestCombo, s.bestCombo),
    bestRuns: Math.max(rec.bestRuns, s.score),
    recent: [
      { at: new Date().toISOString(), score, kpm: speed, runs: s.score, level },
      ...rec.recent,
    ].slice(0, 10),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장소가 막힌 환경 — 기록을 못 남길 뿐 경기는 끝났다 */
    }
  }
  return next;
}

/**
 * 맞힌 개념을 학습 기록에 반영한다 — **올리기만 한다.**
 *
 * 놓친 것은 아무것도 적지 않는다. 이 게임의 아웃은 두 가지를 구분하지 못하기
 * 때문이다 — 개념을 모르는 것과, 알지만 8초 안에 손이 따라가지 못한 것.
 * 둘을 같은 오답으로 적으면 마스터 난이도로 놀았다는 이유만으로 아는 개념까지
 * "몰라요" 쪽으로 밀려, 내일 데일리 문항이 엉뚱하게 짜인다.
 *
 * 이미 3(익숙함)인 개념을 2로 끌어내리지도 않는다. 게임은 확인이지 강등이
 * 아니다.
 *
 * FSRS(기억 상태)는 건드리지 않는다. 복습 간격은 차분히 푸는 인출이 정해야
 * 하고, 시간에 쫓기는 타석은 그 근거가 되지 못한다.
 */
export function creditConcept(conceptId: string): void {
  const level = loadProgress().concepts[conceptId]?.level;
  if (level === undefined || level < 2) markConcept(2, conceptId);
}

/* ────────────────────────────── 순위표 (서버) ────────────────────────────── */

export interface RankRow {
  user_id: string;
  nickname: string;
  best_score: number;
  best_kpm: number;
  best_combo: number;
  runs: number;
  plays: number;
}

/**
 * 순위표는 **올리겠다고 누른 사람만** 오른다.
 *
 * 동의받은 항목에 "학습 기록"은 있지만, 그 기록을 **다른 학생에게 보여 주는
 * 일**은 따로 묻는 것이 맞다. 경기가 끝날 때마다 조용히 올라가면 학생은
 * 자기 닉네임이 남의 화면에 떠 있다는 사실을 모른 채 게임을 하게 된다.
 */
export async function submitScore(s: GameState): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "서버와 연결되지 않았어요." };
  const sb = supabase();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return { ok: false, reason: "로그인하면 순위표에 올릴 수 있어요." };

  const { data: prof } = await sb.from("profiles").select("nickname").eq("id", uid).maybeSingle();
  const nickname = (prof?.nickname ?? "").trim();
  if (!nickname) return { ok: false, reason: "내 정보에서 닉네임을 먼저 정해 주세요." };

  const { error } = await sb.rpc("arcade_submit", {
    p_nickname: nickname,
    p_score: finalScore(s),
    p_kpm: s.bestKpm,
    p_combo: s.bestCombo,
    p_runs: s.score,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** 상위 N명. 로그인하지 않았으면 빈 배열 — 순위표는 서버에만 있다 */
export async function loadRanking(limit = 20): Promise<RankRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase()
    .from("arcade_scores")
    .select("user_id, nickname, best_score, best_kpm, best_combo, runs, plays")
    .order("best_score", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as RankRow[];
}

/**
 * 내 정보에서 고른 수강 과목 — 게임의 기본 범위가 된다.
 *
 * enrollment 에 담기는 것은 과목 **코드**('mate')이고 카드가 갖는 것은
 * 과목 **이름**('물질과 에너지')이다. 여기서 한 번 바꿔 둔다 — 화면마다
 * 바꾸면 언젠가 한 곳을 빠뜨린다.
 */
export function enrolledSubjectNames(): string[] {
  const codes = loadProgress().enrollment?.subjects ?? [];
  return codes.map((c) => subjectNameOf(c)).filter((n): n is string => Boolean(n));
}
