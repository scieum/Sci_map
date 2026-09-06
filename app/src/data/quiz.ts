import type { QuizItem, QuizKind } from "@/lib/types";
import type { DayPlan } from "@/lib/scheduler";
import { CONCEPTS, conceptById } from "./concepts";

/**
 * 데일리 문항 파생 — 설계서 §2.4의 결정론적 파생 규칙.
 *
 * **유형마다 파생기가 따로 있다.** 한 함수가 세 유형을 한 배열에 섞어 내던 때에는
 * 세트도 섞여 나왔고, 유형별 규칙을 손보려면 한 덩어리를 헤집어야 했다.
 * OX 는 명제에서, 단답·선택형은 정의에서 나오므로 원천부터 다르다.
 *
 * 세 파생기 모두 `quizReady` 카드만 본다 — C8 을 지나지 않은 명제는 문항이
 * 되지 않는다 (CLAUDE.md §9.1). 이 필터를 파생기 밖으로 빼지 마라. 빼면 언젠가
 * 한 유형만 빠뜨린다.
 */

const ready = () => CONCEPTS.filter((c) => c.quizReady);

/** OX — 명제 참 / 방향 반전 거짓 / 오개념 거짓 */
export function deriveOx(): QuizItem[] {
  const pool: QuizItem[] = [];
  for (const c of ready()) {
    for (const r of c.relations) {
      pool.push({
        id: `${c.id}-${r.id}-true`,
        conceptId: c.id,
        kind: "ox",
        prompt: `${r.text}. (${r.condition})`,
        answer: "O",
        explanation: r.text,
      });
      if (r.invertible && r.invertedText) {
        pool.push({
          id: `${c.id}-${r.id}-inv`,
          conceptId: c.id,
          kind: "ox",
          prompt: `${r.invertedText}. (${r.condition})`,
          answer: "X",
          explanation: `옳은 명제: ${r.text}`,
        });
      }
    }
    c.misconceptions.forEach((m, i) => {
      pool.push({
        id: `${c.id}-mis-${i}`,
        conceptId: c.id,
        kind: "ox",
        prompt: m.text,
        answer: "X",
        explanation: m.whyWrong,
      });
    });
  }
  return pool;
}

/** 단답 — 정의 → 표제어 (영문명은 별칭으로 허용) */
export function deriveShort(): QuizItem[] {
  return ready().map((c) => ({
    id: `${c.id}-short-def`,
    conceptId: c.id,
    kind: "short" as const,
    prompt: c.definition,
    answer: c.term,
    aliases: [c.english.toLowerCase(), ...(c.aliases ?? [])],
    explanation: `${c.term} (${c.english})`,
  }));
}

/** 선택형 — 발문은 정의, 오답은 링크 거리 1의 형제 개념 셋 */
export function deriveMcq(): QuizItem[] {
  const pool: QuizItem[] = [];
  for (const c of ready()) {
    const siblings = c.links
      .map((l) => conceptById(l.target)?.term)
      .filter((t): t is string => !!t && t !== c.term)
      .slice(0, 3);
    if (siblings.length < 3) continue; // 오답 셋을 못 채우면 문항이 서지 않는다
    pool.push({
      id: `${c.id}-mcq-def`,
      conceptId: c.id,
      kind: "mcq",
      prompt: c.definition,
      answer: c.term,
      choices: shuffleStable([c.term, ...siblings], c.id),
      explanation: `${c.term} — ${c.definition}`,
    });
  }
  return pool;
}

const DERIVE: Record<QuizKind, () => QuizItem[]> = {
  ox: deriveOx,
  short: deriveShort,
  mcq: deriveMcq,
};

/** 한 유형의 풀. 유형을 주지 않던 옛 호출은 없다 — 섞인 풀은 만들지 않는다 */
export function deriveQuizPool(kind: QuizKind): QuizItem[] {
  return DERIVE[kind]();
}

export const KIND_LABEL: Record<QuizKind, string> = {
  ox: "OX",
  short: "단답",
  mcq: "선택형",
};

export const KIND_ORDER: QuizKind[] = ["ox", "short", "mcq"];

/** 문자열이 유형이면 그대로, 아니면 기본값(OX) */
export function asKind(v: string | null | undefined): QuizKind {
  return v === "short" || v === "mcq" ? v : "ox";
}

/** 날짜 기반 결정론적 셔플 — 같은 날에는 같은 세트가 나오도록 */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleStable<T>(arr: T[], seedKey: string): T[] {
  const seeded = arr.map((v, i) => ({ v, k: hashStr(`${seedKey}-${i}-${String(v)}`) }));
  seeded.sort((a, b) => a.k - b.k);
  return seeded.map((s) => s.v);
}

export interface DailySet {
  kind: QuizKind;
  items: QuizItem[];
  reviewCount: number;
  newCount: number;
}

/**
 * 오늘의 세트 — **한 유형** N문항, **오늘의 개념 집합(DayPlan)** 안에서만.
 * 어떤 개념을 낼지는 스케줄러(FSRS due)가 정했고, 여기서는 그 개념들의 이 유형
 * 문항만 고른다. 복습(due 지난 개념) 먼저, 부족분을 신규로. 같은 개념 최대 2문항.
 * 세션 하나가 한 유형이라야 화면도 채점도 한 가지만 하면 된다.
 */
export function buildDailySet(
  dateKey: string,
  plan: DayPlan,
  kind: QuizKind,
  size = 10,
): DailySet {
  const pool = deriveQuizPool(kind);
  const rank = new Map<string, number>();
  plan.review.forEach((id, i) => rank.set(id, i));
  // 복습은 due 가 이른 순(plan 순서)을 지키고, 신규는 날짜 시드로 섞는다
  const review = pool
    .filter((q) => rank.has(q.conceptId))
    .sort((a, b) => rank.get(a.conceptId)! - rank.get(b.conceptId)!);
  const freshSet = new Set(plan.fresh);
  const fresh = shuffleStable(
    pool.filter((q) => freshSet.has(q.conceptId)),
    `new-${kind}-${dateKey}`,
  );
  // 개념 편중 방지 — 같은 개념 최대 2문항 (OX 는 한 카드에서 여럿 나온다)
  const picked: QuizItem[] = [];
  const perConcept = new Map<string, number>();
  const take = (list: QuizItem[], max: number) => {
    for (const q of list) {
      if (picked.length >= max) break;
      const n = perConcept.get(q.conceptId) ?? 0;
      if (n >= 2) continue;
      picked.push(q);
      perConcept.set(q.conceptId, n + 1);
    }
  };
  take(review, Math.min(size, review.length));
  const reviewCount = picked.length;
  take(fresh, size);
  return { kind, items: picked, reviewCount, newCount: picked.length - reviewCount };
}

/** 세 유형의 오늘 세트를 한 번에 — 유형 선택 화면과 홈 타일이 쓴다 */
export function buildDailyOverview(dateKey: string, plan: DayPlan) {
  const sets = KIND_ORDER.map((k) => buildDailySet(dateKey, plan, k));
  return { sets, reviewConceptCount: plan.review.length, newConceptCount: plan.fresh.length };
}

/** 단답 채점 — 평문 정규화 (R8 축소판: 공백 제거·소문자화) */
export function checkShortAnswer(input: string, item: QuizItem): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const v = norm(input);
  if (!v) return false;
  return v === norm(item.answer) || (item.aliases ?? []).some((a) => v === norm(a));
}
