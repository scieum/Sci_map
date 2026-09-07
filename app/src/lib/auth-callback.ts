"use client";

import { supabase } from "@/lib/supabase";

/**
 * 로그인 링크로 돌아온 URL 을 세션으로 바꾼다 — 구글·이메일 링크 공통.
 *
 * supabase-js 의 detectSessionInUrl 에 맡기지 않는다. 그쪽은 교환이 실패해도
 * 콘솔에만 남기고 화면에는 아무 말이 없어서, 학생은 링크를 눌렀는데 로그아웃
 * 상태인 까닭을 알 수 없다 (docs/login_design.md §4).
 *
 * 돌아오는 URL 은 세 가지다.
 *   1) ?code=…                       — PKCE 성공 경로. 교환하면 세션이 생긴다
 *   2) ?error=…&error_code=…         — Supabase 가 거절 (만료·이미 쓴 링크 등)
 *   3) #error=…&error_code=…         — 같은 거절이 해시로 올 때가 있다
 */

export type AuthCallback =
  | { kind: "none" }
  | { kind: "ok" }
  | { kind: "fail"; message: string; hint: string; raw: string };

/** URL 에 로그인 응답이 실려 있는가 — 클라이언트에서만 부른다 */
export function hasAuthParams(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return Boolean(q.get("code") || q.get("error") || h.get("error"));
}

/** 주소창에서 로그인 흔적을 지운다 — 뒤로 가기로 같은 코드를 두 번 쓰지 않게 */
function cleanUrl() {
  const url = new URL(window.location.href);
  for (const k of ["code", "error", "error_code", "error_description", "state"]) {
    url.searchParams.delete(k);
  }
  url.hash = "";
  window.history.replaceState({}, "", url.toString());
}

/**
 * 실패 사유를 학생이 읽을 문장으로 바꾼다.
 *
 * hint 는 **다음에 할 행동**이다. 원문(raw)은 따로 두어 운영자가 본다 —
 * 학생에게 영어 오류 문구를 그대로 보이지 않는다.
 */
function explain(code: string, message: string): { message: string; hint: string } {
  const m = `${code} ${message}`.toLowerCase();

  // PKCE 검증자는 링크를 **요청한** 브라우저의 저장소에 있다. 메일 앱이 자체
  // 브라우저로 링크를 열면 그 저장소가 없어서 교환이 안 된다 — 가장 흔한 실패다.
  if (m.includes("code verifier") || m.includes("invalid request")) {
    return {
      message: "링크를 요청한 브라우저와 다른 곳에서 열렸어요.",
      hint: "메일 앱 안에서 열지 말고, 링크를 길게 눌러 주소를 복사한 뒤 이 브라우저에 붙여 넣어 주세요. 다시 받아도 돼요.",
    };
  }
  if (m.includes("expired") || m.includes("otp_expired")) {
    return {
      message: "링크가 만료됐어요.",
      hint: "링크는 한 번만, 그리고 잠깐 동안만 쓸 수 있어요. 아래에서 다시 받아 주세요.",
    };
  }
  if (m.includes("already") || m.includes("used")) {
    return {
      message: "이미 쓴 링크예요.",
      hint: "링크 하나는 한 번만 들어갈 수 있어요. 아래에서 새로 받아 주세요.",
    };
  }
  if (m.includes("redirect") || m.includes("not allowed")) {
    return {
      message: "이 주소로는 돌아올 수 없게 설정돼 있어요.",
      hint: "운영자 설정 문제예요. Supabase → Authentication → URL Configuration 의 Redirect URLs 에 이 주소의 /me 를 넣어야 해요.",
    };
  }
  if (m.includes("access_denied")) {
    return {
      message: "로그인이 거절됐어요.",
      hint: "링크가 만료됐거나 이미 쓰였을 때도 이렇게 나와요. 아래에서 다시 받아 주세요.",
    };
  }
  return {
    message: "로그인을 마치지 못했어요.",
    hint: "다시 링크를 받아 주세요. 그래도 안 되면 아래 원문을 선생님께 보여 주세요.",
  };
}

/**
 * URL 의 로그인 응답을 처리한다. 성공하면 세션이 저장되고 onAuthStateChange 가 돈다.
 * 어느 경우든 주소창은 깨끗하게 두고 돌아온다.
 */
export async function completeAuthFromUrl(): Promise<AuthCallback> {
  if (typeof window === "undefined") return { kind: "none" };

  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const errCode = q.get("error_code") ?? h.get("error_code") ?? "";
  const err = q.get("error") ?? h.get("error") ?? "";
  const errDesc = q.get("error_description") ?? h.get("error_description") ?? "";
  if (err || errCode) {
    cleanUrl();
    const raw = [err, errCode, errDesc].filter(Boolean).join(" · ");
    return { kind: "fail", ...explain(errCode || err, errDesc), raw };
  }

  const code = q.get("code");
  if (!code) return { kind: "none" };

  const { error } = await supabase().auth.exchangeCodeForSession(code);
  cleanUrl();
  if (!error) return { kind: "ok" };
  return {
    kind: "fail",
    ...explain((error as { code?: string }).code ?? "", error.message),
    raw: error.message,
  };
}
