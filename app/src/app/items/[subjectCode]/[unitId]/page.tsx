"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { BottomCta, Card, Chip, ProgressBar } from "@/components/ui";
import { Chip as ModeChip, ChipRow } from "@/components/hub";
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
 *
 * ★ 출제 순서는 다섯 가지다 (2026-10-10, 시안 v2 문제 B): 순서대로 · 쉬운 것부터 ·
 *   어려운 것부터 · 랜덤 · 안 푼 것만. 평가지 번호 순 하나뿐이던 때에는 시험 전에
 *   어려운 것만 보거나 특정 문항으로 건너뛸 길이 없었다. 난이도 표가 없는 자료
 *   (물질과 에너지)에서는 난이도 두 칩이 비활성이 된다 — 없는 정보로 정렬하지 않는다.
 *   랜덤은 세션 안에서 씨앗을 고정해 뒤로 갔다 와도 같은 순서다.
 */
type UnitItem = UnitItems["items"][number];

type Order = "seq" | "easy" | "hard" | "random" | "unsolved";
const ORDERS: { key: Order; label: string; needsDifficulty?: boolean }[] = [
  { key: "seq", label: "순서대로" },
  { key: "easy", label: "쉬운 것부터", needsDifficulty: true },
  { key: "hard", label: "어려운 것부터", needsDifficulty: true },
  { key: "random", label: "랜덤" },
  { key: "unsolved", label: "안 푼 것만" },
];
/** 발행사 난이도 표기 → 숫자. 표기가 없으면 가운데로 둔다 (정렬에서 앞뒤로 튀지 않게) */
const DIFF_RANK: Record<string, number> = { 하: 1, 중: 2, 상: 3 };
const rankOf = (i: UnitItem) => DIFF_RANK[i.difficulty ?? ""] ?? 2;

/** 씨앗 있는 셔플 (mulberry32 + Fisher–Yates) — 같은 씨앗이면 같은 순서다 */
function shuffled<T>(list: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Answered = Record<string, { given: string; correct: boolean }>;

/** 순서 설정대로 문항을 세운다. 순수 함수 — 같은 입력이면 같은 순서다 */
function orderItems(
  all: UnitItem[],
  sort: { order: Order; seed: number; skip: Answered },
): UnitItem[] {
  switch (sort.order) {
    case "easy":
      return all.slice().sort((a, b) => rankOf(a) - rankOf(b));
    case "hard":
      return all.slice().sort((a, b) => rankOf(b) - rankOf(a));
    case "random":
      return shuffled(all, sort.seed);
    case "unsolved": {
      const rest = all.filter((i) => !sort.skip[i.id]);
      return rest.length > 0 ? rest : all;
    }
    default:
      return all;
  }
}

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
  // 풀이 기록 — 문항 고르기 그리드의 ✓·✕ 와 "안 푼 것만" 의 근거. localStorage 는
  // 마운트 뒤에만 읽는다 (서버 렌더와 첫 그림이 같아야 한다)
  const [answered, setAnswered] = useState<Answered>({});
  // 순서 설정은 한 덩어리로 바뀐다 — 어떤 순서인지, 랜덤 씨앗, "안 푼 것만" 을
  // 고른 순간의 기록. 셋이 따로 놀면 목록이 풀 때마다 줄어 지금 보는 문항이 사라진다
  const [sort, setSort] = useState<{ order: Order; seed: number; skip: Answered }>({
    order: "seq",
    seed: 1,
    skip: {},
  });
  const order = sort.order;
  const [pickerOpen, setPickerOpen] = useState(false);

  const all = useMemo(() => unit?.items ?? [], [unit]);
  const hasDifficulty = useMemo(() => all.some((i) => i.difficulty), [all]);

  /** 지금 순서대로 세운 문항 */
  const items = useMemo(() => orderItems(all, sort), [all, sort]);

  /** 순서를 바꾼다. 새 순서에서 아직 답하지 않은 첫 문항으로 간다. 랜덤을 다시 누르면 다시 섞인다 */
  function changeOrder(next: Order) {
    const nextSort = {
      order: next,
      // 다시 섞을 때마다 씨앗을 한 칸 민다 — 시계를 읽지 않아도 매번 다른 순서가 된다
      seed: next === "random" ? (sort.seed * 16807 + 11) % 2147483647 : sort.seed,
      skip: answered,
    };
    const list = orderItems(all, nextSort);
    const first = list.findIndex((i) => !answered[i.id]);
    setSort(nextSort);
    setGiven(null);
    setIdx(first === -1 ? 0 : first);
    setPickerOpen(false);
  }

  /** 그리드에서 고른 문항으로. 이미 푼 문항이면 그때의 답과 해설을 그대로 보여 준다 */
  function jumpTo(i: number) {
    const it = items[i];
    setIdx(i);
    setGiven(it && answered[it.id] ? answered[it.id].given : null);
    setPickerOpen(false);
  }

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
    if (!signedIn || all.length === 0) return;
    let alive = true;
    void signedUrls(all).then((u) => {
      if (alive) setUrls(u);
    });
    return () => {
      alive = false;
    };
  }, [all, signedIn]);

  // 풀던 자리부터. 전부 풀었다면 처음으로 돌아간다(다시 풀 수 있어야 한다)
  useEffect(() => {
    if (all.length === 0) return;
    const rec = loadProgress().exam;
    const mine: Answered = {};
    for (const i of all) if (rec[i.id]) mine[i.id] = { given: rec[i.id].given, correct: rec[i.id].correct };
    setAnswered(mine);
    const next = all.findIndex((i) => !rec[i.id]);
    setIdx(next === -1 ? 0 : next);
    setScore(examProgress(all.map((i) => i.id)));
  }, [all]);

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
    setAnswered((a) => ({ ...a, [item.id]: { given: choice, correct } }));
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
      {/* 출제 순서 — 칩 한 줄. 랜덤을 다시 누르면 다시 섞인다 */}
      <ChipRow scroll>
        {ORDERS.map((o) => (
          <ModeChip
            key={o.key}
            on={order === o.key}
            disabled={Boolean(o.needsDifficulty) && !hasDifficulty}
            onClick={() => changeOrder(o.key)}
          >
            {o.key === "random" && order === "random" ? "랜덤 · 다시 섞기" : o.label}
          </ModeChip>
        ))}
      </ChipRow>

      <ItemPicker
        items={items}
        answered={answered}
        current={idx!}
        open={pickerOpen}
        onToggle={() => setPickerOpen((o) => !o)}
        onPick={jumpTo}
      />

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

/**
 * 문항 고르기 — 접이식 그리드. 칸은 지금 순서의 자리 번호이고, 색과 글자(✓·✕)가
 * 풀이 결과를 말한다 (D4). 누르면 그 문항으로 간다.
 */
function ItemPicker({
  items,
  answered,
  current,
  open,
  onToggle,
  onPick,
}: {
  items: UnitItem[];
  answered: Answered;
  current: number;
  open: boolean;
  onToggle: () => void;
  onPick: (i: number) => void;
}) {
  const ok = items.filter((i) => answered[i.id]?.correct).length;
  const bad = items.filter((i) => answered[i.id] && !answered[i.id].correct).length;
  const rest = items.length - ok - bad;
  return (
    <div className="mb-3 overflow-hidden rounded-[20px] bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-[13px] font-bold">문항 고르기</span>
        <span className="flex items-center gap-2 text-[12px] text-ink-sub">
          <span className="text-success">✓ {ok}</span>
          <span className="text-danger">✕ {bad}</span>
          <span>안 품 {rest}</span>
          <span aria-hidden className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-6 gap-1.5 px-4 pb-4 pt-1">
          {items.map((it, i) => {
            const a = answered[it.id];
            const look = a
              ? a.correct
                ? "bg-success-bg text-success"
                : "bg-danger-bg text-danger"
              : "bg-bg-subtle text-ink-sub";
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === current ? "true" : undefined}
                aria-label={`${i + 1}번째 문항${a ? (a.correct ? " · 정답" : " · 오답") : ""}${it.difficulty ? ` · 난이도 ${it.difficulty}` : ""}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-[10px] text-[12px] font-bold tabular-nums ${look} ${
                  i === current ? "ring-2 ring-primary-500" : ""
                }`}
              >
                {i + 1}
                {a && <span className="text-[9px] leading-none">{a.correct ? "✓" : "✕"}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
