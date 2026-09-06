"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildTree, byTopic, majorNo, minorNo, topicNo } from "@/data/concepts";
import type { Concept } from "@/lib/types";
import { LevelDots, Screen, ScreenTitle } from "@/components/ui";
import { useProgress } from "@/lib/store";
import { accentOfSubject, subjectAccent } from "@/lib/brand";

/** 개념 탭 — 과목 알약 칩 → 대단원 카드 → 중단원 접기 → 소주제 → 개념 행 */
export default function ConceptsPage() {
  const progress = useProgress();
  const tree = useMemo(() => buildTree(), []);
  const subjects = Array.from(tree.keys());
  const [subject, setSubject] = useState(subjects[0]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const majors =
    tree.get(subject) ?? new Map<string, Map<string, Concept[]>>();

  return (
    <Screen>
      <ScreenTitle>개념</ScreenTitle>

      {/* 과목 알약 칩 */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => setSubject(s)}
            className={`shrink-0 rounded-full px-4.5 py-2 text-[14px] font-bold transition-colors ${
              s === subject
                ? `${subjectAccent(s)} text-white`
                : "bg-surface text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.05)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {Array.from(majors.entries()).map(([major, minors]) => {
        // 과목 색 — 같은 과목의 대단원은 전부 같은 색이다
        const accent = accentOfSubject(subject);
        return (
        <section
          key={major}
          className="mb-4 overflow-hidden rounded-[24px] bg-surface shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
        >
          {/* 과목 색 머리띠 — 번호는 목록 순서가 아니라 백로그 id 에서 온다 (concepts.ts) */}
          <h2 className={`px-5 pb-3 pt-4 text-[16px] font-bold ${accent.tint}`}>
            <No value={majorNo(firstOf(minors))} cls={accent.text} />
            {major}
          </h2>

          {Array.from(minors.entries()).map(([minor, concepts]) => {
            const key = `${major}>${minor}`;
            // 중단원(소단원)은 기본으로 펼친다 — 대단원 아래 목차가 보여야 한다
            const isOpen = open[key] ?? true;
            const studied = countStudied(concepts, progress);
            return (
              <div key={key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                  className="flex w-full items-center justify-between px-5 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[15px] font-semibold text-ink-sub">
                    <No value={minorNo(concepts[0])} />
                    {minor}
                  </span>
                  <Meta studied={studied} total={concepts.length} open={isOpen} accent={accent} />
                </button>

                {isOpen &&
                  byTopic(concepts).map(([topic, list]) => {
                    const tkey = `${key}>${topic}`;
                    // 세부 개념은 기본으로 접어 둔다 — 목차부터 보고 필요한 것만 편다
                    const tOpen = open[tkey] ?? false;
                    const tStudied = countStudied(list, progress);
                    return (
                      <div key={tkey || "_"}>
                        <button
                          onClick={() =>
                            setOpen((o) => ({ ...o, [tkey]: !tOpen }))
                          }
                          className="flex w-full items-center justify-between py-2 pl-8 pr-5 text-left active:bg-bg-subtle"
                          aria-expanded={tOpen}
                        >
                          <span className="text-[14px] font-medium text-ink">
                            <No value={topicNo(list[0])} />
                            {topic || "개념"}
                          </span>
                          <Meta
                            studied={tStudied}
                            total={list.length}
                            open={tOpen}
                            subtle
                          />
                        </button>

                        {tOpen && (
                          <div className="pb-1">
                            {list.map((c) => (
                              <Link
                                key={c.id}
                                href={`/concepts/${c.id}`}
                                className="mx-2 flex min-h-[48px] items-center justify-between rounded-2xl py-2.5 pl-9 pr-3 active:bg-bg-subtle"
                              >
                                <span className="text-[15px] font-medium">
                                  {c.term}
                                </span>
                                <span className="flex items-center gap-2.5">
                                  <LevelDots
                                    level={progress.concepts[c.id]?.level ?? 0}
                                  />
                                  <span className="text-ink-faint" aria-hidden>
                                    ›
                                  </span>
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {isOpen && <div className="pb-1" />}
              </div>
            );
          })}
        </section>
        );
      })}
    </Screen>
  );
}

/**
 * 목차 번호 조각 — 번호가 없는 카드(시드)에서는 아무것도 그리지 않는다.
 * 자리만 차지하는 빈 번호는 정렬을 흐트러뜨린다.
 */
function No({ value, cls = "text-primary-600" }: { value: string; cls?: string }) {
  if (!value) return null;
  return (
    <span className={`mr-1.5 font-bold tabular-nums ${cls}`}>
      {value}.
    </span>
  );
}

/** 대단원 번호를 알려면 그 아래 아무 카드나 하나면 된다 */
function firstOf(minors: Map<string, Concept[]>): Concept {
  return minors.values().next().value![0];
}

function countStudied(
  list: Concept[],
  progress: { concepts: Record<string, { level: number }> },
) {
  return list.filter((c) => (progress.concepts[c.id]?.level ?? 0) > 0).length;
}

/** 진도 뱃지 + 펼침 화살표 — 중단원과 소주제가 같은 모양을 쓴다 */
function Meta({
  studied,
  total,
  open,
  subtle = false,
  accent,
}: {
  studied: number;
  total: number;
  open: boolean;
  subtle?: boolean;
  /** 중단원 배지는 그 단원의 색을 입는다. 소주제(subtle)는 회색 그대로 */
  accent?: { tint: string; text: string };
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
          subtle
            ? "bg-bg-subtle text-ink-sub"
            : `${accent?.tint ?? "bg-primary-50"} ${accent?.text ?? "text-primary-600"}`
        }`}
      >
        {studied}/{total}
      </span>
      <span
        className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      >
        ⌄
      </span>
    </span>
  );
}
