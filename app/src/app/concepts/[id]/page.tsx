"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useState } from "react";
import { Art } from "@/components/Art";
import { conceptById, LINK_LABEL } from "@/data/concepts";
import {
  BottomCta,
  Card,
  Chip,
  ConceptMedia,
  Screen,
  SectionLabel,
} from "@/components/ui";

/**
 * 개념 카드 화면 — 정의 → 표기 → 관계 명제 → 함정 → 그림 → 링크, CTA 하나.
 * 한자가 없는 음차어는 표기 줄에 한자 자리를 아예 만들지 않는다.
 */
export default function ConceptPage({ params }: PageProps<"/concepts/[id]">) {
  const { id } = use(params);
  const c = conceptById(id);
  const [showGloss, setShowGloss] = useState(false);
  if (!c) notFound();

  const sameLinks = c.links.filter((l) => l.type === "same");

  return (
    <Screen>
      {/* 브레드크럼 — 위치 감각 */}
      <nav className="mb-4 flex items-center gap-1 text-[13px] text-ink-faint">
        <Link
          href="/concepts"
          aria-label="트리로"
          className="mr-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[15px] text-ink shadow-[0_2px_10px_rgba(23,58,94,0.06)]"
        >
          ←
        </Link>
        {c.subject} · {c.unit.split(" > ").pop()}
      </nav>

      <h1 className="text-[26px] font-extrabold">{c.term}</h1>
      {c.hanja ? (
        <button
          onClick={() => setShowGloss((v) => !v)}
          className="mt-1 text-left text-[15px] text-ink-sub"
        >
          {c.hanja} · {c.english}
          {c.hanjaGloss && (
            <span className="ml-1.5 text-primary-600">
              {showGloss ? "접기" : "풀이"}
            </span>
          )}
        </button>
      ) : (
        <p className="mt-1 text-[15px] text-ink-sub">{c.english}</p>
      )}
      {showGloss && c.hanjaGloss && (
        <p className="mt-2 rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.05)]">
          {c.hanjaGloss}
        </p>
      )}
      {sameLinks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sameLinks.map((l) => {
            const t = conceptById(l.target);
            return (
              <Link key={l.target} href={`/concepts/${l.target}`}>
                <Chip tone="info">
                  ↔ {l.note ?? "연계"} · {t?.term}
                </Chip>
              </Link>
            );
          })}
        </div>
      )}

      <SectionLabel>정의</SectionLabel>
      <Card>
        <p className="text-[16px] leading-relaxed">{c.definition}</p>
      </Card>

      <SectionLabel>
        <Art name="section-relations" className="mr-1.5 align-[-2px]" />
        관계 명제
      </SectionLabel>
      <div className="flex flex-col gap-3">
        {c.relations.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="primary">{r.condition}</Chip>
              {r.scope && <Chip>{r.scope}</Chip>}
            </div>
            <p className="mt-2.5 text-[17px] font-semibold leading-relaxed">
              {r.text}
            </p>
          </Card>
        ))}
      </div>

      <SectionLabel>
        <Art name="section-caution" className="mr-1.5 align-[-2px]" />
        이것만은 조심해요
      </SectionLabel>
      <div className="flex flex-col gap-3">
        {c.misconceptions.map((m, i) => (
          <div
            key={i}
            className="rounded-[24px] bg-[#fff6ea] p-5 shadow-[0_2px_14px_rgba(23,58,94,0.05)]"
          >
            <p className="text-[15px] font-semibold text-ink line-through decoration-warning/50">
              &ldquo;{m.text}&rdquo;
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
              <span className="mr-1 rounded-full bg-warning-bg px-2 py-0.5 text-[12px] font-bold text-warning">
                왜?
              </span>
              {m.whyWrong}
            </p>
          </div>
        ))}
      </div>

      {(c.hasRestrictedMedia || c.mediaFile) && (
        <>
          <SectionLabel>그림</SectionLabel>
          <ConceptMedia
            restricted={c.hasRestrictedMedia}
            caption={c.mediaCaption}
            file={c.mediaFile}
          />
        </>
      )}

      <SectionLabel>
        <Art name="section-links" className="mr-1.5 align-[-2px]" />
        이어지는 개념
      </SectionLabel>
      <div className="flex flex-wrap gap-2">
        {c.links.map((l) => {
          const t = conceptById(l.target);
          if (!t) return null;
          return (
            <Link key={`${l.type}-${l.target}`} href={`/concepts/${t.id}`}>
              <Chip tone={l.type === "same" ? "info" : "neutral"}>
                {l.type === "prereq" && "← "}
                {LINK_LABEL[l.type]} · {t.term}
                {l.type === "next" && " →"}
              </Chip>
            </Link>
          );
        })}
      </div>

      <BottomCta href={`/concepts/${c.id}/recall`}>
        가리고 떠올려보기
      </BottomCta>
    </Screen>
  );
}
