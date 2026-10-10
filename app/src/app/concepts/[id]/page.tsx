"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Art } from "@/components/Art";
import { ConceptLinks } from "@/components/ConceptLinks";
import { conceptById } from "@/data/concepts";
import { rememberSubject } from "@/lib/ui-state";
import { useBookmark, useProgress } from "@/lib/store";
import {
  BookmarkStar,
  BottomCta,
  Card,
  Chip,
  ConceptMediaList,
  LevelDots,
  Screen,
  SectionLabel,
} from "@/components/ui";

/**
 * 개념 카드 화면 — 정의 → 표기 → 관계 명제 → 함정 → 그림 → 링크, CTA 하나.
 * 한자가 없는 음차어는 표기 줄에 한자 자리를 아예 만들지 않는다.
 */
/**
 * 섹션 점프 칩 — 긴 카드에서 그림·연결로 바로 내려가는 줄. 칩마다 그 섹션의
 * 개수를 함께 적어 두어, 누르기 전에 카드에 무엇이 얼마나 있는지 읽힌다.
 * 스크롤 위치는 IntersectionObserver 로 따라간다 — 손으로 내려도 칩이 켜진다.
 */
function SectionJump({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const key = sections.map((s) => s.id).join("|");
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length < 2) return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id);
      },
      { rootMargin: "-10% 0px -75% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (sections.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="카드 안 이동"
      className="sticky top-0 z-20 -mx-5 mt-3 flex gap-2 overflow-x-auto bg-bg/95 px-5 py-2 backdrop-blur [scrollbar-width:none] md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((s) => {
        const on = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              setActive(s.id);
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-bold transition-colors ${
              on ? "bg-ink text-white" : "bg-surface text-ink-sub shadow-[0_1px_6px_rgba(23,58,94,0.06)]"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ConceptPage({ params }: PageProps<"/concepts/[id]">) {
  const { id } = use(params);
  const c = conceptById(id);
  const [showGloss, setShowGloss] = useState(false);
  // 훅은 카드가 없을 때도 같은 수만큼 불려야 한다 — notFound() 위에 둔다
  const [marked, toggleMark] = useBookmark(id);
  const progress = useProgress();

  // 이 카드의 과목을 개념 탭이 돌아갈 자리로 적어 둔다. 검색이나 오늘의 학습으로
  // 곧장 들어온 경우에도 ← 를 누르면 이 카드가 있는 과목이 열린다
  useEffect(() => {
    if (c) rememberSubject(c.subject);
  }, [c]);

  if (!c) notFound();

  // 학습 상태 칩 — 한 번이라도 인출해 본 카드에만 단다. 미학습 카드에 빈 도트를
  // 다는 것은 "아직 안 했다" 는 지적일 뿐이라 이 화면의 과업(읽기)에 보탬이 없다
  const level = progress.concepts[c.id]?.level ?? 0;
  // 한자가 없는 음차어는 null 이지만 "해당 없음" 문자열로 올 때도 같은 대접을 한다
  const hanja = c.hanja && c.hanja !== "해당 없음" ? c.hanja : null;
  // 연계 배지 — 파이프라인이 concept_key 로 확정한 same 링크에서만 (CLAUDE.md §9.5)
  const same = c.links
    .filter((l) => l.type === "same")
    .map((l) => conceptById(l.target))
    .find((t): t is NonNullable<typeof t> => Boolean(t) && t!.subject !== c.subject);
  const linkCount = c.links.filter((l) => conceptById(l.target)).length;
  const sections = [
    { id: "sec-def", label: "정의" },
    { id: "sec-rel", label: `관계 명제 ${c.relations.length}` },
    ...(c.misconceptions.length > 0 ? [{ id: "sec-trap", label: `함정 ${c.misconceptions.length}` }] : []),
    ...((c.media?.length ?? 0) > 0 ? [{ id: "sec-media", label: `그림 ${c.media!.length}` }] : []),
    ...(linkCount > 0 ? [{ id: "sec-links", label: `연결 ${linkCount}` }] : []),
  ];

  return (
    <Screen>
      {/* 브레드크럼 — 위치 감각 */}
      <nav className="mb-4 flex items-center gap-1 text-[13px] text-ink-faint">
        <Link
          href="/concepts"
          aria-label="트리로"
          className="mr-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[15px] text-ink shadow-card"
        >
          ←
        </Link>
        <span className="min-w-0 flex-1 truncate">
          {[c.subject, ...c.unit.split(" > ")].join(" › ")}
        </span>
        {/* 별은 제목 옆이 아니라 여기다. 제목 옆에 두면 표제어 길이에 따라
            자리가 춤춘다 — 어느 카드를 열어도 같은 자리에 있어야 손이 기억한다 */}
        <BookmarkStar on={marked} onToggle={toggleMark} />
      </nav>

      {/* 표제어 히어로 — 표제어·표기·학습 상태·연계 배지를 틴트 판 한 장에 모은다
          (말해보카 단어 정보, 시안 v2 카드 B). 연계 배지는 **링크가 아니다** —
          같은 카드로 가는 입구는 아래 '연결된 개념' 하나뿐이어야 한다 */}
      <section className="rounded-[24px] bg-primary-50 px-5 pb-5 pt-6 text-center">
        <h1 className="text-[26px] font-bold leading-tight">{c.term}</h1>
        {hanja ? (
          <button
            onClick={() => setShowGloss((v) => !v)}
            className="mt-1 text-[15px] text-ink-sub"
          >
            {hanja} · {c.english}
            {c.hanjaGloss && (
              <span className="ml-1.5 font-semibold text-primary-700">
                {showGloss ? "접기" : "풀이"}
              </span>
            )}
          </button>
        ) : (
          <p className="mt-1 text-[15px] text-ink-sub">{c.english}</p>
        )}
        {showGloss && c.hanjaGloss && (
          <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-left text-[14px] text-ink-sub">
            {c.hanjaGloss}
          </p>
        )}
        {(level > 0 || same) && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {level > 0 && (
              <Chip tone="primary">
                학습 중
                <LevelDots level={level} />
              </Chip>
            )}
            {same && (
              <Chip tone="info">
                <span aria-hidden>↔</span>
                <span className="sr-only">다른 과목에서도 배움:</span>
                {same.subject}
              </Chip>
            )}
          </div>
        )}
      </section>

      <SectionJump sections={sections} />

      <SectionLabel id="sec-def">정의</SectionLabel>
      <Card>
        <p className="text-[16px] leading-relaxed">{c.definition}</p>
      </Card>

      <SectionLabel id="sec-rel">
        <Art name="section-relations" className="mr-1.5 align-[-2px]" />
        관계 명제
      </SectionLabel>
      {/* 관계 명제가 시각적 중심이다 (Design.md §4.1) — 흰 카드 사이에서 틴트 판으로
          구별한다. 그림자를 빼 표면이 아니라 "강조된 영역" 으로 읽히게 한다 */}
      <div className="flex flex-col gap-3">
        {c.relations.map((r) => (
          <div key={r.id} className="rounded-[24px] bg-primary-50 p-5">
            <div className="flex flex-wrap gap-1.5">
              {/* 조건이 먼저다 — 명제가 언제 성립하는지가 읽기의 전제다 */}
              <Chip tone="outline">조건 · {r.condition}</Chip>
              {r.scope && <Chip tone="outline">{r.scope}</Chip>}
            </div>
            <p className="mt-3 text-[17px] font-medium leading-relaxed text-ink">
              {r.text}
            </p>
          </div>
        ))}
      </div>

      {c.misconceptions.length > 0 && (
        <>
          <SectionLabel id="sec-trap" tone="warning">
            <Art name="section-caution" className="mr-1.5 align-[-2px]" />
            흔한 함정
          </SectionLabel>
          <div className="flex flex-col gap-3">
            {c.misconceptions.map((m, i) => (
              <div key={i} className="rounded-[24px] bg-warning-bg p-5">
                {/* 색만으로 "틀린 말" 을 말하지 않는다 — ⚠ 와 따옴표가 형태다 (D4) */}
                <p className="flex gap-2 text-[16px] font-semibold leading-relaxed text-ink">
                  <span aria-hidden className="shrink-0 text-warning">⚠</span>
                  <span>
                    <span className="sr-only">흔한 함정: </span>
                    &ldquo;{m.text}&rdquo;
                  </span>
                </p>
                <p className="mt-2 pl-6 text-[14px] leading-relaxed text-ink-sub">
                  <span className="font-bold text-warning">왜 틀렸나</span>
                  <span aria-hidden> · </span>
                  {m.whyWrong}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {(c.media?.length ?? 0) > 0 && (
        <>
          <SectionLabel id="sec-media">그림</SectionLabel>
          <ConceptMediaList assets={c.media!} />
        </>
      )}

      {/* same 링크는 표기 줄 아래 배지가 제자리다 (Design.md §4.1). 여기서 또
          렌더하면 같은 카드로 가는 입구가 한 화면에 둘이 된다. */}
      <SectionLabel id="sec-links">
        <Art name="section-links" className="mr-1.5 align-[-2px]" />
        연결된 개념
      </SectionLabel>
      {/* 연계(same)도 여기 함께 쌓는다. 예전에는 표제어 바로 밑에 칩으로 따로
          띄웠는데, 그 자리에 파이프라인 메모가 그대로 나왔다 — "통합과학1 카드와
          concept_key 가 같다 (R9)" 는 학생이 읽을 말이 아니다. 링크 목록 안으로
          들어오면 '연계' 배지가 종류를 말해 주므로 칩이 하던 일이 없어진다. */}
      <ConceptLinks links={c.links} />

      {/* 화면 유일 CTA (D2) — 이 카드 단독의 3단계 인출 모드(§5.2)로 들어간다 */}
      <BottomCta href={`/concepts/${c.id}/recall`}>
        이 개념 인출 연습하기
      </BottomCta>
    </Screen>
  );
}
