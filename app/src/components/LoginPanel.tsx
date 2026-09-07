"use client";

import { useState } from "react";
import { BottomCta, Card, Screen, ScreenTitle } from "@/components/ui";
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
 * 않아도 들어올 수 있어야 한다는 것이 이유다.
 *
 * ── 2026-09-07 개선 (유아이볼로 국내 앱 로그인·가입 화면을 훑고 고쳤다) ──
 * 1. **비밀번호에 보기 토글**을 단다. 8자 이상·영문+숫자 규칙이 있는 한 눈으로
 *    확인할 길이 있어야 한다. 위닛·코오롱몰 등 대부분이 갖고 있다.
 * 2. **오류는 그 칸 바로 아래**에 붙인다. 폼 맨 아래 한 곳에 모으면 어느 칸이
 *    잘못됐는지 학생이 되짚어야 한다 (iM뱅크·코오롱몰).
 * 3. **가입을 두 단계로 나눈다.** 칸 여섯 개와 학교 4단계를 한 화면에 쌓으면
 *    스크롤이 길어 끝이 안 보인다. 베이비빌리처럼 한 번에 한 묶음만 묻는다.
 * 4. **CTA 를 화면 아래에 고정**한다(BottomCta). 폼이 길어도 다음 버튼이 늘
 *    같은 자리에 있다 (카카오T).
 * 5. **비밀번호를 잊었을 때 갈 곳**을 로그인 화면에 둔다. 관행상 CTA 아래
 *    작은 링크 자리다 (코오롱몰 '아이디 찾기 | 비밀번호 재설정').
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

      <div className="mb-4 flex gap-1 rounded-full bg-bg-subtle p-1">
        <Tab on={mode === "in"} onClick={() => setMode("in")}>로그인</Tab>
        <Tab on={mode === "up"} onClick={() => setMode("up")}>가입하기</Tab>
      </div>

      {mode === "in" ? (
        <SignIn onSignUp={() => setMode("up")} />
      ) : (
        <SignUp onDone={() => setMode("in")} />
      )}
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
      aria-current={on ? "page" : undefined}
      className={`h-9 flex-1 rounded-full text-[14px] font-bold ${
        on ? "bg-surface text-ink shadow-[0_2px_8px_rgba(23,58,94,0.08)]" : "text-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────── 로그인 ────────────────────────────── */

function SignIn({ onSignUp }: { onSignUp: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  async function submit() {
    if (!id.trim() || !pw) return;
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
    <>
      <Card className="!p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <Field label="아이디" error={null}>
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
          <Field label="비밀번호" error={error}>
            <PasswordInput
              value={pw}
              onChange={setPw}
              autoComplete="current-password"
            />
          </Field>
          {/* 엔터로도 보내지도록 폼 안에 숨은 제출 버튼을 둔다.
              실제로 누르는 버튼은 화면 아래 고정된 BottomCta 다 */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Card>

      <button
        onClick={() => setHelpOpen((v) => !v)}
        aria-expanded={helpOpen}
        className="mt-3 w-full text-center text-[13px] font-semibold text-ink-sub underline underline-offset-4"
      >
        아이디나 비밀번호를 잊었어요
      </button>
      {helpOpen && (
        <Card className="mt-2 !bg-bg-subtle">
          <p className="text-[13px] leading-relaxed text-ink-sub">
            선생님께 아이디를 말하면 비밀번호를 새로 정해 줄 수 있어요. 가입할 때 적은
            이메일 주소로도 되찾을 수 있고요.
            <br />
            아이디가 기억나지 않으면 <b className="text-ink">가입할 때 적은 이메일</b>을
            선생님께 알려 주세요.
          </p>
        </Card>
      )}

      <p className="mt-4 px-1 text-center text-[13px] text-ink-faint">
        아직 계정이 없나요?{" "}
        <button onClick={onSignUp} className="font-bold text-primary-600 underline underline-offset-4">
          가입하기
        </button>
      </p>

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-ink-faint">
        로그인은 선택이에요. 로그인 없이도 개념 카드와 오늘의 문항을 쓸 수 있고, 기록은
        이 기기에만 남아요.
      </p>

      <BottomCta onClick={() => void submit()} disabled={!id.trim() || !pw || busy}>
        {busy ? "확인하는 중…" : "로그인"}
      </BottomCta>
    </>
  );
}

/* ────────────────────────────── 가입 ────────────────────────────── */

type Errors = Partial<
  Record<"id" | "nick" | "pw" | "pw2" | "email" | "form", string>
>;

function SignUp({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [nick, setNick] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState<SchoolValue | null>(null);
  const [checking, setChecking] = useState<"id" | "nick" | null>(null);
  /** null = 아직 확인 안 함 */
  const [taken, setTaken] = useState<boolean | null>(null);
  const [nickTaken, setNickTaken] = useState<boolean | null>(null);
  const [err, setErr] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function set(k: keyof Errors, v?: string) {
    setErr((e) => ({ ...e, [k]: v }));
  }

  async function checkId() {
    const problem = usernameProblem(id);
    set("id", problem ?? undefined);
    if (problem) return;
    setChecking("id");
    try {
      const t = await isUsernameTaken(id);
      setTaken(t);
      set("id", t ? "이미 쓰이고 있는 아이디예요." : undefined);
    } catch (e) {
      set("id", `아이디를 확인하지 못했어요. ${(e as Error).message}`);
    } finally {
      setChecking(null);
    }
  }

  async function checkNick() {
    const problem = nicknameProblem(nick);
    set("nick", problem ?? undefined);
    if (problem) return;
    setChecking("nick");
    try {
      const t = await isNicknameTaken(nick);
      setNickTaken(t);
      set("nick", t ? "이미 쓰이고 있는 닉네임이에요." : undefined);
    } catch (e) {
      set("nick", `닉네임을 확인하지 못했어요. ${(e as Error).message}`);
    } finally {
      setChecking(null);
    }
  }

  /** 1단계 — 계정. 여기서 막히면 2단계로 넘기지 않는다 */
  async function next() {
    const e: Errors = {
      id: usernameProblem(id) ?? undefined,
      pw: passwordProblem(pw) ?? undefined,
      pw2: pw !== pw2 ? "비밀번호가 서로 달라요." : undefined,
    };
    setErr(e);
    if (e.id || e.pw || e.pw2) return;
    // 넘어가기 전에 아이디를 한 번 확인한다 — 2단계를 다 채우고 나서
    // "이미 있는 아이디" 를 만나면 그때까지의 입력이 헛수고가 된다
    if (taken !== false) {
      setChecking("id");
      try {
        const t = await isUsernameTaken(id);
        setTaken(t);
        if (t) {
          set("id", "이미 쓰이고 있는 아이디예요.");
          return;
        }
      } catch {
        // 확인에 실패해도 막지는 않는다. 진짜 방어선은 유일 인덱스다
      } finally {
        setChecking(null);
      }
    }
    setStep(2);
  }

  /** 2단계 — 프로필. 학교는 선택이다 */
  async function submit() {
    const e: Errors = {
      nick: nicknameProblem(nick) ?? undefined,
      email: emailProblem(email) ?? undefined,
    };
    setErr(e);
    if (e.nick || e.email) return;
    setBusy(true);
    try {
      await signUpWithId({ username: id, nickname: nick, password: pw, email, school });
      setDone(true);
    } catch (error) {
      set("form", (error as Error).message);
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
    <>
      {/* 어디까지 왔는지 — 두 칸짜리 진행 막대. 숫자보다 눈에 빨리 들어온다 */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="text-[12px] font-bold text-primary-600">{step}/2</span>
        <span className="flex h-1 flex-1 gap-1">
          <i className="h-1 flex-1 rounded-full bg-primary-500" />
          <i className={`h-1 flex-1 rounded-full ${step === 2 ? "bg-primary-500" : "bg-line"}`} />
        </span>
        <span className="text-[12px] text-ink-faint">
          {step === 1 ? "계정 만들기" : "나에 대해"}
        </span>
      </div>

      <Card className="!p-4">
        {step === 1 ? (
          <div className="flex flex-col gap-3">
            <Field label="아이디" hint="영문 소문자·숫자·밑줄(_), 4~20자" error={err.id}>
              <div className="flex gap-2">
                <input
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setTaken(null);
                    set("id", undefined);
                  }}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={INPUT}
                />
                <CheckButton onClick={checkId} busy={checking === "id"} disabled={!id.trim()} />
              </div>
              {!err.id && taken === false && <Note tone="good">쓸 수 있는 아이디예요.</Note>}
            </Field>

            <Field label="비밀번호" hint="8자 이상, 영문과 숫자를 함께" error={err.pw}>
              <PasswordInput value={pw} onChange={setPw} autoComplete="new-password" />
            </Field>

            <Field label="비밀번호 확인" error={err.pw2}>
              <PasswordInput value={pw2} onChange={setPw2} autoComplete="new-password" />
              {!err.pw2 && pw2 !== "" && pw === pw2 && <Note tone="good">같아요.</Note>}
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="닉네임" hint="한글·영문·숫자 2~12자. 다른 학생과 겹칠 수 없어요" error={err.nick}>
              <div className="flex gap-2">
                <input
                  value={nick}
                  onChange={(e) => {
                    setNick(e.target.value);
                    setNickTaken(null);
                    set("nick", undefined);
                  }}
                  autoComplete="nickname"
                  className={INPUT}
                />
                <CheckButton onClick={checkNick} busy={checking === "nick"} disabled={!nick.trim()} />
              </div>
              {!err.nick && nickTaken === false && <Note tone="good">쓸 수 있는 닉네임이에요.</Note>}
            </Field>

            <Field label="이메일" hint="비밀번호를 잊었을 때 되찾는 데만 써요" error={err.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  set("email", undefined);
                }}
                autoComplete="email"
                inputMode="email"
                className={INPUT}
              />
            </Field>

            <Field label="학교" hint="지금 안 골라도 돼요. 나중에 내 정보에서 고를 수 있어요">
              <SchoolPicker value={school} onChange={setSchool} />
            </Field>
          </div>
        )}
      </Card>

      {err.form && (
        <Card className="mt-2 !bg-danger-bg">
          <p className="text-[13px] leading-relaxed text-danger">{err.form}</p>
        </Card>
      )}

      {step === 2 && (
        <button
          onClick={() => setStep(1)}
          className="mt-3 w-full text-center text-[13px] font-semibold text-ink-sub underline underline-offset-4"
        >
          ← 계정 정보 고치기
        </button>
      )}

      {/* 폼이 CTA 뒤로 숨지 않게 — BottomCta 는 화면에 고정돼 있다 */}
      <div className="h-24" aria-hidden />

      {step === 1 ? (
        <BottomCta onClick={() => void next()} disabled={checking === "id"}>
          {checking === "id" ? "아이디 확인 중…" : "다음"}
        </BottomCta>
      ) : (
        <BottomCta onClick={() => void submit()} disabled={busy}>
          {busy ? "만드는 중…" : "가입하기"}
        </BottomCta>
      )}
    </>
  );
}

/* ────────────────────────────── 조각들 ────────────────────────────── */

const INPUT =
  "h-11 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300";

/** 비밀번호 칸 — 눈 아이콘으로 보였다 감췄다 한다 */
function PasswordInput({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={`${INPUT} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint active:bg-line/40"
      >
        {shown ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function CheckButton({
  onClick,
  busy,
  disabled,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="h-11 shrink-0 rounded-full bg-bg-subtle px-4 text-[13px] font-bold text-ink-sub disabled:opacity-40"
    >
      {busy ? "확인 중" : "중복 확인"}
    </button>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[13px] font-bold text-ink-sub">{label}</span>
      {children}
      {/* 오류가 있으면 힌트 자리를 오류가 대신 쓴다 — 두 줄이 겹쳐 쌓이면
          정작 읽어야 할 문장이 뒤로 밀린다 */}
      {error ? (
        <Note tone="bad">{error}</Note>
      ) : hint ? (
        <span className="mt-1 block px-1 text-[11px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

function Note({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  return (
    <span
      role={tone === "bad" ? "alert" : undefined}
      className={`mt-1 block px-1 text-[12px] ${tone === "good" ? "text-success" : "text-danger"}`}
    >
      {children}
    </span>
  );
}

function Eye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4.1M6.4 7.6A17 17 0 0 0 2 12s3.5 6.5 10 6.5c1 0 1.9-.1 2.7-.4" />
      <path d="M9.8 10a2.6 2.6 0 0 0 3.6 3.6" />
    </svg>
  );
}
