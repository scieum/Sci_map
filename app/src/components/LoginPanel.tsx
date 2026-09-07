"use client";

import { useState } from "react";
import { Card, Screen, ScreenTitle } from "@/components/ui";
import SchoolPicker, { type SchoolValue } from "@/components/SchoolPicker";
import {
  emailProblem,
  isNicknameTaken,
  isUsernameTaken,
  nicknameProblem,
  normalizeUsername,
  passwordProblem,
  signInWithId,
  signUpWithId,
  usernameProblem,
} from "@/lib/account";

/**
 * 로그인 · 가입 — 아이디와 비밀번호 (docs/login_design.md).
 *
 * 구글과 메일 링크를 걷어냈다(2026-09-07 교사 결정). 학생이 메일함을 열지
 * 않아도 들어올 수 있어야 한다는 것이 이유다. 대신 잊었을 때 되찾을 길을
 * 남겨야 해서 가입할 때 이메일을 한 번 받아 둔다.
 *
 * 로그인은 여전히 선택이다 (D5) — 안 해도 카드와 오늘의 문항은 그대로 돈다.
 */
export default function LoginPanel() {
  const [mode, setMode] = useState<"in" | "up">("in");

  return (
    <Screen>
      <ScreenTitle>내 정보</ScreenTitle>
      <p className="-mt-3 mb-4 text-[14px] leading-relaxed text-ink-sub">
        로그인하면 기록이 서버에 남고, 폰을 바꿔도 이어져요.
      </p>

      {/* 두 갈래를 한 자리에 둔다 — 학생에게 가입과 로그인의 차이를 묻지 않되,
          이미 계정이 있는 사람이 가입 화면에서 헤매지 않도록 탭으로 나눈다 */}
      <div className="mb-3 flex gap-1 rounded-full bg-bg-subtle p-1">
        <Tab on={mode === "in"} onClick={() => setMode("in")}>로그인</Tab>
        <Tab on={mode === "up"} onClick={() => setMode("up")}>가입하기</Tab>
      </div>

      {mode === "in" ? <SignIn /> : <SignUp onDone={() => setMode("in")} />}

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-ink-faint">
        로그인은 선택이에요. 로그인 없이도 개념 카드와 오늘의 문항을 쓸 수 있고, 기록은
        이 기기에만 남아요.
      </p>
    </Screen>
  );
}

function Tab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 flex-1 rounded-full text-[14px] font-bold ${
        on ? "bg-surface text-ink shadow-[0_2px_8px_rgba(23,58,94,0.08)]" : "text-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

function SignIn() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithId(id, pw);
      // 성공하면 /me 의 onAuthStateChange 가 화면을 바꾼다
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="!p-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Field label="아이디">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="영문으로 시작하는 아이디"
            className={INPUT}
          />
        </Field>
        <Field label="비밀번호">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            className={INPUT}
          />
        </Field>
        <button
          type="submit"
          disabled={!id.trim() || !pw || busy}
          className="mt-2 h-12 rounded-full bg-primary-500 text-[15px] font-bold text-white shadow-cta disabled:opacity-40"
        >
          {busy ? "확인하는 중…" : "로그인"}
        </button>
      </form>
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-ink-faint">
        비밀번호를 잊었다면 선생님께 말해 주세요. 가입할 때 적은 이메일로 되찾을 수 있어요.
      </p>
    </Card>
  );
}

function SignUp({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState("");
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState<SchoolValue | null>(null);
  const [checking, setChecking] = useState<"id" | "nick" | null>(null);
  /** null = 아직 확인 안 함 */
  const [taken, setTaken] = useState<boolean | null>(null);
  const [nickTaken, setNickTaken] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const idProblem = id ? usernameProblem(id) : null;
  const nickProblem = nick ? nicknameProblem(nick) : null;

  async function checkId() {
    const problem = usernameProblem(id);
    if (problem) {
      setError(problem);
      return;
    }
    setChecking("id");
    setError(null);
    try {
      setTaken(await isUsernameTaken(id));
    } catch (e) {
      setError(`아이디를 확인하지 못했어요. ${(e as Error).message}`);
    } finally {
      setChecking(null);
    }
  }

  async function checkNick() {
    const problem = nicknameProblem(nick);
    if (problem) {
      setError(problem);
      return;
    }
    setChecking("nick");
    setError(null);
    try {
      setNickTaken(await isNicknameTaken(nick));
    } catch (e) {
      setError(`닉네임을 확인하지 못했어요. ${(e as Error).message}`);
    } finally {
      setChecking(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem =
      usernameProblem(id) ??
      nicknameProblem(nick) ??
      passwordProblem(pw) ??
      (pw !== pw2 ? "비밀번호가 서로 달라요." : null) ??
      emailProblem(email);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUpWithId({ username: id, nickname: nick, password: pw, email, school });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <p className="text-[15px] font-bold">가입했어요</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
          아이디 <b className="text-ink">{normalizeUsername(id)}</b> 로 들어왔어요. 이제
          기록이 서버에 남아요.
        </p>
        <button onClick={onDone} className="mt-4 text-[13px] font-semibold text-primary-600">
          로그인 화면으로
        </button>
      </Card>
    );
  }

  return (
    <Card className="!p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label="아이디"
          hint="영문 소문자·숫자·밑줄(_), 4~20자. 영문으로 시작해요"
        >
          <div className="flex gap-2">
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setTaken(null);
              }}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className={INPUT}
            />
            <button
              type="button"
              onClick={checkId}
              disabled={!id.trim() || checking !== null}
              className="h-11 shrink-0 rounded-full bg-bg-subtle px-4 text-[13px] font-bold text-ink-sub disabled:opacity-40"
            >
              {checking === "id" ? "확인 중" : "중복 확인"}
            </button>
          </div>
          {idProblem && <Note tone="bad">{idProblem}</Note>}
          {!idProblem && taken === true && <Note tone="bad">이미 쓰이고 있는 아이디예요.</Note>}
          {!idProblem && taken === false && <Note tone="good">쓸 수 있는 아이디예요.</Note>}
        </Field>

        <Field label="닉네임" hint="한글·영문·숫자 2~12자. 다른 학생과 겹칠 수 없어요">
          <div className="flex gap-2">
            <input
              value={nick}
              onChange={(e) => {
                setNick(e.target.value);
                setNickTaken(null);
              }}
              autoComplete="nickname"
              className={INPUT}
            />
            <button
              type="button"
              onClick={checkNick}
              disabled={!nick.trim() || checking !== null}
              className="h-11 shrink-0 rounded-full bg-bg-subtle px-4 text-[13px] font-bold text-ink-sub disabled:opacity-40"
            >
              {checking === "nick" ? "확인 중" : "중복 확인"}
            </button>
          </div>
          {nickProblem && <Note tone="bad">{nickProblem}</Note>}
          {!nickProblem && nickTaken === true && <Note tone="bad">이미 쓰이고 있는 닉네임이에요.</Note>}
          {!nickProblem && nickTaken === false && <Note tone="good">쓸 수 있는 닉네임이에요.</Note>}
        </Field>

        <Field label="비밀번호" hint="8자 이상, 영문과 숫자를 함께">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            className={INPUT}
          />
        </Field>

        <Field label="비밀번호 확인">
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            className={INPUT}
          />
          {pw2 && pw !== pw2 && <Note tone="bad">비밀번호가 서로 달라요.</Note>}
        </Field>

        <Field label="이메일" hint="비밀번호를 잊었을 때 되찾는 데만 써요">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            className={INPUT}
          />
        </Field>

        <Field label="학교" hint="지역 → 시·군·구 → 학교급 순으로 골라요">
          <SchoolPicker value={school} onChange={setSchool} />
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-12 rounded-full bg-primary-500 text-[15px] font-bold text-white shadow-cta disabled:opacity-40"
        >
          {busy ? "만드는 중…" : "가입하기"}
        </button>
      </form>
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
    </Card>
  );
}

const INPUT =
  "h-11 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[13px] font-bold text-ink-sub">{label}</span>
      {hint && <span className="mb-1.5 block px-1 text-[11px] text-ink-faint">{hint}</span>}
      {children}
    </label>
  );
}

function Note({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={`mt-1 block px-1 text-[12px] ${tone === "good" ? "text-success" : "text-danger"}`}
    >
      {children}
    </span>
  );
}
