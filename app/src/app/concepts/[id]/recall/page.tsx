"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useState } from "react";
import { Art } from "@/components/Art";
import { conceptById } from "@/data/concepts";
import { toChosung } from "@/lib/chosung";
import { markConcept } from "@/lib/store";

/**
 * 3단계 인출 모드 — ① 가리기 ② 두음 힌트 ③ 정답 + 자기 평가
 */
type Stage = 0 | 1 | 2;

export default function RecallPage({
  params,
}: PageProps<"/concepts/[id]/recall">) {
  const { id } = use(params);
  const c = conceptById(id);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(0);
  if (!c) notFound();

  const stageLabel = ["머릿속으로 떠올려 보세요", "두음 힌트", "정답 공개"][stage];

  function grade(level: 1 | 2 | 3) {
    markConcept(level, c!.id);
    router.push(`/concepts/${c!.id}`);
  }

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
        <MaskedBlock label="정의" text={c.definition} stage={stage} />
        {c.relations.map((r, i) => (
          <MaskedBlock
            key={r.id}
            label={`관계 명제${c.relations.length > 1 ? ` ${i + 1}` : ""}`}
            text={r.text}
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
                힌트 보기
              </button>
            )}
            <button
              onClick={() => setStage(2)}
              className="h-14 flex-1 rounded-full bg-primary-500 text-[16px] font-bold text-white shadow-[0_6px_16px_rgba(24,159,230,0.35)]"
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

function MaskedBlock({
  label,
  text,
  sub,
  stage,
}: {
  label: string;
  text: string;
  sub?: string;
  stage: Stage;
}) {
  const [revealed, setRevealed] = useState(false);
  const shown = stage === 2 || revealed;

  return (
    <button
      onClick={() => !shown && setRevealed(true)}
      disabled={shown}
      className="rounded-[24px] bg-surface p-5 text-left shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
      aria-label={shown ? label : `${label} — 탭하여 공개`}
    >
      <p className="mb-1.5 text-[13px] font-bold text-ink-faint">{label}</p>
      {shown ? (
        <>
          <p className="text-[16px] leading-relaxed">{text}</p>
          {sub && <p className="mt-1.5 text-[13px] text-ink-faint">{sub}</p>}
        </>
      ) : stage === 1 ? (
        <p className="text-[16px] leading-relaxed tracking-widest text-primary-600">
          {toChosung(text)}
        </p>
      ) : (
        <p className="select-none rounded-2xl bg-bg-subtle py-3.5 text-center text-[14px] text-ink-faint">
          <Art name="masked" className="mr-1.5 align-[-3px]" />
          가려져 있어요 · 탭하면 이 부분만 공개
        </p>
      )}
    </button>
  );
}
