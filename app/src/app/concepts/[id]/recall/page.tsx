"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { Art } from "@/components/Art";
import { CONCEPTS, conceptById } from "@/data/concepts";
import { makeCloze, type Segment } from "@/lib/cloze";
import { markConcept } from "@/lib/store";

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

  const stageLabel = ["빈칸을 채워 보세요", "초성 힌트", "정답 공개"][stage];

  function grade(level: 1 | 2 | 3) {
    markConcept(level, c!.id);
    router.push(`/concepts/${c!.id}`);
  }

  const cloze = (text: string) =>
    makeCloze(text, { term: c!.term, aliases: c!.aliases, lexicon });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-8 pt-5">
      <header className="mb-6 flex items-center justify-between">
        <Link
          href={`/concepts/${c.id}`}
          aria-label="카드로 돌아가기"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.06)]"
        >
          ×
        </Link>
        <span className="rounded-full bg-primary-50 px-4 py-1.5 text-[13px] font-bold text-primary-600">
          {stageLabel}
        </span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-4 rounded-full ${i <= stage ? "bg-primary-500" : "bg-bg-subtle"}`}
            />
          ))}
        </span>
      </header>

      <h1 className="text-[26px] font-extrabold">{c.term}</h1>
      <p className="text-[14px] text-ink-faint">
        {c.subject} · {c.unit.split(" > ").pop()}
      </p>

      <section className="mt-6 flex flex-col gap-3.5">
        <ClozeBlock label="정의" segments={cloze(c.definition)} stage={stage} />
        {c.relations.map((r, i) => (
          <ClozeBlock
            key={r.id}
            label={`관계 명제${c.relations.length > 1 ? ` ${i + 1}` : ""}`}
            segments={cloze(r.text)}
            // 조건은 비우지 않는다. 명제가 **언제** 성립하는지는 답이 아니라
            // 물음의 전제다 — 전제까지 가리면 무엇을 묻는지 알 수 없다
            sub={`조건 · ${r.condition}`}
            stage={stage}
          />
        ))}
      </section>

      <div className="mt-auto pt-8">
        {stage < 2 ? (
          <div className="flex gap-3">
            {stage === 0 && (
              <button
                onClick={() => setStage(1)}
                className="h-14 flex-1 rounded-full bg-surface text-[16px] font-bold text-primary-600 shadow-[0_2px_14px_rgba(23,58,94,0.08)]"
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
      className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-[20px] bg-surface text-[13px] font-bold text-ink-sub shadow-[0_2px_14px_rgba(23,58,94,0.08)] active:bg-primary-50 active:text-primary-600"
    >
      <Art name={art} />
      {label}
    </button>
  );
}

/**
 * 빈칸이 뚫린 문장 한 덩어리.
 *
 * 빈칸은 **하나씩** 열린다. 문장 전체를 한 번에 여는 단추였을 때는 한 자리가
 * 막혀도 문장이 통째로 펼쳐져, 나머지 빈칸까지 답을 보고 지나갔다.
 */
function ClozeBlock({
  label,
  segments,
  sub,
  stage,
}: {
  label: string;
  segments: Segment[];
  sub?: string;
  stage: Stage;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <div className="rounded-[24px] bg-surface p-5 shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
      <p className="mb-1.5 text-[13px] font-bold text-ink-faint">{label}</p>
      <p className="text-[16px] leading-[1.9]">
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
      {sub && <p className="mt-2 text-[13px] text-ink-faint">{sub}</p>}
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
    return (
      <span className="rounded-md bg-primary-50 px-1 font-bold text-primary-600">
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
      className={`mx-0.5 rounded-md border-b-2 border-dashed border-primary-300 bg-bg-subtle px-1.5 align-baseline font-bold tracking-[0.12em] ${
        hinted ? "text-primary-600" : "text-ink-faint"
      }`}
    >
      {label}
    </button>
  );
}
