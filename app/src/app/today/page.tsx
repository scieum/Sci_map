"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Art } from "@/components/Art";
import { Screen, ScreenTitle } from "@/components/ui";
import { buildDailyOverview, KIND_LABEL } from "@/data/quiz";
import { todayPlan } from "@/lib/scheduler";
import { TILE } from "@/lib/brand";
import { todayKey, useProgress } from "@/lib/store";
import type { QuizKind } from "@/lib/types";

/**
 * 오늘의 학습 — 유형 선택.
 *
 * 세션 하나는 한 유형이다. 이 화면의 일은 그 하나를 고르는 것뿐이라, 칸 셋이
 * 곧 선택지다 (화면당 CTA 하나라는 D2 는 "행동 하나" 이지 "버튼 하나" 가 아니다).
 * 칸마다 오늘 그 유형에서 몇 문항이 나오는지, 그중 복습이 몇인지 보여 준다.
 */

const KIND_META: Record<
  QuizKind,
  { desc: string; art: string; tone: { tint: string; tag: string; value: string } }
> = {
  ox: { desc: "명제를 읽고 맞다 · 틀리다", art: "ox-true", tone: TILE.fresh },
  short: { desc: "정의를 보고 개념 이름 쓰기", art: "concept-new", tone: TILE.review },
  mcq: { desc: "정의에 맞는 개념 고르기", art: "review-return", tone: TILE.streak },
};

export default function TodayPickPage() {
  const progress = useProgress();
  const today = useMemo(
    () => buildDailyOverview(todayKey(), todayPlan()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress],
  );

  return (
    <Screen>
      <ScreenTitle>오늘은 어떤 유형으로?</ScreenTitle>
      <p className="-mt-3 mb-5 text-[14px] text-ink-sub">
        한 번에 한 유형만 풀어요. 끝나면 다른 유형을 이어서 풀 수 있어요.
      </p>

      <div className="flex flex-col gap-3">
        {today.sets.map((s) => {
          const meta = KIND_META[s.kind];
          const empty = s.items.length === 0;
          return (
            <Link
              key={s.kind}
              href={empty ? "#" : `/today/run?kind=${s.kind}`}
              aria-disabled={empty}
              className={`flex items-center gap-4 rounded-[24px] px-5 py-5 ${meta.tone.tint} ${
                empty ? "opacity-50" : "active:brightness-95"
              }`}
            >
              <Art name={meta.art} px={36} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[12px] font-bold ${meta.tone.tag}`}>
                  {KIND_LABEL[s.kind]}
                </span>
                <span className="mt-0.5 block text-[17px] font-extrabold text-ink">
                  {empty ? "아직 문항이 없어요" : `${s.items.length}문항`}
                  {!empty && s.reviewCount > 0 && (
                    <span className="ml-1.5 text-[13px] font-semibold text-ink-sub">
                      복습 {s.reviewCount}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[13px] text-ink-sub">{meta.desc}</span>
              </span>
              <span aria-hidden className={`text-[18px] ${meta.tone.value}`}>
                ›
              </span>
            </Link>
          );
        })}
      </div>
    </Screen>
  );
}
