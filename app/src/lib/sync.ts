"use client";

import { isSupabaseConfigured, supabase, type Profile } from "@/lib/supabase";
import { loadProgress, saveProgress, type StudyState } from "@/lib/store";
import type { QuizKind } from "@/lib/types";

/**
 * localStorage ↔ Supabase 동기화.
 *
 * 원칙: **로컬이 먼저 쓰고, 서버는 뒤따른다.** 응답 처리는 로컬 저장으로 끝나고
 * 서버 upsert 는 기다리지 않는다(fire-and-forget). 네트워크가 없어도 학습은
 * 멈추지 않고, 다음 로그인 때 `pullStudyStates` 가 맞춘다.
 *
 * 서버가 이기는 경우는 하나 — 로그인 직후의 pull. 다른 기기에서 쌓은 기록이
 * 로컬의 빈 상태를 덮어야 "기기를 바꿔도 이어진다" 가 성립한다.
 */

async function userId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/** 로그인 직후 — 서버의 기억 상태를 로컬로 */
export async function pullStudyStates(): Promise<number> {
  const uid = await userId();
  if (!uid) return 0;
  const { data, error } = await supabase()
    .from("study_states")
    .select("concept_id, state")
    .eq("user_id", uid);
  if (error || !data) return 0;
  const p = loadProgress();
  for (const row of data) p.studyStates[row.concept_id] = row.state as StudyState;
  p.userId = uid;
  // 오늘 계획은 새 상태로 다시 뽑는다
  delete p.plan;
  saveProgress(p);
  return data.length;
}

/** 응답 뒤 — 개념 하나의 기억 상태를 서버에 */
export function pushStudyState(conceptId: string, state: StudyState): void {
  void (async () => {
    const uid = await userId();
    if (!uid) return;
    await supabase().from("study_states").upsert({
      user_id: uid,
      concept_id: conceptId,
      state,
      due: state.due,
    });
  })();
}

/** 응답 기록 — C10 튜닝 입력. 실패해도 조용히 넘어간다 */
export function logAttempt(a: {
  conceptId: string;
  itemId: string;
  kind: QuizKind;
  correct: boolean;
  elapsedMs: number;
  grade: number;
}): void {
  void (async () => {
    const uid = await userId();
    if (!uid) return;
    await supabase().from("attempts").insert({
      user_id: uid,
      concept_id: a.conceptId,
      item_id: a.itemId,
      kind: a.kind,
      correct: a.correct,
      elapsed_ms: a.elapsedMs,
      grade: a.grade,
    });
  })();
}

/** 오늘 뽑은 개념 집합 — 재현·복기용 */
export function pushDailyPlan(plan: { dateKey: string; review: string[]; fresh: string[] }): void {
  void (async () => {
    const uid = await userId();
    if (!uid) return;
    await supabase().from("daily_sets").upsert({
      user_id: uid,
      date_key: plan.dateKey,
      review: plan.review,
      fresh: plan.fresh,
    });
  })();
}

export async function loadProfile(): Promise<Profile | null> {
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase()
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();
  // ★ 실패를 null 로 뭉개지 않는다. 호출하는 쪽은 null 을 "프로필이 아직 없다"
  //   = "동의를 받아야 한다" 로 읽는데, 네트워크가 한 번 튀었을 뿐인데도 그렇게
  //   읽히면 이미 동의한 학생 앞에 동의 화면이 다시 뜬다 (2026-09-11 버그).
  //   없는 것과 못 읽은 것은 다른 일이므로 다르게 알린다.
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

/**
 * 프로필 저장 — 서버와 로컬 둘 다. 스케줄러는 로컬의 enrollment 만 본다
 * (오프라인·비로그인에서도 같은 코드가 돌아야 한다).
 */
export async function saveProfile(patch: Partial<Profile>): Promise<Profile | null> {
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase()
    .from("profiles")
    .upsert({ id: uid, ...patch })
    .select()
    .single();
  if (error) throw error;
  const prof = data as Profile;
  const p = loadProgress();
  p.userId = uid;
  p.enrollment = { grade: prof.grade, semester: prof.semester, subjects: prof.subjects ?? [] };
  delete p.plan; // 범위가 바뀌었으니 오늘 계획을 다시 뽑는다
  saveProgress(p);
  return prof;
}

/** 초대 코드 사용 — 유효하면 true. 서버 함수가 uses 를 올린다 */
export async function redeemInvite(code: string): Promise<boolean> {
  const { data, error } = await supabase().rpc("redeem_invite", { p_code: code.trim() });
  if (error) return false;
  return Boolean(data);
}
