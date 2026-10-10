"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Art } from "@/components/Art";
import { BottomCta, Screen } from "@/components/ui";
import { conceptById } from "@/data/concepts";
import { BRAND } from "@/lib/brand";
import { kindsDoneToday, todayKey, useProgress } from "@/lib/store";
import { buildDailyOverview, KIND_DESC, KIND_LABEL } from "@/data/quiz";
import { todayPlan } from "@/lib/scheduler";
import type { Concept, QuizKind } from "@/lib/types";

/**
 * 오늘 탭(홈) — 히어로(날짜·스트릭·오늘 진행·이번 주 줄) + 유형 바로 고르기.
 *
 * 2026-10-08 홈 시안 C(유형 바로 고르기, CTA 하나)의 구조를 그대로 두고,
 * 2026-10-10 시안 v2 홈 C 로 겉모습만 바꿨다: 이번 주 줄과 날짜 줄이 브랜드
 * 블루 히어로 한 장으로 합쳐졌고, 유형 카드 셋은 세로 쌓기에서 가로 3칸이 됐다.
 * 아래 설명은 그 구조의 근거다.
 *
 * 예전 홈은 히어로 → [오늘의 학습 시작하기] → /today 에서 유형 고르기 → 풀이로
 * 두 번을 눌러야 했다. 학생이 홈에서 실제로 정하는 것은 "어느 유형을 풀까"
 * 하나뿐이라, 그 선택을 홈으로 올렸다. 유형 카드 셋은 선택지이고 실행은 아래
 * BottomCta 하나다 — D2 는 "행동 하나"이지 "버튼 하나"가 아니다 (/today 와 같은 판단).
 *
 * 출석 잔디(12주)와 "오늘의 구성" 타일은 이번 주 7칸 줄과 유형 카드로 갈음했다.
 * 복습·신규 수는 카드마다 "복습 n"으로 남는다. /today 는 예전 링크가 닿을 수
 * 있어 그대로 둔다.
 */
export default function TodayPage() {
  const progress = useProgress();

  // progress 가 마운트 뒤 localStorage 값으로 바뀌면 그때 다시 계산한다
  const today = useMemo(
    () => buildDailyOverview(todayKey(), todayPlan()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress],
  );
  const done = kindsDoneToday(progress);

  // 고른 유형 — 고르기 전에는 "아직 안 끝낸 유형 중 첫째"를 미리 짚어 둔다.
  // 셋 다 끝냈으면 첫째로 돌아가 "한 번 더"를 권한다
  const [picked, setPicked] = useState<QuizKind | null>(null);
  const playable = today.sets.filter((s) => s.items.length > 0);
  const fallback =
    playable.find((s) => !done.includes(s.kind))?.kind ?? playable[0]?.kind ?? null;
  const current = picked ?? fallback;
  const allDone = playable.length > 0 && playable.every((s) => done.includes(s.kind));
  const doneCount = playable.filter((s) => done.includes(s.kind)).length;
  const reviewTotal = playable.reduce((n, s) => n + s.reviewCount, 0);

  // 북마크 줄 — 홈에서 "다시 볼 것"으로 바로 이어지는 입구 (시안 v2 홈 C)
  const marks = progress.bookmarks.map(conceptById).filter((c): c is Concept => Boolean(c));

  return (
    <Screen>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-[19px] font-extrabold text-ink">
          {/* 심벌이 이름 자리를 대신한다. 그림이 이름이므로 alt 에 이름을 남긴다 —
              스크린 리더와 이미지가 막힌 환경에서 앱 이름이 사라지면 안 된다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mark.png"
            alt={BRAND.name}
            width={53}
            height={30}
            className="h-[30px] w-auto object-contain"
          />
          {BRAND.provisional && (
            <span className="align-middle text-[11px] font-medium text-ink-faint">
              가칭
            </span>
          )}
        </h1>
      </header>

      {/* 히어로 — 날짜·스트릭·오늘 진행·이번 주 줄을 한 장에 (시안 v2 홈 C, 2026-10-10).
          세모 홈의 현황 카드와 플랭의 연속 칩을 합친 자리다. 유형 카드 셋이 가로
          3칸으로 줄면서 화면이 짧아졌고, 그 여유를 여기에 썼다 */}
      <Hero
        doneCount={doneCount}
        total={playable.length}
        reviewTotal={reviewTotal}
        streak={progress.streak.count}
        doneDates={progress.doneDates}
      />

      <p className="mb-2.5 mt-5 text-[14px] font-bold text-ink">
        {allDone ? "오늘 세 유형을 다 풀었어요. 한 번 더 풀어도 좋아요." : "어떤 유형으로 풀까요?"}
      </p>

      <div role="radiogroup" aria-label="오늘 풀 유형" className="grid grid-cols-3 gap-2.5">
        {today.sets.map((s) => (
          <KindCard
            key={s.kind}
            kind={s.kind}
            count={s.items.length}
            reviewCount={s.reviewCount}
            done={done.includes(s.kind)}
            selected={current === s.kind}
            onPick={() => setPicked(s.kind)}
          />
        ))}
      </div>

      {marks.length > 0 && (
        <Link
          href="/concepts"
          className="mt-3 flex items-center gap-3 rounded-[20px] bg-surface px-4 py-3.5 shadow-card active:bg-bg-subtle"
        >
          <span className="text-[15px] text-primary-500" aria-hidden>★</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold">북마크 {marks.length}장</span>
            <span className="block truncate text-[12px] text-ink-faint">
              {marks.slice(0, 4).map((c) => c.term).join(" · ")}
            </span>
          </span>
          <span className="text-ink-faint" aria-hidden>›</span>
        </Link>
      )}

      {/* 바닥 로고 줄 — 왼쪽 끝·오른쪽 끝. 이 앱이 어느 교재를 따라가는지
          밝히는 자리다. BottomCta 는 화면에 고정돼 있으므로 그 높이만큼
          띄워 두지 않으면 마지막 줄이 버튼 뒤로 숨는다 */}
      <div className="mt-8 mb-24 flex items-center justify-between px-1 opacity-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/selpa.png" alt="천재 셀파" width={89} height={20}
             className="h-5 w-auto object-contain" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/chunjae.png" alt="천재교육" width={159} height={20}
             className="h-5 w-auto object-contain" />
      </div>

      {current ? (
        <BottomCta href={`/today/run?kind=${current}`}>
          {done.includes(current) ? `${KIND_LABEL[current]} 한 번 더 풀기` : `${KIND_LABEL[current]} 시작하기`}
        </BottomCta>
      ) : (
        <BottomCta disabled>아직 오늘의 문항이 없어요</BottomCta>
      )}
    </Screen>
  );
}

/**
 * 히어로 카드 — 브랜드 블루 그러데이션 위에 흰 글자.
 *
 * 들어가는 것은 넷뿐이다: 날짜(와 자정까지 남은 시간) · 연속 일수 · 오늘 몇 유형을
 * 끝냈나 · 이번 주 출석 줄. 숫자가 더 붙으면 "오늘 할 일" 이 아니라 리포트가 된다.
 * 마운트 전에는 날짜 자리를 비워 두어 높이가 출렁이지 않게 한다.
 */
function Hero({
  doneCount,
  total,
  reviewTotal,
  streak,
  doneDates,
}: {
  doneCount: number;
  total: number;
  reviewTotal: number;
  streak: number;
  doneDates: string[];
}) {
  const now = useNow();
  let date = String.fromCharCode(160);
  let left = "";
  if (now) {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const mins = Math.max(0, Math.round((+midnight - +now) / 60_000));
    left = mins >= 60 ? `${Math.floor(mins / 60)}시간` : `${mins}분`;
    date = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`;
  }
  const headline =
    total === 0
      ? "아직 오늘의 문항이 없어요"
      : doneCount === 0
        ? "오늘 학습을 시작해 볼까요?"
        : doneCount >= total
          ? "오늘 할 일을 다 끝냈어요"
          : `오늘 ${doneCount}/${total} 끝냈어요`;
  const detail = [left && `자정까지 ${left}`, reviewTotal > 0 && `복습 ${reviewTotal}개 들어 있어요`]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-[28px] bg-gradient-to-br from-primary-700 to-primary-500 px-5 pb-4 pt-5 text-white shadow-hero">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white/80">{date}</span>
        <span className="flex items-center gap-1 rounded-full bg-white/18 px-3 py-1 text-[12px] font-bold">
          <Art name="streak-flame" px={14} />
          {streak}일 연속
        </span>
      </div>
      <h2 className="mt-2 text-[22px] font-extrabold leading-tight">{headline}</h2>
      {detail && <p className="mt-1 text-[13px] text-white/75">{detail}</p>}
      <WeekStrip doneDates={doneDates} now={now} />
    </section>
  );
}

/** 유형 머리글자 — 카드 왼쪽 네모 안에 들어간다. 선택형은 "4지"로 모양을 말한다 */
const KIND_BADGE: Record<QuizKind, string> = { ox: "OX", short: "단답", mcq: "4지" };

/**
 * 유형 카드 — 라디오 하나.
 *
 * 상태는 색만으로 말하지 않는다 (D4): 고름 = 테두리 + 속이 찬 동그라미,
 * 끝냄 = ✓ 완료 칩. 끝낸 유형도 고를 수 있다 — 같은 날 다시 푸는 길을 막지 않는다.
 */
function KindCard({
  kind,
  count,
  reviewCount,
  done,
  selected,
  onPick,
}: {
  kind: QuizKind;
  count: number;
  reviewCount: number;
  done: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={empty}
      onClick={onPick}
      className={`flex min-h-[118px] flex-col items-center justify-start gap-1.5 rounded-[20px] bg-surface px-2 pb-3 pt-3.5 text-center shadow-card transition-shadow disabled:opacity-50 ${
        selected ? "ring-2 ring-primary-500" : ""
      }`}
    >
      <span
        aria-hidden
        className={`flex h-10 w-10 items-center justify-center rounded-[12px] text-[13px] font-extrabold ${
          done ? "bg-success-bg text-success" : "bg-primary-50 text-primary-700"
        }`}
      >
        {KIND_BADGE[kind]}
      </span>
      <span className="block text-[15px] font-bold text-ink">{KIND_LABEL[kind]}</span>
      <span className="block text-[11px] leading-snug text-ink-sub">
        {done ? (
          <span className="font-bold text-success">✓ 완료</span>
        ) : empty ? (
          "문항 없음"
        ) : (
          <>
            {count}문항
            {reviewCount > 0 && <><br />복습 {reviewCount}</>}
          </>
        )}
      </span>
      <span className="sr-only">{KIND_DESC[kind]}</span>
    </button>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function subscribeMinute(onChange: () => void) {
  // 자정을 넘기며 화면을 켜 둔 경우를 위해 1분마다 다시 읽는다
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}
/** 분 단위로 자른 시각 — 스냅숏이 같은 분 안에서는 같은 값이어야 한다 */
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** 서버 렌더와 기기 시각이 다르므로 시각은 마운트 뒤에만 쓴다 (hydration) */
function useNow(): Date | null {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, () => null);
  return minute == null ? null : new Date(minute * 60_000);
}

const dateKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * 이번 주 줄 — 일요일부터 토요일까지 7칸 (하이링구얼 달력의 한 줄 판).
 *
 * 히어로 안에 들어가므로 흰 칸으로 그린다: 끝낸 날 = 흰 채움 + ✓, 오늘 = 흰 테두리,
 * 나머지는 반투명. 마운트 전에는 칸만 그려 두어 높이가 출렁이지 않게 한다.
 */
function WeekStrip({ doneDates, now }: { doneDates: string[]; now: Date | null }) {
  const days = useMemo(() => {
    if (!now) return null;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKeyOf(d);
      return { key, date: d.getDate(), done: doneDates.includes(key), isToday: key === dateKeyOf(now), future: d > now };
    });
  }, [now, doneDates]);
  const doneCount = days?.filter((d) => d.done).length ?? 0;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-white/75">
        <span>이번 주</span>
        <span>{days ? `${doneCount}일 출석` : ""}</span>
      </div>
      <ol className="flex justify-between" aria-label="이번 주 출석">
        {WEEKDAY.map((w, i) => {
          const d = days?.[i];
          return (
            <li key={w} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-white/60">{w}</span>
              <span
                aria-label={d ? `${d.date}일 ${d.done ? "출석" : d.future ? "" : "미출석"}`.trim() : undefined}
                className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-bold ${
                  d?.done ? "bg-white text-primary-700" : "bg-white/15 text-white/80"
                } ${d?.isToday ? "ring-2 ring-white" : ""} ${d && d.future ? "text-white/45" : ""}`}
              >
                {d ? (d.done ? <CheckIcon /> : d.date) : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
