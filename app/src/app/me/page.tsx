"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LoginPanel from "@/components/LoginPanel";
import SchoolPicker, { type SchoolValue } from "@/components/SchoolPicker";
import { BottomCta, Card, Screen, ScreenTitle, SectionLabel } from "@/components/ui";
import { CATALOG, courseTypeLabel, groupByCourseType } from "@/data/catalog";
import { isSupabaseConfigured, supabase, type Profile } from "@/lib/supabase";
import { accentOfSubject } from "@/lib/brand";
import { loadProfile, pullStudyStates, saveProfile } from "@/lib/sync";
import { loadProgress, saveProgress } from "@/lib/store";

/**
 * 내 정보 — 노선 탭 자리에 임시로 (SciMetro 는 한참 뒤다. Design.md §4.6).
 *
 * 흐름: 연결 안 됨 안내 → 로그인(구글 · 이메일 링크, docs/login_design.md) → 개인정보 동의 → 프로필
 * (닉네임 · 학교 · 이메일 · 학년 · 학기 · 수강 과목). 저장하면 스케줄러의 출제
 * 범위가 그 과목·학기로 잡힌다.
 *
 * 동의 문구의 원본은 docs/privacy_notice.md 다. 여기 문구를 고치면 그 파일도
 * 같이 고친다 — 두 곳이 갈라지면 학생이 본 문구가 어느 쪽인지 알 수 없게 된다.
 * CONSENT_VERSION 을 함께 올릴지는 아래 주석의 기준을 따른다.
 */

// 아이디·비밀번호 가입으로 바뀌면서 수집 항목이 달라졌다 → 버전을 올려
// 다시 동의를 받는다 (원본 문구는 docs/privacy_notice.md)
//
// ★ 2026-09-11: 문구에서 '초대 코드'를 뺐지만 **버전은 올리지 않는다.**
//   재동의는 수집 범위가 **넓어질 때** 받는 것이고, 이번은 항목이 하나 줄었다.
//   줄어든 문구로 버전을 올리면 이미 동의한 학생 전원이 동의 화면을 다시 보는데,
//   그것은 설명되지 않는 가로막이다 — 받을 이유가 없는 동의를 다시 묻는 셈이다.
//   반대로 항목을 하나라도 **늘리면 반드시 버전을 올린다.**
const CONSENT_VERSION = "2026-09-07.v2";

export default function MePage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  return <Account />;
}

function NotConfigured() {
  return (
    <Screen>
      <ScreenTitle>내 정보</ScreenTitle>
      <Card>
        <p className="text-[15px] font-bold">아직 서버와 연결되지 않았어요</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
          로그인 없이도 개념 카드와 오늘의 문항은 그대로 쓸 수 있어요. 기록은 이
          기기에만 남아요.
        </p>
        <p className="mt-3 rounded-2xl bg-bg-subtle p-3 text-[12px] leading-relaxed text-ink-faint">
          운영자: <code>NEXT_PUBLIC_SUPABASE_URL</code> · <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          를 <code>.env.local</code> 과 Vercel 환경 변수에 넣고, <code>supabase/schema.sql</code>
          을 실행하면 이 화면이 열려요.
        </p>
      </Card>
    </Screen>
  );
}

/**
 * 이 화면이 지금 무엇인가 — **셋 중 하나**다.
 *
 * 예전에는 `uid` 와 `profile` 두 상태로 갈랐다. 그러면 "로그인은 됐는데 프로필은
 * 아직 못 읽은" 중간 상태가 생기는데, 그 순간의 화면이 `!profile` 조건에 걸려
 * **개인정보 동의 화면**이었다. 로그인할 때마다, 토큰이 갱신될 때마다 동의
 * 화면이 얼핏 스쳤던 것이 이 때문이다 (2026-09-11).
 *
 * 상태를 하나로 합치면 그 중간 상태가 아예 표현되지 않는다. 프로필을 손에
 * 쥐기 전에는 `loading` 이고, `in` 이 되는 순간에는 이미 답을 안다.
 */
type Phase =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "in"; uid: string; profile: Profile | null }
  | { kind: "failed"; reason: string };

function Account() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  /**
   * 프로필을 이미 읽어 둔 사용자. 토큰 갱신·탭 복귀 때마다 onAuthStateChange 가
   * 다시 울리는데, 같은 사람이면 다시 읽을 것이 없다. 다시 읽으면 그때마다
   * 실패할 기회가 한 번씩 더 생길 뿐이다.
   */
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    let alive = true;

    async function enter(id: string | null) {
      if (!alive) return;
      if (!id) {
        loadedFor.current = null;
        setPhase({ kind: "anon" });
        return;
      }
      if (loadedFor.current === id) return; // 같은 사람 — 토큰만 갱신됐다
      loadedFor.current = id;
      setPhase({ kind: "loading" });
      try {
        const p = await loadProfile();
        if (!alive || loadedFor.current !== id) return;
        setPhase({ kind: "in", uid: id, profile: p });
        // 기억 상태 내려받기는 화면을 잡아 두지 않는다. 기다릴 이유가 없다 —
        // 프로필만 있으면 이 화면은 이미 그릴 수 있다
        void pullStudyStates();
      } catch (e) {
        if (!alive || loadedFor.current !== id) return;
        // 못 읽은 것을 "프로필이 없다"로 읽지 않는다. 그렇게 읽으면 이미
        // 동의한 학생에게 동의 화면이 뜬다
        loadedFor.current = null;
        setPhase({ kind: "failed", reason: (e as Error).message });
      }
    }

    void sb.auth.getSession().then(({ data }) => void enter(data.session?.user.id ?? null));
    const { data: sub } = sb.auth.onAuthStateChange(
      (_e, session) => void enter(session?.user.id ?? null),
    );
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setProfile = (p: Profile) =>
    setPhase((cur) => (cur.kind === "in" ? { ...cur, profile: p } : cur));

  async function signOut() {
    await supabase().auth.signOut();
    const p = loadProgress();
    delete p.userId;
    delete p.enrollment;
    delete p.plan;
    saveProgress(p);
    loadedFor.current = null;
    setPhase({ kind: "anon" });
  }

  if (phase.kind === "loading") {
    return (
      <Screen>
        <ScreenTitle>내 정보</ScreenTitle>
        <p className="text-[14px] text-ink-faint">불러오는 중…</p>
      </Screen>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Screen>
        <ScreenTitle>내 정보</ScreenTitle>
        <Card>
          <p className="text-[15px] font-bold">내 정보를 불러오지 못했어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            인터넷 연결을 확인하고 다시 눌러 주세요. 로그인은 그대로 남아 있어요.
          </p>
          <p className="mt-2 text-[12px] text-ink-faint">{phase.reason}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
          >
            다시 불러오기
          </button>
        </Card>
      </Screen>
    );
  }

  if (phase.kind === "anon") return <LoginPanel />;

  if (!phase.profile || phase.profile.consent_version !== CONSENT_VERSION) {
    return <Consent onAgreed={setProfile} />;
  }

  return <ProfileForm profile={phase.profile} onSaved={setProfile} onSignOut={signOut} />;
}

/** 개인정보 수집·이용 동의 — 필수 4요소를 한 화면에 (docs/privacy_notice.md) */
function Consent({ onAgreed }: { onAgreed: (p: Profile) => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function agree() {
    setBusy(true);
    try {
      const p = await saveProfile({
        consent_version: CONSENT_VERSION,
        consent_at: new Date().toISOString(),
      });
      if (p) onAgreed(p);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>개인정보 수집·이용 동의</ScreenTitle>
      <p className="-mt-3 mb-4 text-[13px] text-ink-sub">
        학습 기록을 서버에 남기려면 아래 내용에 동의가 필요해요. 꼭 필요한 것만 받아요.
      </p>
      <Card className="text-[14px] leading-relaxed">
        <Row k="수집 항목">
          아이디·비밀번호, 닉네임, 이메일 주소(비밀번호 찾기),
          학교(지역·시군구·학교급·학교명), 학년·학기·수강 과목,
          학습 기록(문항 응답, 개념별 기억 상태, 출석일)
        </Row>
        <Row k="수집·이용 목적">
          계정 식별과 로그인 · 비밀번호 재설정 · 학교 단위 학습 현황 확인 ·
          학습 범위 설정과 오늘의 문항 출제 · 복습 간격 계산
        </Row>
        <Row k="보유·이용 기간">
          회원 탈퇴 시까지, 또는 해당 학년도 종료 후 1년까지. 이후 지체 없이 파기해요.
        </Row>
        <Row k="처리 위탁">
          데이터베이스·인증은 Supabase Inc. 의 클라우드에 저장돼요.
        </Row>
        <Row k="동의를 거부할 권리">
          동의하지 않아도 돼요. 다만 로그인 기능(기록 저장, 기기 간 이어 하기,
          스터디룸·순위표)은 쓸 수 없고, 로그인 없이 개념 카드 열람과 문항 풀이는
          계속 가능해요.
        </Row>
      </Card>
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-ink-faint">
        만 14세 미만이라면 보호자(법정대리인)의 동의가 필요해요. 이름·전화번호·주소는
        받지 않아요. 전문은 <Link href="/privacy" className="underline">개인정보 처리방침</Link>
        에서 볼 수 있어요.
      </p>
      <label className="mt-5 flex items-start gap-3 rounded-[20px] bg-surface p-4 shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-5 w-5 accent-[#4b5be8]"
        />
        <span className="text-[14px] leading-relaxed">
          위 내용을 읽었고, 개인정보 수집·이용에 <b>동의합니다</b>. (필수)
        </span>
      </label>
      <BottomCta onClick={agree} disabled={!checked || busy}>
        동의하고 계속하기
      </BottomCta>
    </Screen>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      <p className="mb-1 text-[12px] font-bold text-ink-faint">{k}</p>
      <p className="text-ink">{children}</p>
    </div>
  );
}

function ProfileForm({
  profile,
  onSaved,
  onSignOut,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
  onSignOut: () => void;
}) {
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [grade, setGrade] = useState<1 | 2 | 3 | null>(profile.grade);
  const [semester, setSemester] = useState<1 | 2 | null>(profile.semester);
  const [subjects, setSubjects] = useState<string[]>(profile.subjects ?? []);
  const [email, setEmail] = useState(profile.recovery_email ?? "");
  const [school, setSchool] = useState<SchoolValue | null>(
    profile.school_code
      ? {
          sido_code: profile.sido_code ?? "",
          sido: profile.sido ?? "",
          sigungu: profile.sigungu ?? "",
          school_kind: profile.school_kind ?? "",
          school_code: profile.school_code,
          school_name: profile.school_name ?? "",
        }
      : null,
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    nickname !== (profile.nickname ?? "") ||
    grade !== profile.grade ||
    semester !== profile.semester ||
    subjects.join() !== (profile.subjects ?? []).join() ||
    email !== (profile.recovery_email ?? "") ||
    (school?.school_code ?? "") !== (profile.school_code ?? "");

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const p = await saveProfile({
        nickname: nickname.trim() || null,
        grade,
        semester,
        subjects,
        recovery_email: email.trim() || null,
        sido_code: school?.sido_code ?? null,
        sido: school?.sido ?? null,
        sigungu: school?.sigungu ?? null,
        school_kind: school?.school_kind ?? null,
        school_code: school?.school_code ?? null,
        school_name: school?.school_name ?? null,
        // invite_code 는 여기서 손대지 않는다 — 화면에서 뺐을 뿐 값은 그대로
        // 남는다 (아래 '초대 코드' 자리의 주석)
      });
      if (p) {
        onSaved(p);
        setMsg("저장했어요. 오늘의 문항이 이 범위로 다시 뽑혀요.");
      }
    } catch (e) {
      const m = (e as Error).message;
      // 유일 인덱스에 걸린 것이라 서버 문구가 영어다. 학생이 읽을 말로 바꾼다
      if (/profiles_nickname_key/i.test(m)) {
        setMsg("이미 쓰이고 있는 닉네임이에요. 다른 닉네임으로 해 주세요.");
      } else {
        setMsg(`저장하지 못했어요: ${m}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const toggle = (code: string) =>
    setSubjects((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]));

  return (
    <Screen>
      <div className="mb-1 flex items-center justify-between">
        <ScreenTitle>내 정보</ScreenTitle>
        <button onClick={onSignOut} className="mb-5 text-[13px] font-semibold text-ink-faint">
          로그아웃
        </button>
      </div>

      <SectionLabel>아이디</SectionLabel>
      <Card className="!p-3">
        {/* 아이디는 계정을 가리키는 이름이라 바꾸지 않는다. 바꾸면 로그인에 쓰는
            합성 주소도 함께 바뀌어야 하는데, 그건 계정을 새로 만드는 일과 같다 */}
        <p className="px-2 text-[16px] font-bold">{profile.username ?? "—"}</p>
      </Card>

      <SectionLabel>닉네임</SectionLabel>
      <Card className="!p-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="한글·영문·숫자 2~12자"
          className="h-11 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300"
        />
      </Card>

      <SectionLabel>학년 · 학기</SectionLabel>
      {/* 학년과 학기를 한 줄에 놓으면 좁은 화면에서 칩 다섯 개가 접히면서
          학년 칩만 두 줄로 흘러내린다. 접히는 자리가 화면 폭에 따라 달라져
          어디까지가 학년이고 어디부터가 학기인지 읽히지 않는다.
          줄을 나눠 두면 폭과 무관하게 같은 모양으로 보인다. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((g) => (
            <Pill key={g} on={grade === g} onClick={() => setGrade(g)}>{g}학년</Pill>
          ))}
        </div>
        <div className="flex gap-2">
          {([1, 2] as const).map((s) => (
            <Pill key={s} on={semester === s} onClick={() => setSemester(s)}>{s}학기</Pill>
          ))}
        </div>
      </div>

      <SectionLabel>수강 과목</SectionLabel>
      <p className="-mt-1 mb-3 text-[13px] text-ink-sub">
        고른 과목에서만 오늘의 문항이 나와요. 나중에 언제든 바꿀 수 있어요.
      </p>

      {/* 과목 구분(공통·일반 선택·진로 선택)으로 묶는다. 학생이 시간표를 짤 때
          쓰는 말이 이것이라, 한 줄에 섞어 두면 구분이 눈에 들어오지 않는다.
          카드가 없는 과목은 흐리게 두고 고르지 못하게 한다 — 골라 봐야 그 과목에서
          나올 문항이 없어서, 고르고 나면 오늘의 학습이 비어 버린다 */}
      {groupByCourseType(CATALOG.subjects).map(([type, list]) => (
        <div key={type || "etc"} className="mb-4">
          <p className="mb-2 px-1 text-[12px] font-bold text-ink-faint">
            {courseTypeLabel(type)}
          </p>
          <div className="flex flex-col gap-2">
            {list.map((s) => {
              const on = subjects.includes(s.code);
              const ready = s.cardCount > 0;
              const accent = accentOfSubject(s.name);
              return (
                <button
                  key={s.code}
                  // 이미 골라 둔 과목은 준비 중이 되더라도 뺄 수 있어야 한다 —
                  // 못 빼면 그 학생의 출제 범위에 빈 과목이 영영 남는다
                  onClick={() => (ready || on) && toggle(s.code)}
                  disabled={!ready && !on}
                  aria-pressed={on}
                  className={`flex items-center justify-between rounded-[20px] px-5 py-4 text-left transition-colors ${
                    !ready
                      ? "bg-surface/60 opacity-60"
                      : on
                        ? `${accent.tint} ring-2 ring-inset ring-current ${accent.text}`
                        : "bg-surface shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-ink">{s.name}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-sub">
                      {ready
                        ? `개념 ${s.cardCount}장 · 단원 ${s.units.filter((u) => u.cards).length}개`
                        : "아직 준비 중이에요"}
                    </span>
                  </span>
                  {ready ? (
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                        on ? `${accent.solid} text-white` : "bg-bg-subtle text-ink-faint"
                      }`}
                    >
                      {on ? "✓" : "＋"}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-bg-subtle px-2.5 py-1 text-[11px] font-bold text-ink-faint">
                      준비 중
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <SectionLabel>학교</SectionLabel>
      <Card className="!p-3">
        <SchoolPicker value={school} onChange={setSchool} />
      </Card>

      <SectionLabel>이메일</SectionLabel>
      <Card className="!p-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="비밀번호를 잊었을 때 쓰는 주소"
          autoComplete="email"
          inputMode="email"
          className="h-11 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300"
        />
      </Card>

      {/* ── 초대 코드 자리 (2026-09-11 교사 결정으로 화면에서 뺐다) ────────────
          지운 것은 **입력 칸뿐**이다. `profiles.invite_code` 열도, 서버의
          `redeem_invite` 함수도, 그것을 보는 `lib/viewer.ts` 도 그대로 살아
          있다 — 저 셋은 교과서 그림(restricted 자산)을 수업 참여 학생에게만
          여는 장치이고(CLAUDE.md §6, docs/rights_policy.md), 지금은
          `MEDIA_REQUIRES_LOGIN` 스위치가 내려가 있어 쓰이지 않을 뿐이다.

          ★ 그 스위치를 다시 올리는 날, 코드를 넣을 자리가 없으면 아무 학생도
            그림을 볼 수 없게 된다. 그때 이 자리를 되살려야 한다. 장치까지
            함께 지웠다면 되살릴 것이 남아 있지 않았을 것이다. ─────────────── */}

      {msg && <p className="mt-4 text-[14px] font-semibold text-primary-700">{msg}</p>}

      <BottomCta onClick={save} disabled={!dirty || busy}>
        저장하기
      </BottomCta>
    </Screen>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[14px] font-bold ${
        on ? "bg-primary-500 text-white shadow-chip" : "bg-surface text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.05)]"
      }`}
    >
      {children}
    </button>
  );
}
