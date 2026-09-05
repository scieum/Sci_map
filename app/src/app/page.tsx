"use client";

import { useMemo } from "react";
import { Art } from "@/components/Art";
import { BottomCta, Card, Screen } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { todayKey, useProgress } from "@/lib/store";
import { buildDailySet } from "@/data/quiz";

/**
 * 오늘 탭(홈) — 컬러 히어로 카드(티키타카) + 진단 리스트 행(핑글) + 출석 잔디
 */
export default function TodayPage() {
  const progress = useProgress();
  const doneToday = progress.doneDates.includes(todayKey());

  const set = useMemo(
    () => buildDailySet(todayKey(), progress.wrongConceptIds),
    [progress.wrongConceptIds],
  );

  return (
    <Screen>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-[19px] font-extrabold text-ink">
          {BRAND.name}
          {BRAND.provisional && (
            <span className="ml-1 align-middle text-[11px] font-medium text-ink-faint">
              가칭
            </span>
          )}
        </h1>
        <span className="flex items-center gap-1 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-bold text-ink shadow-[0_2px_10px_rgba(23,58,94,0.06)]">
          <Art name="streak-flame" />
          {progress.streak.count}일 연속
        </span>
      </header>

      {/* 히어로 카드 */}
      <section className="relative overflow-hidden rounded-[28px] bg-primary-500 p-6 text-white shadow-[0_10px_24px_rgba(24,159,230,0.35)]">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold">
          <Art name="timer" />
          약 3분 · {set.items.length}문항
        </span>
        <h2 className="text-[24px] font-extrabold leading-snug">
          {doneToday ? (
            <>
              오늘 학습 끝!
              <br />
              내일 또 만나요
            </>
          ) : (
            <>
              오늘도 가볍게,
              <br />
              {set.items.length}문항이면 충분해요
            </>
          )}
        </h2>
        <p className="mt-2 text-[14px] text-white/85">
          복습 {set.reviewCount} + 신규 {set.newCount} 문항으로 골라뒀어요
        </p>
        <span className="pointer-events-none absolute -bottom-3 -right-1" aria-hidden>
          <Art name={doneToday ? "daily-done" : "daily-todo"} />
        </span>
      </section>

      {/* 오늘의 구성 — 리스트 행 */}
      <Card className="mt-4 divide-y divide-line !p-0">
        <Row label="복습이 돌아온 개념" value={`${set.reviewCount}개`} art="review-return" />
        <Row label="처음 만나는 개념" value={`${set.newCount}개`} art="concept-new" />
        <Row
          label="연속 학습"
          value={`${progress.streak.count}일`}
          art="streak-flame"
        />
      </Card>

      {/* 출석 잔디 */}
      <Card className="mt-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-[15px] font-bold">
          <Art name="attendance" />
          출석 체크
        </h3>
        <Grass doneDates={progress.doneDates} />
      </Card>

      <BottomCta href="/today/run">
        {doneToday ? "한 번 더 풀어보기" : "오늘의 학습 시작하기"}
      </BottomCta>
    </Screen>
  );
}

function Row({
  label,
  value,
  art,
}: {
  label: string;
  value: string;
  art: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="flex items-center gap-2.5 text-[15px] text-ink">
        <Art name={art} />
        {label}
      </span>
      <span className="text-[15px] font-bold text-primary-600">{value}</span>
    </div>
  );
}

function Grass({ doneDates }: { doneDates: string[] }) {
  const cells = useMemo(() => {
    const out: { key: string; done: boolean }[] = [];
    const d = new Date();
    d.setDate(d.getDate() - 83);
    for (let i = 0; i < 84; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ key, done: doneDates.includes(key) });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [doneDates]);

  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" aria-label="최근 12주 출석 기록">
      {cells.map((c) => (
        <span
          key={c.key}
          title={c.key}
          className={`h-3 w-3 rounded-[4px] ${c.done ? "bg-primary-500" : "bg-bg-subtle"}`}
        />
      ))}
    </div>
  );
}
