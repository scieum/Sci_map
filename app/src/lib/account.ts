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

/**
 * 닉네임 규칙 — 한글·영문·숫자, 2~12자.
 *
 * 아이디는 로그인용이고 닉네임은 서로 부르는 이름이다. 아이디와 달리 한글을
 * 허용한다 — 학생이 실제로 쓸 이름이기 때문이다. 실명은 받지 않는다 (R13).
 */
export function nicknameProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "닉네임을 입력해 주세요.";
  if (v.length < 2) return "닉네임은 2자 이상이어야 해요.";
  if (v.length > 12) return "닉네임은 12자까지예요.";
  if (!/^[가-힣a-zA-Z0-9]+$/.test(v))
    return "닉네임에는 한글·영문·숫자만 쓸 수 있어요. 띄어쓰기와 기호는 빼 주세요.";
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

/** 이 닉네임이 이미 쓰이는가. 대소문자를 구분하지 않는다 */
export async function isNicknameTaken(nickname: string): Promise<boolean> {
  const { data, error } = await supabase().rpc("nickname_taken", {
    p_nickname: nickname.trim(),
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export interface SignUpInput {
  username: string;
  nickname: string;
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
  if (error) throw new Error(signUpMessage(error.message));

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
    nickname: input.nickname.trim(),
    recovery_email: input.email.trim(),
    ...(input.school ?? {}),
  });
  if (pErr) {
    // 미리 물어본 뒤에도 여기서 걸릴 수 있다 — 같은 순간에 둘이 눌렀을 때다.
    // 어느 쪽이 겹쳤는지 인덱스 이름으로 갈라 알려 준다
    if (/profiles_nickname_key/i.test(pErr.message)) {
      throw new Error("방금 다른 사람이 같은 닉네임을 만들었어요. 다른 닉네임으로 해 주세요.");
    }
    if (/profiles_username_key|duplicate key/i.test(pErr.message)) {
      throw new Error("방금 다른 사람이 같은 아이디를 만들었어요. 다른 아이디로 해 주세요.");
    }
    throw new Error(pErr.message);
  }
}

/**
 * 가입 실패 문구 — 서버가 주는 영어를 학생이 읽을 말로 바꾼다.
 *
 * ★ 아래 둘은 **운영자 설정** 문제다. 학생이 아무리 다시 눌러도 풀리지 않으므로
 *   화면에 그렇게 적어야 한다. 둘 다 원인이 하나다 — Supabase 의 이메일 확인
 *   (Confirm email)이 켜져 있으면 가입할 때마다 합성 주소로 확인 메일을 보내려
 *   든다. 그 주소는 받을 수 없는 주소이고(400 invalid), 시도 자체가 기본 메일
 *   발송 한도에 걸린다(429 rate limit).
 */
function signUpMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (/already registered|already been registered|user already exists/.test(m)) {
    return "이미 쓰이고 있는 아이디예요. 다른 아이디로 해 주세요.";
  }
  if (/rate limit/.test(m)) {
    return (
      "지금은 가입할 수 없어요. 선생님께 알려 주세요 — " +
      "Supabase 의 이메일 확인(Confirm email)을 끄면 풀려요. " +
      "(메일 발송 한도에 걸렸어요)"
    );
  }
  if (/email address .* is invalid|email_address_invalid/.test(m)) {
    return (
      "지금은 가입할 수 없어요. 선생님께 알려 주세요 — " +
      "Supabase 의 이메일 확인(Confirm email)을 끄면 풀려요. " +
      "(로그인용 주소를 서버가 받지 않았어요)"
    );
  }
  if (/password/.test(m)) return "비밀번호가 규칙에 맞지 않아요. 8자 이상, 영문과 숫자를 함께 넣어 주세요.";
  if (/network|fetch/.test(m)) return "인터넷 연결을 확인하고 다시 눌러 주세요.";
  return `가입하지 못했어요. ${raw}`;
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
