"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildTree, byTopic, majorNo, minorNo, topicNo } from "@/data/concepts";
import { orderSubjectNames, subjectNameOf } from "@/data/catalog";
import type { Concept } from "@/lib/types";
import { LevelDots, Screen, ScreenTitle } from "@/components/ui";
import { useProgress } from "@/lib/store";
import { loadUi, saveUi } from "@/lib/ui-state";
import { accentOfSubject, subjectAccent } from "@/lib/brand";

/** 개념 탭 — 과목 드롭다운 → 대단원 카드 → 중단원 접기 → 소주제 → 개념 행 */
export default function ConceptsPage() {
  const progress = useProgress();
  const tree = useMemo(() => buildTree(), []);
  // 카드가 있는 과목 전부. 공통 → 일반 선택 → 진로 선택, 같은 구분에서는 물·화·생·지
  const allSubjects = useMemo(
    () => orderSubjectNames(Array.from(tree.keys())),
    [tree],
  );

  /**
   * 고른 과목만 보여 준다 — 내 정보의 수강 과목이 곧 이 목록이다.
   *
   * 아직 아무것도 고르지 않았다면(비로그인 포함) 전부 보여 준다. 스케줄러가
   * 출제 범위를 정할 때 쓰는 규칙과 같다 (scheduler.ts) — 두 곳이 어긋나면
   * "보이지도 않는 과목에서 오늘의 문항이 나오는" 일이 생긴다.
   * 고른 과목에 아직 카드가 하나도 없을 때도 전부로 물러난다. 빈 화면보다는 낫다.
   */
  const subjects = useMemo(() => {
    const mine = new Set(
      (progress.enrollment?.subjects ?? [])
        .map(subjectNameOf)
        .filter((n): n is string => Boolean(n)),
    );
    const picked = allSubjects.filter((s) => mine.has(s));
    return picked.length > 0 ? picked : allSubjects;
  }, [allSubjects, progress.enrollment]);

  // 서버 렌더와 첫 그림은 항상 같은 값이어야 하므로(hydration) 저장된 과목은
  // 마운트 뒤에 읽는다. 읽은 값이 지금 목록에 없으면(과목이 빠졌거나 수강
  // 과목에서 뺐다면) 무시하고 목록의 첫 과목으로 돌아간다
  const [subject, setSubject] = useState(allSubjects[0]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // 저장된 과목은 처음 한 번만 되살린다. 그 뒤로는 학생이 고른 것이 우선이라
  // 목록이 바뀌었을 때(수강 과목을 고쳤을 때)만 손댄다
  const restored = useRef(false);
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const saved = loadUi().conceptsSubject;
      if (saved && subjects.includes(saved)) {
        setSubject(saved);
        return;
      }
    }
    if (!subjects.includes(subject)) setSubject(subjects[0]);
  }, [subjects, subject]);

  useEffect(() => {
    const ui = loadUi();
    if (ui.conceptsOpen) setOpen(ui.conceptsOpen);
  }, []);

  /** 과목을 고르면 그 자리를 기억한다 — 카드에 들어갔다 나와도 여기로 돌아온다 */
  function chooseSubject(s: string) {
    setSubject(s);
    saveUi({ conceptsSubject: s });
  }

  function toggleSection(key: string, isOpen: boolean) {
    setOpen((o) => {
      const next = { ...o, [key]: !isOpen };
      saveUi({ conceptsOpen: next });
      return next;
    });
  }

  const majors =
    tree.get(subject) ?? new Map<string, Map<string, Concept[]>>();

  return (
    <Screen>
      <ScreenTitle>개념</ScreenTitle>

      <SubjectSelect subjects={subjects} value={subject} onChange={chooseSubject} />

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
                  onClick={() => toggleSection(key, isOpen)}
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
 * 과목 고르기 — 알약 칩 줄을 대신하는 드롭다운.
 *
 * 칩 줄은 과목이 늘수록 옆으로 흘러 화면 밖으로 나갔다. 스크롤바가 있어도
 * 지금 몇 개 중 어디에 있는지 보이지 않는다. 고른 과목만 담기는 목록이라
 * 대개 두셋이지만, 접어 두면 개수와 무관하게 자리가 한 줄로 고정된다.
 *
 * 과목이 하나뿐이면 펼칠 것이 없으므로 이름표만 남긴다 — 눌러도 아무 일이
 * 없는 단추는 두지 않는다.
 */
function SubjectSelect({
  subjects,
  value,
  onChange,
}: {
  subjects: string[];
  value: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  // 바깥을 누르거나 Esc 를 누르면 닫는다. 펼친 동안에만 듣는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = (
    <span className="truncate text-[15px] font-bold text-white">{value}</span>
  );

  if (subjects.length <= 1) {
    return (
      <div className="mb-5">
        <span
          className={`inline-flex h-12 max-w-full items-center rounded-full px-5 ${subjectAccent(value)}`}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    // 폭은 과목 이름만큼만. 한 줄을 가로지르는 단추는 "여기서 무엇이든 고른다" 는
    // 신호가 너무 커서, 정작 아래 목차보다 눈에 먼저 든다
    <div ref={box} className="relative mb-5 w-fit max-w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-12 max-w-full items-center gap-2 rounded-full pl-5 pr-4 ${subjectAccent(value)}`}
      >
        {label}
        <span
          aria-hidden
          className={`shrink-0 text-white/80 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ⌄
        </span>
      </button>

      {/* 목록은 단추보다 넓어도 된다 — 가장 긴 과목 이름에 맞춘다. 다만 화면
          밖으로는 나가지 않게 좌우 여백만큼 뺀 폭을 상한으로 둔다 */}
      {open && (
        <ul
          role="listbox"
          aria-label="과목"
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-max min-w-full max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[20px] bg-surface p-1.5 shadow-[0_10px_30px_rgba(23,58,94,0.18)]"
        >
          {subjects.map((s) => {
            const on = s === value;
            const accent = accentOfSubject(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`flex min-h-[46px] w-full items-center justify-between rounded-2xl px-4 text-left text-[15px] active:bg-bg-subtle ${
                    on ? `${accent.tint} ${accent.text} font-bold` : "font-medium text-ink"
                  }`}
                >
                  {s}
                  {on && <span aria-hidden>✓</span>}
                </button>
              </li>
            );
          })}
          {/* 목록에 없는 과목을 보려면 수강 과목을 고쳐야 한다. 그 길을 여기서 가리킨다 */}
          <li className="border-t border-bg-subtle">
            <Link
              href="/me"
              className="flex min-h-[44px] items-center justify-between px-4 text-[13px] font-semibold text-ink-faint"
            >
              수강 과목 고치기
              <span aria-hidden>›</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
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
