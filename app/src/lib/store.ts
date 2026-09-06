"use client";

import { useEffect, useState } from "react";

/**
 * 학습 상태 — MVP는 localStorage.
 * Supabase `study_states`(FSRS) 연동 시 이 모듈만 교체한다 (설계서 §2.5).
 */

/** ts-fsrs Card 의 직렬화 형태 — Date 는 ISO 문자열로 */
export interface StudyState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface Progress {
  /** 개념별 상태: 마지막 자기평가 (recall 모드·퀴즈 결과 반영) */
  concepts: Record<string, { level: 0 | 1 | 2 | 3; updatedAt: string }>;
  /** 개념별 FSRS 기억 상태 — 매일 뭘 낼지는 여기 due 가 정한다 (scheduler.ts) */
  studyStates: Record<string, StudyState>;
  /** 오늘 뽑은 개념 집합 — 하루 한 번 뽑아 세 유형 세션이 나눠 쓴다 */
  plan?: { dateKey: string; review: string[]; fresh: string[] };
  /** 로그인한 Supabase 사용자. 없으면 이 기기 안에서만 산다 */
  userId?: string;
  /**
   * 출제 범위 — 내 정보에서 고른 학년·학기·과목. 스케줄러는 서버가 아니라
   * 이 로컬 값을 본다 (오프라인·비로그인에서도 같은 코드가 돌아야 한다).
   * 없으면 전체 과목이 범위다.
   */
  enrollment?: { grade: number | null; semester: number | null; subjects: string[] };
  /** 최근 세션에서 틀린 개념 — 다음 데일리 세트의 복습 후보 */
  wrongConceptIds: string[];
  streak: { count: number; lastDate: string };
  /** 데일리 완료 날짜 목록 (출석 잔디) */
  doneDates: string[];
}

const KEY = "scisherpa-progress-v1";

const EMPTY: Progress = {
  concepts: {},
  studyStates: {},
  wrongConceptIds: [],
  streak: { count: 0, lastDate: "" },
  doneDates: [],
};

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Progress) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveProgress(p: Progress) {
  if (typeof window === "undefined") return; // 서버 렌더에서는 저장할 곳이 없다
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function markConcept(level: 0 | 1 | 2 | 3, conceptId: string) {
  const p = loadProgress();
  p.concepts[conceptId] = { level, updatedAt: new Date().toISOString() };
  saveProgress(p);
}

/** 데일리 세트 완료 처리 — 스트릭·잔디·오답 개념 갱신 */
export function completeDaily(wrongConceptIds: string[]) {
  const p = loadProgress();
  const today = todayKey();
  if (!p.doneDates.includes(today)) p.doneDates.push(today);

  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  if (p.streak.lastDate === today) {
    // 같은 날 재완료 — 유지
  } else if (p.streak.lastDate === yesterday) {
    p.streak = { count: p.streak.count + 1, lastDate: today };
  } else {
    p.streak = { count: 1, lastDate: today };
  }
  p.wrongConceptIds = Array.from(new Set(wrongConceptIds));
  saveProgress(p);
}

/** SSR 안전 훅 — 마운트 후 localStorage 값으로 갱신 */
export function useProgress(): Progress {
  const [p, setP] = useState<Progress>(EMPTY);
  useEffect(() => {
    setP(loadProgress());
  }, []);
  return p;
}
