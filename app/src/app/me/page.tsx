"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LoginPanel from "@/components/LoginPanel";
import SchoolPicker, { type SchoolValue } from "@/components/SchoolPicker";
import { BottomCta, Card, Chip, Screen, ScreenTitle, SectionLabel, StatRow } from "@/components/ui";
import {
  CATALOG,
  courseTypeLabel,
  groupByCourseType,
  orderSubjectNames,
  subjectNameOf,
} from "@/data/catalog";
import { isSupabaseConfigured, supabase, type Profile } from "@/lib/supabase";
import { accentOfSubject } from "@/lib/brand";
import { loadProfile, pullStudyStates, saveProfile } from "@/lib/sync";
import { loadProgress, saveProgress, useProgress } from "@/lib/store";
import {
  initialPlan,
  normalizePlan,
  prunePlan,
  samePlan,
  slotLabel,
  slotOf,
  SLOTS,
  type CoursePlan,
  type Slot,
} from "@/lib/enrollment";

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

  return <ProfileHome profile={phase.profile} onSaved={setProfile} onSignOut={signOut} />;
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

  // 시안 ⑫ 의 '2 / 3' 진행 막대는 달지 않는다. 이 화면은 가입 단계의 하나가
  // 아니라 로그인 뒤에 따로 뜨는 관문이고, 동의 버전이 오르면 이미 가입한
  // 학생에게도 단독으로 뜬다 — 그때 '몇 단계 중 몇'은 맞는 말이 아니다.
  //
  // 문구는 docs/privacy_notice.md 와 같아야 한다. 바꾸면 CONSENT_VERSION 판단이
  // 따라오고, 그것은 교사가 정한다 (맨 위 주석).
  //
  // ★ 2026-10-07: '거부할 권리'의 예시를 원본대로 '교과서 그림 열람'으로 맞췄다
  //   (교사 결정 — 코드만 '스터디룸·순위표'로 갈라져 있었다). 수집 범위는 그대로라
  //   위 기준에 따라 버전은 올리지 않는다.
  return (
    <Screen>
      {/* 제목을 두 줄로 — 끊는 자리는 '동의' 앞이다. 학생이 이 화면에서 할 일이
          그 한 단어라서 줄 머리에 오게 둔다 */}
      <h1 className="mb-2 text-[24px] font-extrabold leading-snug">
        개인정보 수집·이용
        <br />
        동의
      </h1>
      <p className="mb-5 text-[14px] leading-relaxed text-ink-sub">
        학습 기록을 서버에 남기려면 아래 내용에 동의가 필요해요. 꼭 필요한 것만 받아요.
      </p>
      {/* 안내문은 흰 카드가 아니라 옅은 바탕에 둔다 — 아래 체크 줄과 CTA 가
          눈에 먼저 들어오지 않게, 읽을거리라는 것이 모양으로 보이게 */}
      <div className="rounded-[24px] bg-bg-subtle px-5 py-4 text-[14px] leading-relaxed">
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
          교과서 그림 열람)은 쓸 수 없고, 로그인 없이 개념 카드 열람과 문항 풀이는
          계속 가능해요.
        </Row>
      </div>
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-ink-faint">
        만 14세 미만이라면 보호자(법정대리인)의 동의가 필요해요. 이름·전화번호·주소는
        받지 않아요. 전문은 <Link href="/privacy" className="underline">개인정보 처리방침</Link>
        에서 볼 수 있어요.
      </p>
      <div className="mt-5 flex items-start gap-3 px-1">
        {/* 진짜 체크박스는 화면에서만 감추고(sr-only) 키보드·스크린 리더는 그대로
            쓰게 둔다. 보이는 상자는 그 상태를 따라 그린다 — 켜지면 색과 함께
            ✓ 모양이 생겨서 색을 못 가려도 상태가 읽힌다 (D4).
            예전의 accent-[#…] 는 토큰 밖의 색이라 걷어냈다 */}
        <label className="flex flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300 ${
              checked ? "bg-primary-500 text-white" : "bg-surface ring-2 ring-inset ring-line"
            }`}
          >
            {checked && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
          <span className="text-[14px] leading-relaxed">
            위 내용을 읽었고, 개인정보 수집·이용에 <b>동의합니다</b>. (필수)
          </span>
        </label>
        {/* '보기'는 label 밖에 둔다 — 안에 두면 링크를 누를 때 체크까지 바뀐다 */}
        <Link
          href="/privacy"
          aria-label="개인정보 처리방침 전문 보기"
          className="shrink-0 pt-0.5 text-[14px] font-bold text-primary-700 underline underline-offset-4"
        >
          보기
        </Link>
      </div>
      <BottomCta onClick={agree} disabled={!checked || busy}>
        동의하고 계속하기
      </BottomCta>
    </Screen>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    // 옅은 바탕 위라 줄 대신 간격으로 나눈다 — 라벨은 진하게, 내용은 한 단계 옅게
    <div className="py-2.5 first:pt-0 last:pb-0">
      <p className="mb-0.5 text-[13px] font-bold text-ink">{k}</p>
      <p className="text-ink-sub">{children}</p>
    </div>
  );
}

/**
 * 프로필 첫 화면 — 보기와 고치기를 나눈다 (Figma 시안 ⑪).
 *
 * 예전에는 들어오자마자 입력 칸 여섯 묶음이 펼쳐진 폼이었다. 학생이 이 탭을
 * 여는 이유는 대개 "내가 무슨 과목으로 잡혀 있나"를 보는 것이라, 고칠 때만
 * 폼을 연다. 폼 자체(저장 내용·출제 범위 규칙)는 그대로다.
 *
 * 학년·학기를 아직 고르지 않은 학생은 바로 폼으로 간다 — 보기 화면에 빈 칸만
 * 늘어놓아 봐야 할 일은 결국 '수정'을 누르는 것 하나다.
 */
function ProfileHome({
  profile,
  onSaved,
  onSignOut,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
  onSignOut: () => void;
}) {
  const [editing, setEditing] = useState<null | "all" | "subjects">(() =>
    profile.grade == null || profile.semester == null ? "all" : null,
  );
  const [msg, setMsg] = useState<string | null>(null);
  const progress = useProgress();

  if (editing) {
    return (
      <ProfileForm
        profile={profile}
        focus={editing}
        onSaved={(p) => {
          onSaved(p);
          setEditing(null);
          setMsg("저장했어요. 오늘의 문항이 이 범위로 다시 뽑혀요.");
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const open = (what: "all" | "subjects") => {
    setMsg(null);
    setEditing(what);
  };

  // 실명은 받지 않는다(R13). 보이는 이름은 닉네임, 없으면 아이디다
  const alias = profile.nickname || profile.username || "이름 없음";
  const initial = Array.from(alias)[0] ?? "?";
  const where = [
    profile.school_name,
    profile.grade && profile.semester ? `${profile.grade}학년 ${profile.semester}학기` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const subjectNames = orderSubjectNames(
    (profile.subjects ?? []).map(subjectNameOf).filter((n): n is string => Boolean(n)),
  );

  return (
    <Screen>
      <h1 className="sr-only">내 정보</h1>

      {/* 틴트 헤더 — 아바타·이름·학교를 가운데 모아 "내 화면"으로 읽히게 한다
          (세모 내 정보, 시안 v2 내 정보 B). 좌우로 화면 끝까지 깔린다 */}
      <section className="-mx-5 -mt-5 mb-3 flex flex-col items-center bg-gradient-to-b from-primary-50 to-bg px-5 pb-5 pt-7 text-center md:-mx-8 md:px-8">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-500 text-[24px] font-extrabold text-white shadow-chip"
        >
          {initial}
        </span>
        <p className="mt-3 max-w-full truncate text-[19px] font-extrabold">{alias}</p>
        <p className="mt-0.5 max-w-full truncate text-[13px] text-ink-sub">
          {where || "학교·학년을 아직 고르지 않았어요"}
        </p>
        <button
          onClick={() => open("all")}
          className="mt-3 h-9 rounded-full bg-surface px-4 text-[13px] font-bold text-ink-sub shadow-card"
        >
          프로필 수정 ✎
        </button>
      </section>

      {msg && (
        <p role="status" className="mt-3 px-1 text-[14px] font-semibold text-primary-700">
          {msg}
        </p>
      )}

      {/* 숫자는 이 기기의 기록(lib/store)에서 센다 — 세지 않는 값은 올리지 않는다.
          인출한 개념 = FSRS 기억 상태가 생긴 카드(한 번이라도 떠올려 본 카드),
          푼 문항 = 기출·평가 문항 */}
      <div className="mt-3">
        <StatRow
          items={[
            { value: `${progress.streak.count}일`, label: "연속 학습" },
            { value: Object.keys(progress.studyStates).length, label: "인출한 개념" },
            { value: Object.keys(progress.exam).length, label: "푼 문항" },
          ]}
        />
      </div>

      <Card className="mt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">수강 과목</h2>
          <button
            onClick={() => open("subjects")}
            className="-mr-1 px-1 text-[14px] font-bold text-primary-700"
          >
            변경 ›
          </button>
        </div>
        {/* 스케줄러(lib/scheduler)와 개념 탭(concepts/page)이 모두 이 값을 본다 */}
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-sub">
          오늘의 문항과 개념 탭이 이 과목으로 좁혀져요
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* 과목 칩은 과목 색을 입는다 — 개념 탭·문제 탭과 같은 색이라야 한 과목으로 읽힌다 */}
          {subjectNames.map((n) => {
            const a = accentOfSubject(n);
            return (
              <span
                key={n}
                className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${a.tint} ${a.text}`}
              >
                {n}
              </span>
            );
          })}
          {/* 더하는 것도 고르는 화면이 같다 — 따로 만들지 않고 같은 폼을 연다 */}
          <button
            onClick={() => open("subjects")}
            className="inline-flex items-center rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink-sub ring-1 ring-inset ring-line"
          >
            ＋ 과목 추가
          </button>
        </div>
      </Card>

      {/* 설정 줄 — 지금 있는 것만 둔다. 초대 코드는 2026-09-11 교사 결정으로
          화면에서 뺐다(아래 ProfileForm 의 '초대 코드 자리' 주석). 학습 알림은
          아직 없는 기능이라 시안에 있어도 올리지 않는다 */}
      <Card className="mt-3 !px-0 !py-2">
        <Link
          href="/concepts"
          className="flex items-center justify-between px-5 py-3 active:bg-bg-subtle"
        >
          <span className="flex items-center gap-2.5 text-[15px]">
            <span aria-hidden className="text-primary-500">★</span>북마크한 개념
          </span>
          <span className="flex items-center gap-1.5 text-[14px] text-ink-faint">
            {progress.bookmarks.length}
            <Chevron />
          </span>
        </Link>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2.5 text-[15px]">
            <span aria-hidden className="text-ink-faint">ⓘ</span>아이디
          </span>
          {/* 아이디는 바꾸지 않는다 — 폼의 '아이디' 자리 주석 */}
          <span className="text-[14px] text-ink-faint">{profile.username ?? "—"}</span>
        </div>
        <Link
          href="/privacy"
          className="flex items-center justify-between px-5 py-3 active:bg-bg-subtle"
        >
          <span className="flex items-center gap-2.5 text-[15px]">
            <span aria-hidden className="text-ink-faint">🔒</span>개인정보 처리방침
          </span>
          <Chevron />
        </Link>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 px-5 py-3 text-left text-[15px] text-ink-sub active:bg-bg-subtle"
        >
          <span aria-hidden className="text-ink-faint">↪</span>로그아웃
        </button>
      </Card>
    </Screen>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ProfileForm({
  profile,
  focus,
  onSaved,
  onCancel,
}: {
  profile: Profile;
  /** '변경'으로 들어오면 과목 고르는 자리로 바로 내려간다 */
  focus: "all" | "subjects";
  onSaved: (p: Profile) => void;
  onCancel: () => void;
}) {
  const subjectsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus === "subjects") subjectsRef.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [grade, setGrade] = useState<1 | 2 | 3 | null>(profile.grade);
  const [semester, setSemester] = useState<1 | 2 | null>(profile.semester);
  /**
   * 학기별 수강 과목. 화면에서 고치는 것은 **한 칸**이지만(editSlot), 저장할
   * 때는 여섯 칸을 한 벌로 보낸다 (lib/enrollment.ts)
   */
  const [plan, setPlan] = useState<CoursePlan>(() =>
    initialPlan(profile.course_plan, slotOf(profile.grade, profile.semester), profile.subjects),
  );
  const [editSlot, setEditSlot] = useState<Slot>(
    () => slotOf(profile.grade, profile.semester) ?? "1-1",
  );
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

  // 지금 학기 칸. 학년·학기를 아직 고르지 않았다면 고쳐 보고 있는 칸을 쓴다 —
  // 그렇지 않으면 저장할 과목이 없어져 출제 범위가 통째로 비어 버린다
  const activeSlot = slotOf(grade, semester) ?? editSlot;
  const subjects = plan[activeSlot] ?? [];
  const editing = plan[editSlot] ?? [];

  const dirty =
    nickname !== (profile.nickname ?? "") ||
    grade !== profile.grade ||
    semester !== profile.semester ||
    subjects.join() !== (profile.subjects ?? []).join() ||
    !samePlan(prunePlan(plan), normalizePlan(profile.course_plan)) ||
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
        course_plan: prunePlan(plan),
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
      // 저장 알림("저장했어요 …")은 보기 화면이 띄운다 — 저장하면 폼을 닫고
      // 그리로 돌아가므로, 여기서 띄우면 읽기도 전에 사라진다
      if (p) onSaved(p);
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

  /** 고르고 빼는 것은 **지금 보고 있는 학기 칸**이다 */
  const toggle = (code: string) =>
    setPlan((p) => {
      const cur = p[editSlot] ?? [];
      return {
        ...p,
        [editSlot]: cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code],
      };
    });

  /** 학년·학기를 고치면 보고 있던 칸도 그 학기로 따라간다 */
  function chooseGrade(g: 1 | 2 | 3) {
    setGrade(g);
    const next = slotOf(g, semester);
    if (next) setEditSlot(next);
  }
  function chooseSemester(sem: 1 | 2) {
    setSemester(sem);
    const next = slotOf(grade, sem);
    if (next) setEditSlot(next);
  }

  return (
    <Screen>
      <div className="mb-1 flex items-center justify-between">
        <ScreenTitle>내 정보 수정</ScreenTitle>
        {/* 로그아웃은 보기 화면의 설정 줄로 옮겼다. 여기서는 고친 것을 버리고
            나가는 길만 둔다 — 폼이 닫히면 입력 상태도 함께 사라진다 */}
        <button onClick={onCancel} className="mb-5 text-[13px] font-semibold text-ink-faint">
          취소
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
            <Pill key={g} on={grade === g} onClick={() => chooseGrade(g)}>{g}학년</Pill>
          ))}
        </div>
        <div className="flex gap-2">
          {([1, 2] as const).map((s) => (
            <Pill key={s} on={semester === s} onClick={() => chooseSemester(s)}>{s}학기</Pill>
          ))}
        </div>
      </div>

      <div ref={subjectsRef} className="scroll-mt-4" />
      <SectionLabel>학기별 수강 과목</SectionLabel>
      <p className="-mt-1 mb-3 text-[13px] leading-relaxed text-ink-sub">
        오늘의 문항은 <b className="text-ink">지금 학기</b>에 고른 과목에서만 나와요.
        다른 학기도 미리 채워 두면 학기가 바뀔 때 그대로 이어져요.
      </p>

      {/* 학기 칸 고르기 — 지금 학기에는 표를 달아 둔다. 표가 없으면 어느 칸을
          고치고 있는지와 어느 칸이 출제 범위인지가 같은 모양이라 구분되지 않는다 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {SLOTS.map(({ slot, label }) => {
          const count = (plan[slot] ?? []).length;
          const now = slot === slotOf(grade, semester);
          const on = slot === editSlot;
          return (
            <button
              key={slot}
              onClick={() => setEditSlot(slot)}
              aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold ${
                on
                  ? "bg-primary-500 text-white shadow-chip"
                  : "bg-surface text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.05)]"
              }`}
            >
              {label}
              {now && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    on ? "bg-white/25 text-white" : "bg-primary-50 text-primary-600"
                  }`}
                >
                  지금
                </span>
              )}
              <span className={on ? "text-white/70" : "text-ink-faint"}>{count}</span>
            </button>
          );
        })}
      </div>

      <p className="mb-3 px-1 text-[13px] font-bold text-ink-sub">
        {slotLabel(editSlot)}에 듣는 과목
        {editing.length > 0 && (
          <span className="ml-1.5 font-semibold text-ink-faint">{editing.length}과목</span>
        )}
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
              const on = editing.includes(s.code);
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
