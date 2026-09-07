"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoginPanel from "@/components/LoginPanel";
import SchoolPicker, { type SchoolValue } from "@/components/SchoolPicker";
import { BottomCta, Card, Screen, ScreenTitle, SectionLabel } from "@/components/ui";
import { CATALOG } from "@/data/catalog";
import { isSupabaseConfigured, supabase, type Profile } from "@/lib/supabase";
import { loadProfile, pullStudyStates, redeemInvite, saveProfile } from "@/lib/sync";
import { loadProgress, saveProgress } from "@/lib/store";

/**
 * 내 정보 — 노선 탭 자리에 임시로 (SciMetro 는 한참 뒤다. Design.md §4.6).
 *
 * 흐름: 연결 안 됨 안내 → 로그인(구글 · 이메일 링크, docs/login_design.md) → 개인정보 동의 → 프로필
 * (학번 별칭 · 학년 · 학기 · 수강 과목 · 초대 코드). 저장하면 스케줄러의 출제
 * 범위가 그 과목·학기로 잡힌다.
 *
 * 동의 문구의 원본은 docs/privacy_notice.md 다. 여기 문구를 고치면 그 파일과
 * CONSENT_VERSION 을 같이 올린다 — 버전이 다르면 다시 동의를 받는다.
 */

// 아이디·비밀번호 가입으로 바뀌면서 수집 항목이 달라졌다 → 버전을 올려
// 다시 동의를 받는다 (원본 문구는 docs/privacy_notice.md)
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

function Account() {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const sb = supabase();
    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      const id = data.session?.user.id ?? null;
      setUid(id);
      if (id) {
        setProfile(await loadProfile());
        await pullStudyStates();
      }
      setBusy(false);
    })();
    const { data: sub } = sb.auth.onAuthStateChange(async (_e, session) => {
      const id = session?.user.id ?? null;
      setUid(id);
      if (id) {
        setProfile(await loadProfile());
        await pullStudyStates();
      } else {
        setProfile(null);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase().auth.signOut();
    const p = loadProgress();
    delete p.userId;
    delete p.enrollment;
    delete p.plan;
    saveProgress(p);
    setProfile(null);
    setUid(null);
  }

  if (busy && !uid) return <Screen><ScreenTitle>내 정보</ScreenTitle></Screen>;

  if (!uid) return <LoginPanel />;

  if (!profile || profile.consent_version !== CONSENT_VERSION) {
    return <Consent onAgreed={setProfile} />;
  }

  return <ProfileForm profile={profile} onSaved={setProfile} onSignOut={signOut} />;
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
          아이디·비밀번호, 이메일 주소(비밀번호 찾기), 학교(지역·시군구·학교급·학교명),
          학번 별칭, 학년·학기·수강 과목, 학습 기록(문항 응답, 개념별 기억 상태,
          출석일), 초대 코드
        </Row>
        <Row k="수집·이용 목적">
          계정 식별과 로그인 · 비밀번호 재설정 · 학교 단위 학습 현황 확인 ·
          학습 범위 설정과 오늘의 문항 출제 · 복습 간격 계산 · 수업 참여 학생
          확인과 교과서 자료 열람 권한(학기 종료 시 만료)
        </Row>
        <Row k="보유·이용 기간">
          회원 탈퇴 시까지, 또는 해당 학년도 종료 후 1년까지. 이후 지체 없이 파기해요.
        </Row>
        <Row k="처리 위탁">
          데이터베이스·인증은 Supabase Inc. 의 클라우드에 저장돼요.
        </Row>
        <Row k="동의를 거부할 권리">
          동의하지 않아도 돼요. 다만 로그인 기능(기록 저장, 기기 간 이어 하기, 교과서
          그림 열람)은 쓸 수 없고, 로그인 없이 개념 카드 열람과 문항 풀이는 계속
          가능해요.
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
  const [invite, setInvite] = useState(profile.invite_code ?? "");
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
    (school?.school_code ?? "") !== (profile.school_code ?? "") ||
    invite !== (profile.invite_code ?? "");

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      let inviteToSave = profile.invite_code;
      if (invite.trim() && invite.trim() !== profile.invite_code) {
        const ok = await redeemInvite(invite);
        if (!ok) {
          setMsg("초대 코드가 맞지 않거나 만료됐어요.");
          return;
        }
        inviteToSave = invite.trim();
      }
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
        invite_code: inviteToSave,
      });
      if (p) {
        onSaved(p);
        setMsg("저장했어요. 오늘의 문항이 이 범위로 다시 뽑혀요.");
      }
    } catch (e) {
      setMsg(`저장하지 못했어요: ${(e as Error).message}`);
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

      <SectionLabel>학번 별칭</SectionLabel>
      <Card className="!p-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="예: 20315"
          className="h-11 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300"
        />
      </Card>

      <SectionLabel>학년 · 학기</SectionLabel>
      <div className="flex gap-2">
        {([1, 2, 3] as const).map((g) => (
          <Pill key={g} on={grade === g} onClick={() => setGrade(g)}>{g}학년</Pill>
        ))}
        <span className="w-2" />
        {([1, 2] as const).map((s) => (
          <Pill key={s} on={semester === s} onClick={() => setSemester(s)}>{s}학기</Pill>
        ))}
      </div>

      <SectionLabel>수강 과목</SectionLabel>
      <p className="-mt-1 mb-2 text-[13px] text-ink-sub">
        고른 과목에서만 오늘의 문항이 나와요. 학기를 고르면 그 학기 단원으로 좁혀져요.
      </p>
      <div className="flex flex-col gap-2">
        {CATALOG.subjects.map((s) => {
          const on = subjects.includes(s.code);
          return (
            <button
              key={s.code}
              onClick={() => toggle(s.code)}
              className={`flex items-center justify-between rounded-[20px] px-5 py-4 text-left ${
                on ? "bg-primary-50 ring-2 ring-primary-500" : "bg-surface shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
              }`}
            >
              <span>
                <span className="block text-[15px] font-bold">{s.name}</span>
                <span className="block text-[12px] text-ink-sub">
                  {s.courseType ?? ""} · 단원 {s.units.length}개
                  {s.units.length > 0 && s.units.every((u) => u.semester == null) && " · 학기 미지정"}
                </span>
              </span>
              <span className={`text-[18px] ${on ? "text-primary-600" : "text-ink-faint"}`}>
                {on ? "✓" : "＋"}
              </span>
            </button>
          );
        })}
      </div>

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

      <SectionLabel>초대 코드</SectionLabel>
      <Card className="!p-3">
        <input
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          placeholder="선생님께 받은 코드"
          autoCapitalize="characters"
          className="h-11 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300"
        />
      </Card>
      <p className="mt-2 px-1 text-[12px] text-ink-faint">
        수업 참여 확인용이에요. 교과서 그림 열람 권한이 이 코드로 열려요.
      </p>

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
