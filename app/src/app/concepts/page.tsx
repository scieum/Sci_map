"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildTree, byTopic, conceptById, majorNo, minorNo, topicNo } from "@/data/concepts";
import { orderSubjectNames, subjectNameOf } from "@/data/catalog";
import type { Concept } from "@/lib/types";
import { BookmarkStar, LevelDots, Screen, ScreenTitle } from "@/components/ui";
// 과목 드롭다운은 문제 탭도 쓴다 — 두 탭이 같은 자리에서 같은 모양으로 과목을
// 고르게 하려고 컴포넌트로 뺐다 (components/SubjectSelect.tsx)
import SubjectSelect from "@/components/SubjectSelect";
import { loadProgress, toggleBookmark, useProgress } from "@/lib/store";
import { loadUi, saveUi } from "@/lib/ui-state";
import { accentOfSubject } from "@/lib/brand";

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

  // 북마크는 한 곳에서만 쥔다. 선반과 목록이 따로 읽으면 선반에서 뺀 카드가
  // 아래 목록에서는 아직 별을 달고 있는, 같은 화면 안에서 어긋난 상태가 된다
  const [marks, setMarks] = useState<string[]>([]);
  useEffect(() => {
    setMarks(loadProgress().bookmarks);
  }, []);
  const unmark = (id: string) => {
    toggleBookmark(id);
    setMarks((m) => m.filter((x) => x !== id));
  };

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

      <BookmarkShelf ids={marks} onRemove={unmark} />

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
                                  {marks.includes(c.id) && (
                                    <span className="text-[13px] text-primary-500" aria-label="북마크한 개념">
                                      ★
                                    </span>
                                  )}
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
 * 북마크 선반 — 과목·단원을 가로질러 "다시 볼 카드"만 모은다.
 *
 * 목록 맨 위에 둔다. 북마크는 트리 어디에 있든 상관없이 찾으려고 담는
 * 것이라, 담아 둔 카드를 보려고 다시 트리를 파고들어야 한다면 담은 보람이
 * 없다. 접어 두는 것이 기본이다 — 늘 펼쳐 두면 정작 목차가 아래로 밀린다.
 *
 * 지워진 카드(파이프라인에서 빠진 id)는 조용히 건너뛴다.
 */
function BookmarkShelf({
  ids,
  onRemove,
}: {
  ids: string[];
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = ids.map(conceptById).filter((c): c is Concept => Boolean(c));
  if (list.length === 0) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-[24px] bg-surface shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-[16px] font-bold">
          <span className="mr-1.5 text-primary-500" aria-hidden>★</span>
          북마크
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[12px] font-bold text-primary-600">
            {list.length}
          </span>
          <span
            className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ⌄
          </span>
        </span>
      </button>

      {open && (
        <div className="pb-2">
          {list.map((c) => (
            <div
              key={c.id}
              className="mx-2 flex min-h-[48px] items-center gap-2 rounded-2xl py-1.5 pl-3 pr-2"
            >
              <Link href={`/concepts/${c.id}`} className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-[15px] font-medium">{c.term}</span>
                <span className="block truncate text-[12px] text-ink-faint">
                  {c.subject} · {c.unit.split(" > ").pop()}
                </span>
              </Link>
              <BookmarkStar on onToggle={() => onRemove(c.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
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
