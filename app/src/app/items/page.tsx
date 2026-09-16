"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, EmptyState, Screen, ScreenTitle, SectionLabel } from "@/components/ui";
import SubjectSelect from "@/components/SubjectSelect";
import { papersByUnit, type ExamPaper } from "@/lib/exam";
import { examProgress, useProgress } from "@/lib/store";
import { subjectNameOf } from "@/data/catalog";
import { loadUi, saveUi } from "@/lib/ui-state";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 문제 탭 — 단원별 평가지 목록.
 *
 * ★ 문항 이미지는 로그인해야 열린다 (2026-09-16 교사 결정). 목록과 문항 수는
 *   로그인 없이도 보여 준다 — 무엇이 있는지도 모르는 채 로그인하라고 하면
 *   왜 해야 하는지 알 수 없다.
 *
 * ★ 과목을 먼저 고르고 그 안의 단원을 본다. 개념 탭과 같은 순서다. 과목이
 *   하나뿐인 지금도 과목 이름을 띄운다 — 과목이 둘 이상이 되는 순간 "이
 *   단원이 어느 과목 것인지" 알 수 없는 목록이 되고, 같은 이름의 단원이
 *   과목마다 있어 섞이면 되돌릴 수 없다.
 */
export default function ItemsPage() {
  const groups = papersByUnit();
  const progress = useProgress();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSignedIn(false);
      return;
    }
    const sb = supabase();
    let alive = true;
    void sb.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (alive) setSignedIn(Boolean(session));
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /**
   * 보여 줄 과목 — 내 정보의 수강 과목이 곧 이 목록이다. 아직 아무것도 고르지
   * 않았다면(비로그인 포함) 문항이 있는 과목 전부. 개념 탭과 같은 규칙이다.
   */
  const subjects = useMemo(() => {
    const all = groups.map((g) => g.subject);
    const mine = new Set(
      (progress.enrollment?.subjects ?? [])
        .map(subjectNameOf)
        .filter((n): n is string => Boolean(n)),
    );
    const picked = all.filter((s) => mine.has(s));
    return picked.length > 0 ? picked : all;
  }, [groups, progress.enrollment]);

  const [subject, setSubject] = useState(subjects[0]);
  const restored = useRef(false);
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const saved = loadUi().itemsSubject;
      if (saved && subjects.includes(saved)) {
        setSubject(saved);
        return;
      }
    }
    if (subjects.length > 0 && !subjects.includes(subject)) setSubject(subjects[0]);
  }, [subjects, subject]);

  function chooseSubject(s: string) {
    setSubject(s);
    saveUi({ itemsSubject: s });
  }

  if (groups.length === 0) {
    return (
      <Screen>
        <ScreenTitle>문제</ScreenTitle>
        <EmptyState
          art="empty-items"
          title="아직 들어온 문항이 없어요. 평가지가 준비되면 여기서 단원별로 풀 수 있어요."
          action={
            <Link
              href="/"
              className="rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
            >
              오늘의 학습으로
            </Link>
          }
        />
      </Screen>
    );
  }

  const shown = groups.find((g) => g.subject === subject) ?? groups[0];

  return (
    <Screen>
      <ScreenTitle>문제</ScreenTitle>

      <SubjectSelect subjects={subjects} value={subject} onChange={chooseSubject} />

      {signedIn === false && (
        <Card className="mb-4 !bg-primary-50">
          <p className="text-[15px] font-bold text-primary-700">로그인하면 문제가 열려요</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-sub">
            평가 문항은 교과서 발행사가 만든 자료예요. 수업을 듣는 학생에게만 보여 줄 수
            있어서, 문항을 여는 데는 로그인이 필요해요.
          </p>
          <Link
            href="/me"
            className="mt-3 inline-block rounded-full bg-primary-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-chip"
          >
            로그인하러 가기
          </Link>
        </Card>
      )}

      {shown.units.map((u) => (
        <div key={u.unitId}>
          <SectionLabel>
            {u.title}
            <span className="ml-2 text-[13px] font-semibold text-ink-faint">
              {u.papers.reduce((n, p) => n + p.count, 0)}문항
            </span>
          </SectionLabel>
          <div className="flex flex-col gap-2">
            {u.papers.map((p) => (
              <PaperRow key={p.paperId} paper={p} locked={signedIn === false} />
            ))}
          </div>
        </div>
      ))}

      {/* 고른 과목에 아직 문항이 없을 때. 빈 화면만 남기지 않는다 —
          다른 과목에는 있다는 것을 알려 줘야 학생이 과목을 바꿔 본다 */}
      {shown.units.length === 0 && (
        <Card>
          <p className="text-[15px] font-bold">{subject} 문항은 아직 없어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            위에서 다른 과목을 골라 보세요. 준비되는 대로 여기에 단원별로 쌓여요.
          </p>
        </Card>
      )}

      <p className="mt-8 px-1 text-[12px] leading-relaxed text-ink-faint">
        문항 출처: 천재교육 {subject} 평가자료. 저작권법 제25조 제3항 수업 목적 이용이며,
        로그인한 학생에게만 보여요.
      </p>
    </Screen>
  );
}

function PaperRow({ paper, locked }: { paper: ExamPaper; locked: boolean }) {
  // 진행률은 localStorage 에 있다 — 서버 렌더와 첫 그림에서는 0 이어야 한다
  const [done, setDone] = useState(0);
  useEffect(() => {
    setDone(examProgress(paper.items.map((i) => i.id)).done);
  }, [paper]);

  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold">{paper.label}</span>
        <span className="mt-0.5 block text-[12px] text-ink-sub">
          {paper.count}문항 · 객관식 {paper.items.filter((i) => i.kind === "choice").length}
          {done > 0 && ` · ${done}문항 풀었어요`}
        </span>
      </span>
      <span className="shrink-0 text-[16px] text-ink-faint" aria-hidden>
        {locked ? "🔒" : "›"}
      </span>
    </>
  );

  const cls =
    "flex items-center justify-between gap-3 rounded-[20px] bg-surface px-5 py-4 shadow-[0_2px_14px_rgba(23,58,94,0.06)]";

  if (locked) {
    return (
      <div className={`${cls} opacity-60`} aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <Link href={`/items/${paper.paperId}`} className={`${cls} active:bg-bg-subtle`}>
      {body}
    </Link>
  );
}
