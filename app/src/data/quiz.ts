import type { QuizItem } from "@/lib/types";
import { CONCEPTS, conceptById } from "./concepts";

/**
 * 데일리 문항 파생 — 설계서 §2.4의 결정론적 파생 규칙을 시드 데이터에 적용.
 * OX(참) / OX(방향 반전) / OX(오개념) / 단답(정의→표제어) / 선택형(형제 개념 오답).
 */
export function deriveQuizPool(): QuizItem[] {
  const pool: QuizItem[] = [];

  for (const c of CONCEPTS) {
    // OX 참 — relation.text 그대로
    for (const r of c.relations) {
      pool.push({
        id: `${c.id}-${r.id}-true`,
        conceptId: c.id,
        kind: "ox",
        prompt: `${r.text}. (${r.condition})`,
        answer: "O",
        explanation: r.text,
      });
      // OX 거짓 — invertible한 명제의 방향 반전
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
    // OX 거짓 — 오개념 그대로
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
    // 단답 — 정의 → 표제어
    pool.push({
      id: `${c.id}-short-def`,
      conceptId: c.id,
      kind: "short",
      prompt: c.definition,
      answer: c.term,
      aliases: [c.english.toLowerCase()],
      explanation: `${c.term} (${c.english})`,
    });
    // 선택형 — 발문은 정의, 오답은 링크 거리 1의 형제 개념
    const siblings = c.links
      .map((l) => conceptById(l.target)?.term)
      .filter((t): t is string => !!t && t !== c.term)
      .slice(0, 3);
    if (siblings.length === 3) {
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
  }
  return pool;
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

/**
 * 오늘의 세트 — FSRS 도입 전 대체 규칙:
 * 복습(이전에 틀린 개념의 문항) 우선, 부족분을 신규로 채워 총 N문항.
 */
export function buildDailySet(
  dateKey: string,
  wrongConceptIds: string[],
  size = 10,
): { items: QuizItem[]; reviewCount: number; newCount: number } {
  const pool = deriveQuizPool();
  const review = shuffleStable(
    pool.filter((q) => wrongConceptIds.includes(q.conceptId)),
    `rev-${dateKey}`,
  );
  const fresh = shuffleStable(
    pool.filter((q) => !wrongConceptIds.includes(q.conceptId)),
    `new-${dateKey}`,
  );
  // 개념 편중 방지 — 같은 개념 최대 2문항
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
  return { items: picked, reviewCount, newCount: picked.length - reviewCount };
}

/** 단답 채점 — 평문 정규화 (R8 축소판: 공백 제거·소문자화) */
export function checkShortAnswer(input: string, item: QuizItem): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const v = norm(input);
  if (!v) return false;
  return v === norm(item.answer) || (item.aliases ?? []).some((a) => v === norm(a));
}
