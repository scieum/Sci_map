"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/concepts", label: "개념", icon: IconCards },
  { href: "/map", label: "지도", icon: IconGraph },
  { href: "/", label: "오늘", icon: IconBolt },
  { href: "/items", label: "문제", icon: IconPaper },
  // 노선(SciMetro)은 한참 뒤라 그 자리에 내 정보를 둔다 (교사 결정 2026-09-06,
  // Design.md §4.6). /lines 라우트는 남겨 두되 탭에서만 뺐다.
  { href: "/me", label: "내 정보", icon: IconUser },
] as const;

export default function TabBar() {
  const pathname = usePathname();
  // 퀴즈·인출 모드 중에는 탭 바 숨김 (집중 모드 — Design.md §4.4, §5.2)
  if (pathname.startsWith("/today/run") || pathname.endsWith("/recall"))
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
function IconGraph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="10" cy="18" r="2.5" />
      <path d="M8 7.2 15.6 8M7.2 8.2l2 7.2M16.2 10.1l-4.7 6" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" />
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
