import Link from "next/link";
import { Art } from "@/components/Art";
import { canViewMedia } from "@/lib/access";
import type { ReactNode } from "react";

/** 공통 소형 컴포넌트 — 연회색 바탕 + 보더 없는 흰 라운드 카드 + 파스텔 알약 칩 */

export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-32 pt-5 md:px-8">
      {children}
    </main>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-5 text-[22px] font-bold">{children}</h1>;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[24px] bg-surface p-5 shadow-[0_2px_14px_rgba(23,58,94,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2.5 mt-7 text-[16px] font-bold">{children}</h2>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "info" | "warning";
}) {
  const tones = {
    neutral: "bg-bg-subtle text-ink-sub",
    primary: "bg-primary-50 text-primary-600",
    info: "bg-info-bg text-info",
    warning: "bg-warning-bg text-warning",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** 화면 하단 고정 CTA — 둥근 알약형, 화면당 하나 */
export function BottomCta({
  href,
  onClick,
  children,
  disabled,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const cls =
    "flex h-14 w-full items-center justify-center rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta active:bg-primary-600 disabled:opacity-40";
  return (
    <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-bg via-bg/90 to-transparent px-5 pb-3 pt-6">
      <div className="mx-auto max-w-xl">
        {href ? (
          <Link href={href} className={cls}>
            {children}
          </Link>
        ) : (
          <button onClick={onClick} disabled={disabled} className={cls}>
            {children}
          </button>
        )}
      </div>
    </div>
  );
}

/** 숙련도 도트 */
export function LevelDots({ level }: { level: number }) {
  return (
    <span className="flex gap-1" aria-label={`숙련도 ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i <= level ? "bg-primary-500" : "bg-bg-subtle"
          }`}
        />
      ))}
    </span>
  );
}

/** restricted 자산 잠금 자리 — 카드가 아니라 자산만 잠금 */
export function LockedMedia({ caption }: { caption?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[24px] bg-surface px-4 py-9 text-center shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
      <Art name="locked" />
      <p className="text-[14px] text-ink-sub">
        로그인하면 교과서 그림을 볼 수 있어요
      </p>
      {caption && <p className="text-xs text-ink-faint">{caption}</p>}
      <button className="mt-1 rounded-full bg-primary-50 px-4 py-2 text-[13px] font-bold text-primary-600">
        초대 코드로 가입하기
      </button>
    </div>
  );
}

/**
 * 개념 카드의 그림 자리.
 *
 * 접근 판정은 access.ts 한 곳에서만 한다 — 화면마다 조건을 흩어 놓으면
 * 되돌릴 때 반드시 하나를 빠뜨린다.
 */
export function ConceptMedia({
  restricted,
  caption,
  file,
}: {
  restricted: boolean;
  caption?: string;
  file?: string;
}) {
  if (!canViewMedia(restricted)) return <LockedMedia caption={caption} />;

  // 직접 만든 그림(own/)은 투명 배경 SVG 라 가장자리에 붙으면 어색하다.
  // 교과서 크롭은 흰 여백과 출처 띠를 이미 갖고 있어 꽉 채우는 편이 낫다.
  const own = file?.startsWith("own/");

  return (
    <figure className="overflow-hidden rounded-[24px] bg-surface shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
      {file ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/media/${file}`}
          alt={caption ?? ""}
          className={`block w-full object-contain ${own ? "px-4 pt-4" : ""}`}
        />
      ) : (
        <div className="flex items-center justify-center bg-bg-subtle py-14">
          <span className="text-[13px] text-ink-faint">그림 준비 중</span>
        </div>
      )}
      {caption && (
        <figcaption className="px-5 py-3 text-[13px] text-ink-sub">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** 빈 화면 상태 */
export function EmptyState({
  title,
  art = "empty-default",
  action,
}: {
  title: string;
  /** 아트 슬롯 id — src/data/art.json */
  art?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <Art name={art} />
      <p className="max-w-[260px] text-[15px] leading-relaxed text-ink-sub">
        {title}
      </p>
      {action}
    </div>
  );
}
