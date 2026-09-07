"use client";

import { useState } from "react";
import { Card, Screen, ScreenTitle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { AuthCallback } from "@/lib/auth-callback";

/**
 * 로그인 패널 — docs/login_design.md 를 그대로 구현한다.
 *
 * 비밀번호가 없다. 구글(주 행동) + 이메일 링크(부차) 둘뿐이고, 가입과 로그인을
 * 구분하지 않는다 — 학생에게 그 차이를 묻지 않는다. 로그인은 선택이라는 말을
 * 화면 안에 둔다 (D5): 안 해도 카드·문항은 그대로다.
 */
export default function LoginPanel({
  failure = null,
}: {
  /** 링크로 돌아왔으나 세션을 만들지 못한 경우 — 사유를 맨 위에 띄운다 */
  failure?: Extract<AuthCallback, { kind: "fail" }> | null;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    setBusy("google");
    setError(null);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/me` },
    });
    // 성공하면 페이지가 구글로 넘어가므로 여기 오지 않는다
    if (error) {
      setError(`구글 로그인을 시작하지 못했어요. ${error.message}`);
      setBusy(null);
    }
  }

  async function sendLink() {
    const addr = email.trim();
    if (!addr) return;
    setBusy("email");
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/me` },
    });
    setBusy(null);
    if (error) setError(`메일을 보내지 못했어요. ${error.message}`);
    else setSent(addr);
  }

  return (
    <Screen>
      <ScreenTitle>내 정보</ScreenTitle>
      <p className="-mt-3 mb-5 text-[14px] leading-relaxed text-ink-sub">
        로그인하면 기록이 서버에 남고, 폰을 바꿔도 이어져요.
      </p>

      {/* 링크를 눌렀는데 로그인이 안 된 경우 — 왜 안 됐는지 먼저 말한다.
          말없이 로그인 화면만 다시 보여 주면 학생은 링크가 고장 났다고 여긴다 */}
      {failure && (
        <Card className="mb-3 !bg-danger-bg">
          <p className="text-[15px] font-bold text-danger">{failure.message}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-sub">{failure.hint}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[12px] text-ink-faint">
              선생님께 보여 줄 원문
            </summary>
            <code className="mt-1 block break-all text-[11px] text-ink-faint">
              {failure.raw}
            </code>
          </details>
        </Card>
      )}

      {sent ? (
        <Card>
          <p className="text-[15px] font-bold">메일함을 확인해 주세요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            <b className="text-ink">{sent}</b> 로 로그인 링크를 보냈어요. 링크를 누르면
            이 화면으로 돌아와요. 안 보이면 스팸함도 봐 주세요.
          </p>
          <button
            onClick={() => setSent(null)}
            className="mt-4 text-[13px] font-semibold text-primary-600"
          >
            다른 주소로 받기
          </button>
        </Card>
      ) : (
        <Card className="!p-4">
          {/* 주 행동 — Google 브랜딩 규정: 흰 바탕, 회색 테두리, 표준 색 G 로고, 문구 동반 */}
          <button
            onClick={google}
            disabled={busy !== null}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white text-[14px] font-medium text-[#1f1f1f] active:bg-[#f2f2f2] disabled:opacity-60"
          >
            <GoogleG />
            {busy === "google" ? "구글로 이동 중…" : "Google로 계속하기"}
          </button>

          <div className="my-4 flex items-center gap-3 text-[12px] text-ink-faint">
            <span className="h-px flex-1 bg-line" />
            또는
            <span className="h-px flex-1 bg-line" />
          </div>

          {/* 부차 — 이메일 링크. 칸 바로 아래에 버튼을 둔다(키보드가 올라와도 보이게) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendLink();
            }}
            className="flex flex-col gap-2"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="학교 이메일"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="send"
              className="h-12 w-full rounded-full bg-bg-subtle px-5 text-[16px] outline-none focus:ring-2 focus:ring-primary-300"
            />
            <button
              type="submit"
              disabled={!email.trim() || busy !== null}
              className="h-11 rounded-full text-[14px] font-bold text-primary-600 active:bg-primary-50 disabled:opacity-40"
            >
              {busy === "email" ? "보내는 중…" : "이메일로 로그인 링크 받기"}
            </button>
          </form>

          {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
        </Card>
      )}

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-ink-faint">
        로그인은 선택이에요. 로그인 없이도 개념 카드와 오늘의 문항을 쓸 수 있고, 기록은
        이 기기에만 남아요. 비밀번호는 없어요 — 구글 계정이나 메일로 온 링크로 들어와요.
      </p>
    </Screen>
  );
}

/** 표준 색상 G 로고 — 색·비율을 바꾸지 않는다 (branding-guidelines) */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
