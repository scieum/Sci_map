"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { conceptById } from "@/data/concepts";
import { CHOICES, paperById, signedUrls, subjectTitle, type ExamItem } from "@/lib/exam";
import { saveUi } from "@/lib/ui-state";
import { examProgress, recordExam } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 평가 문항 풀기 — 한 화면에 한 문항, 답하면 바로 채점.
 *
 * ★ 객관식만 앱이 채점한다. 서술형은 발행사가 쓴 모범답안을 가져오지 않아서
 *   (CLAUDE.md §6) 스스로 확인하는 자리로 둔다 — 관련 개념 카드를 옆에 놓아
 *   무엇을 견주어 봐야 하는지 가리킨다.
 *
 * ★ 이미지는 로그인한 세션에만 내려오는 서명 URL 이다. 세션이 없으면 문항을
 *   아예 받아 오지 않는다.
 */
export default function PaperPage({ params }: PageProps<"/items/[paperId]">) {
  const { paperId } = use(params);
  const paper = paperById(paperId);

  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [idx, setIdx] = useState(0);
  const [given, setGiven] = useState<string | null>(null);
  const [score, setScore] = useState({ done: 0, correct: 0 });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSignedIn(false);
      return;
    }
    let alive = true;
    void supabase().auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!paper || !signedIn) return;
    let alive = true;
    void signedUrls(paper).then((u) => {
      if (alive) setUrls(u);
    });
    return () => {
      alive = false;
    };
  }, [paper, signedIn]);

  useEffect(() => {
    if (!paper) return;
    setScore(examProgress(paper.items.map((i) => i.id)));
    // 이 회차의 과목을 문제 탭이 돌아갈 자리로 적어 둔다. 링크로 곧장 들어온
    // 경우에도 ×를 누르면 이 회차가 있는 과목이 열린다 (개념 카드와 같은 규칙)
    saveUi({ itemsSubject: subjectTitle(paper.subjectCode) });
  }, [paper]);

  if (!paper) notFound();

  const item = paper.items[idx];
  const total = paper.items.length;

  function answer(choice: string) {
    if (given) return;
    const correct = item.kind === "choice" ? choice === item.answer : true;
    setGiven(choice);
    recordExam(item.id, choice, correct);
    setScore((s) => ({ done: s.done + 1, correct: s.correct + (correct ? 1 : 0) }));
  }

  function next() {
    setGiven(null);
    setIdx((i) => Math.min(i + 1, total - 1));
  }

  if (signedIn === false) {
    return (
      <Shell paper={`${subjectTitle(paper.subjectCode)} · ${paper.label}`}>
        <Card>
          <p className="text-[15px] font-bold">로그인하면 문제가 열려요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            평가 문항은 교과서 발행사가 만든 자료라 수업을 듣는 학생에게만 보여 줄 수
            있어요. 로그인한 뒤 이 화면으로 다시 오면 바로 풀 수 있어요.
          </p>
          <Link
            href="/me"
            className="mt-4 inline-block rounded-full bg-primary-500 px-5 py-2.5 text-[14px] font-bold text-white shadow-chip"
          >
            로그인하러 가기
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell paper={`${subjectTitle(paper.subjectCode)} · ${paper.label}`}>
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/items"
          aria-label="목록으로"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.06)]"
        >
          ×
        </Link>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-primary-500 transition-all"
            style={{ width: `${((idx + (given ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
        <span className="text-[13px] font-bold text-ink-sub">
          {idx + 1}/{total}
        </span>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-primary-50 px-3 py-1 text-[12px] font-bold text-primary-600">
          {item.no}번
        </span>
        {item.difficulty && (
          <span className="rounded-full bg-bg-subtle px-3 py-1 text-[12px] font-semibold text-ink-sub">
            난이도 {item.difficulty}
          </span>
        )}
        {item.topicLabel && (
          <span className="rounded-full bg-bg-subtle px-3 py-1 text-[12px] font-semibold text-ink-sub">
            {item.topicLabel}
          </span>
        )}
      </div>

      <ItemImage item={item} url={urls?.[item.file]} loading={urls === null} />

      {item.kind === "choice" ? (
        <div className="mt-4 grid grid-cols-5 gap-2">
          {CHOICES.map((c) => {
            const picked = given === c;
            const isAnswer = given && c === item.answer;
            return (
              <button
                key={c}
                onClick={() => answer(c)}
                disabled={Boolean(given)}
                className={`h-14 rounded-2xl text-[18px] font-bold shadow-[0_2px_12px_rgba(23,58,94,0.06)] transition-colors ${
                  isAnswer
                    ? "bg-primary-500 text-white"
                    : picked
                      ? "bg-[#fdf2f2] text-danger ring-2 ring-danger"
                      : "bg-surface text-ink"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      ) : (
        <button
          onClick={() => answer("self")}
          disabled={Boolean(given)}
          className="mt-4 h-14 w-full rounded-full bg-surface text-[15px] font-bold text-primary-600 shadow-[0_2px_14px_rgba(23,58,94,0.08)] disabled:opacity-60"
        >
          서술형이에요 · 스스로 확인하고 넘어가기
        </button>
      )}

      {given && (
        <div className="mt-4">
          {item.kind === "choice" ? (
            <p
              className={`text-[16px] font-extrabold ${
                given === item.answer ? "text-success" : "text-danger"
              }`}
            >
              {given === item.answer ? "정답이에요!" : `아쉬워요 · 정답은 ${item.answer}`}
            </p>
          ) : (
            <p className="text-[15px] font-bold text-ink-sub">
              모범답안은 싣지 않았어요. 아래 개념 카드로 확인해 보세요.
            </p>
          )}

          {item.explanation && (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">{item.explanation}</p>
          )}

          <RelatedConcepts item={item} />

          <button
            onClick={next}
            disabled={idx + 1 >= total}
            className="mt-5 h-14 w-full rounded-full bg-primary-500 text-[16px] font-bold text-white shadow-cta disabled:opacity-40"
          >
            {idx + 1 >= total ? "마지막 문항이에요" : "다음 문항"}
          </button>
          {idx + 1 >= total && (
            <Link
              href="/items"
              className="mt-3 block text-center text-[14px] font-bold text-primary-600"
            >
              목록으로 ({score.correct}/{score.done} 맞힘)
            </Link>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ paper, children }: { paper: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-28 pt-5">
      <p className="mb-3 text-[13px] font-semibold text-ink-faint">{paper}</p>
      {children}
    </main>
  );
}

/** 문항 크롭. 비율을 미리 잡아 두어 이미지가 붙을 때 화면이 튀지 않게 한다 */
function ItemImage({
  item,
  url,
  loading,
}: {
  item: ExamItem;
  url?: string;
  loading: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-[20px] bg-surface p-2 shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${item.no}번 문항`}
          width={item.width}
          height={item.height}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-2xl bg-bg-subtle text-[13px] text-ink-faint">
          {loading ? "문항을 불러오는 중…" : "문항 이미지를 받지 못했어요"}
        </div>
      )}
    </div>
  );
}

/**
 * 관련 개념 카드.
 *
 * Q3 에서 카드 하나로 좁혀진 문항은 그 카드를, 아직 성취기준까지만 맞춰 둔
 * 문항은 후보를 함께 보여 준다. **후보라는 것을 숨기지 않는다** — 확정된 것처럼
 * 보이면 학생이 엉뚱한 카드를 정답 근거로 삼는다.
 */
function RelatedConcepts({ item }: { item: ExamItem }) {
  const ids = item.conceptIds?.length ? item.conceptIds : (item.conceptCandidates ?? []);
  const cards = ids.map(conceptById).filter(Boolean);
  if (cards.length === 0) return null;
  const exact = Boolean(item.conceptIds?.length);

  return (
    <div className="mt-4">
      <p className="mb-2 text-[13px] font-bold text-ink-faint">
        {exact ? "관련 개념" : "이 성취기준의 개념들"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((c) => (
          <Link
            key={c!.id}
            href={`/concepts/${c!.id}`}
            className="rounded-full bg-primary-50 px-3.5 py-1.5 text-[13px] font-semibold text-primary-600"
          >
            {c!.term}
          </Link>
        ))}
      </div>
    </div>
  );
}
