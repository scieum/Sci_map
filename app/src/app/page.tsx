"use client";

import { useMemo } from "react";
import { Art } from "@/components/Art";
import { BottomCta, Card, Screen } from "@/components/ui";
import { BRAND, TILE } from "@/lib/brand";
import { todayKey, useProgress } from "@/lib/store";
import { buildDailyOverview } from "@/data/quiz";

/**
 * 오늘 탭(홈) — 컬러 히어로 카드(티키타카) + 진단 리스트 행(핑글) + 출석 잔디
 */
export default function TodayPage() {
  const progress = useProgress();
  const doneToday = progress.doneDates.includes(todayKey());

  // 세 유형의 오늘 세트 — 히어로와 타일은 개념 수로 말한다 (문항 수는 유형마다 다르다)
  const today = useMemo(
    () => buildDailyOverview(todayKey(), progress.wrongConceptIds),
    [progress.wrongConceptIds],
  );
  const perKind = today.sets[0]?.items.length ?? 0;

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
      <section className="relative overflow-hidden rounded-[28px] bg-primary-500 p-6 text-white shadow-hero">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold">
          <Art name="timer" />
          유형당 약 3분 · {perKind}문항
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
              한 유형씩 {perKind}문항
            </>
          )}
        </h2>
        <p className="mt-2 text-[14px] text-white/85">
          OX · 단답 · 선택형 — 하나 골라 시작해요
        </p>
        <span className="pointer-events-none absolute -bottom-3 -right-1" aria-hidden>
          <Art name={doneToday ? "daily-done" : "daily-todo"} />
        </span>
      </section>

      {/* 오늘의 구성 — 파스텔 타일 셋. 참고 이미지의 "이용 방법" 줄처럼
          옅은 바탕 + 작은 색 태그 + 숫자. 브랜드색은 태그와 숫자에만 쓴다 (D1) */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Tile tag="복습" label="돌아온 개념" value={`${today.reviewConceptCount}개`} art="review-return" tone={TILE.review} />
        <Tile tag="신규" label="새 개념" value={`${today.newConceptCount}개`} art="concept-new" tone={TILE.fresh} />
        <Tile tag="연속" label="이어온 학습" value={`${progress.streak.count}일`} art="streak-flame" tone={TILE.streak} />
      </div>

      {/* 출석 잔디 */}
      <Card className="mt-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-[15px] font-bold">
          <Art name="attendance" />
          출석 체크
        </h3>
        <Grass doneDates={progress.doneDates} />
      </Card>

      <BottomCta href="/today">
        {doneToday ? "한 번 더 풀어보기" : "오늘의 학습 시작하기"}
      </BottomCta>
    </Screen>
  );
}

function Tile({
  tag,
  label,
  value,
  art,
  tone,
}: {
  tag: string;
  label: string;
  value: string;
  art: string;
  tone: { tint: string; tag: string; value: string };
}) {
  return (
    <div className={`flex min-h-[120px] flex-col justify-between rounded-[20px] px-4 py-3.5 ${tone.tint}`}>
      <span className={`text-[12px] font-bold ${tone.tag}`}>{tag}</span>
      <span className={`mt-2 text-[22px] font-extrabold leading-none ${tone.value}`}>
        {value}
      </span>
      <span className="mt-1.5 flex items-center gap-1 text-[12px] leading-snug text-ink-sub">
        <Art name={art} px={14} />
        {label}
      </span>
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
