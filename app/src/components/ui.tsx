import Link from "next/link";
import { Art } from "@/components/Art";
import { canViewMedia } from "@/lib/access";
import { useViewer } from "@/lib/viewer";
import type { ReactNode } from "react";
import type { ConceptAsset } from "@/lib/types";

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
      className={`rounded-[24px] bg-surface p-5 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * 구간 제목 — 왼쪽 4px 막대 + 굵은 제목 (Figma 시안 v1).
 * 카드 화면처럼 섹션이 여럿 이어질 때 어디서 끊기는지 막대가 먼저 알려 준다.
 * `tone` 은 막대 색만 바꾼다 — 함정 섹션은 warning 이다.
 */
export function SectionLabel({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "warning";
}) {
  return (
    <h2 className="mb-2.5 mt-7 flex items-center gap-2 text-[16px] font-bold">
      <span
        aria-hidden
        className={`h-4 w-1 rounded-full ${tone === "warning" ? "bg-warning" : "bg-primary-500"}`}
      />
      {children}
    </h2>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "info" | "warning" | "outline" | "success" | "danger";
}) {
  // success·danger 는 색만으로 말하지 않는다 (D4) — 부르는 쪽이 ✓·✕ 를 함께 넣는다
  const tones = {
    neutral: "bg-bg-subtle text-ink-sub",
    primary: "bg-primary-50 text-primary-600",
    info: "bg-info-bg text-info",
    warning: "bg-warning-bg text-warning",
    outline: "bg-surface text-ink-sub ring-1 ring-inset ring-line",
    success: "bg-success-bg text-success",
    danger: "bg-danger-bg text-danger",
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

/** 가로 진행 막대 — 단원 진도·방 목표·타석 시간이 같은 모양을 쓴다 */
export function ProgressBar({
  value,
  tone = "primary",
  size = "md",
  label,
}: {
  /** 0~1 */
  value: number;
  tone?: "primary" | "soft" | "violet" | "azure" | "rose";
  size?: "sm" | "md";
  /** 스크린 리더용 이름 */
  label?: string;
}) {
  const fills = {
    primary: "bg-primary-500",
    soft: "bg-primary-300",
    violet: "bg-violet-500",
    azure: "bg-azure-500",
    rose: "bg-rose-500",
  } as const;
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`w-full overflow-hidden rounded-full bg-bg-subtle ${size === "sm" ? "h-1.5" : "h-2"}`}
    >
      <div className={`h-full rounded-full ${fills[tone]} transition-[width]`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * 세그먼트 진행 — 문항 수만큼 칸을 나눈다 (EF hello 패턴, 시안 ②).
 * 칸이 너무 많으면 칸이 실선처럼 붙어 버리므로 20칸을 넘으면 막대 하나로 그린다.
 */
export function SegmentedProgress({ current, total }: { current: number; total: number }) {
  if (total > 20) return <ProgressBar value={total ? current / total : 0} size="sm" label={`${current}/${total}`} />;
  return (
    <div className="flex w-full gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} aria-label={`${current}/${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < current ? "bg-primary-500" : "bg-line"}`} />
      ))}
    </div>
  );
}

/** 숫자 셋을 나란히 — 경기 점수판·내 정보 기록에 쓴다 (시안 ⑧ ⑪) */
export function StatRow({ items }: { items: { value: ReactNode; label: string }[] }) {
  return (
    <Card className="flex py-4">
      {items.map((it) => (
        <div key={it.label} className="flex flex-1 flex-col items-center gap-0.5">
          <span className="text-[22px] font-extrabold leading-tight text-primary-700">{it.value}</span>
          <span className="text-[12px] text-ink-faint">{it.label}</span>
        </div>
      ))}
    </Card>
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

/**
 * restricted 자산 잠금 자리 — 카드가 아니라 자산만 잠근다 (§0.4, D5).
 *
 * 안내 문구와 버튼이 실제로 갈 곳을 가리켜야 한다. 예전에는 onClick 도 href 도
 * 없는 버튼이라 눌러도 아무 일이 없었다.
 */
export function LockedMedia({ caption }: { caption?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[24px] bg-surface px-4 py-9 text-center shadow-card">
      <Art name="locked" />
      <p className="text-[14px] text-ink-sub">
        로그인하면 교과서 그림을 볼 수 있어요
      </p>
      {caption && <p className="text-xs text-ink-faint">{caption}</p>}
      <Link
        href="/me"
        className="mt-1 rounded-full bg-primary-50 px-4 py-2 text-[13px] font-bold text-primary-600"
      >
        로그인하러 가기
      </Link>
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
  const viewer = useViewer();
  if (!canViewMedia(restricted, viewer)) return <LockedMedia caption={caption} />;

  // 직접 만든 그림(own/)은 투명 배경 SVG 라 가장자리에 붙으면 어색하다.
  // 교과서 크롭은 흰 여백과 출처 띠를 이미 갖고 있어 꽉 채우는 편이 낫다.
  const own = file?.startsWith("own/");

  return (
    <figure className="overflow-hidden rounded-[24px] bg-surface shadow-card">
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

/** 자산 종류 꼬리표 — 그림만 있는 카드가 아니게 되면서 필요해졌다 */
const KIND_LABEL: Record<string, string> = {
  graph: "그래프",
  table: "표",
  formula: "식",
  photo: "사진",
  note: "곁주",
};

/**
 * 카드의 그림 자리 — 자산 여러 장을 세로로 쌓는다.
 *
 * 잠금은 **자산 단위**다 (§0.4). 한 장이 restricted 라고 나머지까지 가리지 않는다.
 */
export function ConceptMediaList({ assets }: { assets: ConceptAsset[] }) {
  if (assets.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {assets.map((a) => {
        const label = KIND_LABEL[a.kind];
        return (
          <div key={a.file}>
            {label && (
              <span className="mb-1.5 inline-flex rounded-full bg-bg-subtle px-2.5 py-0.5 text-[12px] font-bold text-ink-sub">
                {label}
              </span>
            )}
            <ConceptMedia
              restricted={a.restricted}
              caption={a.caption}
              file={a.file}
            />
          </div>
        );
      })}
    </div>
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

/**
 * 북마크 단추 — "나중에 다시 볼 카드" 표시.
 *
 * 별을 쓴다. 숙련도 도트가 이미 파란 점 세 개라 같은 화면에서 또 점을 쓰면
 * 무엇이 무엇인지 구분되지 않는다. 켜진 상태는 색만이 아니라 **모양**(속이 찬
 * 별)으로도 달라야 한다 — 색만으로 구분하면 못 보는 학생이 생긴다.
 */
export function BookmarkStar({
  on,
  onToggle,
  className = "",
}: {
  on: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "북마크 해제" : "북마크에 담기"}
      className={`flex h-9 w-9 items-center justify-center rounded-full shadow-card transition-colors ${
        on ? "bg-primary-50 text-primary-600" : "bg-surface text-ink-faint"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden
        fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
        strokeLinejoin="round">
        <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" />
      </svg>
    </button>
  );
}
