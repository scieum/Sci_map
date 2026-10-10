"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { asKind, buildDailySet, checkShortAnswer, KIND_LABEL } from "@/data/quiz";
import { Art, hasArt } from "@/components/Art";
import { conceptById } from "@/data/concepts";
import type { QuizItem, QuizKind } from "@/lib/types";
import { completeDaily, loadProgress, markConcept, todayKey, useBookmark } from "@/lib/store";
import { BookmarkStar, Chip, SectionLabel, SegmentedProgress, StatRow } from "@/components/ui";
import { gradeFor, reviewConcept, todayPlan } from "@/lib/scheduler";
import { logAttempt } from "@/lib/sync";

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
  // 세션 전체 시간 — 결과 화면의 "풀이 시간". 문항별 시간(shownAt)과는 다른 값이다
  const [startedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

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
    const elapsed = Date.now() - shownAt;
    const grade = gradeFor(item.kind, correct, elapsed);
    reviewConcept(item.conceptId, grade);
    logAttempt({ conceptId: item.conceptId, itemId: item.id, kind: item.kind, correct, elapsedMs: elapsed, grade });
  }

  function next() {
    setFeedback(null);
    setShownAt(Date.now());
    if (idx + 1 >= total) {
      const wrong = answers.filter((a) => !a.correct).map((a) => a.item.conceptId);
      completeDaily(Array.from(new Set(wrong)), kind);
      setElapsedMs(Date.now() - startedAt);
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

  if (finished) return <ResultScreen answers={answers} kind={kind} elapsedMs={elapsedMs} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pt-5">
      {/* 상단: 닫기 + 칸 나뉜 진행 바 + n/N (집중 모드 — 탭 바 숨김) */}
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          aria-label="그만두기"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] leading-none text-ink-sub active:bg-bg-subtle"
        >
          <span aria-hidden>✕</span>
        </Link>
        <div className="flex-1">
          <SegmentedProgress current={idx + (feedback ? 1 : 0)} total={total} />
        </div>
        <span className="text-[13px] font-bold text-ink-sub" aria-hidden>
          {idx + 1}/{total}
        </span>
      </header>

      <QuestionView key={item.id} item={item} onSubmit={submit} feedback={feedback} />

      {/* 즉시 피드백 시트 — 세 유형이 같은 시트를 쓴다.
          fixed 가 아니라 흐름 안의 sticky 다: 시트가 제 높이만큼 자리를 차지해야
          O·X 단추와 선택지의 판정(✓ 정답 / ✕ 내 답)이 시트 뒤로 숨지 않는다 */}
      {feedback && (
        <FeedbackSheet feedback={feedback} last={idx + 1 >= total} onNext={next} />
      )}
    </main>
  );
}

/** 판정 아이콘 — 아트 슬롯이 비어 있어도 형태(✓/✕)가 남아야 한다 (D4) */
function VerdictIcon({ correct }: { correct: boolean }) {
  const art = correct ? "feedback-correct" : "feedback-wrong";
  if (hasArt(art)) return <Art name={art} />;
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ring-2 ${
        correct ? "text-success ring-success" : "text-danger ring-danger"
      }`}
    >
      {correct ? "✓" : "✕"}
    </span>
  );
}

function FeedbackSheet({
  feedback,
  last,
  onNext,
}: {
  feedback: Answered;
  last: boolean;
  onNext: () => void;
}) {
  const concept = conceptById(feedback.item.conceptId);
  return (
    <div className="sticky bottom-0 z-50 -mx-5 rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(23,58,94,0.12)]">
      {/* 끌개 막대 — 모양만. 시트는 끌어 내리지 않는다 (다음 문항으로만 닫힌다) */}
      <span aria-hidden className="mx-auto mb-4 block h-1 w-9 rounded-full bg-line" />
      <p
        role="status"
        className={`mb-2 flex items-center gap-2 text-[17px] font-extrabold ${
          feedback.correct ? "text-success" : "text-danger"
        }`}
      >
        <VerdictIcon correct={feedback.correct} />
        {feedback.correct ? "정답이에요" : `오답이에요 · 정답은 ${feedback.item.answer}`}
      </p>
      <p className="mb-3 text-[15px] leading-relaxed text-ink">
        {feedback.item.explanation}
      </p>
      {concept && (
        <Link
          href={`/concepts/${concept.id}`}
          className="mb-3 inline-block text-[14px] font-bold text-primary-700"
        >
          개념 카드 보기 · {concept.term} →
        </Link>
      )}
      {/* 다시 볼 카드를 담는 자리는 **여기**다. 틀린 개념을 기억해 두었다가
          나중에 개념 탭에서 찾아 담으라고 하면 아무도 담지 않는다 */}
      <SaveForLater conceptId={feedback.item.conceptId} />
      <button
        onClick={onNext}
        className="h-14 w-full rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta active:bg-primary-600"
      >
        {last ? "결과 보기" : "다음 문항"}
      </button>
    </div>
  );
}

/**
 * 답한 뒤 선택지의 모양 — OX 단추와 선택형이 같은 규칙을 쓴다.
 * 정답 칸은 success + "✓ 정답", 내가 고른 오답은 danger + "✕ 내 답".
 * 색만으로 말하지 않는다 (D4).
 */
type ChoiceState = "idle" | "correct" | "wrong" | "dim";

function choiceState(value: string, item: QuizItem, feedback: Answered | null): ChoiceState {
  if (!feedback) return "idle";
  if (value === item.answer) return "correct";
  if (value === feedback.given) return "wrong";
  return "dim";
}

const CHOICE_CLASS: Record<ChoiceState, string> = {
  idle: "bg-surface text-ink shadow-card active:bg-primary-50",
  correct: "bg-success-bg text-success ring-2 ring-success",
  wrong: "bg-danger-bg text-danger ring-2 ring-danger",
  dim: "bg-surface text-ink-faint shadow-card",
};

function ChoiceTag({ state, mine }: { state: "correct" | "wrong"; mine: boolean }) {
  return (
    <span className="shrink-0 text-[12px] font-bold">
      {state === "correct" ? (mine ? "✓ 정답 · 내 답" : "✓ 정답") : "✕ 내 답"}
    </span>
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
        {KIND_LABEL[item.kind]} · {concept?.unit.split(" > ").pop()}
      </span>
      <div className="flex min-h-[160px] flex-col justify-center rounded-[24px] bg-surface p-6 shadow-card">
        {item.kind !== "ox" && (
          <p className="mb-2 text-[13px] font-bold text-ink-faint">
            다음 정의에 해당하는 개념은?
          </p>
        )}
        <p className="text-[18px] font-semibold leading-relaxed">
          {item.prompt}
        </p>
        {item.kind === "ox" && (
          <p className="mt-3 text-[13px] text-ink-faint">명제가 맞으면 O, 틀리면 X</p>
        )}
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
            className={`h-14 scroll-mt-24 rounded-full px-5 text-[16px] outline-none focus:ring-2 focus:ring-primary-300 ${
              feedback ? CHOICE_CLASS[feedback.correct ? "correct" : "wrong"] : "bg-surface shadow-card"
            }`}
            autoFocus
            autoComplete="off"
            enterKeyHint="done"
          />
          {/* 답한 뒤에는 제출 단추를 내린다 — 시트의 "다음 문항" 이 유일한 CTA (D2).
              판정은 입력창 색과 이 줄의 ✓/✕ 가 함께 말한다 (D4) */}
          {feedback ? (
            <p className={`px-5 text-[13px] font-bold ${feedback.correct ? "text-success" : "text-danger"}`}>
              {feedback.correct ? "✓ 정답" : "✕ 내 답"}
            </p>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-14 rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta disabled:opacity-40"
            >
              제출하기
            </button>
          )}
        </form>
      )}

      <div className="mt-auto pb-6 pt-6">
        {item.kind === "ox" && (
          <div className="flex gap-3">
            <OxBtn value="O" art="ox-true" label="맞아요" item={item} onSubmit={onSubmit} feedback={feedback} />
            <OxBtn value="X" art="ox-false" label="아니에요" item={item} onSubmit={onSubmit} feedback={feedback} />
          </div>
        )}

        {item.kind === "mcq" && (
          <div className="flex flex-col gap-2.5">
            {item.choices?.map((c) => {
              const st = choiceState(c, item, feedback);
              return (
                <button
                  key={c}
                  onClick={() => onSubmit(c)}
                  disabled={!!feedback}
                  className={`flex min-h-[54px] items-center justify-between gap-3 rounded-full px-6 text-left text-[16px] font-semibold transition-colors ${CHOICE_CLASS[st]}`}
                >
                  <span>{c}</span>
                  {(st === "correct" || st === "wrong") && (
                    <ChoiceTag state={st} mine={feedback?.given === c} />
                  )}
                </button>
              );
            })}
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
  item,
  onSubmit,
  feedback,
}: {
  value: "O" | "X";
  art: string;
  label: string;
  item: QuizItem;
  onSubmit: (v: string) => void;
  feedback: Answered | null;
}) {
  const st = choiceState(value, item, feedback);
  return (
    <button
      onClick={() => onSubmit(value)}
      disabled={!!feedback}
      aria-label={`${value} ${label}`}
      className={`flex h-[104px] flex-1 flex-col items-center justify-center gap-1 rounded-[24px] transition-colors ${CHOICE_CLASS[st]}`}
    >
      {/* 아트 슬롯이 비어 있으면 O·X 글자가 그 자리를 맡는다 */}
      {hasArt(art) ? (
        <Art name={art} />
      ) : (
        <span aria-hidden className="text-[36px] font-extrabold leading-none">
          {value}
        </span>
      )}
      {st === "correct" || st === "wrong" ? (
        <ChoiceTag state={st} mine={feedback?.given === value} />
      ) : (
        <span className="text-[13px] font-semibold text-ink-sub">{label}</span>
      )}
    </button>
  );
}

/**
 * "나중에 다시 보기" — 피드백 시트 안의 북마크 줄.
 *
 * 별 하나만 두지 않고 문장을 붙인다. 시트에는 설명과 다음 문제 단추뿐이라
 * 맥락 없는 별이 무엇을 하는 물건인지 알 길이 없다.
 */
function SaveForLater({ conceptId }: { conceptId: string }) {
  const [on, toggle] = useBookmark(conceptId);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={`mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold ${
        on ? "bg-primary-50 text-primary-600" : "bg-bg-subtle text-ink-sub"
      }`}
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
      {on ? "북마크에 담았어요" : "나중에 다시 보기"}
    </button>
  );
}

/** 결과 카드의 별 — 훅을 쓰려면 카드마다 제 컴포넌트가 있어야 한다 */
function BookmarkToggle({ conceptId }: { conceptId: string }) {
  const [on, toggle] = useBookmark(conceptId);
  return <BookmarkStar on={on} onToggle={toggle} />;
}

/** 링 게이지 — 정답 수를 원호로. 흰 원호가 파란 히어로 위에 올라간다 (산타 학습 결과) */
function Ring({ value, label, sub }: { value: number; label: string; sub: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="relative mx-auto h-[112px] w-[112px]">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="10" />
        <circle
          cx="56" cy="56" r={r} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[26px] font-extrabold tabular-nums">{label}</span>
        <span className="mt-1 text-[11px] font-bold text-white/80">{sub}</span>
      </div>
    </div>
  );
}

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 결과 화면 — 링 게이지 히어로 + 지표 3칸 + 다시 볼 문항(오답) + 맞힌 문항 + [완료] (시안 v2 결과 B) */
function ResultScreen({
  answers,
  kind,
  elapsedMs,
}: {
  answers: Answered[];
  kind: QuizKind;
  elapsedMs: number;
}) {
  const correct = answers.filter((a) => a.correct).length;
  const streak = loadProgress().streak.count;
  const perfect = correct === answers.length;
  const score = answers.length ? Math.round((correct / answers.length) * 100) : 0;
  const wrongCount = answers.length - correct;
  const headline = perfect
    ? "전부 맞혔어요!"
    : wrongCount <= 2
      ? `잘했어요, 오답 ${wrongCount}개만 다시 봐요`
      : `오답 ${wrongCount}개를 다시 봐요`;
  // 문항 번호는 푼 순서다 — 오답만 따로 모아도 Q# 은 원래 자리를 가리킨다
  const numbered = answers.map((a, i) => ({ a, n: i + 1 }));
  const wrong = numbered.filter((x) => !x.a.correct);
  const right = numbered.filter((x) => x.a.correct);

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-32 pt-6">
      {/* 링 게이지 히어로 — 정답 수가 원호로, 한 줄 평가가 그 아래 */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-primary-700 to-primary-500 px-6 pb-6 pt-5 text-center text-white shadow-hero">
        <p className="mb-3 text-[13px] font-semibold text-white/80">{KIND_LABEL[kind]} · 오늘의 학습</p>
        <Ring value={answers.length ? correct / answers.length : 0} label={`${correct}/${answers.length}`} sub="정답" />
        <h1 className="mt-3 text-[20px] font-extrabold leading-snug">{headline}</h1>
        <span className="pointer-events-none absolute -right-2 -top-3" aria-hidden>
          <Art name={perfect ? "result-perfect" : "result-good"} />
        </span>
      </section>

      {/* 지표 3칸 — 정답률·풀이 시간·연속. 풀이 시간은 이미 재고 있던 값이라
          새로 저장하는 것은 없다 */}
      <div className="mt-3">
        <StatRow
          items={[
            { value: `${score}점`, label: "정답률" },
            { value: fmtElapsed(elapsedMs), label: "풀이 시간" },
            { value: `${streak}일`, label: "연속 학습" },
          ]}
        />
      </div>

      <SectionLabel>다시 볼 문항 {wrong.length}</SectionLabel>
      {wrong.length === 0 ? (
        <p className="rounded-[24px] bg-surface p-5 text-[15px] text-ink-sub shadow-card">
          모두 맞혔어요! 다시 볼 문항이 없어요.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {wrong.map(({ a, n }) => (
            <ResultCard key={a.item.id} a={a} n={n} />
          ))}
        </div>
      )}

      {/* Design.md §4.4(c) 는 문항별 카드 스택 전부를 보여 준다. 시안은 오답만
          그렸으나 맞힌 문항도 해설을 다시 읽을 자리가 있어야 해 아래에 둔다 */}
      {right.length > 0 && (
        <>
          <SectionLabel>맞힌 문항 {right.length}</SectionLabel>
          <div className="flex flex-col gap-3">
            {right.map(({ a, n }) => (
              <ResultCard key={a.item.id} a={a} n={n} />
            ))}
          </div>
        </>
      )}

      {/* 탭 바가 숨는 화면이라 BottomCta(탭 바 위에 뜬다) 대신 바닥에 붙인다.
          "다른 유형 풀기"는 유형 고르기 화면으로 — 홈의 유형 카드와 같은 선택이다 */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/90 to-transparent px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto flex max-w-xl gap-2.5">
          <Link
            href="/today"
            className="flex h-14 flex-1 items-center justify-center rounded-full bg-surface text-[16px] font-bold text-primary-700 shadow-card"
          >
            다른 유형 풀기
          </Link>
          <Link
            href="/"
            className="flex h-14 flex-1 items-center justify-center rounded-full bg-primary-500 text-[16px] font-bold text-white shadow-cta"
          >
            완료
          </Link>
        </div>
      </div>
    </main>
  );
}

function ResultCard({ a, n }: { a: Answered; n: number }) {
  const concept = conceptById(a.item.conceptId);
  return (
    <div className="rounded-[24px] bg-surface p-5 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-primary-700">Q{n}</span>
        <span className="flex items-center gap-2">
          {concept && <BookmarkToggle conceptId={concept.id} />}
          {a.correct ? <Chip tone="success">✓ 정답</Chip> : <Chip tone="danger">✕ 오답</Chip>}
        </span>
      </div>
      <p className="text-[15px] font-medium leading-relaxed text-ink">{a.item.prompt}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-sub">
        {!a.correct && <>내 답 {a.given} · 정답 {a.item.answer} — </>}
        {a.item.explanation}
      </p>
      {!a.correct && concept && (
        <Link
          href={`/concepts/${concept.id}`}
          className="mt-3 inline-block text-[13px] font-bold text-primary-700"
        >
          개념 카드 보기 · {concept.term} →
        </Link>
      )}
    </div>
  );
}
