"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Card, Screen, SectionLabel } from "@/components/ui";
import { subjectSummaries, subjectTitle, unitsOfSubject, type ExamPaper } from "@/lib/exam";
import { accentOfSubject } from "@/lib/brand";
import { examProgress } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 한 과목의 평가지 — 대단원 → 회차.
 *
 * ★ 문항 이미지는 로그인해야 열린다 (2026-09-16 교사 결정). 목록과 문항 수는
 *   로그인 없이도 보여 준다 — 무엇이 있는지도 모르는 채 로그인하라고 하면
 *   왜 해야 하는지 알 수 없다.
 */
export default function SubjectItemsPage({ params }: PageProps<"/items/[subjectCode]">) {
  const { subjectCode } = use(params);
  const known = subjectSummaries().some((s) => s.code === subjectCode);
  const units = unitsOfSubject(subjectCode);
  const name = subjectTitle(subjectCode);
  const accent = accentOfSubject(name);

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

  if (!known) notFound();

  return (
    <Screen>
      {/* 브레드크럼 — 어느 과목 안에 있는지가 늘 보여야 한다 */}
      <nav className="mb-4 flex items-center gap-2 text-[13px] text-ink-faint">
        <Link
          href="/items"
          aria-label="과목 목록으로"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[15px] text-ink shadow-[0_2px_10px_rgba(23,58,94,0.06)]"
        >
          ←
        </Link>
        문제
      </nav>

      <h1 className={`mb-1 inline-flex rounded-full px-4 py-1.5 text-[16px] font-bold ${accent.tint} ${accent.text}`}>
        {name}
      </h1>

      {signedIn === false && (
        <Card className="mb-4 mt-3 !bg-primary-50">
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

      {units.map((u) => (
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

      <p className="mt-8 px-1 text-[12px] leading-relaxed text-ink-faint">
        문항 출처: 천재교육 {name} 평가자료. 저작권법 제25조 제3항 수업 목적 이용이며,
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
    <Link
      href={`/items/${paper.subjectCode}/${paper.paperId}`}
      className={`${cls} active:bg-bg-subtle`}
    >
      {body}
    </Link>
  );
}
