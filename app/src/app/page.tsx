"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Art } from "@/components/Art";
import { BottomCta, Card, Screen } from "@/components/ui";
import { BRAND, TILE } from "@/lib/brand";
import { todayKey, useProgress } from "@/lib/store";
import { buildDailyOverview } from "@/data/quiz";
import { todayPlan } from "@/lib/scheduler";

/**
 * 오늘 탭(홈) — 컬러 히어로 카드(티키타카) + 진단 리스트 행(핑글) + 출석 잔디
 */
export default function TodayPage() {
  const progress = useProgress();
  const doneToday = progress.doneDates.includes(todayKey());

  // 세 유형의 오늘 세트 — 히어로와 타일은 개념 수로 말한다 (문항 수는 유형마다 다르다)
  // progress 가 마운트 뒤 localStorage 값으로 바뀌면 그때 다시 계산한다
  const today = useMemo(
    () => buildDailyOverview(todayKey(), todayPlan()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress],
  );
  const perKind = today.sets[0]?.items.length ?? 0;

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
        <span className="flex items-center gap-1 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-bold text-ink shadow-[0_2px_10px_rgba(23,58,94,0.06)]">
          <Art name="streak-flame" />
          {progress.streak.count}일 연속
        </span>
      </header>

      {/* 히어로 카드 — 날짜 줄 · 제목 · 구성 알약. 시작 단추는 넣지 않는다:
          이 화면의 CTA 는 아래 BottomCta 하나다 (D2) */}
      <section className="relative overflow-hidden rounded-[28px] bg-primary-500 p-6 text-white shadow-hero">
        <DayLine />
        <h2 className="mt-2 text-[24px] font-extrabold leading-snug">
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
        {/* 오늘 세트의 구성 — 아래 타일과 같은 값이지만 히어로만 보고 들어가는
            학생에게도 "얼마나" 를 먼저 말한다. 분량은 유형당 어림값만 안다 */}
        <ul className="relative z-10 mt-4 flex flex-wrap gap-2 text-[13px] font-bold">
          <li className="rounded-full bg-white/20 px-3.5 py-1.5">
            복습 {today.reviewConceptCount}
          </li>
          <li className="rounded-full bg-white/20 px-3.5 py-1.5">
            신규 {today.newConceptCount}
          </li>
          <li className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3.5 py-1.5">
            <Art name="timer" px={14} />
            유형당 약 3분
          </li>
        </ul>
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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
            <Art name="attendance" />
            출석 체크
          </h3>
          <span className="text-[12px] text-ink-faint">최근 12주</span>
        </div>
        <Grass doneDates={progress.doneDates} />
      </Card>

      {/* 바닥 로고 줄 — 왼쪽 끝·오른쪽 끝. 이 앱이 어느 교재를 따라가는지
          밝히는 자리다. BottomCta 는 화면에 고정돼 있으므로 그 높이만큼
          띄워 두지 않으면 마지막 줄이 버튼 뒤로 숨는다 */}
      <div className="mt-6 mb-24 flex items-center justify-between px-1 opacity-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/selpa.png" alt="천재 셀파" width={89} height={20}
             className="h-5 w-auto object-contain" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/chunjae.png" alt="천재교육" width={159} height={20}
             className="h-5 w-auto object-contain" />
      </div>

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

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function subscribeMinute(onChange: () => void) {
  // 자정을 넘기며 화면을 켜 둔 경우를 위해 1분마다 다시 읽는다
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}
/** 분 단위로 자른 시각 — 스냅숏이 같은 분 안에서는 같은 값이어야 한다 */
const minuteNow = () => Math.floor(Date.now() / 60_000);

/**
 * 히어로 첫 줄 — "10월 7일 화요일 · 자정까지 6시간".
 *
 * 서버 렌더 시각과 기기 시각이 다르므로 마운트 뒤에만 그린다. 그 전에는 같은
 * 높이의 빈 줄을 두어 히어로가 한 번 출렁이지 않게 한다 (hydration 불일치 방지).
 */
function DayLine() {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, () => null);
  const now = minute == null ? null : new Date(minute * 60_000);

  let text = String.fromCharCode(160); // NBSP — 마운트 전 자리 지킴 — 빈 줄 높이
  if (now) {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const mins = Math.max(0, Math.round((+midnight - +now) / 60_000));
    const left = mins >= 60 ? `${Math.floor(mins / 60)}시간` : `${mins}분`;
    text = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일 · 자정까지 ${left}`;
  }
  return <p className="text-[13px] font-semibold text-white/85">{text}</p>;
}

/**
 * 출석 잔디 — 이분값(한 날 / 안 한 날).
 * 시안은 5단계 농도지만 store 가 날짜별 문항 수를 남기지 않는다(doneDates 뿐).
 * 날짜별 횟수가 생기면 bg-subtle → primary-100/300/500/700 로 나눈다.
 */
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
