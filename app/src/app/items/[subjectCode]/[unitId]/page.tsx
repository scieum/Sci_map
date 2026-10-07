"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { BottomCta, Card, Chip, ProgressBar } from "@/components/ui";
import { conceptById } from "@/data/concepts";
import {
  CHOICES,
  paperById,
  signedUrls,
  subjectTitle,
  unitItems,
  type ExamItem,
  type UnitItems,
} from "@/lib/exam";
import { examProgress, loadProgress, recordExam } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 단원 하나를 푼다 — 그 단원의 문항 전부를 한 줄로, 한 화면에 하나씩.
 *
 * ★ 이어서 푼다. 처음 여는 자리는 **아직 답하지 않은 첫 문항**이다. 25문항을
 *   두 번에 나눠 푸는 일이 흔한데, 늘 1번부터 시작하면 풀던 자리를 손으로
 *   찾아 넘겨야 한다.
 *
 * ★ 객관식만 앱이 채점한다. 서술형은 발행사가 쓴 모범답안을 가져오지 않아서
 *   (CLAUDE.md §6) 스스로 확인하는 자리로 둔다 — 관련 개념 카드를 옆에 놓아
 *   무엇을 견주어 봐야 하는지 가리킨다.
 *
 * ★ 이미지는 로그인한 세션에만 내려오는 서명 URL 이다. 세션이 없으면 문항을
 *   아예 받아 오지 않는다.
 */
type UnitItem = UnitItems["items"][number];

export default function UnitPage({ params }: PageProps<"/items/[subjectCode]/[unitId]">) {
  const { subjectCode, unitId } = use(params);
  // Keep the item list stable across state updates so loading and progress effects
  // only restart when the selected unit changes.
  const unit = useMemo(() => unitItems(unitId), [unitId]);

  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [given, setGiven] = useState<string | null>(null);
  const [score, setScore] = useState({ done: 0, correct: 0 });

  const items = useMemo(() => unit?.items ?? [], [unit]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSignedIn(false);
      return;
    }
    let alive = true;
    void supabase().auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn || items.length === 0) return;
    let alive = true;
    void signedUrls(items).then((u) => {
      if (alive) setUrls(u);
    });
    return () => {
      alive = false;
    };
  }, [items, signedIn]);

  // 풀던 자리부터. 전부 풀었다면 처음으로 돌아간다(다시 풀 수 있어야 한다)
  useEffect(() => {
    if (items.length === 0) return;
    const answered = loadProgress().exam;
    const next = items.findIndex((i) => !answered[i.id]);
    setIdx(next === -1 ? 0 : next);
    setScore(examProgress(items.map((i) => i.id)));
  }, [items]);

  // Fetch and decode only the next two images while the student reads this one.
  // Signed URLs alone do not download the image bytes.
  useEffect(() => {
    if (!signedIn || !urls || idx === null) return;
    for (const upcoming of items.slice(idx + 1, idx + 3)) {
      const url = urls[upcoming.id];
      if (!url) continue;
      const image = new Image();
      image.src = url;
      void image.decode().catch(() => {
        // A failed preload must not prevent normal loading when the item opens.
      });
    }
  }, [idx, items, signedIn, urls]);

  if (!unit) notFound();

  const item = idx === null ? null : items[idx];
  const total = items.length;

  function answer(choice: string) {
    if (given || !item) return;
    const correct = item.kind === "choice" ? choice === item.answer : true;
    setGiven(choice);
    recordExam(item.id, choice, correct);
    setScore((s) => ({ done: s.done + 1, correct: s.correct + (correct ? 1 : 0) }));
  }

  function next() {
    setGiven(null);
    setIdx((i) => Math.min((i ?? 0) + 1, total - 1));
  }

  const head = `${subjectTitle(subjectCode)} · ${unit.title}`;
  const back = `/items/${subjectCode}`;

  if (signedIn === false) {
    return (
      <Shell head={head} back={back}>
        <Card>
          <p className="text-[15px] font-bold">로그인하면 문제가 열려요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            평가 문항은 교과서 발행사가 만든 자료라 수업을 듣는 학생에게만 보여 줄 수
            있어요. 로그인한 뒤 이 화면으로 다시 오면 바로 풀 수 있어요.
          </p>
          <Link
            href="/me"
            className="mt-4 inline-block rounded-full bg-primary-500 px-5 py-2.5 text-[14px] font-bold text-white shadow-chip"
          >
            로그인하러 가기
          </Link>
        </Card>
      </Shell>
    );
  }

  if (!item) {
    return (
      <Shell head={head} back={back}>
        <p className="text-[14px] text-ink-faint">불러오는 중…</p>
      </Shell>
    );
  }

  const isLast = idx! + 1 >= total;
  const right = item.kind === "choice" && given === item.answer;

  return (
    <Shell head={head} back={back} count={`${idx! + 1} / ${total}`} withCta={Boolean(given)}>
      <div className="mb-4">
        <ProgressBar
          value={(idx! + (given ? 1 : 0)) / total}
          size="sm"
          label={`${total}문항 중 ${idx! + 1}번째`}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {/* 어느 평가지에서 온 문항인지 — 회차를 목록에서 뺀 대신 여기 남긴다 */}
        <Chip tone="primary">
          {item.paperLabel} · 문항 {item.no}
        </Chip>
        {item.kind !== "unknown" && (
          <Chip tone="outline">{item.kind === "choice" ? "객관식" : "서술형"}</Chip>
        )}
        {item.topicLabel && <Chip tone="outline">{item.topicLabel}</Chip>}
        {item.difficulty && <Chip tone="outline">난이도 {item.difficulty}</Chip>}
      </div>

      <ItemImage item={item} url={urls?.[item.id]} loading={urls === null} />

      {item.kind === "choice" ? (
        <>
          <p className="mb-2.5 mt-5 text-[13px] font-bold text-ink-sub">답 고르기</p>
          <div className="flex justify-between gap-1">
            {CHOICES.map((c) => {
              const picked = given === c;
              const isAnswer = Boolean(given) && c === item.answer;
              const wrongPick = picked && !isAnswer;
              // 채점 결과는 색만으로 알리지 않는다 (D4) — 원 아래에 ✓·✕ 글자를 붙인다
              const look = isAnswer
                ? "bg-success-bg text-success ring-2 ring-success"
                : wrongPick
                  ? "bg-danger-bg text-danger ring-2 ring-danger"
                  : given
                    ? "bg-surface text-ink-faint ring-1 ring-line"
                    : "bg-surface text-ink ring-1 ring-line active:bg-primary-50";
              return (
                <div key={c} className="flex flex-col items-center">
                  <button
                    onClick={() => answer(c)}
                    disabled={Boolean(given)}
                    aria-label={`${c}번${isAnswer ? " · 정답" : wrongPick ? " · 내 답, 오답" : ""}`}
                    className={`flex h-[54px] w-[54px] items-center justify-center rounded-full text-[20px] font-bold shadow-chip transition-colors ${look}`}
                  >
                    {c}
                  </button>
                  <span
                    aria-hidden
                    className={`mt-1 h-4 text-[11px] font-bold ${
                      isAnswer ? "text-success" : "text-danger"
                    }`}
                  >
                    {isAnswer ? "✓ 정답" : wrongPick ? "✕ 내 답" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <button
          onClick={() => answer("self")}
          disabled={Boolean(given)}
          className="mt-5 h-14 w-full rounded-full bg-surface text-[15px] font-bold text-primary-600 ring-1 ring-line shadow-chip disabled:opacity-60"
        >
          서술형이에요 · 스스로 확인하고 넘어가기
        </button>
      )}

      {given && (
        <Card className="mt-4">
          {item.kind === "choice" ? (
            <p
              className={`flex items-center gap-2 text-[17px] font-extrabold ${
                right ? "text-success" : "text-danger"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] ring-2 ${
                  right ? "ring-success" : "ring-danger"
                }`}
              >
                {right ? "✓" : "✕"}
              </span>
              {right ? "정답이에요" : `오답이에요 · 정답 ${item.answer}`}
            </p>
          ) : (
            <p className="text-[15px] font-bold text-ink-sub">
              모범답안은 싣지 않았어요. 아래 개념 카드로 확인해 보세요.
            </p>
          )}

          {/* 해설은 사이맵이 쓴 것뿐이다 — 발행사 해설은 옮기지 않는다 (CLAUDE.md §6) */}
          {item.explanation && (
            <>
              <p className="mt-2 text-[12px] text-ink-faint">
                해설 · 개념 카드의 관계 명제를 인용해 사이맵이 직접 썼어요
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{item.explanation}</p>
            </>
          )}

          <RelatedConcepts item={item} />

          <Link
            href={back}
            className="mt-5 block text-center text-[13px] font-bold text-ink-faint"
          >
            단원 목록으로 ({score.correct}/{score.done} 맞힘)
          </Link>
        </Card>
      )}

      {given && (
        <BottomCta onClick={next} disabled={isLast}>
          {isLast ? "이 단원의 마지막 문항이에요" : "다음 문항"}
        </BottomCta>
      )}
    </Shell>
  );
}

function Shell({
  head,
  back,
  count,
  withCta = false,
  children,
}: {
  head: string;
  back: string;
  /** "3 / 25" — 문항을 보고 있을 때만 */
  count?: string;
  /** 하단 고정 CTA 가 뜨면 그만큼 아래를 비워 둔다 */
  withCta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className={`mx-auto w-full max-w-xl px-5 pt-5 ${withCta ? "pb-48" : "pb-28"}`}>
      <header className="mb-3 flex items-center gap-2">
        <Link
          href={back}
          aria-label="단원 목록으로"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-ink"
        >
          ‹
        </Link>
        <p className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink">
          {head}
          {count && <span className="text-ink-sub"> · {count}</span>}
        </p>
      </header>
      {children}
    </main>
  );
}

/**
 * 문항 크롭. 비율을 미리 잡아 두어 이미지가 붙을 때 화면이 튀지 않게 한다.
 *
 * ★ 이미지 아래 띠에 출처·이용 근거·경고 문구를 상시 둔다 (Design.md §4.3,
 *   rights_policy §5). 크롭 안의 워터마크와 별개로, 화면에서도 늘 읽혀야 한다.
 * ★ 길게 누르기·우클릭·끌어서 저장을 막는다 (Design.md §4.3). 캡처까지 막지는
 *   못하지만, 손쉬운 저장 경로는 닫아 둔다.
 */
function ItemImage({
  item,
  url,
  loading,
}: {
  item: UnitItem;
  url?: string;
  loading: boolean;
}) {
  const holder = paperById(item.paperId)?.rightsHolder;
  return (
    <figure className="overflow-hidden rounded-[24px] bg-surface shadow-chip">
      <div
        className="select-none p-2 [-webkit-touch-callout:none]"
        style={{ aspectRatio: `${item.width} / ${item.height}` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`${item.no}번 문항`}
            width={item.width}
            height={item.height}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="pointer-events-none h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-2xl bg-bg-subtle text-[13px] text-ink-faint">
            {loading ? "문항을 불러오는 중…" : "문항 이미지를 받지 못했어요"}
          </div>
        )}
      </div>
      <figcaption className="bg-bg-subtle px-4 py-2.5 text-[12px] leading-snug text-ink-faint">
        출처 · {holder ? `${holder} ` : ""}
        {item.paperLabel} | 수업 목적 이용(저작권법 제25조 제3항) · 저장·공유 금지
      </figcaption>
    </figure>
  );
}

/**
 * 관련 개념 카드.
 *
 * Q3 에서 카드 하나로 좁혀진 문항은 그 카드를, 아직 성취기준까지만 맞춰 둔
 * 문항은 후보를 함께 보여 준다. **후보라는 것을 숨기지 않는다** — 확정된 것처럼
 * 보이면 학생이 엉뚱한 카드를 정답 근거로 삼는다.
 *
 * ★ 후보가 너무 많으면 아예 늘어놓지 않는다. 성취기준이 문항마다 적혀 있지
 *   않은 자료(대단원 총괄평가)에서는 후보가 단원 전체 서른 장까지 간다.
 *   서른 개 칩은 "관련 개념" 이 아니라 목차이고, 그걸 훑느니 개념 탭에서
 *   단원을 펴 보는 편이 빠르다. Q4 매핑이 끝나면 이 자리는 한두 장이 된다.
 */
const CHIP_LIMIT = 6;

function RelatedConcepts({ item }: { item: ExamItem }) {
  const exact = Boolean(item.conceptIds?.length);
  const ids = exact ? item.conceptIds! : (item.conceptCandidates ?? []);
  const cards = ids.map(conceptById).filter(Boolean);
  if (cards.length === 0) return null;

  if (!exact && cards.length > CHIP_LIMIT) {
    return (
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-bold text-ink-faint">개념 다시 보기</p>
        <Link href="/concepts">
          <Chip tone="primary">이 단원의 개념 {cards.length}장 보기 →</Chip>
        </Link>
        <p className="mt-1.5 text-[11px] text-ink-faint">
          이 문항이 어느 개념을 묻는지는 아직 좁히는 중이에요.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] font-bold text-ink-faint">
        {exact ? "관련 개념" : "이 성취기준의 개념들"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((c) => (
          <Link key={c!.id} href={`/concepts/${c!.id}`}>
            <Chip tone="primary">{c!.term} →</Chip>
          </Link>
        ))}
      </div>
    </div>
  );
}
