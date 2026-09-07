"use client";

import { supabase } from "@/lib/supabase";

/**
 * 아이디·비밀번호 계정 (2026-09-07 교사 결정, docs/login_design.md).
 *
 * ★ Supabase Auth 의 email 자리에는 **아이디로 만든 합성 주소**를 넣는다.
 *   진짜 메일 주소를 넣으면 "아이디로 로그인"을 하려고 아이디 → 메일 주소를
 *   찾아 주는 통로가 필요해지는데, 그 통로가 열려 있으면 아이디만 알면 그
 *   학생의 메일 주소를 알아낼 수 있게 된다. 합성 주소는 아이디에서 바로
 *   계산되므로 찾을 일이 없다.
 *
 *   진짜 메일 주소는 비밀번호 재설정 용도로만 `profiles.recovery_email` 에 둔다.
 *
 * ★ 이 방식은 Supabase 대시보드에서 **이메일 확인(Confirm email)이 꺼져 있어야**
 *   돈다. 합성 주소로는 확인 메일이 도착할 수 없기 때문이다.
 */

/** 합성 주소의 도메인. 실제로 메일을 받지 않는 자리다 */
const ID_DOMAIN = "id.scisherpa.app";

export const MIN_PASSWORD = 8;

/** 아이디 규칙 — 영문 소문자·숫자·밑줄, 4~20자. 첫 글자는 영문 */
const ID_RE = /^[a-z][a-z0-9_]{3,19}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 아이디가 규칙에 맞는가 — 맞으면 null, 아니면 학생이 읽을 사유 */
export function usernameProblem(raw: string): string | null {
  const id = normalizeUsername(raw);
  if (!id) return "아이디를 입력해 주세요.";
  if (id.length < 4) return "아이디는 4자 이상이어야 해요.";
  if (id.length > 20) return "아이디는 20자까지예요.";
  if (!/^[a-z]/.test(id)) return "아이디는 영문으로 시작해요.";
  if (!ID_RE.test(id)) return "아이디에는 영문 소문자·숫자·밑줄(_)만 쓸 수 있어요.";
  return null;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`;
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw))
    return "비밀번호에 영문과 숫자를 함께 넣어 주세요.";
  return null;
}

export function emailProblem(email: string): string | null {
  const v = email.trim();
  if (!v) return "이메일을 입력해 주세요. 비밀번호를 잊었을 때 이 주소로 되찾아요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "이메일 형식이 아니에요.";
  if (v.toLowerCase().endsWith(`@${ID_DOMAIN}`)) return "쓸 수 없는 주소예요.";
  return null;
}

const authEmail = (username: string) => `${normalizeUsername(username)}@${ID_DOMAIN}`;

/** 이 아이디가 이미 쓰이는가. 서버는 있다/없다만 돌려준다 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const { data, error } = await supabase().rpc("username_taken", {
    p_username: normalizeUsername(username),
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export interface SignUpInput {
  username: string;
  password: string;
  email: string;
  school: {
    sido_code: string;
    sido: string;
    sigungu: string;
    school_kind: string;
    school_code: string;
    school_name: string;
  } | null;
}

/**
 * 가입 — 계정을 만들고 프로필에 아이디·이메일·학교를 적는다.
 *
 * 중복은 두 겹으로 막는다. 미리 물어보는 `username_taken` 은 화면을 위한 것이고,
 * 진짜 방어선은 auth 의 email 유일성과 `profiles_username_key` 유일 인덱스다 —
 * 두 사람이 같은 순간에 같은 아이디로 눌러도 하나만 통과한다.
 */
export async function signUpWithId(input: SignUpInput): Promise<void> {
  const username = normalizeUsername(input.username);
  const sb = supabase();

  const { data, error } = await sb.auth.signUp({
    email: authEmail(username),
    password: input.password,
  });
  if (error) {
    if (/already registered|already been registered|user already exists/i.test(error.message)) {
      throw new Error("이미 쓰이고 있는 아이디예요. 다른 아이디로 해 주세요.");
    }
    throw new Error(error.message);
  }

  const uid = data.user?.id;
  if (!uid) {
    // 이메일 확인이 켜져 있으면 세션 없이 여기까지 온다 — 합성 주소로는 확인
    // 메일이 도착할 수 없으므로 설정이 잘못된 것이다. 운영자가 볼 문구다
    throw new Error(
      "계정은 만들어졌지만 바로 들어갈 수 없어요. 운영자에게 알려 주세요 — Supabase 의 이메일 확인(Confirm email)을 꺼야 해요.",
    );
  }

  const { error: pErr } = await sb.from("profiles").upsert({
    id: uid,
    username,
    recovery_email: input.email.trim(),
    ...(input.school ?? {}),
  });
  if (pErr) {
    if (/profiles_username_key|duplicate key/i.test(pErr.message)) {
      throw new Error("방금 다른 사람이 같은 아이디를 만들었어요. 다른 아이디로 해 주세요.");
    }
    throw new Error(pErr.message);
  }
}

/** 로그인 — 아이디를 합성 주소로 바꿔 넘긴다 */
export async function signInWithId(username: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({
    email: authEmail(username),
    password,
  });
  if (!error) return;
  if (/invalid login credentials/i.test(error.message)) {
    // 아이디가 없는 것인지 비밀번호가 틀린 것인지 구분해 주지 않는다 —
    // 구분해 주면 "이 아이디는 있다" 를 알려 주는 통로가 된다
    throw new Error("아이디나 비밀번호가 맞지 않아요.");
  }
  if (/email not confirmed/i.test(error.message)) {
    throw new Error(
      "계정 확인이 끝나지 않았어요. 운영자에게 알려 주세요 — Supabase 의 이메일 확인(Confirm email)을 꺼야 해요.",
    );
  }
  throw new Error(error.message);
}
