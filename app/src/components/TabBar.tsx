"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/concepts", label: "개념", icon: IconCards },
  // 라벨은 "탐험" — 이 칸이 지도 하나가 아니라 **지도·야구·스터디룸 셋을 품는
  // 자리**가 됐기 때문이다 (교사 결정 2026-09-11). "지도"로 두면 바깥 이름이
  // 안의 세그먼트 하나와 같은 말이라, 야구를 하다 지도 탭을 누르면 어디로 가는
  // 것인지 알 수 없다.
  //
  // 셋이 공유하는 성질은 "한 단원에 매이지 않고 둘러본다"는 것이다 —
  // 개념 탭이 한 단원을 파고들고 홈이 오늘 할 일을 보여 주는 것과 갈린다.
  // 아이콘도 노드 그래프(=지도)에서 나침반으로 바꿨다. 아이콘이 안의 화면
  // 하나를 그리고 있으면 라벨만 바꿔 봐야 같은 오해가 남는다.
  // 라우트(/map)와 §7.5 의 5탭 계약은 그대로다.
  { href: "/map", label: "탐험", icon: IconCompass },
  // 라벨은 "홈" — 이 자리가 앱을 열면 닿는 곳이다 (교사 결정 2026-09-07).
  // 화면 자체는 여전히 데일리 인출이다 (Design.md §4.4).
  { href: "/", label: "홈", icon: IconHome },
  { href: "/items", label: "문제", icon: IconPaper },
  // 노선(SciMetro)은 한참 뒤라 그 자리에 내 정보를 둔다 (교사 결정 2026-09-06,
  // Design.md §4.6). /lines 라우트는 남겨 두되 탭에서만 뺐다.
  { href: "/me", label: "내 정보", icon: IconUser },
] as const;

export default function TabBar() {
  const pathname = usePathname();
  // 퀴즈·인출 모드 중에는 탭 바 숨김 (집중 모드 — Design.md §4.4, §5.2).
  // 개념 야구의 경기 화면도 같다 — 한 타석이 8~24초라 탭을 잘못 눌러 나가면
  // 그 판이 통째로 날아간다
  if (
    pathname.startsWith("/today/run") ||
    pathname.startsWith("/map/arcade/play") ||
    pathname.endsWith("/recall")
  )
    return null;

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(23,58,94,0.06)]"
    >
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                active ? "text-primary-500 font-semibold" : "text-ink-faint"
              }`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function IconCards() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="6" width="13" height="15" rx="2" />
      <path d="M9 3h9a2 2 0 0 1 2 2v12" />
    </svg>
  );
}
/** 탐험 — 나침반. 지도·야구·스터디룸 어느 하나로 읽히지 않는 그림이라야 한다 */
function IconCompass() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7z" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10.5 12 3.5l8 7" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  );
}
function IconPaper() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2h9l4 4v16H6z" />
      <path d="M9 11h7M9 15h7" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconMetro() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 16 10 8h4l6 8" />
      <circle cx="4" cy="16" r="2" />
      <circle cx="20" cy="16" r="2" />
      <circle cx="12" cy="8" r="2" />
    </svg>
  );
}
