"use client";

import Link from "next/link";
import { EmptyState, Screen, ScreenTitle } from "@/components/ui";
import { subjectSummaries } from "@/lib/exam";
import { accentOfSubject } from "@/lib/brand";
import { orderSubjectNames, subjectByCode, courseTypeLabel } from "@/data/catalog";

/**
 * 문제 탭 첫 화면 — **과목 고르기**.
 *
 * 단원을 곧바로 늘어놓지 않는다. 단원 이름은 과목마다 겹치고("에너지"는 어느
 * 과목에나 있다), 과목이 둘만 돼도 지금 보는 단원이 어느 과목 것인지 알 수
 * 없는 목록이 된다. 내 정보의 수강 과목 화면과 같은 모양으로 과목을 먼저
 * 고르게 해서, 그 뒤 화면은 한 과목 안에서만 움직이게 한다.
 *
 * 과목 구분(공통·일반 선택·진로 선택)으로 묶는 것도 저 화면과 같다 — 학생이
 * 시간표를 짤 때 쓰는 말이 그것이다.
 */
export default function ItemsPage() {
  const subjects = subjectSummaries();

  if (subjects.length === 0) {
    return (
      <Screen>
        <ScreenTitle>문제</ScreenTitle>
        <EmptyState
          art="empty-items"
          title="아직 들어온 문항이 없어요. 평가지가 준비되면 여기서 과목별로 풀 수 있어요."
          action={
            <Link
              href="/"
              className="rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
            >
              오늘의 학습으로
            </Link>
          }
        />
      </Screen>
    );
  }

  // 구분별로 묶는다. 카탈로그에 없는 과목은 '그 밖'으로 내려간다
  const byType = new Map<string, typeof subjects>();
  for (const name of orderSubjectNames(subjects.map((s) => s.name))) {
    const s = subjects.find((x) => x.name === name)!;
    const type = subjectByCode(s.code)?.courseType ?? null;
    const key = courseTypeLabel(type);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(s);
  }

  return (
    <Screen>
      <ScreenTitle>문제</ScreenTitle>
      <p className="-mt-3 mb-5 text-[13px] leading-relaxed text-ink-sub">
        과목을 고르면 단원별 평가지가 열려요. 문항은 로그인한 학생에게만 보여요.
      </p>

      {Array.from(byType.entries()).map(([type, list]) => (
        <div key={type} className="mb-4">
          <p className="mb-2 px-1 text-[12px] font-bold text-ink-faint">{type}</p>
          <div className="flex flex-col gap-2">
            {list.map((s) => {
              const accent = accentOfSubject(s.name);
              return (
                <Link
                  key={s.code}
                  href={`/items/${s.code}`}
                  className={`flex items-center justify-between gap-3 rounded-[20px] px-5 py-4 ring-2 ring-inset ring-current ${accent.tint} ${accent.text} active:opacity-80`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold text-ink">
                      {s.name}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-sub">
                      문항 {s.items}개 · 평가지 {s.papers}개 · 단원 {s.units}개
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${accent.solid}`}
                  >
                    ›
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <p className="mt-6 px-1 text-[12px] leading-relaxed text-ink-faint">
        문항 출처: 교과서 발행사 평가자료. 저작권법 제25조 제3항 수업 목적 이용이며,
        로그인한 학생에게만 보여요.
      </p>
    </Screen>
  );
}
