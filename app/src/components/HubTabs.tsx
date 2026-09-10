"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 지도 탭 안의 갈래 — 지도 · 야구 · 스터디룸 (교사 결정 2026-09-11).
 *
 * 지도 탭을 **부가 기능이 모이는 자리**로 쓰기로 했다. 하단 탭 바는 5칸이
 * 다 찼고(개념·지도·홈·문제·내 정보), 칸을 늘리면 터치 타깃이 44px 아래로
 * 내려간다. 늘릴 수 없다면 어느 한 칸이 안을 나눠 가져야 한다.
 *
 * 왜 지도인가. 셋 다 **개념 전체를 가로지르는 화면**이라는 성질이 같다.
 * 개념 탭은 한 단원을 파고들고 홈은 오늘 할 일을 보여 주지만, 지도·야구·
 * 스터디룸은 어느 것도 특정 단원에 매이지 않는다.
 *
 * 세그먼트지 하위 탭 바가 아니다 — 셋은 각자 **진짜 라우트**를 갖는다.
 * 상태로 갈아 끼우면 뒤로 가기가 지도 탭 밖으로 튕겨 나가고, 친구에게
 * 스터디룸 주소를 보낼 수도 없다.
 */

const LINKS = [
  { href: "/map", label: "지도", exact: true },
  { href: "/map/arcade", label: "야구", exact: false },
  { href: "/map/rooms", label: "스터디룸", exact: false },
] as const;

export default function HubTabs() {
  const pathname = usePathname();

  return (
    <div className="px-5 pb-3 pt-4 md:px-8">
      <div className="mx-auto flex max-w-xl gap-1 rounded-full bg-bg-subtle p-1">
        {LINKS.map(({ href, label, exact }) => {
          const on = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex h-10 flex-1 items-center justify-center rounded-full text-[14px] font-bold transition-colors ${
                on
                  ? "bg-surface text-ink shadow-[0_2px_8px_rgba(23,58,94,0.08)]"
                  : "text-ink-faint"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
