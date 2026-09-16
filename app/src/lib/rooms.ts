"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 스터디룸 — 친구끼리 코드로 모이는 방 (교사 결정 2026-09-11).
 *
 * ★ 초대 코드(invite_codes)와 **다른 것**이다. 저쪽은 교사가 만들어 수업 참여
 *   학생을 확인하는 권리 장치이고(CLAUDE.md §6), 이쪽은 학생끼리 서로의
 *   학습량을 보려고 만드는 자리다. 둘을 한 코드로 합치면 스터디룸에 들어온
 *   학생 전부에게 교과서 그림 열람 권한이 딸려 나간다 — 합치지 않는다.
 *
 * ★ 방 안의 숫자는 **집계만** 내려온다. 서로의 오답이나 어떤 개념을 틀렸는지는
 *   보이지 않는다. 학습량을 견주는 것과 남의 오답을 들여다보는 것은 다른
 *   일이고, 뒤쪽까지 열면 방에 들어가는 일 자체가 부담이 된다.
 *
 * ★ 남의 행을 읽어야 하는 조회는 전부 서버 함수(security definer)를 거친다.
 *   RLS 는 "자기 행만"이 원칙이라(supabase/schema.sql), 방 순위표는 그 원칙을
 *   구멍 내지 않고 **방 구성원인지 확인한 뒤** 집계해 내려주는 함수로 낸다.
 */

export interface Room {
  code: string;
  name: string;
  subjects: string[];
  /** 하루 목표 문항 수 — 방이 함께 세운 기준 */
  goal: number;
  owner: string;
  member_count?: number;
}

export interface BoardRow {
  user_id: string;
  nickname: string;
  /** 오늘 푼 문항 수 (한국 시간 기준) */
  today_count: number;
  /** 최근 7일 중 학습한 날 수 */
  week_days: number;
  /** 기억 상태가 잡힌 개념 수 */
  concepts: number;
  /** 개념 야구 최고 점수. 순위표에 올린 적 없으면 0 */
  best_score: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

const NOT_CONFIGURED = "서버와 연결되지 않았어요.";
const NOT_SIGNED_IN = "로그인하면 스터디룸을 쓸 수 있어요.";

/**
 * 서버가 돌려준 사유를 학생이 읽을 말로 바꾼다.
 *
 * ★ "Could not find the function public.create_study_room ... in the schema
 *   cache" 는 학생이 잘못 눌러서 나는 말이 아니다. **스터디룸 스키마가 아직
 *   프로젝트에 실행되지 않았다**는 뜻이다(supabase/migrations/20260916_study_rooms.sql).
 *   영어 원문을 그대로 화면에 뱉으면 학생은 자기가 뭘 잘못했는지 찾게 된다 —
 *   고칠 수 있는 사람(교사)을 가리키는 말로 바꿔 둔다.
 */
function explain(raw: string): string {
  const m = raw ?? "";
  if (/schema cache|does not exist|Could not find the (function|table)/i.test(m)) {
    return "스터디룸이 아직 서버에 준비되지 않았어요. 선생님께 알려 주세요. (supabase/migrations/20260916_study_rooms.sql 실행 필요)";
  }
  if (/JWT|not authenticated/i.test(m)) return NOT_SIGNED_IN;
  if (/Failed to fetch|NetworkError/i.test(m)) return "서버에 닿지 못했어요. 연결을 확인해 주세요.";
  return m;
}

async function uid(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/** 방 이름 규칙 — 실명이 들어오지 않게 짧게 막는다 */
export function roomNameProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "방 이름을 지어 주세요.";
  if (v.length < 2) return "방 이름은 2자 이상이어야 해요.";
  if (v.length > 20) return "방 이름은 20자까지예요.";
  return null;
}

/** 코드 표기 — 사람이 불러 주기 쉽게 대문자로 맞춘다 */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "");

/**
 * 방 만들기. 코드는 서버가 짓는다 — 클라이언트가 지으면 두 사람이 같은 순간에
 * 같은 코드를 뽑았을 때 어느 쪽이 이겼는지 알 수 없다.
 */
export async function createRoom(
  name: string,
  subjects: string[],
  goal: number,
): Promise<Result<string>> {
  if (!isSupabaseConfigured()) return { ok: false, reason: NOT_CONFIGURED };
  if (!(await uid())) return { ok: false, reason: NOT_SIGNED_IN };
  const { data, error } = await supabase().rpc("create_study_room", {
    p_name: name.trim(),
    p_subjects: subjects,
    p_goal: goal,
  });
  if (error) return { ok: false, reason: explain(error.message) };
  return { ok: true, value: String(data) };
}

/** 코드로 참여. 없는 코드·정원 초과는 서버가 사유를 돌려준다 */
export async function joinRoom(code: string): Promise<Result<string>> {
  if (!isSupabaseConfigured()) return { ok: false, reason: NOT_CONFIGURED };
  if (!(await uid())) return { ok: false, reason: NOT_SIGNED_IN };
  const { data, error } = await supabase().rpc("join_study_room", {
    p_code: normalizeCode(code),
  });
  if (error) return { ok: false, reason: explain(error.message) };
  return { ok: true, value: String(data) };
}

export async function leaveRoom(code: string): Promise<Result<null>> {
  if (!isSupabaseConfigured()) return { ok: false, reason: NOT_CONFIGURED };
  const { error } = await supabase().rpc("leave_study_room", { p_code: normalizeCode(code) });
  if (error) return { ok: false, reason: explain(error.message) };
  return { ok: true, value: null };
}

/**
 * 내가 속한 방들.
 *
 * 빈 목록과 "서버가 준비되지 않음" 을 구분해 돌려준다. 예전에는 둘 다 빈
 * 배열이라, 스키마가 없는 프로젝트에서 "아직 들어간 방이 없어요" 가 떴다 —
 * 학생은 코드를 넣어 보고, 거기서야 진짜 사유를 만난다.
 */
export async function myRooms(): Promise<Result<Room[]>> {
  if (!isSupabaseConfigured()) return { ok: false, reason: NOT_CONFIGURED };
  const id = await uid();
  if (!id) return { ok: true, value: [] };
  const { data, error } = await supabase()
    .from("room_members")
    .select("code, study_rooms(code, name, subjects, goal, owner)")
    .eq("user_id", id);
  if (error) return { ok: false, reason: explain(error.message) };
  type Row = { code: string; study_rooms: Room | Room[] | null };
  const rooms = (data as Row[] | null ?? [])
    .map((r) => (Array.isArray(r.study_rooms) ? r.study_rooms[0] : r.study_rooms))
    .filter((r): r is Room => Boolean(r));
  return { ok: true, value: rooms };
}

/**
 * 방 하나. 구성원이 아니면 RLS 가 막아 `value: null` 이 온다 — **없는 방과
 * 구분하지 않는다**(코드를 하나씩 넣어 보며 방을 찾아내지 못하게).
 * 서버 자체가 답하지 못한 경우는 그와 달리 `ok: false` 다.
 */
export async function roomInfo(code: string): Promise<Result<Room | null>> {
  if (!isSupabaseConfigured()) return { ok: false, reason: NOT_CONFIGURED };
  const { data, error } = await supabase()
    .from("study_rooms")
    .select("code, name, subjects, goal, owner")
    .eq("code", normalizeCode(code))
    .maybeSingle();
  if (error) return { ok: false, reason: explain(error.message) };
  return { ok: true, value: (data as Room | null) ?? null };
}

/** 방 순위표 — 구성원 확인은 서버 함수 안에서 한다 */
export async function roomBoard(code: string): Promise<Result<BoardRow[]>> {
  if (!isSupabaseConfigured()) return { ok: false, reason: NOT_CONFIGURED };
  const { data, error } = await supabase().rpc("study_room_board", {
    p_code: normalizeCode(code),
  });
  if (error) return { ok: false, reason: explain(error.message) };
  return { ok: true, value: (data ?? []) as BoardRow[] };
}
