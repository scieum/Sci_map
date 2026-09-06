"use client";

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";
import { CONCEPTS } from "@/data/concepts";
import { loadProgress, saveProgress, todayKey, type StudyState } from "@/lib/store";
import type { QuizKind } from "@/lib/types";

/**
 * 적응형 스케줄러 — 개념 단위 FSRS (설계서 §2.5, CLAUDE.md §14).
 *
 * 문항이 아니라 **개념**이 기억 상태를 갖는다. 개념마다 stability · difficulty ·
 * due(다음 볼 날)가 있고, 매 응답이 그 개념의 due 를 민다 — 잘 알수록 멀리,
 * 틀리면 내일. "매일 뭘 낼까"는 이 due 가 정한다.
 *
 * CLAUDE.md 는 py-fsrs 를 지정했다. 앱 안에서 돌리려면 같은 알고리즘의 TS 구현이
 * 필요해 ts-fsrs(MIT, FSRS-5) 를 쓴다. Supabase 가 붙어 서버 스케줄링으로 가면
 * 그때 py-fsrs 로 옮기되, 아래 `todayPlan` 의 규칙은 그대로 둔다.
 */

/** 하루에 처음 만나는 개념 상한 — 교사 결정(2026-09-06). 105장이면 11일에 한 바퀴다. */
export const NEW_PER_DAY = 10;

// fuzz 를 끈다 — 같은 날 같은 응답이면 같은 due 가 나와야 검증·재현이 된다.
const F = fsrs(generatorParameters({ enable_fuzz: false }));

/** 직렬화 경계 — localStorage 에는 Date 가 없다 */
function toCard(s: StudyState): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}
function fromCard(c: Card): StudyState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined,
  };
}

/**
 * 응답 → 등급. 틀리면 Again. 맞았어도 오래 걸렸으면 Hard — 응답 시간은 무언
 * 측정한다(Design.md §5.3). 임계값은 유형마다 다르다: 타이핑은 읽고 누르는 것보다
 * 오래 걸리는 게 정상이라 단답을 느리다고 벌하면 안 된다.
 */
const SLOW_MS: Record<QuizKind, number> = { ox: 6000, mcq: 10000, short: 20000 };
export function gradeFor(kind: QuizKind, correct: boolean, elapsedMs: number): Grade {
  if (!correct) return Rating.Again;
  return elapsedMs > SLOW_MS[kind] ? Rating.Hard : Rating.Good;
}

/** 한 개념에 대한 응답을 기억 상태에 반영한다 */
export function reviewConcept(conceptId: string, grade: Grade, now = new Date()): void {
  const p = loadProgress();
  const prev = p.studyStates[conceptId];
  const card = prev ? toCard(prev) : createEmptyCard(now);
  const { card: next } = F.next(card, now, grade);
  p.studyStates[conceptId] = fromCard(next);
  saveProgress(p);
}

export interface DayPlan {
  dateKey: string;
  /** due 가 오늘 이전인 개념 — due 가 이른 순. 전부 넣는다(밀린 복습은 미루지 않는다) */
  review: string[];
  /** 아직 기억 상태가 없는 개념 — 백로그 순서(선수 먼저)로 NEW_PER_DAY 까지 */
  fresh: string[];
}

/**
 * 오늘의 개념 집합. **하루에 한 번 뽑아 저장**하고, 세 유형 세션이 같은 집합을
 * 나눠 쓴다 — 오늘 OX 로 본 개념을 단답·선택형이 다른 방향으로 다시 묻는다.
 * 같은 날 다시 열어도 집합이 바뀌지 않아야 "오늘 10문항" 이 말이 된다.
 */
export function todayPlan(dateKey = todayKey()): DayPlan {
  const p = loadProgress();
  if (p.plan && p.plan.dateKey === dateKey) return p.plan;

  const endOfDay = new Date(`${dateKey}T23:59:59`);
  const ready = CONCEPTS.filter((c) => c.quizReady);

  const review = ready
    .filter((c) => p.studyStates[c.id] && new Date(p.studyStates[c.id].due) <= endOfDay)
    .sort((a, b) => +new Date(p.studyStates[a.id].due) - +new Date(p.studyStates[b.id].due))
    .map((c) => c.id);

  // CONCEPTS 는 build_concepts 가 백로그(topic_id) 순으로 정렬해 둔 것이다 —
  // 그 순서가 곧 "선수 개념이 먼저" 다. 여기서 다시 섞지 않는다.
  const fresh = ready
    .filter((c) => !p.studyStates[c.id])
    .slice(0, NEW_PER_DAY)
    .map((c) => c.id);

  const plan: DayPlan = { dateKey, review, fresh };
  p.plan = plan;
  saveProgress(p);
  return plan;
}

/** 다음에 볼 날짜 — 카드·리포트 표시용 */
export function nextDue(conceptId: string): Date | null {
  const s = loadProgress().studyStates[conceptId];
  return s ? new Date(s.due) : null;
}
