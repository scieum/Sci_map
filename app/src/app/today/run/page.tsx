"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { asKind, buildDailySet, checkShortAnswer, KIND_LABEL } from "@/data/quiz";
import { Art } from "@/components/Art";
import { conceptById } from "@/data/concepts";
import type { QuizItem } from "@/lib/types";
import { completeDaily, loadProgress, markConcept, todayKey } from "@/lib/store";
import { gradeFor, reviewConcept, todayPlan } from "@/lib/scheduler";

/**
 * 데일리 퀴즈 러너 — 문항당 1화면 / 즉시 피드백 시트 / 점수 히어로 결과
 *
 * 세션 하나는 **한 유형**이다 (`?kind=ox|short|mcq`). 유형이 섞이면 화면도
 * 채점도 문항마다 갈아끼워야 하고, 학생은 매번 "이번엔 뭘 하는 문제지"부터
 * 읽어야 한다. 유형은 /today 에서 고른다.
 */

interface Answered {
  item: QuizItem;
  given: string;
  correct: boolean;
}

export default function QuizRunPage() {
  // useSearchParams 는 정적 렌더 경계가 필요하다 — Suspense 로 감싼다
  return (
    <Suspense fallback={null}>
      <Runner />
    </Suspense>
  );
}

function Runner() {
  const kind = asKind(useSearchParams().get("kind"));
  const set = useMemo(
    () => buildDailySet(todayKey(), todayPlan(), kind),
    [kind],
  );
  // 응답 시간은 무언 측정한다 — 등급(Hard/Good)의 근거다 (Design.md §5.3)
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [feedback, setFeedback] = useState<Answered | null>(null);
  const [finished, setFinished] = useState(false);

  const item = set.items[idx];
  const total = set.items.length;

  function submit(given: string) {
    if (feedback) return;
    const correct =
      item.kind === "short"
        ? checkShortAnswer(given, item)
        : given === item.answer;
    const a = { item, given, correct };
    setAnswers((prev) => [...prev, a]);
    setFeedback(a);
    markConcept(correct ? 2 : 1, item.conceptId);
    // 개념의 기억 상태를 민다 — 다음에 볼 날이 여기서 정해진다
    reviewConcept(item.conceptId, gradeFor(item.kind, correct, Date.now() - shownAt));
  }

  function next() {
    setFeedback(null);
    setShownAt(Date.now());
    if (idx + 1 >= total) {
      const wrong = answers.filter((a) => !a.correct).map((a) => a.item.conceptId);
      completeDaily(Array.from(new Set(wrong)));
      setFinished(true);
    } else {
      setIdx(idx + 1);
    }
  }

  if (total === 0)
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center text-ink-sub">
        {KIND_LABEL[kind]} 문항이 아직 없어요.
        <Link href="/today" className="mt-4 block font-bold text-primary-600">
          다른 유형 고르기
        </Link>
      </main>
    );

  if (finished) return <ResultScreen answers={answers} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pt-5">
      {/* 상단: 닫기 + 진행 바 (집중 모드) */}
      <header className="mb-7 flex items-center gap-3">
        <Link
          href="/"
          aria-label="그만두기"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.06)]"
        >
          ×
        </Link>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-primary-500 transition-all"
            style={{ width: `${((idx + (feedback ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
        <span className="text-[13px] font-bold text-ink-sub">
          {idx + 1}/{total}
        </span>
      </header>

      <QuestionView key={item.id} item={item} onSubmit={submit} feedback={feedback} />

      {/* 즉시 피드백 시트 */}
      {feedback && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_30px_rgba(23,58,94,0.12)]">
          <div className="mx-auto max-w-xl">
            <p
              className={`mb-1.5 flex items-center gap-2 text-[18px] font-extrabold ${
                feedback.correct ? "text-success" : "text-danger"
              }`}
            >
              <Art name={feedback.correct ? "feedback-correct" : "feedback-wrong"} />
              {feedback.correct ? "정답이에요!" : "아쉬워요"}
            </p>
            <p className="mb-4 text-[15px] leading-relaxed text-ink-sub">
              {feedback.item.explanation}
            </p>
            <button
              onClick={next}
              className={`h-14 w-full rounded-full text-[17px] font-bold text-white ${
                feedback.correct
                  ? "bg-success shadow-[0_6px_16px_rgba(22,163,74,0.3)]"
                  : "bg-primary-500 shadow-cta"
              }`}
            >
              {idx + 1 >= total ? "결과 보기" : "다음 문제"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function QuestionView({
  item,
  onSubmit,
  feedback,
}: {
  item: QuizItem;
  onSubmit: (given: string) => void;
  feedback: Answered | null;
}) {
  const [input, setInput] = useState("");
  const concept = conceptById(item.conceptId);

  return (
    <section className="flex flex-1 flex-col">
      <span className="mb-3 self-start rounded-full bg-primary-50 px-3.5 py-1.5 text-[12px] font-bold text-primary-600">
        {concept?.unit.split(" > ").pop()} ·{" "}
        {KIND_LABEL[item.kind]}
      </span>
      <div className="rounded-[24px] bg-surface p-6 shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
        {item.kind !== "ox" && (
          <p className="mb-2 text-[13px] font-bold text-ink-faint">
            다음 정의에 해당하는 개념은?
          </p>
        )}
        <p className="text-[18px] font-semibold leading-relaxed">
          {item.prompt}
        </p>
      </div>

      {item.kind === "short" && (
        // 문항 카드 바로 아래. 키보드가 올라와도 문항과 입력창이 한 화면에 남는다.
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) onSubmit(input);
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!!feedback}
            placeholder="개념어를 입력해 주세요"
            // 16px 미만이면 iOS 가 포커스 때 화면을 확대한다
            className="h-14 scroll-mt-24 rounded-full bg-surface px-5 text-[16px] shadow-[0_2px_14px_rgba(23,58,94,0.06)] outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
            autoComplete="off"
            enterKeyHint="done"
          />
          <button
            type="submit"
            disabled={!!feedback || !input.trim()}
            className="h-14 rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta disabled:opacity-40"
          >
            제출하기
          </button>
        </form>
      )}

      <div className="mt-auto pb-8 pt-8">
        {item.kind === "ox" && (
          <div className="flex gap-3">
            <OxBtn
              value="O"
              art="ox-true"
              label="맞아요"
              onSubmit={onSubmit}
              feedback={feedback}
            />
            <OxBtn
              value="X"
              art="ox-false"
              label="아니에요"
              onSubmit={onSubmit}
              feedback={feedback}
            />
          </div>
        )}

        {item.kind === "mcq" && (
          <div className="flex flex-col gap-2.5">
            {item.choices?.map((c) => (
              <button
                key={c}
                onClick={() => onSubmit(c)}
                disabled={!!feedback}
                className={`min-h-[54px] rounded-full px-6 text-left text-[16px] font-semibold shadow-[0_2px_12px_rgba(23,58,94,0.06)] transition-colors ${
                  feedback && feedback.given === c
                    ? feedback.correct
                      ? "bg-primary-50 text-primary-600 ring-2 ring-primary-500"
                      : "bg-[#fdf2f2] text-danger ring-2 ring-danger"
                    : feedback && c === item.answer
                      ? "bg-primary-50 text-primary-600"
                      : "bg-surface text-ink active:bg-primary-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OxBtn({
  value,
  art,
  label,
  onSubmit,
  feedback,
}: {
  value: "O" | "X";
  art: string;
  label: string;
  onSubmit: (v: string) => void;
  feedback: Answered | null;
}) {
  const picked = feedback && feedback.given === value;
  return (
    <button
      onClick={() => onSubmit(value)}
      disabled={!!feedback}
      className={`flex h-28 flex-1 flex-col items-center justify-center gap-1.5 rounded-[24px] text-[15px] font-bold shadow-[0_2px_14px_rgba(23,58,94,0.08)] transition-colors ${
        picked
          ? feedback!.correct
            ? "bg-primary-50 text-primary-600 ring-2 ring-primary-500"
            : "bg-[#fdf2f2] text-danger ring-2 ring-danger"
          : "bg-surface text-ink active:bg-primary-50"
      }`}
    >
      <Art name={art} />
      {label}
    </button>
  );
}

/** 결과 화면 — 점수 히어로 카드 + 문항 카드 스택 + 오답 → 개념 카드 */
function ResultScreen({ answers }: { answers: Answered[] }) {
  const correct = answers.filter((a) => a.correct).length;
  const streak = loadProgress().streak.count;
  const perfect = correct === answers.length;

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-32 pt-6">
      {/* 점수 히어로 */}
      <section className="relative overflow-hidden rounded-[28px] bg-primary-500 p-6 text-center text-white shadow-hero">
        <p className="text-[14px] font-semibold text-white/85">오늘의 학습 완료</p>
        <p className="mt-1 text-[44px] font-extrabold leading-none">
          {correct}
          <span className="text-[22px] font-bold text-white/70">
            {" "}/ {answers.length}
          </span>
        </p>
        <p className="mt-3 inline-flex rounded-full bg-white/20 px-4 py-1.5 text-[13px] font-bold">
          <Art name="streak-flame" className="mr-1" />
          연속 {streak}일 달성
        </p>
        <span className="pointer-events-none absolute -right-2 -top-3" aria-hidden>
          <Art name={perfect ? "result-perfect" : "result-good"} />
        </span>
      </section>

      <div className="mt-5 flex flex-col gap-3">
        {answers.map((a, i) => {
          const concept = conceptById(a.item.conceptId);
          return (
            <div
              key={a.item.id}
              className="rounded-[24px] bg-surface p-5 shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-bold text-ink-faint">
                  Q{i + 1}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    a.correct
                      ? "bg-primary-50 text-primary-600"
                      : "bg-[#fdf2f2] text-danger"
                  }`}
                >
                  {a.correct ? (
                    <>
                      <Art name="answer-correct" className="mr-1 align-[-2px]" />
                      정답
                    </>
                  ) : (
                    "오답"
                  )}
                </span>
              </div>
              <p className="text-[15px] font-medium">{a.item.prompt}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-sub">
                {a.item.explanation}
              </p>
              {!a.correct && concept && (
                <Link
                  href={`/concepts/${concept.id}`}
                  className="mt-3 inline-block rounded-full bg-primary-50 px-4 py-2 text-[13px] font-bold text-primary-600"
                >
                  {concept.term} 다시 보기 →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/90 to-transparent px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
        <Link
          href="/"
          className="mx-auto flex h-14 max-w-xl items-center justify-center rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta"
        >
          완료
        </Link>
      </div>
    </main>
  );
}
