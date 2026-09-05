"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildTree, byTopic } from "@/data/concepts";
import type { Concept } from "@/lib/types";
import { LevelDots, Screen, ScreenTitle } from "@/components/ui";
import { useProgress } from "@/lib/store";

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
                ? "bg-primary-500 text-white shadow-[0_4px_12px_rgba(24,159,230,0.3)]"
                : "bg-surface text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.05)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {Array.from(majors.entries()).map(([major, minors]) => (
        <section
          key={major}
          className="mb-4 overflow-hidden rounded-[24px] bg-surface shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
        >
          <h2 className="px-5 pb-1 pt-4 text-[16px] font-bold">{major}</h2>
          {Array.from(minors.entries()).map(([minor, concepts]) => {
            const key = `${major}>${minor}`;
            const isOpen = open[key] ?? true;
            const studied = concepts.filter(
              (c) => (progress.concepts[c.id]?.level ?? 0) > 0,
            ).length;
            return (
              <div key={key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                  className="flex w-full items-center justify-between px-5 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[15px] font-semibold text-ink-sub">
                    {minor}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[12px] font-bold text-primary-600">
                      {studied}/{concepts.length}
                    </span>
                    <span
                      className={`text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      ⌄
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {byTopic(concepts).map(([topic, list]) => (
                      <div key={topic || "_"}>
                        {topic && (
                          <p className="px-5 pb-1 pt-2 text-[12px] font-bold tracking-wide text-ink-faint">
                            {topic}
                          </p>
                        )}
                        {list.map((c) => (
                          <Link
                            key={c.id}
                            href={`/concepts/${c.id}`}
                            className="mx-2 flex min-h-[48px] items-center justify-between rounded-2xl px-3 py-2.5 active:bg-bg-subtle"
                          >
                            <span className="text-[15px] font-medium">{c.term}</span>
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
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </Screen>
  );
}
