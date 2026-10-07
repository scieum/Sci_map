"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { Art } from "@/components/Art";
import { CONCEPTS, conceptById } from "@/data/concepts";
import { makeCloze, type Segment } from "@/lib/cloze";
import { markConcept } from "@/lib/store";
import { Chip, SectionLabel } from "@/components/ui";

/**
 * 3단계 인출 모드 — ① 빈칸 ② 초성 힌트 ③ 정답 + 자기 평가
 *
 * 문장을 통째로 가리지 않는다. 뼈대는 남기고 **판가름 나는 자리만** 비운다
 * (어디를 비울지는 lib/cloze.ts 의 형식 규칙이 정한다). 통째로 가리면 학생은
 * 맞았는지 틀렸는지 모르는 채로 정답을 열게 되고, 그러면 마지막의 자기 평가가
 * 아무것도 재지 못한다.
 */
type Stage = 0 | 1 | 2;

export default function RecallPage({
  params,
}: PageProps<"/concepts/[id]/recall">) {
  const { id } = use(params);
  const c = conceptById(id);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(0);

  // 개념 사전 = 다른 카드의 표제어. 여기 있는 말은 학생이 이미 배운 말이라
  // 비워도 되는 자리다. 목록은 카드가 바뀌지 않는 한 그대로다
  const lexicon = useMemo(() => CONCEPTS.map((x) => x.term), []);

  if (!c) notFound();

  // 단계마다 무엇을 하면 되는지 한 줄로 — 스테퍼는 "어디" 를, 이 줄은 "무엇" 을 말한다
  const stageGuide = [
    "비운 자리를 소리 내어 떠올려 보세요.",
    "비운 자리에 초성이 보여요. 다시 떠올려 보세요.",
    "정답이 열렸어요. 얼마나 떠올렸는지 골라 주세요.",
  ][stage];

  function grade(level: 1 | 2 | 3) {
    markConcept(level, c!.id);
    router.push(`/concepts/${c!.id}`);
  }

  const cloze = (text: string) =>
    makeCloze(text, { term: c!.term, aliases: c!.aliases, lexicon });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-8 pt-5">
      <header className="mb-4 flex items-center gap-2">
        <Link
          href={`/concepts/${c.id}`}
          aria-label="카드로 돌아가기"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[22px] text-ink-sub active:bg-bg-subtle"
        >
          ✕
        </Link>
        <span className="text-[17px] font-bold">인출 연습</span>
      </header>

      <Stepper stage={stage} />

      <h1 className="mt-5 text-[24px] font-bold leading-tight">{c.term}</h1>
      <p className="mt-1 text-[14px] text-ink-sub">{stageGuide}</p>

      <section>
        <SectionLabel>정의</SectionLabel>
        <ClozeBlock segments={cloze(c.definition)} stage={stage} />
      </section>

      <section>
        <SectionLabel>관계 명제</SectionLabel>
        <div className="flex flex-col gap-3">
          {c.relations.map((r) => (
            <ClozeBlock
              key={r.id}
              tint
              segments={cloze(r.text)}
              // 조건은 비우지 않는다. 명제가 **언제** 성립하는지는 답이 아니라
              // 물음의 전제다 — 전제까지 가리면 무엇을 묻는지 알 수 없다
              condition={r.condition}
              stage={stage}
            />
          ))}
        </div>
      </section>

      <div className="mt-auto pt-8">
        {stage < 2 ? (
          <div className="flex gap-3">
            {/* ① 단계의 힌트는 보조 단추다 — 주 행동은 언제나 "정답 보기" 하나 (D2).
                ② 에서는 힌트가 이미 열려 있어 단추가 하나만 남는다 */}
            {stage === 0 && (
              <button
                onClick={() => setStage(1)}
                className="h-14 flex-1 rounded-full bg-surface text-[16px] font-bold text-primary-600 shadow-card"
              >
                <Art name="hint" className="mr-1.5 align-[-3px]" />
                초성 힌트
              </button>
            )}
            <button
              onClick={() => setStage(2)}
              className="h-14 flex-1 rounded-full bg-primary-500 text-[16px] font-bold text-white shadow-cta"
            >
              정답 보기
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-center text-[14px] font-medium text-ink-sub">
              얼마나 떠올렸나요?
            </p>
            <div className="flex gap-2">
              <GradeBtn onClick={() => grade(1)} art="grade-again" label="아직이에요" />
              <GradeBtn onClick={() => grade(2)} art="grade-vague" label="애매해요" />
              <GradeBtn onClick={() => grade(3)} art="grade-perfect" label="완벽해요" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function GradeBtn({
  onClick,
  art,
  label,
}: {
  onClick: () => void;
  art: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-[20px] bg-surface text-[13px] font-bold text-ink-sub shadow-card active:bg-primary-50 active:text-primary-600"
    >
      <Art name={art} />
      {label}
    </button>
  );
}

/**
 * 세 단계 알약 — ① 떠올리기 ② 힌트 ③ 정답.
 * 지난 단계·지금 단계·남은 단계를 색과 함께 굵기·채움(형태)으로 가른다 (D4).
 */
function Stepper({ stage }: { stage: Stage }) {
  const steps = ["① 떠올리기", "② 힌트", "③ 정답"];
  return (
    <ol className="flex gap-2" aria-label="인출 단계">
      {steps.map((s, i) => {
        const cls =
          i < stage
            ? "bg-primary-100 text-primary-700 font-semibold"
            : i === stage
              ? "bg-primary-500 text-white font-bold shadow-chip"
              : "bg-bg-subtle text-ink-faint font-medium";
        return (
          <li
            key={s}
            aria-current={i === stage ? "step" : undefined}
            className={`flex h-10 flex-1 items-center justify-center rounded-full text-[14px] ${cls}`}
          >
            {s}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 빈칸이 뚫린 문장 한 덩어리.
 *
 * 빈칸은 **하나씩** 열린다. 문장 전체를 한 번에 여는 단추였을 때는 한 자리가
 * 막혀도 문장이 통째로 펼쳐져, 나머지 빈칸까지 답을 보고 지나갔다.
 *
 * `tint` 는 관계 명제 판이다 — 카드 화면과 같은 bg-primary-50 판에 그림자 없이.
 * 조건 칩은 맨 앞에 늘 보인다 (조건은 가리지 않는다 — lib/cloze.ts).
 */
function ClozeBlock({
  segments,
  condition,
  tint = false,
  stage,
}: {
  segments: Segment[];
  condition?: string;
  tint?: boolean;
  stage: Stage;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <div
      className={`rounded-[24px] p-5 ${tint ? "bg-primary-50" : "bg-surface shadow-card"}`}
    >
      {condition && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip tone="outline">조건 · {condition}</Chip>
        </div>
      )}
      <p className="text-[17px] font-medium leading-[2.1]">
        {segments.map((s, i) =>
          s.blank ? (
            <Blank
              key={i}
              seg={s}
              shown={stage === 2 || Boolean(open[i])}
              hinted={stage >= 1}
              onReveal={() => setOpen((o) => ({ ...o, [i]: true }))}
            />
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
    </div>
  );
}

function Blank({
  seg,
  shown,
  hinted,
  onReveal,
}: {
  seg: Segment;
  shown: boolean;
  hinted: boolean;
  onReveal: () => void;
}) {
  if (shown) {
    // 열린 칸은 점선 테두리를 지운다 — 닫힌 칸(점선)과 색이 아니라 형태로 갈린다 (D4)
    return (
      <span className="mx-0.5 rounded-lg bg-primary-100 px-1.5 py-0.5 font-bold text-primary-700">
        {seg.text}
      </span>
    );
  }

  // 아직 닫힌 자리. 초성 단계에서는 초성을, 그 전에는 글자 수만큼의 칸을
  // 보여 준다 — 글자 수도 힌트다(두 글자인지 다섯 글자인지가 후보를 좁힌다)
  const label = hinted ? seg.hint : "○".repeat(Math.min(seg.text.length, 12));

  return (
    <button
      type="button"
      onClick={onReveal}
      aria-label={hinted ? `초성 ${seg.hint} — 탭하면 이 칸만 공개` : "빈칸 — 탭하면 이 칸만 공개"}
      className={`mx-0.5 inline-block rounded-lg border-[1.5px] border-dashed border-primary-300 bg-primary-50 px-2 py-0.5 align-baseline text-[15px] font-bold leading-normal tracking-[0.12em] ${
        hinted ? "text-primary-700" : "text-primary-300"
      }`}
    >
      {label}
    </button>
  );
}

