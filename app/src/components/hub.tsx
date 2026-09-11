"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 탐험 탭(지도 · 야구 · 스터디룸)의 공용 조각 — 참고 이미지(2026-09-11 교사 제공)에서
 * 옮긴 패턴들.
 *
 * ★ 옮긴 것은 **배치와 정보 구조**지 색이 아니다.
 *   참고 이미지의 값(라운드 12px, 남색 채움 칩 등)을 그대로 베끼면 Design.md 의
 *   토큰 체계와 두 벌이 되고, 다음 팔레트 교체 때 이 화면들만 남는다
 *   (CLAUDE.md §14 — 색은 의미 토큰만). 그래서 라운드·그림자·브랜드색은
 *   집 규칙을 그대로 쓰고, 가져온 것은 아래 일곱 가지다.
 *
 *   ① 앱바(작은 제목) 아래 **큰 두 줄 헤드라인** — 화면 이름과 그 화면이 뭘 하자는
 *      말인지를 분리한다. 지금까지는 "지도" 한 마디뿐이라 처음 연 학생이 무엇을
 *      하는 곳인지 알 수 없었다.
 *   ② **필터 칩 행** — 세로로 쌓던 설정을 한 줄로 줄인다. 야구 로비는 설정이
 *      셋(난이도·이닝·범위)이라 카드로 쌓으면 시작 버튼이 화면 두 개 아래로 간다.
 *   ③ **어두운 히어로 카드** — "이어서 하기" 자리. 파랑 히어로가 이미 '내 기록'에
 *      쓰이고 있어, 행동을 부르는 카드는 다른 무게가 필요했다.
 *   ④ **통계 타일 3칸** — 큰 숫자 + 작은 라벨.
 *   ⑤ **섹션 헤더 + 오른쪽 작은 링크**.
 *   ⑥ **정보 테이블**(왼쪽 라벨 / 오른쪽 값) — 규칙을 문단으로 쓰면 아무도 안 읽는다.
 *   ⑦ **번호 단계 목록**.
 *
 * ★ 칩의 선택 색은 브랜드색이 아니라 잉크(먹색)다. 한 화면에 칩이 열 개 넘게
 *   서는데 그걸 전부 인디고로 채우면 브랜드색이 화면의 10%를 넘고(D1), 정작
 *   눌러야 할 CTA 가 칩들 사이에 묻힌다. 채도를 쓰는 자리는 CTA 하나다.
 */

/* ────────────────────────────── 앱바 ────────────────────────────── */

/** 브랜드 마크 — 개념 지도의 노드 그래프를 아주 작게 줄인 것 */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="7" r="2.6" className="fill-primary-500" />
      <circle cx="18" cy="10" r="2.6" className="fill-primary-300" />
      <circle cx="11" cy="18" r="2.6" className="fill-primary-500" />
      <path
        d="M8.2 7.7 15.5 9.4M7.4 9.4l2.6 6.2M16.4 12.2l-3.8 4.6"
        stroke="var(--color-primary-300)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 화면 맨 위 줄 — 마크 + 화면 이름, 오른쪽에 곁들일 것 하나.
 *
 * 큰 제목(HubHeading)과 역할이 다르다. 이쪽은 "여기가 어디인가"를 늘 같은
 * 자리에서 말하고, 저쪽은 "여기서 뭘 하자는 것인가"를 말한다.
 */
export function HubAppBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mx-auto flex h-12 w-full max-w-xl items-center gap-2 px-5 md:px-8">
      <Mark />
      <span className="text-[15px] font-extrabold text-ink">{title}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

/* ────────────────────────────── 헤드라인 ────────────────────────────── */

export function HubHeading({
  overline,
  children,
  sub,
}: {
  overline?: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {overline && (
        <p className="mb-1.5 text-[12px] font-semibold text-ink-faint">{overline}</p>
      )}
      <h1 className="text-[24px] font-extrabold leading-[1.35] tracking-[-0.01em] text-ink">
        {children}
      </h1>
      {sub && <p className="mt-2 text-[13px] leading-relaxed text-ink-sub">{sub}</p>}
    </header>
  );
}

/* ────────────────────────────── 필터 칩 ────────────────────────────── */

/**
 * 칩 한 줄.
 *
 * `scroll` 을 켜면 줄을 바꾸지 않고 가로로 흐른다. 칩이 예닐곱 개를 넘으면
 * 줄바꿈은 화면 높이를 두세 줄씩 먹는데, 칩 줄 위에 놓인 것이 지도 캔버스나
 * 히어로처럼 높이가 곧 쓸모인 물건이면 그 손해가 크다. 스크롤바는 감춘다 —
 * 잘린 칩이 이미 "옆에 더 있다"고 말한다.
 */
export function ChipRow({
  label,
  scroll,
  children,
}: {
  label?: string;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      {label && <p className="mb-2 text-[12px] font-bold text-ink-faint">{label}</p>}
      <div
        className={
          scroll
            ? "flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "flex flex-wrap gap-2"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function Chip({
  on,
  onClick,
  children,
  disabled,
}: {
  on: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-bold transition-colors disabled:opacity-45 ${
        on
          ? "bg-ink text-white"
          : "bg-surface text-ink-sub shadow-[0_1px_6px_rgba(23,58,94,0.06)]"
      }`}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────── 히어로 ────────────────────────────── */

/**
 * 어두운 히어로 — 이 화면에서 **이어서 할 일** 하나.
 *
 * 흰 CTA 를 안에 품는다. 어두운 바탕 위에서는 인디고 버튼보다 흰 버튼이
 * 먼저 읽힌다 — 참고 이미지가 그렇게 하고 있고, 대비도 그쪽이 높다.
 */
export function DarkHero({
  eyebrow,
  title,
  meta,
  cta,
  href,
  onClick,
}: {
  eyebrow?: string;
  title: ReactNode;
  meta?: string;
  cta: string;
  href?: string;
  onClick?: () => void;
}) {
  const btn =
    "mt-4 flex h-12 w-full items-center justify-center rounded-full bg-white text-[15px] font-bold text-ink";
  return (
    <section className="rounded-[24px] bg-ink p-5 text-white shadow-[0_6px_20px_rgba(32,36,43,0.24)]">
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">
          {eyebrow}
        </p>
      )}
      <p className="mt-1.5 text-[19px] font-extrabold leading-snug">{title}</p>
      {meta && <p className="mt-1.5 text-[12px] text-white/60">{meta}</p>}
      {href ? (
        <Link href={href} className={btn}>
          {cta}
        </Link>
      ) : (
        <button onClick={onClick} className={btn}>
          {cta}
        </button>
      )}
    </section>
  );
}

/* ────────────────────────────── 통계 타일 ────────────────────────────── */

export function StatTiles({
  items,
}: {
  items: { label: string; value: string | number; unit?: string }[];
}) {
  return (
    <div className={`grid gap-2 ${items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-[20px] bg-surface px-3 py-4 shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
        >
          <p className="text-[26px] font-extrabold leading-none text-ink">
            {s.value}
            {s.unit && (
              <span className="ml-0.5 text-[12px] font-bold text-ink-faint">{s.unit}</span>
            )}
          </p>
          <p className="mt-2 text-[11px] font-semibold text-ink-faint">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────── 섹션 ────────────────────────────── */

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-baseline justify-between gap-3">
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      {action && <span className="text-[12px] text-ink-faint">{action}</span>}
    </div>
  );
}

/* ────────────────────────────── 배지 ────────────────────────────── */

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "primary" | "success" | "warning" | "dark";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-bg-subtle text-ink-sub",
    primary: "bg-primary-50 text-primary-700",
    success: "bg-[#e9f7ee] text-success",
    warning: "bg-warning-bg text-warning",
    dark: "bg-ink text-white",
  } as const;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────── 정보 테이블 ────────────────────────────── */

/** 왼쪽 라벨 / 오른쪽 값. 규칙·조건처럼 "짝이 있는 사실"을 늘어놓는 자리 */
export function MetaTable({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <div className="rounded-[24px] bg-surface px-5 shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
      {rows.map((r) => (
        <div
          key={r.k}
          className="flex items-start justify-between gap-4 border-b border-line py-3.5 last:border-b-0"
        >
          <span className="shrink-0 text-[13px] font-semibold text-ink-faint">{r.k}</span>
          <span className="text-right text-[14px] font-semibold leading-relaxed text-ink">
            {r.v}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────── 번호 단계 ────────────────────────────── */

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="rounded-[24px] bg-surface p-5 shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
      {items.map((it, i) => (
        <li key={i} className={`flex gap-3 ${i > 0 ? "mt-3.5" : ""}`}>
          <span
            aria-hidden
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-extrabold text-primary-700"
          >
            {i + 1}
          </span>
          <span className="text-[14px] leading-relaxed text-ink-sub">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/* ────────────────────────────── 리스트 카드 ────────────────────────────── */

/**
 * 목록의 한 줄 — 위에 작은 메타 라벨, 가운데 제목, 아래 부가 정보.
 *
 * 메타를 제목 **위**에 두는 것이 참고 이미지의 요령이다. 아래에 두면 제목만
 * 훑는 눈에는 안 보이는데, 위에 있으면 제목을 읽기 직전에 "무료·초급" 같은
 * 걸러 낼 근거가 먼저 들어온다.
 */
export function ListCard({
  meta,
  title,
  foot,
  right,
  href,
  onClick,
}: {
  meta?: string[];
  title: ReactNode;
  foot?: ReactNode;
  right?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        {meta && meta.length > 0 && (
          <span className="mb-1 block text-[11px] font-bold text-ink-faint">
            {meta.join(" · ")}
          </span>
        )}
        <span className="block text-[15px] font-bold leading-snug text-ink">{title}</span>
        {foot && <span className="mt-1.5 block text-[12px] text-ink-faint">{foot}</span>}
      </span>
      {right && <span className="shrink-0">{right}</span>}
    </>
  );
  const cls =
    "flex w-full items-center gap-3 rounded-[20px] bg-surface px-5 py-4 text-left shadow-[0_2px_14px_rgba(23,58,94,0.06)]";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  // 갈 곳도 할 일도 없으면 **버튼으로 만들지 않는다.** 눌러도 아무 일이 없는
  // 버튼은 보조 기술에 "누를 수 있는 것"으로 읽히고, 손가락으로도 한 번 눌러
  // 보게 만든다. 순위표 한 줄이 그런 경우다 — 읽으라고 있는 줄이다.
  if (!onClick) {
    return <div className={cls}>{body}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/* ────────────────────────────── 체크 목록 ────────────────────────────── */

export function CheckList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-sub">
          <span aria-hidden className="mt-0.5 shrink-0 font-bold text-success">
            ✓
          </span>
          {it}
        </li>
      ))}
    </ul>
  );
}

/* ────────────────────────────── 검색·코드 입력 ────────────────────────────── */

/** 참고 이미지의 검색창 모양. 돋보기 자리에 다른 글리프를 넣을 수 있다 */
export function SearchField({
  value,
  onChange,
  placeholder,
  onSubmit,
  action,
  maxLength,
  wide,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  action?: ReactNode;
  maxLength?: number;
  /** 코드처럼 한 글자씩 또박또박 읽어야 하는 값이면 자간을 벌린다 */
  wide?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className="flex items-center gap-2"
    >
      <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface px-4 shadow-[0_2px_14px_rgba(23,58,94,0.06)] focus-within:ring-2 focus-within:ring-primary-300">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0 text-ink-faint"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          // 16px 미만이면 iOS 가 포커스 때 화면을 확대한다
          className={`min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-faint ${
            wide ? "tracking-[0.2em]" : ""
          }`}
        />
      </div>
      {action}
    </form>
  );
}
