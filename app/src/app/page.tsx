"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Art } from "@/components/Art";
import { BottomCta, Card, Chip, Screen } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { kindsDoneToday, todayKey, useProgress } from "@/lib/store";
import { buildDailyOverview, KIND_DESC, KIND_LABEL } from "@/data/quiz";
import { todayPlan } from "@/lib/scheduler";
import type { QuizKind } from "@/lib/types";

/**
 * 오늘 탭(홈) — 이번 주 줄 + 유형 바로 고르기 (홈 시안 C, 2026-10-08 교사 결정).
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

  return (
    <Screen>
      <header className="mb-5 flex items-center justify-between">
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
        <span className="flex items-center gap-1 rounded-full bg-primary-50 px-3.5 py-1.5 text-[13px] font-bold text-primary-700">
          <Art name="streak-flame" />
          {progress.streak.count}일 연속
        </span>
      </header>

      <WeekStrip doneDates={progress.doneDates} />

      <DayLine />

      <p className="mb-3 text-[14px] text-ink-sub">
        {allDone
          ? "오늘 세 유형을 다 풀었어요. 한 번 더 풀어도 좋아요."
          : "오늘은 어떤 유형으로 풀까요? 한 번에 한 유형만 풀어요."}
      </p>

      <div role="radiogroup" aria-label="오늘 풀 유형" className="flex flex-col gap-3">
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
      className={`flex w-full items-center gap-3.5 rounded-[20px] bg-surface px-4 py-4 text-left shadow-card transition-shadow disabled:opacity-50 ${
        selected ? "ring-2 ring-primary-500" : ""
      }`}
    >
      <span
        aria-hidden
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[14px] font-extrabold ${
          done ? "bg-success-bg text-success" : "bg-primary-50 text-primary-700"
        }`}
      >
        {KIND_BADGE[kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold text-ink">{KIND_LABEL[kind]}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-sub">
          {KIND_DESC[kind]}
          {" · "}
          {empty ? "아직 문항이 없어요" : `${count}문항`}
          {!empty && reviewCount > 0 && ` · 복습 ${reviewCount}`}
        </span>
      </span>
      {done && <Chip tone="success">✓ 완료</Chip>}
      <span
        aria-hidden
        className={`h-[22px] w-[22px] shrink-0 rounded-full ${
          selected ? "border-[7px] border-primary-500" : "border-2 border-line"
        }`}
      />
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
 * 끝낸 날 = 연한 인디고 + ✓, 오늘 = 테두리, 지난 빈 날과 앞날은 회색 숫자.
 * 마운트 전에는 칸만 그려 두어 높이가 출렁이지 않게 한다.
 */
function WeekStrip({ doneDates }: { doneDates: string[] }) {
  const now = useNow();
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
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-bold">이번 주</h2>
        <span className="text-[12px] text-ink-sub">{days ? `${doneCount}일 출석` : ""}</span>
      </div>
      <ol className="flex justify-between" aria-label="이번 주 출석">
        {WEEKDAY.map((w, i) => {
          const d = days?.[i];
          return (
            <li key={w} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] font-medium text-ink-faint">{w}</span>
              <span
                aria-label={d ? `${d.date}일 ${d.done ? "출석" : d.future ? "" : "미출석"}`.trim() : undefined}
                className={`flex h-[38px] w-[38px] items-center justify-center rounded-full text-[14px] font-bold ${
                  d?.done ? "bg-primary-100 text-primary-700" : "bg-bg-subtle"
                } ${d?.isToday ? "ring-2 ring-primary-500" : ""} ${
                  d && !d.done ? (d.isToday ? "bg-surface text-primary-700" : d.future ? "text-ink-faint" : "text-ink-sub") : ""
                }`}
              >
                {d ? (d.done ? <CheckIcon /> : d.date) : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
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

/** "10월 8일 수요일 · 자정까지 6시간" — 마운트 전에는 같은 높이의 빈 줄 */
function DayLine() {
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
  return (
    <div className="mb-1 flex items-center justify-between">
      <span className="text-[17px] font-bold">{date}</span>
      {left && (
        <span className="flex items-center gap-1 text-[13px] font-bold text-primary-700">
          <Art name="timer" px={14} />
          자정까지 {left}
        </span>
      )}
    </div>
  );
}
