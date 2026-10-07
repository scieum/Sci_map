"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildTree, byTopic, conceptById, majorNo, minorNo, topicNo } from "@/data/concepts";
import { orderSubjectNames, subjectNameOf } from "@/data/catalog";
import type { Concept } from "@/lib/types";
import { BookmarkStar, Chip, LevelDots, ProgressBar, Screen, ScreenTitle } from "@/components/ui";
import { loadProgress, toggleBookmark, useProgress } from "@/lib/store";
import { loadUi, saveUi } from "@/lib/ui-state";
import { accentOfSubject, subjectAccent, type Accent } from "@/lib/brand";

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

  // 과목 요약 한 줄 — 지금 고른 과목 안에서만 센다
  const subjectAll = Array.from(majors.values()).flatMap((m) =>
    Array.from(m.values()).flat(),
  );
  const subjectStudied = countStudied(subjectAll, progress);

  return (
    <Screen>
      <ScreenTitle>개념</ScreenTitle>

      <SubjectSelect subjects={subjects} value={subject} onChange={chooseSubject} />

      {subjectAll.length > 0 && (
        <p className="-mt-2 mb-4 text-[13px] text-ink-faint">
          {subjectAll.length}개 개념 · 학습 시작 {subjectStudied}
        </p>
      )}

      <BookmarkShelf ids={marks} onRemove={unmark} />

      {Array.from(majors.entries()).map(([major, minors]) => {
        // 과목 색 — 같은 과목의 대단원은 전부 같은 색이다
        const accent = accentOfSubject(subject);
        // 대단원 진도 — 학습을 시작한 카드 / 전체 (Design.md §5.6 단원 진행 바)
        const all = Array.from(minors.values()).flat();
        const majorStudied = countStudied(all, progress);
        return (
        <section
          key={major}
          className="mb-4 overflow-hidden rounded-[24px] bg-surface shadow-card"
        >
          {/* 과목 색 머리띠 — 번호는 목록 순서가 아니라 백로그 id 에서 온다 (concepts.ts) */}
          <div className={`px-5 pb-4 pt-4 ${accent.tint}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="min-w-0 text-[17px] font-bold">
                <No value={majorNo(firstOf(minors))} cls={accent.text} />
                {major}
              </h2>
              <span className={`shrink-0 text-[14px] font-bold tabular-nums ${accent.text}`}>
                {majorStudied} / {all.length}
              </span>
            </div>
            <ProgressBar
              value={all.length ? majorStudied / all.length : 0}
              tone={toneOf(accent)}
              size="sm"
              label={`${major} 학습 ${majorStudied}/${all.length}`}
            />
          </div>

          {Array.from(minors.entries()).map(([minor, concepts]) => {
            const key = `${major}>${minor}`;
            // 중단원(소단원)은 기본으로 펼친다 — 대단원 아래 목차가 보여야 한다
            const isOpen = open[key] ?? true;
            const studied = countStudied(concepts, progress);
            return (
              <div key={key}>
                <button
                  onClick={() => toggleSection(key, isOpen)}
                  className="flex min-h-[48px] w-full items-center gap-2 px-5 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <Chevron open={isOpen} />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                    <No value={minorNo(concepts[0])} />
                    {minor}
                  </span>
                  {/* 펼친 중단원은 과목 색 진도 배지(교사 결정 2026-09-07 — brand.ts),
                      접힌 중단원은 카드 수만 흐리게 (Design.md §4.1 "▸ 화학 결합 12장") */}
                  {isOpen ? (
                    <Meta studied={studied} total={concepts.length} accent={accent} />
                  ) : (
                    <span className="shrink-0 text-[13px] text-ink-faint">
                      {concepts.length}장
                    </span>
                  )}
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
                          className="flex min-h-[44px] w-full items-center gap-2 py-2 pl-9 pr-5 text-left active:bg-bg-subtle"
                          aria-expanded={tOpen}
                        >
                          <Chevron open={tOpen} />
                          <span className="min-w-0 flex-1 text-[14px] font-medium text-ink-sub">
                            <No value={topicNo(list[0])} />
                            {topic || "개념"}
                          </span>
                          <Meta studied={tStudied} total={list.length} subtle />
                        </button>

                        {tOpen && (
                          <div className="pb-1">
                            {list.map((c) => (
                              <Link
                                key={c.id}
                                href={`/concepts/${c.id}`}
                                className="mx-2 flex min-h-[56px] items-center justify-between gap-3 rounded-2xl py-2.5 pl-14 pr-3 active:bg-bg-subtle"
                              >
                                <ConceptRowText c={c} />
                                <span className="flex shrink-0 items-center gap-2.5">
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
    <section className="mb-4 overflow-hidden rounded-[24px] bg-surface shadow-card">
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

/** 진도 뱃지 — 중단원과 소주제가 같은 모양을 쓴다. 펼침 표시는 왼쪽 Chevron 이 맡는다 */
function Meta({
  studied,
  total,
  subtle = false,
  accent,
}: {
  studied: number;
  total: number;
  subtle?: boolean;
  /** 중단원 배지는 그 단원의 색을 입는다. 소주제(subtle)는 회색 그대로 */
  accent?: { tint: string; text: string };
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums ${
        subtle
          ? "bg-bg-subtle text-ink-sub"
          : `${accent?.tint ?? "bg-primary-50"} ${accent?.text ?? "text-primary-600"}`
      }`}
    >
      {studied}/{total}
    </span>
  );
}

/** 펼침 표시 — 접힘 ›, 펼침 ⌄. 색이 아니라 방향(형태)으로 상태를 말한다 (D4) */
function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex w-4 shrink-0 justify-center text-[15px] text-ink-faint transition-transform ${
        open ? "rotate-90" : ""
      }`}
    >
      ›
    </span>
  );
}

/**
 * 과목 색 → 진행 막대 색. brand.ts 가 색 이름을 내보내지 않아 채움 클래스로 거꾸로 찾는다.
 * 사전에 없는 색은 브랜드색으로 — 없는 색을 지어내지 않는다.
 */
function toneOf(accent: Accent): "primary" | "violet" | "azure" | "rose" {
  if (accent.solid === "bg-violet-500") return "violet";
  if (accent.solid === "bg-azure-500") return "azure";
  if (accent.solid === "bg-rose-500") return "rose";
  return "primary";
}

/**
 * 개념 행의 글자 부분 — 표제어 + 표기 줄 + same 배지 (Design.md §5.1).
 *
 * same 배지는 파이프라인이 concept_key 로 확정해 둔 links 에서만 뽑는다. 표제어
 * 문자열을 다른 과목과 맞대어 만들지 않는다 (CLAUDE.md §9.5). 대상 카드가 이
 * 앱에 아직 없으면 배지를 그리지 않는다 — 눌러도 갈 곳이 없는 약속이 된다.
 */
function ConceptRowText({ c }: { c: Concept }) {
  const same = c.links
    .filter((l) => l.type === "same")
    .map((l) => conceptById(l.target))
    .find((t): t is Concept => Boolean(t) && t!.subject !== c.subject);
  // 한자가 없는 음차어(null·"해당 없음")는 한자 자리를 아예 만들지 않는다
  const hanja = c.hanja && c.hanja !== "해당 없음" ? c.hanja : null;
  const notation = [hanja, c.english].filter(Boolean).join(" · ");
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[16px] font-bold">{c.term}</span>
        {same && (
          <Chip tone="info">
            <span aria-hidden>↔</span>
            <span className="sr-only">다른 과목에서도 배움:</span>
            {same.subject}
          </Chip>
        )}
      </span>
      {notation && (
        <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
          {notation}
        </span>
      )}
    </span>
  );
}

